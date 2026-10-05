import {
  checkPin, DEFAULT_LEDGER_ID, newId, parseAttempts,
  type Ledger, type LedgerKind, type PinAttempts, type PinCheck,
} from '../core';
import type { Db } from './types';
import { getSetting, setSetting } from './repository';
import { notifyLocalWrite } from './writes';

const nowIso = () => new Date().toISOString();

type LedgerRow = { id: string; name: string; kind: LedgerKind; pin_hash: string | null; created_at: string; updated_at: string };
const toLedger = (r: LedgerRow): Ledger => ({
  id: r.id, name: r.name, kind: r.kind, hasPin: r.pin_hash !== null, createdAt: r.created_at, updatedAt: r.updated_at,
});

/** The household ledger first, then personal ledgers in the order they were made. */
export async function listLedgers(db: Db): Promise<Ledger[]> {
  const rows = await db.getAllAsync<LedgerRow>(
    `SELECT id, name, kind, pin_hash, created_at, updated_at FROM ledgers
     ORDER BY CASE kind WHEN 'HOUSEHOLD' THEN 0 ELSE 1 END, created_at, rowid`,
    [],
  );
  return rows.map(toLedger);
}

export async function getLedger(db: Db, id: string): Promise<Ledger | null> {
  const r = await db.getFirstAsync<LedgerRow>('SELECT id, name, kind, pin_hash, created_at, updated_at FROM ledgers WHERE id = ?', [id]);
  return r ? toLedger(r) : null;
}

/** A personal ledger for a family member. `pinHash` comes from core `hashPin` (null = no PIN). */
export async function createLedger(db: Db, name: string, pinHash: string | null = null, id: string = newId()): Promise<Ledger> {
  const now = nowIso();
  const clean = name.trim();
  if (!clean) throw new Error('ledger name is required');
  await db.runAsync(
    `INSERT INTO ledgers (id, name, kind, pin_hash, created_at, updated_at, dirty) VALUES (?, ?, 'PERSONAL', ?, ?, ?, 1)`,
    [id, clean, pinHash, now, now],
  );
  notifyLocalWrite();
  return { id, name: clean, kind: 'PERSONAL', hasPin: pinHash !== null, createdAt: now, updatedAt: now };
}

/** Set or remove (null) a ledger's PIN. Local only: a PIN or its hash is never synced, so no dirty flag and no sync call. */
export async function setLedgerPin(db: Db, id: string, pinHash: string | null): Promise<void> {
  if (id === DEFAULT_LEDGER_ID) throw new Error('the household ledger has no PIN');
  await db.runAsync('UPDATE ledgers SET pin_hash = ? WHERE id = ?', [pinHash, id]);
  await db.runAsync('DELETE FROM settings WHERE key = ?', [attemptsKey(id)]);
}

const attemptsKey = (scope: string) => `pin_attempts:${scope}`;

async function tryPin(db: Db, scope: string, stored: string | null, pin: string, now: number): Promise<PinCheck> {
  const attempts = parseAttempts(await getSetting(db, attemptsKey(scope)));
  const r = checkPin(pin, stored, attempts, now);
  const changed: PinAttempts = r.next;
  if (changed.fails !== attempts.fails || changed.lockedUntil !== attempts.lockedUntil) {
    await setSetting(db, attemptsKey(scope), JSON.stringify(changed));
  }
  const { next: _n, ...out } = r;
  void _n;
  return out;
}

/** Check a ledger's PIN with the persistent wrong-attempt back-off (survives app restarts). */
export async function verifyLedgerPin(db: Db, id: string, pin: string, now = Date.now()): Promise<PinCheck> {
  const r = await db.getFirstAsync<{ pin_hash: string | null }>('SELECT pin_hash FROM ledgers WHERE id = ?', [id]);
  return tryPin(db, id, r?.pin_hash ?? null, pin, now);
}

// ---------- app lock (PIN on open and after 2 minutes in the background; OFF by default) ----------
const APP_LOCK_KEY = 'app_lock_hash';

export async function isAppLockOn(db: Db): Promise<boolean> {
  return (await getSetting(db, APP_LOCK_KEY)) !== null;
}
export async function setAppLockPin(db: Db, pinHash: string): Promise<void> {
  await setSetting(db, APP_LOCK_KEY, pinHash);
  await db.runAsync('DELETE FROM settings WHERE key = ?', [attemptsKey('app')]);
}
export async function clearAppLock(db: Db): Promise<void> {
  await db.runAsync('DELETE FROM settings WHERE key IN (?, ?)', [APP_LOCK_KEY, attemptsKey('app')]);
}
export async function verifyAppLockPin(db: Db, pin: string, now = Date.now()): Promise<PinCheck> {
  return tryPin(db, 'app', await getSetting(db, APP_LOCK_KEY), pin, now);
}
