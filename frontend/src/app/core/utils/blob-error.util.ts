import { HttpErrorResponse } from '@angular/common/http';

/**
 * Requests made with responseType 'blob' deliver error bodies as a Blob, so `err.error.message`
 * is undefined. This reads the JSON `{ message }` the server sent (e.g. "Generate a timetable
 * first.") and falls back to a sensible default.
 */
export async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const e = err as HttpErrorResponse | undefined;
  if (e && typeof Blob !== 'undefined' && e.error instanceof Blob) {
    try {
      const parsed = JSON.parse(await e.error.text());
      if (parsed?.message) return String(parsed.message);
    } catch {
      /* body was not JSON */
    }
  } else if (e?.error?.message) {
    return String(e.error.message);
  }
  if (e?.status === 0) return 'Cannot reach the server. Make sure the backend is running.';
  return fallback;
}
