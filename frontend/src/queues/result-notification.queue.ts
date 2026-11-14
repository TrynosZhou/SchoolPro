import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../config/env';
import { getRedisConnectionOptions } from '../config/redis';

export const RESULT_NOTIFICATION_QUEUE_NAME = 'result-whatsapp-notifications';

export interface ResultNotificationJobData {
  notificationLogId: string;
  parentPhone: string;
  studentName: string;
  examName: string;
  score: string;
  portalLink: string;
  /** whatsapp = primary channel; sms = no consent or explicit SMS path */
  channel: 'whatsapp' | 'sms';
}

let queue: Queue<ResultNotificationJobData> | null = null;
let worker: Worker<ResultNotificationJobData> | null = null;

export function getResultNotificationQueue(): Queue<ResultNotificationJobData> {
  if (!queue) {
    queue = new Queue<ResultNotificationJobData>(RESULT_NOTIFICATION_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}

export async function enqueueResultNotification(
  data: ResultNotificationJobData,
): Promise<string | null> {
  if (!env.redis.enabled) return null;
  try {
    const job = await getResultNotificationQueue().add('send-result-notification', data, {
      jobId: data.notificationLogId,
    });
    console.log(
      `[result-notification-queue] Enqueued job ${job.id} for log ${data.notificationLogId}`,
    );
    return job.id ?? null;
  } catch (err) {
    console.error('[result-notification-queue] Failed to enqueue job:', err);
    return null;
  }
}

export function startResultNotificationWorker(
  processor: (job: Job<ResultNotificationJobData>) => Promise<void | 'whatsapp' | 'sms'>,
): Worker<ResultNotificationJobData> | null {
  if (!env.redis.enabled) return null;
  if (worker) return worker;

  let lastErrorLogAt = 0;

  try {
    worker = new Worker<ResultNotificationJobData>(RESULT_NOTIFICATION_QUEUE_NAME, processor, {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    });

    worker.on('completed', (job) => {
      console.log(`[result-notification-queue] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(
        `[result-notification-queue] Job ${job?.id ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempt(s):`,
        err.message,
      );
    });

    worker.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrorLogAt < 60_000) return;
      lastErrorLogAt = now;
      console.error('[result-notification-queue] Worker error (is Redis running?):', err.message);
    });

    console.log('[result-notification-queue] Worker started (concurrency=5, retries=3, exponential backoff)');
    return worker;
  } catch (err) {
    console.error('[result-notification-queue] Failed to start worker:', err);
    return null;
  }
}

export async function closeResultNotificationQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}
