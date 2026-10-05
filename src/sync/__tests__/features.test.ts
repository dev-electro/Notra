/** Stage 5 sync features: profile sync, account switching safety, poison rows, ledgers on the wire. */
import { DEFAULT_LEDGER_ID as L, hashPin } from '../../core';
import { clearAllLocalData } from '../../db/maintenance';
import { memDb } from '../../db/mem-db.testutil';
import { migrate } from '../../db/migrations';
import { createLedger, listLedgers, setLedgerPin } from '../../db/ledgers';
import {
  addEntry, createEvent, createHousehold, getIncrement, getMyHouseholdId, listEntries, listEvents, listHouseholds,
  setIncrement, setMyHouseholdId, updateHousehold,
} from '../../db/repository';
import { sqlTotals } from '../../db/queries';
import type { Db } from '../../db/types';
import { bindAccount, decideBind, hasLocalData, releaseOwner, type AskInfo, type SignInChoice } from '../account';
import { applyPage, pullAll, pushDirty, syncOnce } from '../engine';
import { FakeServer } from '../fake-server.testutil';
import { getLocalProfile } from '../profile';
import { countRejected, listRejected, retryRejected } from '../rejected';
import { getSyncState, pendingCount } from '../state';
import type { PullPage } from '../wire';

const hh = (n: string) => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला' });
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
const phone = async (): Promise<Db> => {
  const db = memDb();
  await migrate(db);
  return db;
};
const emptyPage = (over: Partial<PullPage> = {}): PullPage => ({ ledgers: [], households: [], events: [], entries: [], profile: null, nextCursor: 1, hasMore: false, ...over });
const flag = async (db: Db) => (await getSyncState(db)).profileDirty;

describe('profile sync (my household + increment)', () => {
  it('a restored phone gets my household and the increment, so first-run setup is skipped and no duplicate is made', async () => {
    const srv = new FakeServer();
    const a = await phone();
    const me = await createHousehold(a, hh('मैं'));
    await setMyHouseholdId(a, me.id);
    await setIncrement(a, { type: 'PERCENT', pct: 10 });
    expect(await flag(a)).toBe(true);
    await syncOnce(a, srv);
    expect(await flag(a)).toBe(false);
    expect(srv.profile?.row).toMatchObject({ myHouseholdId: me.id, increment: { type: 'PERCENT', pct: 10 } });

    const b = await phone();
    await syncOnce(b, srv);
    expect(await getMyHouseholdId(b)).toBe(me.id);
    expect(await getIncrement(b)).toEqual({ type: 'PERCENT', pct: 10 });
    expect(await listHouseholds(b)).toHaveLength(1); // only the one household, restored
    expect(await flag(b)).toBe(false);
    const before = srv.pushes.length;
    await syncOnce(b, srv);
    expect(srv.pushes).toHaveLength(before); // a pulled profile is not pushed back
  });

  it('changes made after the first backup are pushed again', async () => {
    const srv = new FakeServer();
    const a = await phone();
    const me = await createHousehold(a, hh('मैं'));
    await setMyHouseholdId(a, me.id);
    await syncOnce(a, srv);
    await new Promise((r) => setTimeout(r, 5));
    await setIncrement(a, { type: 'FIXED', rupees: 101 });
    await syncOnce(a, srv);
    expect(srv.profile?.row.increment).toEqual({ type: 'FIXED', rupees: 101 });
  });

  it('is last-write-wins: a newer remote profile replaces the local one, an older one does not', async () => {
    const a = await phone();
    await setMyHouseholdId(a, 'local-house');
    await setIncrement(a, { type: 'FIXED', rupees: 51 });
    const local = (await getLocalProfile(a))!;
    await applyPage(a, emptyPage({ profile: { myHouseholdId: 'old-remote', increment: { type: 'FIXED', rupees: 1 }, updatedAt: '2000-01-01T00:00:00.000Z' } }));
    expect(await getMyHouseholdId(a)).toBe('local-house');
    expect(await getIncrement(a)).toEqual({ type: 'FIXED', rupees: 51 });
    await applyPage(a, emptyPage({ profile: { myHouseholdId: 'new-remote', increment: null, updatedAt: '2999-01-01T00:00:00.000Z' }, nextCursor: 2 }));
    expect(await getMyHouseholdId(a)).toBe('new-remote');
    expect(await getIncrement(a)).toEqual({ type: 'FIXED', rupees: 51 }); // a null field never erases a local value
    expect((await getLocalProfile(a))!.updatedAt).toBe('2999-01-01T00:00:00.000Z');
    expect(local.updatedAt < '2999').toBe(true);
  });

  it('a profile edit made while a push is in flight stays dirty', async () => {
    const srv = new FakeServer();
    const a = await phone();
    await setMyHouseholdId(a, 'h1');
    srv.onPush = async () => {
      srv.onPush = undefined;
      await new Promise((r) => setTimeout(r, 5));
      await setIncrement(a, { type: 'FIXED', rupees: 201 });
    };
    await pushDirty(a, srv);
    expect(await flag(a)).toBe(true);
    await pushDirty(a, srv);
    expect(srv.profile?.row.increment).toEqual({ type: 'FIXED', rupees: 201 });
  });
});

describe('account switching safety', () => {
  const ask = (answer: SignInChoice) => {
    const calls: AskInfo[] = [];
    return { fn: async (i: AskInfo) => (calls.push(i), answer), calls };
  };

  it('decides: same owner or an empty phone binds silently; anything else asks', () => {
    expect(decideBind('u1', 'u1', true)).toBe('bind');
    expect(decideBind(null, 'u1', false)).toBe('bind');
    expect(decideBind('u2', 'u1', false)).toBe('bind');
    expect(decideBind(null, 'u1', true)).toBe('ask'); // never synced to anyone
    expect(decideBind('u2', 'u1', true)).toBe('ask'); // someone else's data
  });

  it('first sign-in on an empty phone binds without asking and records the owner', async () => {
    const db = await phone();
    const q = ask('cancel');
    expect(await bindAccount(db, 'u1', q.fn)).toMatchObject({ status: 'bound' });
    expect(q.calls).toHaveLength(0);
    expect((await getSyncState(db)).userId).toBe('u1');
  });

  it('local data that was never synced: asks (neverSynced), and cancel changes nothing and uploads nothing', async () => {
    const srv = new FakeServer();
    const db = await phone();
    const h = await createHousehold(db, hh('रमेश'));
    await addEntry(db, { ...base, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 100 });
    const q = ask('cancel');
    expect(await bindAccount(db, 'u1', q.fn)).toEqual({ status: 'cancelled', choice: 'cancel' });
    expect(q.calls).toEqual([{ neverSynced: true }]);
    expect((await getSyncState(db)).userId).toBeNull();
    expect(srv.pushes).toHaveLength(0);
    expect(await hasLocalData(db)).toBe(true);
    expect(await listEntries(db, L)).toHaveLength(1);
  });

  it('a different user on a phone that holds someone else\'s data is asked; "merge" adds the data to the new account', async () => {
    const srv = new FakeServer();
    const db = await phone();
    const h = await createHousehold(db, hh('रमेश'));
    await addEntry(db, { ...base, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 100 });
    await bindAccount(db, 'u1', ask('merge').fn);
    await syncOnce(db, srv);
    expect(await pendingCount(db)).toBe(0);

    const q = ask('merge');
    expect(await bindAccount(db, 'u2', q.fn)).toMatchObject({ status: 'bound', choice: 'merge' });
    expect(q.calls).toEqual([{ neverSynced: false }]);
    expect((await getSyncState(db)).userId).toBe('u2');
    expect(await pendingCount(db)).toBe(2); // household + entry will be uploaded to u2
    expect((await getSyncState(db)).cursor).toBe(0);
  });

  it('a different user who cancels: nothing is bound, nothing is marked dirty, data untouched', async () => {
    const srv = new FakeServer();
    const db = await phone();
    await createHousehold(db, hh('रमेश'));
    await bindAccount(db, 'u1', ask('merge').fn);
    await syncOnce(db, srv);
    const before = await getSyncState(db);
    expect(await bindAccount(db, 'u2', ask('cancel').fn)).toMatchObject({ status: 'cancelled' });
    expect(await getSyncState(db)).toEqual(before);
    expect(await pendingCount(db)).toBe(0);
  });

  it('"wipe first" clears the phone and then restores the account\'s own data (the old data is never uploaded)', async () => {
    const srv = new FakeServer();
    const owner = await phone();
    const mine = await createHousehold(owner, hh('खाते वाला'));
    await bindAccount(owner, 'u2', ask('merge').fn);
    await syncOnce(owner, srv);

    const shared = await phone();
    await createHousehold(shared, hh('किसी और का'));
    expect(await bindAccount(shared, 'u2', ask('wipe').fn)).toMatchObject({ status: 'bound', choice: 'wipe' });
    expect(await listHouseholds(shared)).toHaveLength(0);
    await syncOnce(shared, srv);
    expect((await listHouseholds(shared)).map((h) => h.id)).toEqual([mine.id]);
    expect([...srv.hs.values()].map((x) => x.row.headName)).toEqual(['खाते वाला']);
  });

  it('after the cloud account is deleted the data stays on the phone as "never synced"', async () => {
    const db = await phone();
    await createHousehold(db, hh('रमेश'));
    await bindAccount(db, 'u1', ask('merge').fn);
    await releaseOwner(db);
    expect(await getSyncState(db)).toMatchObject({ userId: null, enabled: false, cursor: 0 });
    const q = ask('cancel');
    await bindAccount(db, 'u1', q.fn);
    expect(q.calls).toEqual([{ neverSynced: true }]);
  });

  it('a personal ledger counts as local data', async () => {
    const db = await phone();
    expect(await hasLocalData(db)).toBe(false);
    await createLedger(db, 'सीता');
    expect(await hasLocalData(db)).toBe(true);
  });
});

describe('poison rows', () => {
  async function seed() {
    const db = await phone();
    const srv = new FakeServer();
    const a = await createHousehold(db, hh('रमेश'));
    const e1 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 50100, createdAt: '2026-01-01T00:00:01.000Z' });
    const e2 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', cashPaise: 10100, createdAt: '2026-01-01T00:00:02.000Z' });
    const e3 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 20100, createdAt: '2026-01-01T00:00:03.000Z' });
    return { db, srv, a, e1, e2, e3 };
  }

  it('a rejected row is marked sync_error, the rest of the batch still goes through, and it is not retried', async () => {
    const { db, srv, e2 } = await seed();
    srv.reject = (t, r) => (t === 'entries' && r.id === e2.id ? 'invalid_payload:cashPaise' : null);
    expect(await pushDirty(db, srv)).toBe(3); // household + 2 good entries
    expect(srv.ens.size).toBe(2);
    expect(await countRejected(db)).toBe(1);
    expect(await pendingCount(db)).toBe(0); // nothing is "waiting" any more
    const row = await db.getFirstAsync<{ sync_error: string; dirty: number }>('SELECT sync_error, dirty FROM entries WHERE id = ?', [e2.id]);
    expect(row).toEqual({ sync_error: 'invalid_payload:cashPaise', dirty: 1 });
    const pushes = srv.pushes.length;
    await syncOnce(db, srv);
    await syncOnce(db, srv);
    expect(srv.pushes).toHaveLength(pushes); // never retried automatically
    expect(await listRejected(db)).toEqual([
      expect.objectContaining({ table: 'entries', id: e2.id, reason: 'invalid_payload:cashPaise', label: 'रमेश · ₹101 गया' }),
    ]);
    // the phone's own totals are unaffected: local data is the source of truth
    expect(await sqlTotals(db, L)).toEqual({ receivedPaise: 70200, givenPaise: 10100 });
  });

  it('all rows of a batch can be rejected without looping forever', async () => {
    const { db, srv } = await seed();
    srv.reject = () => 'invalid_payload:x';
    await pushDirty(db, srv);
    expect(srv.pushes).toHaveLength(1);
    expect(await countRejected(db)).toBe(4);
  });

  it('editing a rejected household clears the error so it is sent again; "retry" clears the rest', async () => {
    const { db, srv, a, e1 } = await seed();
    srv.reject = (t) => (t === 'households' || t === 'entries' ? 'invalid_payload:headName' : null);
    await pushDirty(db, srv);
    expect(await countRejected(db)).toBe(4);

    srv.reject = undefined;
    await new Promise((r) => setTimeout(r, 3));
    await updateHousehold(db, { ...(await listHouseholds(db))[0]!, headName: 'रमेश भाई' });
    expect(await countRejected(db)).toBe(3);
    await pushDirty(db, srv);
    expect(srv.hs.get(a.id)!.row.headName).toBe('रमेश भाई');

    await retryRejected(db);
    expect(await countRejected(db)).toBe(0);
    expect(await pendingCount(db)).toBe(3);
    await pushDirty(db, srv);
    expect(srv.ens.has(e1.id)).toBe(true);
    expect(await pendingCount(db)).toBe(0);
  });

  it('an old server that returns no `rejected` list behaves as before', async () => {
    const { db, srv } = await seed();
    const push = srv.push.bind(srv);
    srv.push = async (b) => {
      await push(b);
      return undefined as never;
    };
    await expect(pushDirty(db, srv)).resolves.toBe(4);
    expect(await countRejected(db)).toBe(0);
  });

  it('a rejected row does not block pulling', async () => {
    const { db, srv } = await seed();
    srv.reject = (t) => (t === 'entries' ? 'bad' : null);
    await syncOnce(db, srv);
    const other = await phone();
    await syncOnce(other, srv);
    expect(await listHouseholds(other)).toHaveLength(1);
    expect(await listEntries(other, L)).toHaveLength(0);
    await pullAll(db, srv);
  });
});

describe('ledgers on the wire', () => {
  it('syncs personal ledgers and ledger_id on entries/events; PIN hashes never leave the phone', async () => {
    const srv = new FakeServer();
    const a = await phone();
    const h = await createHousehold(a, hh('रमेश'));
    const sita = await createLedger(a, 'सीता', hashPin('4321', new Uint8Array(16).fill(5)));
    const ev = await createEvent(a, { hostHouseholdId: h.id, occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'PLANNED', ledgerId: sita.id });
    await addEntry(a, { ...base, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 5100, ledgerId: sita.id, eventId: ev.id });
    await addEntry(a, { ...base, otherHouseholdId: h.id, direction: 'AAYA', cashPaise: 100 });
    await syncOnce(a, srv);

    const wire = JSON.stringify(srv.pushes);
    expect(wire).not.toContain('pbkdf2');
    expect(wire).not.toContain('pin');
    expect(srv.ls.size).toBe(1); // the default ledger has a fixed id on every phone and is not uploaded

    const b = await phone();
    await syncOnce(b, srv);
    const ledgers = await listLedgers(b);
    expect(ledgers.map((l) => [l.id, l.name, l.hasPin])).toEqual([[L, 'घर का खाता', false], [sita.id, 'सीता', false]]);
    expect((await listEvents(b, sita.id)).map((e) => e.id)).toEqual([ev.id]);
    expect(await sqlTotals(b, sita.id)).toEqual({ receivedPaise: 5100, givenPaise: 0 });
    expect(await sqlTotals(b, L)).toEqual({ receivedPaise: 100, givenPaise: 0 });
  });

  it('pulling a ledger never touches the local PIN of a ledger with the same id; a newer name wins', async () => {
    const a = await phone();
    const l = await createLedger(a, 'सीता', hashPin('1111', new Uint8Array(16).fill(1)));
    await applyPage(a, emptyPage({ ledgers: [{ id: l.id, name: 'सीता देवी', kind: 'PERSONAL', createdAt: l.createdAt!, updatedAt: '2999-01-01T00:00:00.000Z' }] }));
    const got = (await listLedgers(a)).find((x) => x.id === l.id)!;
    expect(got).toMatchObject({ name: 'सीता देवी', hasPin: true });
    await setLedgerPin(a, l.id, null);
    expect((await listLedgers(a)).find((x) => x.id === l.id)!.hasPin).toBe(false);
  });

  it('wiping the phone leaves just the default household ledger', async () => {
    const a = await phone();
    await createLedger(a, 'सीता');
    await clearAllLocalData(a);
    expect((await listLedgers(a)).map((l) => l.id)).toEqual([L]);
  });
});
