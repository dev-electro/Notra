/**
 * Runs the real migrations and repository SQL against Node's built-in SQLite (a stand-in for expo-sqlite).
 * Encryption (SQLCipher) is not exercised here; it needs a native dev build.
 */
import { balances, activeEntries } from '../../core';
import { LATEST_VERSION, migrate } from '../migrations';
import {
  addEntry, correctEntry, createEvent, createHousehold, getHousehold, getIncrement, listEntries,
  listEntriesForEvent, listEntriesForHousehold, listEvents, listHouseholds, setEventStatus, setIncrement,
} from '../repository';
import type { Db } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

function memDb(): Db {
  const sql = new DatabaseSync(':memory:');
  type P = (string | number | null)[];
  return {
    execAsync: async (s) => void sql.exec(s),
    runAsync: async (s, p: P) => sql.prepare(s).run(...p),
    getAllAsync: async <T,>(s: string, p: P) => sql.prepare(s).all(...p) as T[],
    getFirstAsync: async <T,>(s: string, p: P) => (sql.prepare(s).get(...p) as T | undefined) ?? null,
    withTransactionAsync: async (task) => {
      sql.exec('BEGIN');
      try { await task(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
}

const hh = (n: string) => ({ headName: n, fatherName: 'Kalu', jati: 'Bhil', atak: 'Damor', village: 'Sarwan', fala: 'Upla' });

describe('db', () => {
  it('migrates to latest and is idempotent', async () => {
    const db = memDb();
    expect(await migrate(db)).toBe(LATEST_VERSION);
    expect(await migrate(db)).toBe(LATEST_VERSION);
  });

  it('round-trips households, events and entries to core types', async () => {
    const db = memDb();
    await migrate(db);
    const h = await createHousehold(db, { ...hh('Suresh'), phone: '9999999999' });
    const me = await createHousehold(db, hh('Main'));
    expect(await getHousehold(db, h.id)).toMatchObject({ headName: 'Suresh', phone: '9999999999' });
    expect((await listHouseholds(db)).map((x) => x.headName)).toEqual(['Main', 'Suresh']);

    const ev = await createEvent(db, { hostHouseholdId: me.id, occasion: 'SHAADI', date: '2026-02-01', panchApproved: true, invitationType: 'YELLOW_RICE', status: 'PLANNED', lekhakName: 'Mangu' });
    await setEventStatus(db, ev.id, 'HELD');
    expect((await listEvents(db))[0]).toMatchObject({ status: 'HELD', panchApproved: true, lekhakName: 'Mangu' });

    const e = await addEntry(db, { eventId: ev.id, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 50100, inKindItem: '10 किलो गेहूं', inKindValuePaise: 30000, paymentMode: 'CASH', recordedBy: 'Mangu' });
    expect((await listEntriesForEvent(db, ev.id))[0]).toEqual(e);
    expect(await listEntriesForHousehold(db, h.id)).toHaveLength(1);
  });

  it('corrections are new rows; originals untouched and excluded from totals', async () => {
    const db = memDb();
    await migrate(db);
    const h = await createHousehold(db, hh('Suresh'));
    const e1 = await addEntry(db, { otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 50000, inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'me', createdAt: '2026-01-01T00:00:00Z' });
    const e2 = await correctEntry(db, e1, { cashPaise: 50100, createdAt: '2026-01-02T00:00:00Z' });
    expect(e2.correctsEntryId).toBe(e1.id);
    const all = await listEntries(db);
    expect(all).toHaveLength(2);
    expect(activeEntries(all).map((x) => x.id)).toEqual([e2.id]);
    expect(balances(all)[h.id].totalReceived).toBe(50100);
  });

  it('blocks UPDATE and DELETE on entries', async () => {
    const db = memDb();
    await migrate(db);
    const h = await createHousehold(db, hh('Suresh'));
    const e = await addEntry(db, { otherHouseholdId: h.id, direction: 'GAYA', cashPaise: 100, inKindValuePaise: 0, paymentMode: 'UPI', recordedBy: 'me' });
    await expect(db.runAsync('UPDATE entries SET cash_paise = 1 WHERE id = ?', [e.id])).rejects.toThrow(/immutable/);
    await expect(db.runAsync('DELETE FROM entries WHERE id = ?', [e.id])).rejects.toThrow(/append-only/);
  });

  it('rejects a death-feast style occasion', async () => {
    const db = memDb();
    await migrate(db);
    const h = await createHousehold(db, hh('Suresh'));
    await expect(
      db.runAsync(`INSERT INTO events (id, host_household_id, occasion, date, invitation_type, status, created_at, updated_at) VALUES ('x', ?, 'MRITYU_BHOJ', '2026-01-01', 'CARD', 'PLANNED', 'n', 'n')`, [h.id]),
    ).rejects.toThrow();
  });

  it('stores the village increment setting', async () => {
    const db = memDb();
    await migrate(db);
    expect(await getIncrement(db)).toEqual({ type: 'FIXED', rupees: 51 });
    await setIncrement(db, { type: 'PERCENT', pct: 10 });
    expect(await getIncrement(db)).toEqual({ type: 'PERCENT', pct: 10 });
    await setIncrement(db, { type: 'FIXED', rupees: 101 });
    expect(await getIncrement(db)).toEqual({ type: 'FIXED', rupees: 101 });
  });
});
