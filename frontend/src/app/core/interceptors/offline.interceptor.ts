import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
  HttpHeaders,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { from, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { OfflineService } from '../services/offline.service';
import { cacheGet, cachePut } from '../offline/offline-db';

function headersToRecord(headers: HttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of headers.keys()) {
    const v = headers.get(key);
    if (v != null) out[key] = v;
  }
  return out;
}

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) return false;
  return err.status === 0 || err.status === 504;
}

/**
 * Offline support:
 * - Cache successful GETs for attendance / exams / timetable
 * - Serve cached GETs when offline or network fails
 * - Queue selected mutations (attendance bulk, mark entry) while offline
 */
export const offlineInterceptor: HttpInterceptorFn = (req, next) => {
  const offline = inject(OfflineService);

  // Replay from the sync queue — do not re-queue or re-cache.
  if (req.headers.has('X-Offline-Sync')) {
    return next(req);
  }

  // Skip blob / FormData — not safely queueable or cacheable as JSON.
  if (req.responseType === 'blob' || req.body instanceof FormData) {
    return next(req);
  }

  const method = req.method.toUpperCase();

  if (method === 'GET' && offline.isCacheableGet(req.urlWithParams, method)) {
    return next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.ok) {
          void cachePut({
            key: req.urlWithParams,
            body: event.body,
            status: event.status,
            statusText: event.statusText,
            headers: headersToRecord(event.headers),
            cachedAt: Date.now(),
          });
        }
      }),
      catchError((err: unknown) => {
        if (!isNetworkFailure(err) && offline.online()) {
          return throwError(() => err);
        }
        return from(cacheGet(req.urlWithParams)).pipe(
          switchMap((cached) => {
            if (!cached) return throwError(() => err);
            return of(
              new HttpResponse({
                body: cached.body,
                status: cached.status || 200,
                statusText: cached.statusText || 'OK (cached)',
                headers: new HttpHeaders({
                  ...cached.headers,
                  'X-Offline-Cache': 'hit',
                }),
                url: req.urlWithParams,
              }),
            );
          }),
        );
      }),
    );
  }

  const queueable = offline.isQueueableMutation(req.urlWithParams, method);
  if (queueable.ok && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    if (!offline.online()) {
      return from(
        offline.enqueue(
          method,
          req.urlWithParams,
          req.body,
          headersToRecord(req.headers),
          queueable.label,
        ),
      ).pipe(
        switchMap((item) =>
          of(
            new HttpResponse({
              body: {
                queued: true,
                id: item.id,
                message: `${queueable.label} saved offline and will sync when you reconnect.`,
              },
              status: 202,
              statusText: 'Accepted (queued)',
              url: req.urlWithParams,
            }),
          ),
        ),
      );
    }

    return next(req).pipe(
      catchError((err: unknown) => {
        if (!isNetworkFailure(err)) return throwError(() => err);
        return from(
          offline.enqueue(
            method,
            req.urlWithParams,
            req.body,
            headersToRecord(req.headers),
            queueable.label,
          ),
        ).pipe(
          switchMap((item) =>
            of(
              new HttpResponse({
                body: {
                  queued: true,
                  id: item.id,
                  message: `${queueable.label} saved offline and will sync when you reconnect.`,
                },
                status: 202,
                statusText: 'Accepted (queued)',
                url: req.urlWithParams,
              }),
            ),
          ),
        );
      }),
    );
  }

  return next(req);
};
