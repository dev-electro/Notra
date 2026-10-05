import { DEFAULT_LEDGER_ID as L } from '../../core';
import { sqlTotals } from '../../db/queries';
import { migrate } from '../../db/migrations';
import { memDb } from '../../db/mem-db.testutil';
import { clearAllLocalData } from '../../db/maintenance';
import { addEntry, correctEntry, createEvent, createHousehold, listEntries, listHouseholds, updateHousehold, voidEntry } from '../../db/repository';
import type { Db } from '../../db/types';
import { applyPage, pullAll, pushDirty, syncOnce } from '../engine';
import { bindAccount } from '../account';
import { FakeServer } from '../fake-server.testutil';
import { getSyncState, pendingCount, setSyncEnabled } from '../state';
import type { PullPage } from '../wire';

const page = (over: Partial<PullPage>): PullPage => ({ ledgers: [], households: [], events: [], entries: [], profile: null, nextCursor: 1, hasMore: false, ...over });
const hh = (n: string) => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला' });
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
async function phone(): Promise<Db> {
  const db = memDb();
  await migrate(db);
  return db;
}
const dirtyOf = async (db: Db, table: string) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE dirty = 1`, []))!.n;

async function seed(db: Db) {
  const a = await createHousehold(db, hh('रमेश'));
  const b = await createHousehold(db, hh('सुरेश'));
  const ev = await createEvent(db, { hostHouseholdId: a.id, occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'PLANNED' });
  const e1 = await addEntry(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 50100, eventId: ev.id, createdAt: '2026-01-01T00:00:01.000Z' });
  const e2 = await addEntry(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 11100, eventId: ev.id, createdAt: '2026-01-01T00:00:02.000Z' });
  const c = await correctEntry(db, e1, { cashPaise: 60100, createdAt: '2026-01-01T00:00:03.000Z' });
  await voidEntry(db, e2, '2026-01-01T00:00:04.000Z');
  void c;
  return { a, b, ev };
}

describe('push', () => {
  it('sends dirty rows, clears exactly them, and a second run sends nothing', async () => {
    const db = await phone();
    const srv = new FakeServer();
    await seed(db);
    expect(await pendingCount(db)).toBe(2 + 1 + 4);
    expect(await pushDirty(db, srv)).toBe(7);
    expect(srv.pushes).toHaveLength(1);
    expect(srv.pushes[0]!.entries.map((e) => e.isVoid)).toEqual([false, false, false, true]);
    expect(await pendingCount(db)).toBe(0);
    expect(await pushDirty(db, srv)).toBe(0);
    expect(srv.pushes).toHaveLength(1);
  });

  it('a local edit marks only that row dirty again', async () => {
    const db = await phone();
    const srv = new FakeServer();
    const { a } = await seed(db);
    await pushDirty(db, srv);
    await updateHousehold(db, { ...(await listHouseholds(db)).find((h) => h.id === a.id)!, village: 'खेरवाड़ा' });
    expect(await pendingCount(db)).toBe(1);
    await pushDirty(db, srv);
    expect(srv.pushes[1]!.households.map((h) => h.village)).toEqual(['खेरवाड़ा']);
    expect(srv.pushes[1]!.entries).toHaveLength(0);
  });

  it('an edit made while a push is in flight stays dirty (cleared by id + updated_at)', async () => {
    const db = await phone();
    const srv = new FakeServer();
    const h = await createHousehold(db, hh('रमेश'));
    let fired = false;
    srv.onPush = async () => {
      if (fired) return;
      fired = true;
      await db.runAsync("UPDATE households SET village = 'नया', updated_at = '2099-01-01T00:00:00.000Z', dirty = 1 WHERE id = ?", [h.id]);
    };
    await pushDirty(db, srv);
    // the first push did not clear the newer edit, so the loop sent it in a second push
    expect(srv.pushes).toHaveLength(2);
    expect(srv.pushes[0]!.households[0]!.village).not.toBe('नया');
    expect(srv.hs.get(h.id)!.row.village).toBe('नया');
    expect(await dirtyOf(db, 'households')).toBe(0);
  });

  it('splits large backlogs into batches of at most 500 rows', async () => {
    const db = await phone();
    const srv = new FakeServer();
    const a = await createHousehold(db, hh('रमेश'));
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < 1200; i++) await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 100 + i });
    });
    await pushDirty(db, srv);
    expect(srv.pushes.map((p) => p.ledgers.length + p.households.length + p.events.length + p.entries.length)).toEqual([500, 500, 201]);
    expect(await pendingCount(db)).toBe(0);
  });

  it('keeps rows dirty and surfaces the error when offline', async () => {
    const db = await phone();
    const srv = new FakeServer();
    await seed(db);
    srv.failPush = true;
    await expect(syncOnce(db, srv)).rejects.toThrow('offline');
    expect(await pendingCount(db)).toBe(7);
    expect((await getSyncState(db)).lastSyncAt).toBeNull();
    srv.failPush = false;
    await syncOnce(db, srv);
    expect(await pendingCount(db)).toBe(0);
    expect((await getSyncState(db)).lastSyncAt).not.toBeNull();
  });

  it('does not send photo or voice-note columns', async () => {
    const db = await phone();
    const srv = new FakeServer();
    const h = await createHousehold(db, { ...hh('रमेश'), photoUri: 'file:///x.jpg' });
    await pushDirty(db, srv);
    expect(JSON.stringify(srv.pushes[0])).not.toContain('x.jpg');
    expect(srv.hs.get(h.id)!.row).not.toHaveProperty('photoUri');
  });
});

describe('pull / restore', () => {
  it('a fresh phone restores everything from cursor 0, clean (not dirty), with the same totals', async () => {
    const srv = new FakeServer();
    const a = await phone();
    await seed(a);
    await syncOnce(a, srv);
    const b = await phone();
    await syncOnce(b, srv);
    expect(await pendingCount(b)).toBe(0);
    expect(await sqlTotals(b, L)).toEqual(await sqlTotals(a, L));
    expect(await sqlTotals(b, L)).toEqual({ receivedPaise: 60100, givenPaise: 0 }); // correction applied, void cancels e2
    expect((await listEntries(b, L)).map((e) => e.id).sort()).toEqual((await listEntries(a, L)).map((e) => e.id).sort());
    expect((await getSyncState(b)).cursor).toBe(srv.seq);
    // nothing to push after restoring
    const pushesBefore = srv.pushes.length;
    await syncOnce(b, srv);
    expect(srv.pushes).toHaveLength(pushesBefore);
  });

  it('pages through large histories', async () => {
    const srv = new FakeServer();
    srv.pageLimit = 400;
    const a = await phone();
    const h = await createHousehold(a, hh('रमेश'));
    await a.withTransactionAsync(async () => {
      for (let i = 0; i < 1000; i++) await addEntry(a, { ...base, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 100 });
    });
    await syncOnce(a, srv);
    const b = await phone();
    srv.pulls = [];
    expect(await pullAll(b, srv)).toBe(1001);
    expect(srv.pulls).toHaveLength(3);
    expect((await sqlTotals(b, L)).receivedPaise).toBe(100_000);
  });

  it('an entry arriving before its household (later page) does not break foreign keys, and FKs are restored', async () => {
    const b = await phone();
    const entry = { id: 'e1', eventId: null, otherHouseholdId: 'h-later', direction: 'AAYA', cashPaise: 100, inKindItem: null, inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'x', createdAt: '2026-01-01T00:00:00.000Z', correctsEntryId: null, isVoid: false, ledgerId: L };
    await applyPage(b, page({ entries: [entry] }));
    const h = { id: 'h-later', headName: 'X', fatherName: '', jati: '', atak: '', village: '', fala: '', phone: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    await applyPage(b, page({ households: [h], nextCursor: 2 }));
    expect((await listHouseholds(b)).map((x) => x.id)).toEqual(['h-later']);
    expect((await b.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys', []))!.foreign_keys).toBe(1);
  });

  it('applies a page atomically: a bad row rolls back everything, cursor included', async () => {
    const b = await phone();
    const good = { id: 'h1', headName: 'X', fatherName: '', jati: '', atak: '', village: '', fala: '', phone: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const badEvent = { id: 'ev1', hostHouseholdId: 'h1', occasion: 'MRITYU_BHOJ', date: '2026-01-01', panchApproved: false, invitationType: 'CARD', status: 'PLANNED', ledgerId: L, createdAt: good.createdAt, updatedAt: good.updatedAt };
    await expect(applyPage(b, page({ households: [good], events: [badEvent], nextCursor: 9 }))).rejects.toThrow();
    expect(await listHouseholds(b)).toHaveLength(0);
    expect((await getSyncState(b)).cursor).toBe(0);
    expect((await b.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys', []))!.foreign_keys).toBe(1);
  });

  it('households/events are last-write-wins locally and never become dirty from a pull; photo is kept', async () => {
    const srv = new FakeServer();
    const a = await phone();
    const h = await createHousehold(a, { ...hh('रमेश'), photoUri: 'file:///mine.jpg' });
    await syncOnce(a, srv);
    // server gets a newer edit from another phone
    const row = srv.hs.get(h.id)!.row;
    srv.hs.set(h.id, { row: { ...row, village: 'दूसरे फ़ोन से', updatedAt: '2099-01-01T00:00:00.000Z' }, seq: ++srv.seq });
    await syncOnce(a, srv);
    const got = (await listHouseholds(a))[0]!;
    expect(got.village).toBe('दूसरे फ़ोन से');
    expect(got.photoUri).toBe('file:///mine.jpg');
    expect(await dirtyOf(a, 'households')).toBe(0);

    // a newer local edit survives an older server copy
    await a.runAsync("UPDATE households SET village = 'स्थानीय', updated_at = '2100-01-01T00:00:00.000Z', dirty = 1 WHERE id = ?", [h.id]);
    await applyPage(a, { ledgers: [], households: [{ ...row, village: 'पुराना', updatedAt: '2050-01-01T00:00:00.000Z' }], events: [], entries: [], profile: null, nextCursor: 99, hasMore: false });
    expect((await listHouseholds(a))[0]!.village).toBe('स्थानीय');
    expect(await dirtyOf(a, 'households')).toBe(1);
  });

  it('entries are insert-or-ignore: pulling an entry that already exists is a no-op', async () => {
    const srv = new FakeServer();
    const a = await phone();
    await seed(a);
    await syncOnce(a, srv);
    const before = await listEntries(a, L);
    await a.runAsync('UPDATE sync_state SET cursor = 0', []);
    await syncOnce(a, srv); // re-pulls everything
    expect(await listEntries(a, L)).toEqual(before);
  });

  it('a failed pull leaves the cursor where it was', async () => {
    const srv = new FakeServer();
    const a = await phone();
    await seed(a);
    await syncOnce(a, srv);
    const cur = (await getSyncState(a)).cursor;
    srv.failPull = true;
    await expect(pullAll(a, srv)).rejects.toThrow();
    expect((await getSyncState(a)).cursor).toBe(cur);
  });
});

describe('state', () => {
  it('starts disabled with cursor 0', async () => {
    const db = await phone();
    expect(await getSyncState(db)).toEqual({ cursor: 0, userId: null, enabled: false, lastSyncAt: null, profileDirty: false });
    await setSyncEnabled(db, true);
    expect((await getSyncState(db)).enabled).toBe(true);
  });

  it('binding the same user again changes nothing; merging into another user re-uploads everything from cursor 0', async () => {
    const srv = new FakeServer();
    const db = await phone();
    await seed(db);
    expect(await bindAccount(db, 'user-1', async () => 'merge')).toMatchObject({ status: 'bound', choice: 'merge' });
    await syncOnce(db, srv);
    expect(await pendingCount(db)).toBe(0);
    expect(await bindAccount(db, 'user-1', async () => { throw new Error('must not ask'); })).toEqual({ status: 'bound', choice: undefined });
    expect(await pendingCount(db)).toBe(0);
    await bindAccount(db, 'user-2', async () => 'merge');
    expect(await pendingCount(db)).toBe(7);
    expect((await getSyncState(db)).cursor).toBe(0);
  });

  it('clearAllLocalData wipes the ledger but keeps entries append-only afterwards', async () => {
    const db = await phone();
    const { b } = await seed(db);
    await clearAllLocalData(db);
    expect(await listEntries(db, L)).toHaveLength(0);
    expect(await listHouseholds(db)).toHaveLength(0);
    expect(await getSyncState(db)).toMatchObject({ cursor: 0, userId: null, enabled: false });
    const h = await createHousehold(db, hh('नया'));
    const e = await addEntry(db, { ...base, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 1 });
    await expect(db.runAsync('DELETE FROM entries WHERE id = ?', [e.id])).rejects.toThrow(/append-only/);
    void b;
  });
});
