/** SQL aggregates must equal the pure core functions (the tested reference). */
import { addE, memDb } from '../mem-db.testutil';
import {
  activeEntries, balances, occasionWise, pendingFromBalances, pendingReturns, personRowsFromBalances, personWise,
  DEFAULT_LEDGER_ID as L, selfLedger, totals, type Increment,
} from '../../core';
import { migrate } from '../migrations';
import {
  listEntriesPage, sqlBalances, sqlEventSummaries, sqlOccasionWise, sqlSelfLedgerPage, sqlTotals, searchHouseholds,
} from '../queries';
import { correctEntry, createEvent, createHousehold, listEntries, listEvents, listHouseholds } from '../repository';

const hh = (n: string, v = 'सरवन') => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: v, fala: 'ऊपला' });

async function seed() {
  const db = memDb();
  await migrate(db);
  const a = await createHousehold(db, hh('रमेश'));
  const b = await createHousehold(db, hh('सुरेश', 'खेरवाड़ा'));
  const c = await createHousehold(db, hh('Mohan'));
  const host = await createHousehold(db, hh('मैं'));
  const shaadi = await createEvent(db, { hostHouseholdId: host.id, occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'HELD' });
  const bimari = await createEvent(db, { hostHouseholdId: host.id, occasion: 'BIMARI', date: '2026-12-01', panchApproved: false, invitationType: 'CARD', status: 'PLANNED' });
  let t = 0;
  const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString();
  const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
  const e1 = await addE(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 50100, eventId: shaadi.id, createdAt: at() });
  await addE(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', cashPaise: 10100, createdAt: at() });
  const e3 = await addE(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 25100, inKindItem: 'घी', inKindValuePaise: 100000, eventId: shaadi.id, createdAt: at() });
  await addE(db, { ...base, otherHouseholdId: c.id, direction: 'GAYA', cashPaise: 10100, eventId: bimari.id, createdAt: at() });
  const e5 = await correctEntry(db, e1, { cashPaise: 60100, createdAt: at() });
  await correctEntry(db, e5, { cashPaise: 70100, createdAt: at() }); // chain
  await addE(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 11100, createdAt: at() });
  void e3;
  return { db, a, b, c, shaadi, bimari };
}

const INC: Increment = { type: 'FIXED', rupees: 51 };

describe('sql aggregates match core', () => {
  it('totals', async () => {
    const { db } = await seed();
    expect(await sqlTotals(db, L)).toEqual(totals(await listEntries(db, L)));
  });

  it('balances (all and single) incl. corrections and suggestions', async () => {
    const { db, a } = await seed();
    const entries = await listEntries(db, L);
    for (const inc of [INC, { type: 'PERCENT', pct: 10 } as Increment]) {
      const ref = balances(entries, inc);
      const got = await sqlBalances(db, inc, L);
      expect(Object.fromEntries(got.map((b) => [b.householdId, b]))).toEqual(ref);
    }
    expect(await sqlBalances(db, INC, L, a.id)).toEqual([balances(entries, INC)[a.id]]);
  });

  it('person-wise and pending rows built from SQL balances equal the core reports', async () => {
    const { db } = await seed();
    const entries = await listEntries(db, L);
    const hs = await listHouseholds(db);
    const bals = await sqlBalances(db, INC, L);
    expect(personRowsFromBalances(bals, hs)).toEqual(personWise(entries, hs, INC));
    expect(pendingFromBalances(bals, hs)).toEqual(pendingReturns(entries, hs, INC));
  });

  it('occasion-wise', async () => {
    const { db } = await seed();
    const entries = await listEntries(db, L);
    const ref = occasionWise(entries, await listEvents(db, L));
    const key = (r: { occasion: string }) => r.occasion;
    expect([...(await sqlOccasionWise(db, L))].sort((x, y) => key(x).localeCompare(key(y)))).toEqual(
      [...ref].sort((x, y) => key(x).localeCompare(key(y))),
    );
  });

  it('self ledger pages (newest first) carry the same running balance', async () => {
    const { db } = await seed();
    const ref = selfLedger(await listEntries(db, L)).reverse();
    const p1 = await sqlSelfLedgerPage(db, L, 3, 0);
    const p2 = await sqlSelfLedgerPage(db, L, 3, 3);
    expect([...p1, ...p2]).toEqual(ref);
  });

  it('event summaries', async () => {
    const { db, shaadi } = await seed();
    const s = await sqlEventSummaries(db, L);
    const ref = activeEntries(await listEntries(db, L)).filter((e) => e.eventId === shaadi.id);
    expect(s[shaadi.id].entryCount).toBe(ref.length);
    expect(s[shaadi.id].receivedPaise).toBe(ref.reduce((x, e) => x + e.cashPaise + e.inKindValuePaise, 0));
    expect(s[shaadi.id].giverCount).toBe(2);
  });
});

describe('pagination and search', () => {
  it('pages history newest first and flags superseded entries', async () => {
    const { db, a } = await seed();
    const all = await listEntriesPage(db, { ledgerId: L, householdId: a.id, limit: 50 });
    expect(all).toHaveLength(4);
    expect(all.filter((e) => e.superseded)).toHaveLength(2);
    const active = await listEntriesPage(db, { ledgerId: L, householdId: a.id, limit: 50, activeOnly: true });
    expect(active).toHaveLength(2);
    const p = await listEntriesPage(db, { ledgerId: L, householdId: a.id, limit: 2, offset: 2 });
    expect(p.map((e) => e.id)).toEqual(all.slice(2, 4).map((e) => e.id));
    expect((await listEntriesPage(db, { ledgerId: L, direction: 'GAYA', limit: 10, activeOnly: true })).every((e) => e.direction === 'GAYA')).toBe(true);
  });

  it('searches by name, father and village, with paging', async () => {
    const { db } = await seed();
    expect((await searchHouseholds(db, 'खेरवाड़ा', 10)).map((h) => h.headName)).toEqual(['सुरेश']);
    expect((await searchHouseholds(db, 'mohan', 10)).map((h) => h.headName)).toEqual(['Mohan']);
    expect(await searchHouseholds(db, 'कालू', 10)).toHaveLength(4);
    expect(await searchHouseholds(db, '', 2, 2)).toHaveLength(2);
    expect(await searchHouseholds(db, 'zzz', 10)).toEqual([]);
  });
});
