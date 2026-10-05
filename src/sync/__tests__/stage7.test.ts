import { DEFAULT_LEDGER_ID as L, legacyEventId } from '../../core';
import { addE, memDb } from '../../db/mem-db.testutil';
import { migrate } from '../../db/migrations';
import { sqlGivenRows } from '../../db/reports';
import { createEvent, createHousehold, getEvent, listEntries, setMyHouseholdId, updateEventDetails } from '../../db/repository';
import type { Db } from '../../db/types';
import { applyPage, pullAll, pushDirty, syncOnce } from '../engine';
import { FakeServer } from '../fake-server.testutil';
import type { PullPage } from '../wire';

const hh = (n: string) => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला' });
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
const phone = async (): Promise<Db> => {
  const db = memDb();
  await migrate(db);
  return db;
};

describe('stage 7 over sync', () => {
  it('carries the diary date, the custom occasion name/details and the new occasions to the server and a second phone', async () => {
    const a = await phone();
    const srv = new FakeServer();
    const me = await createHousehold(a, hh('मैं'));
    await setMyHouseholdId(a, me.id);
    const h = await createHousehold(a, hh('रमेश'));
    const ev = await createEvent(a, { hostHouseholdId: h.id, occasion: 'OTHER', occasionLabel: 'नामकरण', occasionNote: 'बेटी का', date: '2019-05-17', panchApproved: false, invitationType: 'CARD', status: 'HELD' });
    const ev2 = await createEvent(a, { hostHouseholdId: h.id, occasion: 'MUNDAN', date: '2019-06-01', panchApproved: false, invitationType: 'CARD', status: 'HELD' });
    await addE(a, { ...base, otherHouseholdId: h.id, direction: 'GAYA', cashPaise: 50100, eventId: ev.id, occurredOn: '2019-05-17' });
    await pushDirty(a, srv);
    const sent = srv.pushes[0]!;
    expect(sent.entries[0]).toMatchObject({ occurredOn: '2019-05-17', eventId: ev.id });
    expect(sent.events.find((e) => e.id === ev.id)).toMatchObject({ occasionLabel: 'नामकरण', occasionNote: 'बेटी का' });
    expect(sent.events.find((e) => e.id === ev2.id)).toMatchObject({ occasion: 'MUNDAN', occasionLabel: null });

    const b = await phone();
    await pullAll(b, srv);
    expect(await getEvent(b, ev.id)).toMatchObject({ occasion: 'OTHER', occasionLabel: 'नामकरण', occasionNote: 'बेटी का', date: '2019-05-17' });
    expect((await listEntries(b, L))[0]).toMatchObject({ occurredOn: '2019-05-17', eventId: ev.id });
    expect((await sqlGivenRows(b, L, {}))[0]).toMatchObject({ date: '2019-05-17', occasionLabel: 'नामकरण' });
  });

  it('an edited event name travels (events are editable, last write wins)', async () => {
    const a = await phone();
    const b = await phone();
    const srv = new FakeServer();
    const h = await createHousehold(a, hh('रमेश'));
    const ev = await createEvent(a, { hostHouseholdId: h.id, occasion: 'OTHER', occasionLabel: 'पुराना नाम', date: '2026-01-01', panchApproved: false, invitationType: 'CARD', status: 'PLANNED' });
    await syncOnce(a, srv);
    await syncOnce(b, srv);
    await new Promise((r) => setTimeout(r, 3));
    await updateEventDetails(a, ev.id, { occasionLabel: 'नया नाम', occasionNote: 'विवरण' });
    await syncOnce(a, srv);
    await syncOnce(b, srv);
    expect(await getEvent(b, ev.id)).toMatchObject({ occasionLabel: 'नया नाम', occasionNote: 'विवरण' });
  });

  it('entries from an old cloud copy (no event, no occurredOn) are attached to the "पुराना हिसाब" event instead of failing', async () => {
    const db = await phone();
    const me = await createHousehold(db, hh('मैं'));
    await setMyHouseholdId(db, me.id);
    const h = await createHousehold(db, hh('रमेश'));
    const old = (id: string, direction: string) => ({
      id, eventId: null, otherHouseholdId: h.id, direction, cashPaise: 100, inKindItem: null, inKindValuePaise: 0, paymentMode: 'CASH',
      recordedBy: 'x', createdAt: '2025-03-04T10:00:00.000Z', correctsEntryId: null, isVoid: false, ledgerId: L,
    });
    const p: PullPage = { ledgers: [], households: [], events: [], entries: [old('e1', 'AAYA'), old('e2', 'GAYA'), old('e3', 'GAYA')], profile: null, nextCursor: 5, hasMore: false };
    await applyPage(db, p);
    const rows = await listEntries(db, L);
    expect(rows.map((e) => e.occurredOn)).toEqual(['2025-03-04', '2025-03-04', '2025-03-04']);
    expect(rows.map((e) => e.eventId)).toEqual([legacyEventId('AAYA', L, h.id), legacyEventId('GAYA', L, h.id), legacyEventId('GAYA', L, h.id)]);
    expect(await getEvent(db, legacyEventId('AAYA', L, h.id))).toMatchObject({ hostHouseholdId: me.id });
    expect(await getEvent(db, legacyEventId('GAYA', L, h.id))).toMatchObject({ hostHouseholdId: h.id });
    // the direction trigger is back on afterwards
    await expect(addE(db, { ...base, otherHouseholdId: h.id, direction: 'GAYA', cashPaise: 1, eventId: legacyEventId('AAYA', L, h.id) })).rejects.toThrow();
  });
});
