import type { Queryable } from './db';
import { sha256Hex } from './crypto';

/** What the app tells us about itself via headers. All optional: old app builds send none of them. */
export interface ClientInfo {
  appVersion: string | null;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  osVersion: string | null;
}

const TOKEN = /^[0-9A-Za-z.\-+_ ]{1,32}$/;
const clean = (v: string | undefined): string | null => (v && TOKEN.test(v.trim()) ? v.trim() : null);

export function parseClientInfo(get: (name: string) => string | undefined): ClientInfo {
  const p = (get('x-platform') ?? '').trim().toLowerCase();
  return {
    appVersion: clean(get('x-app-version')),
    platform: p === 'android' || p === 'ios' || p === 'web' ? p : 'unknown',
    osVersion: clean(get('x-os-version')),
  };
}

/**
 * Record that a user was active now: device row (app version, platform, last seen / last sync) and the per-day
 * activity counter that feeds DAU/WAU/MAU and retention. One statement. Counters only, never request content.
 */
export async function touchActivity(q: Queryable, userId: string, info: ClientInfo, isSync: boolean): Promise<void> {
  await q.query(
    `WITH d AS (
       INSERT INTO user_devices (user_id, platform, app_version, os_version, last_seen, last_sync_at)
       VALUES ($1, $2, $3, $4, now(), CASE WHEN $5::boolean THEN now() END)
       ON CONFLICT (user_id, platform) DO UPDATE SET
         app_version  = COALESCE(EXCLUDED.app_version, user_devices.app_version),
         os_version   = COALESCE(EXCLUDED.os_version, user_devices.os_version),
         last_seen    = now(),
         last_sync_at = COALESCE(EXCLUDED.last_sync_at, user_devices.last_sync_at)
     )
     INSERT INTO user_activity_daily (user_id, day, sync_requests)
     VALUES ($1, (now() AT TIME ZONE 'UTC')::date, CASE WHEN $5::boolean THEN 1 ELSE 0 END)
     ON CONFLICT (user_id, day) DO UPDATE SET sync_requests = user_activity_daily.sync_requests + EXCLUDED.sync_requests`,
    [userId, info.platform, info.appVersion, info.osVersion, isSync],
  );
}

export async function countSyncError(q: Queryable, userId: string): Promise<void> {
  await q.query(
    `UPDATE user_activity_daily SET sync_errors = sync_errors + 1 WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`,
    [userId],
  );
}

// ---------- error log ----------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Normalise a request path so ids never reach the log: /admin/api/users/<uuid> -> /admin/api/users/:id. */
export function safePath(path: string): string {
  return path.split('?')[0]!.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:n').slice(0, 120);
}

/** Strip anything that could carry personal data out of an error message (phones, emails, ids, long digit runs, quoted values). */
export function scrubMessage(msg: string): string {
  return msg
    .replace(UUID, '<id>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '<number>')
    .replace(/\([^)]*\)=\([^)]*\)/g, '(<key>)=(<value>)')
    .replace(/"[^"]{0,200}"/g, '"<v>"')
    .replace(/'[^']{0,200}'/g, "'<v>'")
    .slice(0, 300);
}

export interface ErrorInfo {
  method: string;
  path: string;
  status: number;
  error: unknown;
}

/**
 * Write an unhandled error to error_log. Sampled: one row per (fingerprint, minute), later hits only bump `occurrences`.
 * Stores method, normalised path, status, error class name, pg error code and a scrubbed message. Never bodies, headers or user ids.
 * Best effort: logging must never turn one error into two.
 */
export async function logError(q: Queryable, e: ErrorInfo): Promise<void> {
  try {
    const err = e.error instanceof Error ? e.error : new Error(String(e.error));
    const name = err.name.slice(0, 60);
    const code = typeof (err as { code?: unknown }).code === 'string' ? String((err as { code?: string }).code).slice(0, 20) : null;
    const message = scrubMessage(err.message);
    const path = safePath(e.path);
    const fingerprint = (await sha256Hex(`${e.method}|${path}|${e.status}|${name}|${code ?? ''}|${message}`)).slice(0, 24);
    await q.query(
      `INSERT INTO error_log (minute_bucket, fingerprint, method, path, status, error_name, error_code, message)
       VALUES (date_trunc('minute', now()), $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (fingerprint, minute_bucket) DO UPDATE SET occurrences = error_log.occurrences + 1, at = now()`,
      [fingerprint, e.method, path, e.status, name, code, message],
    );
  } catch {
    /* ignore */
  }
}
