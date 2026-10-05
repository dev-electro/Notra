import type { Increment } from '../core';
import type { Db } from '../db/types';
import { isoMs, type WireProfile } from './wire';

const MY_HOUSEHOLD_KEY = 'my_household_id';
const INCREMENT_KEY = 'village_increment';

function parseIncrement(raw: string | undefined): Increment | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Increment;
    if ((v.type === 'FIXED' && Number.isFinite(v.rupees)) || (v.type === 'PERCENT' && Number.isFinite(v.pct))) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** This phone's profile (my household + increment), stamped with the newest of the two settings' updated_at. */
export async function getLocalProfile(db: Db): Promise<WireProfile | null> {
  const rows = await db.getAllAsync<{ key: string; value: string; updated_at: string }>(
    'SELECT key, value, updated_at FROM settings WHERE key IN (?, ?)',
    [MY_HOUSEHOLD_KEY, INCREMENT_KEY],
  );
  if (rows.length === 0) return null;
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const updatedAt = rows.map((r) => isoMs(r.updated_at)).sort().at(-1)!;
  return {
    myHouseholdId: by[MY_HOUSEHOLD_KEY]?.value ?? null,
    increment: parseIncrement(by[INCREMENT_KEY]?.value),
    updatedAt,
  };
}

/**
 * Apply a pulled profile, last write wins: only if it is newer than what this phone has. Written straight to the
 * settings table (with the server's timestamp) so it is not treated as a new local change and not pushed back.
 * A null field in the remote profile never erases a local value.
 */
export async function applyProfile(db: Db, remote: WireProfile): Promise<boolean> {
  const local = await getLocalProfile(db);
  if (local && remote.updatedAt <= local.updatedAt) return false;
  const put = (key: string, value: string) =>
    db.runAsync(
      'INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
      [key, value, remote.updatedAt],
    );
  if (remote.myHouseholdId) await put(MY_HOUSEHOLD_KEY, remote.myHouseholdId);
  if (remote.increment) await put(INCREMENT_KEY, JSON.stringify(remote.increment));
  return true;
}
