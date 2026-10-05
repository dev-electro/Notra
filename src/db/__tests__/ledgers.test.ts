/** Ledger scoping: every query/report is per ledger, and SQL == core still holds inside each ledger. */
import {
  activeEntries, balances, DEFAULT_LEDGER_ID as L, entriesInLedger, eventsInLedger, hashPin, occasionWise, selfLedger,
  splitForBackup, totals, type Increment,
} from '../../core';
import {
  clearAppLock, createLedger, getLedger, isAppLockOn, listLedgers, setAppLockPin, setLedgerPin, verifyAppLockPin, verifyLedgerPin,
} from '../ledgers';
import { memDb } from '../mem-db.testutil';
import { LATEST_VERSION, MIGRATIONS, migrate } from '../migrations';
import {
  listEntriesPage, sqlBalances, sqlEventSummaries, sqlOccasionWise, sqlSelfLedgerPage, sqlTotals,
} from '../queries';
import {
  addEntry, correctEntry, createEvent, createHousehold, listEntries, listEntriesForHousehold, listEvents, voidEntry,
} from '../repository';
import type { Db } from '../types';

const hh = (n: string) => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला' });
const INC: Increment = { type: 'FIXED', rupees: 51 };
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
const salt = new Uint8Array(16).fill(3);

async function seed() {
  const db = memDb();
  await migrate(db);
  const sita = await createLedger(db, 'सीता');
  const a = await createHousehold(db, hh('रमेश'));
  const b = await createHousehold(db, hh('सुरेश'));
  const host = await createHousehold(db, hh('मैं'));
  const evH = await createEvent(db, { hostHouseholdId: host.id, occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'HELD' });
  const evS = await createEvent(db, { hostHouseholdId: host.id, occasion: 'BIMARI', date: '2026-12-01', panchApproved: false, invitationType: 'CARD', status: 'PLANNED', ledgerId: sita.id });
  let t = 0;
  const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString();
  const h1 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 50100, eventId: evH.id, createdAt: at() });
  await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', cashPaise: 10100, createdAt: at() });
  await addEntry(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 25100, createdAt: at() });
  const s1 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 7100, ledgerId: sita.id, createdAt: at() });
  await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', cashPaise: 1100, ledgerId: sita.id, createdAt: at() });
  const s3 = await addEntry(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 3100, ledgerId: sita.id, eventId: evS.id, createdAt: at() });
  await correctEntry(db, h1, { cashPaise: 60100, createdAt: at() });
  await voidEntry(db, s3, at());
  return { db, sita, a, b, evH, evS, s1 };
}

describe('ledger scoping', () => {
  it('new entries and events default to the household ledger and inherit through corrections and voids', async () => {
    const { db, sita } = await seed();
    const house = await listEntries(db, L);
    expect(house).toHaveLength(4); // 3 + the correction
    expect(house.every((e) => e.ledgerId === L)).toBe(true);
    const mine = await listEntries(db, sita.id);
    expect(mine).toHaveLength(4); // 3 + the void of s3
    expect(mine.every((e) => e.ledgerId === sita.id)).toBe(true);
    expect((await listEvents(db, L)).map((e) => e.occasion)).toEqual(['SHAADI']);
    expect((await listEvents(db, sita.id)).map((e) => e.occasion)).toEqual(['BIMARI']);
  });

  it('SQL == core inside each ledger (totals, balances, occasion, self ledger, event summaries)', async () => {
    const { db, sita } = await seed();
    for (const id of [L, sita.id]) {
      const all = await listEntries(db, id);
      expect(await sqlTotals(db, id)).toEqual(totals(all));
      const got = await sqlBalances(db, INC, id);
      expect(Object.fromEntries(got.map((x) => [x.householdId, x]))).toEqual(balances(all, INC));
      expect(await sqlOccasionWise(db, id)).toEqual(occasionWise(all, await listEvents(db, id)));
      expect(await sqlSelfLedgerPage(db, id, 50)).toEqual(selfLedger(all).reverse());
      const summaries = await sqlEventSummaries(db, id);
      const ids = new Set(activeEntries(all).filter((e) => e.eventId).map((e) => e.eventId));
      expect(new Set(Object.keys(summaries))).toEqual(ids);
    }
  });

  it('ledgers never leak into each other', async () => {
    const { db, sita, a } = await seed();
    expect(await sqlTotals(db, L)).toEqual({ receivedPaise: 85200, givenPaise: 10100 }); // 60100 (corrected) + 25100
    expect(await sqlTotals(db, sita.id)).toEqual({ receivedPaise: 7100, givenPaise: 1100 }); // s3 voided
    expect(await sqlTotals(db, 'no-such-ledger')).toEqual({ receivedPaise: 0, givenPaise: 0 });
    expect(await sqlBalances(db, INC, 'no-such-ledger')).toEqual([]);

    const houseA = await listEntriesPage(db, { ledgerId: L, householdId: a.id, limit: 50 });
    const sitaA = await listEntriesPage(db, { ledgerId: sita.id, householdId: a.id, limit: 50 });
    expect(houseA.every((e) => e.ledgerId === L)).toBe(true);
    expect(sitaA.every((e) => e.ledgerId === sita.id)).toBe(true);
    expect(houseA.length + sitaA.length).toBe((await listEntries(db, L)).filter((e) => e.otherHouseholdId === a.id).length + (await listEntries(db, sita.id)).filter((e) => e.otherHouseholdId === a.id).length);
    expect((await listEntriesForHousehold(db, a.id, sita.id)).map((e) => e.cashPaise).sort()).toEqual([1100, 7100]);
    // balances for a household in one ledger ignore the other ledger's entries
    expect((await sqlBalances(db, INC, sita.id, a.id))[0]).toMatchObject({ totalReceived: 7100, totalGiven: 1100 });
    expect((await sqlBalances(db, INC, L, a.id))[0]).toMatchObject({ totalReceived: 60100, totalGiven: 10100 });
  });

  it('the pure helpers agree with SQL scoping', async () => {
    const { db, sita } = await seed();
    const all = [...(await listEntries(db, L)), ...(await listEntries(db, sita.id))];
    expect(entriesInLedger(all, sita.id)).toEqual(await listEntries(db, sita.id));
    expect(entriesInLedger(all, L)).toHaveLength(4);
    const evs = [...(await listEvents(db, L)), ...(await listEvents(db, sita.id))];
    expect(eventsInLedger(evs, sita.id)).toHaveLength(1);
    expect(entriesInLedger([{ ...all[0]!, ledgerId: undefined }], L)).toHaveLength(1); // absent id = household ledger
  });

  it('ledger_id is immutable like the rest of an entry', async () => {
    const { db, s1 } = await seed();
    await expect(db.runAsync('UPDATE entries SET ledger_id = ? WHERE id = ?', [L, s1.id])).rejects.toThrow(/immutable/);
    await db.runAsync('UPDATE entries SET dirty = 0 WHERE id = ?', [s1.id]); // sync bookkeeping still works
  });
});

describe('migration of existing data', () => {
  it('rows written before ledgers existed land in the household ledger and keep counting', async () => {
    const db: Db = memDb();
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (let v = 0; v < 4; v++) await db.execAsync(MIGRATIONS[v]!); // a phone still on schema v4
    await db.execAsync('PRAGMA user_version = 4;');
    await db.runAsync(`INSERT INTO households (id, head_name, father_name, jati, atak, village, fala, created_at, updated_at) VALUES ('h1','रमेश','','','','','','t','t')`, []);
    await db.runAsync(`INSERT INTO events (id, host_household_id, occasion, date, invitation_type, status, created_at, updated_at) VALUES ('ev1','h1','SHAADI','2026-01-01','CARD','HELD','t','t')`, []);
    await db.runAsync(`INSERT INTO entries (id, event_id, other_household_id, direction, cash_paise, payment_mode, recorded_by, created_at) VALUES ('e1','ev1','h1','AAYA',50100,'CASH','me','2026-01-01T00:00:00.000Z')`, []);
    expect(await migrate(db)).toBe(LATEST_VERSION);
    expect(await sqlTotals(db, L)).toEqual({ receivedPaise: 50100, givenPaise: 0 });
    expect((await listEvents(db, L)).map((e) => e.id)).toEqual(['ev1']);
    expect((await listLedgers(db)).map((l) => [l.id, l.kind])).toEqual([[L, 'HOUSEHOLD']]);
    expect(await sqlTotals(db, 'other')).toEqual({ receivedPaise: 0, givenPaise: 0 });
    // old rows were already dirty; they stay so (the first sync uploads them, ledger_id defaulting on the server)
    expect((await db.getFirstAsync<{ dirty: number; sync_error: string | null }>('SELECT dirty, sync_error FROM entries', []))).toEqual({ dirty: 1, sync_error: null });
  });
});

describe('ledger PINs', () => {
  it('stores only a salted hash, verifies, and exposes hasPin', async () => {
    const db = memDb();
    await migrate(db);
    const l = await createLedger(db, ' सीता ', hashPin('4321', salt));
    expect(l.name).toBe('सीता');
    expect((await getLedger(db, l.id))?.hasPin).toBe(true);
    const raw = await db.getFirstAsync<{ pin_hash: string }>('SELECT pin_hash FROM ledgers WHERE id = ?', [l.id]);
    expect(raw!.pin_hash).not.toContain('4321');
    expect(await verifyLedgerPin(db, l.id, '4321')).toEqual({ ok: true });
    expect(await verifyLedgerPin(db, l.id, '0000')).toMatchObject({ ok: false, reason: 'wrong' });
    await expect(createLedger(db, '  ')).rejects.toThrow();
    await expect(setLedgerPin(db, L, hashPin('1234', salt))).rejects.toThrow(); // the household ledger has no PIN
  });

  it('wrong tries back off, persistently, and a locked ledger refuses even the right PIN until the wait is over', async () => {
    const db = memDb();
    await migrate(db);
    const l = await createLedger(db, 'सीता', hashPin('4321', salt));
    const t0 = 1_000_000;
    expect(await verifyLedgerPin(db, l.id, '1', t0)).toMatchObject({ ok: false }); // not even a valid PIN shape
    await verifyLedgerPin(db, l.id, '1111', t0);
    const third = await verifyLedgerPin(db, l.id, '2222', t0);
    expect(third).toMatchObject({ ok: false, reason: 'wrong' });
    const locked = await verifyLedgerPin(db, l.id, '4321', t0 + 1000);
    expect(locked).toMatchObject({ ok: false, reason: 'locked' });
    expect((locked as { waitMs: number }).waitMs).toBeGreaterThan(20_000);
    // stored in the database, so it survives an app restart (a new connection would read the same row)
    expect(await verifyLedgerPin(db, l.id, '4321', t0 + 31_000)).toEqual({ ok: true });
    expect(await verifyLedgerPin(db, l.id, '0000', t0 + 32_000)).toMatchObject({ reason: 'wrong' });
    // changing the PIN resets the counter
    await setLedgerPin(db, l.id, hashPin('9999', salt));
    expect(await verifyLedgerPin(db, l.id, '9999', t0 + 33_000)).toEqual({ ok: true });
    await setLedgerPin(db, l.id, null);
    expect((await getLedger(db, l.id))?.hasPin).toBe(false);
  });

  it('a ledger with no PIN never verifies a PIN', async () => {
    const db = memDb();
    await migrate(db);
    const l = await createLedger(db, 'सीता');
    expect(await verifyLedgerPin(db, l.id, '1234')).toMatchObject({ ok: false });
  });
});

describe('app lock', () => {
  it('is off by default; set, verify with back-off, clear', async () => {
    const db = memDb();
    await migrate(db);
    expect(await isAppLockOn(db)).toBe(false);
    await setAppLockPin(db, hashPin('2580', salt));
    expect(await isAppLockOn(db)).toBe(true);
    expect(await verifyAppLockPin(db, '2580', 1)).toEqual({ ok: true });
    for (let i = 0; i < 3; i++) await verifyAppLockPin(db, '0000', 10);
    expect(await verifyAppLockPin(db, '2580', 11)).toMatchObject({ reason: 'locked' });
    await clearAppLock(db);
    expect(await isAppLockOn(db)).toBe(false);
    expect(await verifyAppLockPin(db, '2580', 99)).toMatchObject({ ok: false });
  });
});

describe('backup selection', () => {
  it('a PIN-protected ledger is exported only after its PIN was entered in this session', () => {
    const ls = [{ id: L, hasPin: false }, { id: 'a', hasPin: false }, { id: 'b', hasPin: true }, { id: 'c', hasPin: true }];
    expect(splitForBackup(ls, new Set(['c']))).toEqual({
      included: [ls[0], ls[1], ls[3]],
      skipped: [ls[2]],
    });
  });
});
