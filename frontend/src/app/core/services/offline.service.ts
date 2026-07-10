import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  makeQueueId,
  queueAdd,
  queueCount,
  queueList,
  queueRemove,
  queueUpdate,
  SyncQueueItem,
} from '../offline/offline-db';

/** Mutations that may be queued while offline and replayed later. */
const QUEUEABLE = [
  { match: /\/api\/attendance\/students\/bulk(?:\?|$)/, methods: ['POST'], label: 'Attendance register' },
  { match: /\/api\/exams\/record-book\/save-row(?:\?|$)/, methods: ['POST'], label: 'Exam marks' },
  { match: /\/api\/exams\/record-book\/add-column(?:\?|$)/, methods: ['POST'], label: 'Exam column' },
];

/** GETs that should fall back to IndexedDB when the network fails. */
const CACHEABLE_GET = [
  /\/api\/attendance\//,
  /\/api\/admin\/classes(?:\?|$)/,
  /\/api\/students(?:\?|$)/,
  /\/api\/exams\/(terms|types|grade-boundaries|report-cards|record-book|mark-sheet)(?:\/|\?|$)/,
  /\/api\/timetable\//,
  /\/api\/dashboard\/school-links(?:\?|$)/,
];

@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly http = inject(HttpClient);

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly pendingCount = signal(0);
  readonly syncing = signal(false);
  readonly lastSyncError = signal<string | null>(null);
  readonly lastSyncedAt = signal<number | null>(null);

  readonly statusLabel = computed(() => {
    if (!this.online()) {
      const n = this.pendingCount();
      return n > 0 ? `Offline · ${n} pending` : 'Offline';
    }
    if (this.syncing()) return 'Syncing…';
    const n = this.pendingCount();
    return n > 0 ? `${n} pending sync` : 'Online';
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online.set(true);
        void this.flushQueue();
      });
      window.addEventListener('offline', () => this.online.set(false));
      void this.refreshPendingCount();
    }
  }

  isCacheableGet(url: string, method: string): boolean {
    if (method.toUpperCase() !== 'GET') return false;
    return CACHEABLE_GET.some((re) => re.test(url));
  }

  isQueueableMutation(url: string, method: string): { ok: true; label: string } | { ok: false } {
    const m = method.toUpperCase();
    for (const rule of QUEUEABLE) {
      if (rule.methods.includes(m) && rule.match.test(url)) {
        return { ok: true, label: rule.label };
      }
    }
    return { ok: false };
  }

  async enqueue(
    method: SyncQueueItem['method'],
    url: string,
    body: unknown,
    headers: Record<string, string>,
    label: string,
  ): Promise<SyncQueueItem> {
    const item: SyncQueueItem = {
      id: makeQueueId(),
      method,
      url,
      body,
      headers,
      createdAt: Date.now(),
      attempts: 0,
      label,
    };
    await queueAdd(item);
    await this.refreshPendingCount();
    return item;
  }

  async refreshPendingCount(): Promise<void> {
    try {
      this.pendingCount.set(await queueCount());
    } catch {
      this.pendingCount.set(0);
    }
  }

  async flushQueue(): Promise<void> {
    if (!this.online() || this.syncing()) return;
    this.syncing.set(true);
    this.lastSyncError.set(null);
    try {
      const items = await queueList();
      for (const item of items) {
        try {
          const headers = new HttpHeaders({
            ...item.headers,
            'X-Offline-Sync': '1',
          });
          await firstValueFrom(
            this.http.request(item.method, item.url, {
              body: item.body,
              headers,
              observe: 'response',
            }),
          );
          await queueRemove(item.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed';
          item.attempts += 1;
          item.lastError = message;
          await queueUpdate(item);
          this.lastSyncError.set(`${item.label}: ${message}`);
          // Stop on first failure to preserve order for dependent writes.
          break;
        }
      }
      this.lastSyncedAt.set(Date.now());
    } finally {
      await this.refreshPendingCount();
      this.syncing.set(false);
    }
  }
}
