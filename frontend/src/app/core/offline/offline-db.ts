const DB_NAME = 'school_pro_offline';
const DB_VERSION = 1;
const STORE_CACHE = 'api_cache';
const STORE_QUEUE = 'sync_queue';

export interface CachedResponse {
  key: string;
  body: unknown;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cachedAt: number;
}

export interface SyncQueueItem {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: unknown;
  headers: Record<string, string>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  label: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function cacheGet(key: string): Promise<CachedResponse | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, 'readonly');
    const req = tx.objectStore(STORE_CACHE).get(key);
    req.onsuccess = () => resolve((req.result as CachedResponse | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function cachePut(entry: CachedResponse): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CACHE, 'readwrite');
  tx.objectStore(STORE_CACHE).put(entry);
  await txDone(tx);
}

export async function queueAdd(item: SyncQueueItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(item);
  await txDone(tx);
}

export async function queueList(): Promise<SyncQueueItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).index('createdAt').getAll();
    req.onsuccess = () => resolve((req.result as SyncQueueItem[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function queueRemove(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).delete(id);
  await txDone(tx);
}

export async function queueUpdate(item: SyncQueueItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(item);
  await txDone(tx);
}

export async function queueCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeQueueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
