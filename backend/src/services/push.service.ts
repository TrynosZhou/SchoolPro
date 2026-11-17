import webpush from 'web-push';
import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { PushSubscription } from '../entities';

/** True when a VAPID key pair is configured; without it, push sends are skipped. */
export function isPushConfigured(): boolean {
  return Boolean(env.push.publicKey && env.push.privateKey);
}

/** Public key the browser needs to create a subscription. */
export function getVapidPublicKey(): string {
  return env.push.publicKey;
}

let vapidReady = false;
function ensureVapidDetails(): boolean {
  if (!isPushConfigured()) return false;
  if (!vapidReady) {
    try {
      webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
      vapidReady = true;
    } catch (err) {
      console.error('[push] Invalid VAPID configuration:', err);
      return false;
    }
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  type?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface PushSendSummary {
  /** Devices accepted by the push service. */
  sent: number;
  /** Devices that errored for a transient reason. */
  failed: number;
  /** Stale subscriptions (410/404) removed from the database. */
  removed: number;
  /** True when nothing was attempted because push is not configured. */
  skipped: boolean;
  reason?: string;
}

/** HTTP status codes that mean the subscription is permanently gone. */
const GONE_STATUSES = new Set([404, 410]);

/**
 * Sends a push payload to every subscription belonging to the given users.
 * Stale endpoints (404/410) are pruned so the table does not grow unbounded.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<PushSendSummary> {
  const summary: PushSendSummary = { sent: 0, failed: 0, removed: 0, skipped: false };
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return summary;

  if (!ensureVapidDetails()) {
    summary.skipped = true;
    summary.reason = 'VAPID keys are not configured';
    return summary;
  }

  const repo = AppDataSource.getRepository(PushSubscription);
  const subs = await repo.find({ where: { userId: In(unique) } });
  if (!subs.length) return summary;

  const body = JSON.stringify({
    notification: {
      title: payload.title,
      body: payload.body,
      data: { type: payload.type, url: payload.url, ...(payload.metadata || {}) },
    },
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      summary.sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode && GONE_STATUSES.has(statusCode)) {
        try {
          await repo.delete({ id: sub.id });
          summary.removed += 1;
        } catch (delErr) {
          console.error('[push] Failed to prune stale subscription:', delErr);
        }
      } else {
        summary.failed += 1;
        console.error('[push] Send failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  return summary;
}
