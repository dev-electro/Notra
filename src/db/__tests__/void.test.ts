/** Voids and void-of-correction chains: SQL (views/queries) must equal the pure core. */
import {
  activeEntries, balances, DEFAULT_LEDGER_ID as L, occasionWise, selfLedger, totals, type Increment,
} from '../../core';
import { migrate } from '../migrations';
import { memDb } from '../mem-db.testutil';
import {
  lastActiveEntryForEvent, listEntriesPage, sqlBalances, sqlEventSummaries, sqlEventTotals, sqlOccasionWise,
  sqlSelfLedgerPage, sqlTotals,
} from '../queries';
import { addEntry, correctEntry, createEvent, createHousehold, listEntries, listEvents, voidEntry } from '../repository';

const hh = (n: string) => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला' });
const INC: Increment = { type: 'FIXED', rupees: 51 };
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };

async function seed() {
  const db = memDb();
  await migrate(db);
  const a = await createHousehold(db, hh('रमेश'));
  const b = await createHousehold(db, hh('सुरेश'));
  const host = await createHousehold(db, hh('मैं'));
  const ev = await createEvent(db, { hostHouseholdId: host.id, occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'PLANNED' });
  let t = 0;
  const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString();
  const e1 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 50100, eventId: ev.id, createdAt: at() });
  const e2 = await addEntry(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 25100, eventId: ev.id, createdAt: at() });
  const e3 = await addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 11100, eventId: ev.id, createdAt: at() });
  await voidEntry(db, e2, at()); // plain void
  const c1 = await correctEntry(db, e1, { cashPaise: 60100, createdAt: at() });
  await voidEntry(db, c1, at()); // void of a correction: A <- B <- V leaves nothing for e1's line
  const e4 = await addEntry(db, { ...base, otherHouseholdId: b.id, direction: 'AAYA', cashPaise: 5100, eventId: ev.id, createdAt: at() });
  void e3;
  return { db, a, b, ev, e1, e2, e3, e4, c1 };
}

describe('void entries', () => {
  it('core: voids supersede the target and count as nothing', async () => {
    const { db, e3, e4 } = await seed();
    const all = await listEntries(db, L);
    expect(all.filter((e) => e.isVoid)).toHaveLength(2);
    expect(activeEntries(all).map((e) => e.id)).toEqual([e3.id, e4.id]);
    expect(totals(all)).toEqual({ receivedPaise: 16200, givenPaise: 0 });
  });

  it('SQL == core for totals, balances, occasion, self ledger, event summaries', async () => {
    const { db, ev } = await seed();
    const all = await listEntries(db, L);
    expect(await sqlTotals(db, L)).toEqual(totals(all));
    const got = await sqlBalances(db, INC, L);
    expect(Object.fromEntries(got.map((b) => [b.householdId, b]))).toEqual(balances(all, INC));
    expect(await sqlOccasionWise(db, L)).toEqual(occasionWise(all, await listEvents(db, L)));
    expect(await sqlSelfLedgerPage(db, L, 50)).toEqual(selfLedger(all).reverse());
    const s = (await sqlEventSummaries(db, L))[ev.id];
    expect(s).toMatchObject({ receivedPaise: 16200, entryCount: 2, giverCount: 2 });
  });

  it('history pages hide void rows but flag targets as superseded; activeOnly agrees with core', async () => {
    const { db, e1, e2, c1 } = await seed();
    const hist = await listEntriesPage(db, { ledgerId: L, limit: 50 });
    expect(hist.some((e) => e.isVoid)).toBe(false);
    expect(hist.filter((e) => e.superseded).map((e) => e.id).sort()).toEqual([e1.id, e2.id, c1.id].sort());
    const active = await listEntriesPage(db, { ledgerId: L, limit: 50, activeOnly: true });
    expect(active.map((e) => e.id).sort()).toEqual(activeEntries(await listEntries(db, L)).map((e) => e.id).sort());
  });

  it('event totals and "last active" follow voids (undo can be repeated)', async () => {
    const { db, ev, e3, e4 } = await seed();
    expect(await sqlEventTotals(db, ev.id)).toEqual({ cashPaise: 16200, inKindValuePaise: 0, totalPaise: 16200, giverCount: 2, entryCount: 2 });
    expect((await lastActiveEntryForEvent(db, ev.id))?.id).toBe(e4.id);
    await voidEntry(db, e4);
    expect((await lastActiveEntryForEvent(db, ev.id))?.id).toBe(e3.id);
    await voidEntry(db, e3);
    expect(await lastActiveEntryForEvent(db, ev.id)).toBeNull();
    expect(await sqlEventTotals(db, ev.id)).toEqual({ cashPaise: 0, inKindValuePaise: 0, totalPaise: 0, giverCount: 0, entryCount: 0 });
    expect(await sqlEventTotals(db, 'none')).toMatchObject({ totalPaise: 0, entryCount: 0 });
  });

  it('refuses double-void, correcting a void, and malformed voids at the DB level', async () => {
    const { db, e2, a } = await seed();
    const all = await listEntries(db, L);
    await expect(voidEntry(db, e2)).rejects.toThrow(/superseded/);
    const v = all.find((e) => e.isVoid)!;
    await expect(correctEntry(db, v, { cashPaise: 1 })).rejects.toThrow(/void/);
    await expect(
      addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 5, isVoid: true, correctsEntryId: e2.id }),
    ).rejects.toThrow(/void/);
    await expect(addEntry(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 0, isVoid: true })).rejects.toThrow(/void/);
  });

  it('voids stay append-only (no UPDATE/DELETE) but dirty can be cleared', async () => {
    const { db, e1 } = await seed();
    await expect(db.runAsync('UPDATE entries SET cash_paise = 1 WHERE id = ?', [e1.id])).rejects.toThrow(/immutable/);
    await db.runAsync('UPDATE entries SET dirty = 0 WHERE id = ?', [e1.id]);
    await expect(db.runAsync('DELETE FROM entries WHERE id = ?', [e1.id])).rejects.toThrow(/append-only/);
  });
});
