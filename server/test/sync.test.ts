import { describe, expect, it } from 'vitest';
import { setup, signInWithGoogle, signInWithPhone, type Ctx } from './helpers';

const DEFAULT = '00000000-0000-4000-8000-000000000001';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
const hh = (n: number, name = `H${n}`, upd = T(0)) => ({
  id: id(n), headName: name, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला', phone: null, createdAt: T(0), updatedAt: upd,
});
const ev = (n: number, host: number, status = 'PLANNED', upd = T(0)) => ({
  id: id(n), hostHouseholdId: id(host), occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM',
  status, createdAt: T(0), updatedAt: upd,
});
const en = (n: number, house: number, extra: Record<string, unknown> = {}) => ({
  id: id(n), eventId: id(900), otherHouseholdId: id(house), direction: 'AAYA', cashPaise: 50100, inKindItem: null, inKindValuePaise: 0,
  paymentMode: 'CASH', recordedBy: 'me', createdAt: T(n), correctsEntryId: null, isVoid: false, ...extra,
});

const lg = (n: number, name = `Ledger${n}`, upd = T(0)) => ({ id: id(n), name, kind: 'PERSONAL', createdAt: T(0), updatedAt: upd });

const push = (t: Ctx, token: string, b: object) => t.call('POST', '/v1/sync/push', { token, body: b });
const pull = (t: Ctx, token: string, q = '') => t.call('GET', `/v1/sync/pull${q}`, { token });

describe('push', () => {
  it('stores rows and pull returns them with a cursor', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r = await push(t, s.accessToken, { households: [hh(1)], events: [ev(10, 1)], entries: [en(20, 1, { eventId: id(10), inKindItem: 'घी', inKindValuePaise: 100 })] });
    expect(r.status).toBe(200);
    expect(r.json.accepted).toEqual({ ledgers: 0, households: 1, events: 1, entries: 1, profile: 0 });
    expect(r.json.rejected).toEqual([]);
    const p = await pull(t, s.accessToken);
    expect(p.json.hasMore).toBe(false);
    expect(p.json.households).toEqual([hh(1)]);
    expect(p.json.events).toEqual([{ ...ev(10, 1), ledgerId: DEFAULT, occasionLabel: null, occasionNote: null }]);
    expect(p.json.entries[0]).toMatchObject({ id: id(20), eventId: id(10), inKindItem: 'घी', cashPaise: 50100, isVoid: false, ledgerId: DEFAULT, occurredOn: T(20).slice(0, 10) });
    expect(p.json.nextCursor).toBeGreaterThan(0);
    expect((await pull(t, s.accessToken, `?since=${p.json.nextCursor}`)).json).toMatchObject({ ledgers: [], profile: null, households: [], events: [], entries: [], hasMore: false, nextCursor: p.json.nextCursor });
  });

  it('is idempotent: re-pushing the same rows changes nothing and creates no new server_seq for entries', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const body = { households: [hh(1)], entries: [en(20, 1)] };
    await push(t, s.accessToken, body);
    const first = (await pull(t, s.accessToken)).json;
    const again = await push(t, s.accessToken, body);
    expect(again.json.accepted).toEqual({ ledgers: 0, households: 0, events: 0, entries: 0, profile: 0 });
    expect((await pull(t, s.accessToken)).json).toEqual(first);
  });

  it('entries are immutable: a conflicting push never overwrites', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    await push(t, s.accessToken, { entries: [en(20, 1)] });
    await push(t, s.accessToken, { entries: [en(20, 1, { cashPaise: 999 })] });
    expect((await pull(t, s.accessToken)).json.entries[0].cashPaise).toBe(50100);
  });

  it('households and events are last-write-wins by updated_at', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    await push(t, s.accessToken, { households: [hh(1, 'old', T(5))], events: [ev(10, 1, 'PLANNED', T(5))] });
    // older write loses
    let r = await push(t, s.accessToken, { households: [hh(1, 'stale', T(4))], events: [ev(10, 1, 'SETTLED', T(4))] });
    expect(r.json.accepted).toMatchObject({ households: 0, events: 0 });
    // equal timestamp does not replace
    r = await push(t, s.accessToken, { households: [hh(1, 'tie', T(5))] });
    expect(r.json.accepted.households).toBe(0);
    // newer wins and gets a new server_seq (so other devices pick it up)
    const before = (await pull(t, s.accessToken)).json.nextCursor;
    r = await push(t, s.accessToken, { households: [hh(1, 'new', T(6))], events: [ev(10, 1, 'HELD', T(6))] });
    expect(r.json.accepted).toMatchObject({ households: 1, events: 1 });
    const p = (await pull(t, s.accessToken, `?since=${before}`)).json;
    expect(p.households[0].headName).toBe('new');
    expect(p.events[0].status).toBe('HELD');
    expect((await pull(t, s.accessToken)).json.households).toHaveLength(1);
  });

  it('dedupes rows inside one batch (newest wins for LWW tables)', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r = await push(t, s.accessToken, { households: [hh(1, 'b', T(2)), hh(1, 'a', T(1))], entries: [en(20, 1), en(20, 1, { cashPaise: 1 })] });
    expect(r.status).toBe(200);
    const p = (await pull(t, s.accessToken)).json;
    expect(p.households).toHaveLength(1);
    expect(p.households[0].headName).toBe('b');
    expect(p.entries).toHaveLength(1);
  });

  it('syncs voids and correction chains as ordinary rows', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    await push(t, s.accessToken, { entries: [en(20, 1), en(21, 1, { correctsEntryId: id(20), cashPaise: 60100 }), en(22, 1, { correctsEntryId: id(21), cashPaise: 0, isVoid: true })] });
    const e = (await pull(t, s.accessToken)).json.entries;
    expect(e.map((x: any) => [x.id, x.correctsEntryId, x.isVoid])).toEqual([[id(20), null, false], [id(21), id(20), false], [id(22), id(21), true]]);
  });

  it('validates per row: bad rows are rejected with id + reason, the batch as a whole is not (no poison rows)', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const cases: [string, object, string, string][] = [
      ['households', { households: [{ ...hh(1), id: 'nope' }] }, 'nope', 'invalid_payload:id'],
      ['households', { households: [{ ...hh(1), updatedAt: '2026-01-01' }] }, id(1), 'invalid_payload:updatedAt'],
      ['households', { households: [{ ...hh(1), headName: 5 }] }, id(1), 'invalid_payload:headName'],
      ['households', { households: [{ ...hh(1), headName: 'a\u0000b' }] }, id(1), 'invalid_payload:headName'], // NUL would fail the whole INSERT
      ['events', { events: [{ ...ev(10, 1), occasion: 'MRITYU_BHOJ' }] }, id(10), 'invalid_payload:occasion'],
      ['events', { events: [{ ...ev(10, 1), ledgerId: 'zzz' }] }, id(10), 'invalid_payload:ledgerId'],
      ['entries', { entries: [en(20, 1, { cashPaise: -1 })] }, id(20), 'invalid_payload:cashPaise'],
      ['entries', { entries: [en(20, 1, { cashPaise: 1.5 })] }, id(20), 'invalid_payload:cashPaise'],
      ['entries', { entries: [en(20, 1, { direction: 'X' })] }, id(20), 'invalid_payload:direction'],
      ['entries', { entries: [en(20, 1, { isVoid: true })] }, id(20), 'invalid_payload:isVoid'], // void without target
      ['entries', { entries: [en(20, 1, { isVoid: true, correctsEntryId: id(1), cashPaise: 5 })] }, id(20), 'invalid_payload:isVoid'],
      ['entries', { entries: ['x'] }, '', 'invalid_payload:row'],
      ['ledgers', { ledgers: [{ ...lg(30), kind: 'SECRET' }] }, id(30), 'invalid_payload:kind'],
      ['ledgers', { ledgers: [{ ...lg(30), name: '   ' }] }, id(30), 'invalid_payload:name'],
    ];
    for (const [table, body, rid, reason] of cases) {
      const r = await push(t, s.accessToken, body);
      expect(r.status, reason).toBe(200);
      expect(r.json.accepted).toEqual({ ledgers: 0, households: 0, events: 0, entries: 0, profile: 0 });
      expect(r.json.rejected).toEqual([{ table, id: rid === '' ? null : rid, index: 0, reason }]);
    }
    expect((await t.pg.query('SELECT count(*)::int AS n FROM entries')).rows[0]).toEqual({ n: 0 });
  });

  it('one bad row does not stop the rows around it, and indexes point at the sent array', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r = await push(t, s.accessToken, {
      households: [hh(1), { ...hh(2), jati: 7 }, hh(3)],
      entries: [en(20, 1), en(21, 1, { cashPaise: -5 }), en(22, 1), en(23, 1, { direction: 'Q' })],
      ledgers: [lg(30)],
    });
    expect(r.status).toBe(200);
    expect(r.json.accepted).toEqual({ ledgers: 1, households: 2, events: 0, entries: 2, profile: 0 });
    expect(r.json.rejected).toEqual([
      { table: 'households', id: id(2), index: 1, reason: 'invalid_payload:jati' },
      { table: 'entries', id: id(21), index: 1, reason: 'invalid_payload:cashPaise' },
      { table: 'entries', id: id(23), index: 3, reason: 'invalid_payload:direction' },
    ]);
    const p = (await pull(t, s.accessToken)).json;
    expect(p.households.map((x: any) => x.id).sort()).toEqual([id(1), id(3)]);
    expect(p.entries.map((x: any) => x.id).sort()).toEqual([id(20), id(22)]);
    // a re-push of the corrected row is accepted
    const fixed = await push(t, s.accessToken, { entries: [en(21, 1)] });
    expect(fixed.json).toMatchObject({ accepted: { entries: 1 }, rejected: [] });
  });

  it('only whole-request problems are a 400: not an object, a non-array list, too many rows, bad JSON', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    for (const b of [{ entries: 'x' }, { households: {} }, [], 'str', { ledgers: 1 }]) expect((await push(t, s.accessToken, b as object)).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => en(1000 + i, 1));
    const r = await push(t, s.accessToken, { entries: many });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('batch_too_large');
    expect((await push(t, s.accessToken, { entries: many.slice(0, 500) })).json.accepted.entries).toBe(500);
    const bad = await t.app.request('/v1/sync/push', { method: 'POST', headers: { authorization: `Bearer ${s.accessToken}` }, body: '{not json' });
    expect(bad.status).toBe(400);
    // rejected rows never echo their values back
    const echo = await push(t, s.accessToken, { households: [{ ...hh(1), headName: 'SECRET-NAME'.repeat(100) }] });
    expect(JSON.stringify(echo.json)).not.toContain('SECRET-NAME');
  });
});

describe('pull', () => {
  it('paginates by server_seq across all three tables', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    await push(t, s.accessToken, { households: [hh(1), hh(2)] });
    await push(t, s.accessToken, { events: [ev(10, 1), ev(11, 1)] });
    await push(t, s.accessToken, { entries: [en(20, 1), en(21, 2), en(22, 1)] });
    const seen: string[] = [];
    let cursor = 0;
    let pages = 0;
    for (;;) {
      const p = (await pull(t, s.accessToken, `?since=${cursor}&limit=3`)).json;
      pages++;
      const n = p.households.length + p.events.length + p.entries.length;
      expect(n).toBeLessThanOrEqual(3);
      for (const r of [...p.households, ...p.events, ...p.entries]) seen.push(r.id);
      expect(p.nextCursor).toBeGreaterThan(cursor);
      cursor = p.nextCursor;
      if (!p.hasMore) break;
    }
    expect(pages).toBe(3);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('exact multiple of limit ends with hasMore=false', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    await push(t, s.accessToken, { households: [hh(1), hh(2)] });
    const p = (await pull(t, s.accessToken, '?limit=2')).json;
    expect(p.households).toHaveLength(2);
    expect(p.hasMore).toBe(false);
  });

  it('caps limit at 500 and validates params', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    expect((await pull(t, s.accessToken, '?limit=100000')).status).toBe(200);
    for (const q of ['?since=-1', '?since=abc', '?limit=0', '?limit=1.5']) expect((await pull(t, s.accessToken, q)).status).toBe(400);
  });
});

describe('account isolation', () => {
  it('users never see or affect each other\'s rows, even with identical ids', async () => {
    const t = await setup();
    const a = await signInWithPhone(t, '9876543210');
    const b = await signInWithGoogle(t, 'g-b');
    expect(a.user.id).not.toBe(b.user.id);
    await push(t, a.accessToken, { households: [hh(1, 'A-house', T(1))], events: [ev(10, 1)], entries: [en(20, 1)] });
    expect((await pull(t, b.accessToken)).json).toMatchObject({ households: [], events: [], entries: [] });

    // B pushes the same ids: independent rows, A's data is untouched (not overwritten, not blocked)
    const r = await push(t, b.accessToken, { households: [hh(1, 'B-house', T(9))], events: [ev(10, 1, 'SETTLED', T(9))], entries: [en(20, 1, { cashPaise: 7 })] });
    expect(r.json.accepted).toMatchObject({ households: 1, events: 1, entries: 1 });
    const pa = (await pull(t, a.accessToken)).json;
    expect(pa.households[0].headName).toBe('A-house');
    expect(pa.events[0].status).toBe('PLANNED');
    expect(pa.entries[0].cashPaise).toBe(50100);
    const pb = (await pull(t, b.accessToken)).json;
    expect(pb.households[0].headName).toBe('B-house');
    expect(pb.entries[0].cashPaise).toBe(7);
    // a user cannot pull by guessing someone else's cursor/ids
    expect((await t.pg.query('SELECT count(*)::int AS n FROM entries')).rows[0]).toEqual({ n: 2 });
  });

  it('a second device of the same user sees the data (restore on a new phone = pull from 0)', async () => {
    const t = await setup();
    const a = await signInWithGoogle(t, 'g-1');
    await push(t, a.accessToken, { households: [hh(1)], entries: [en(20, 1)] });
    const fresh = await signInWithGoogle(t, 'g-1');
    const p = (await pull(t, fresh.accessToken, '?since=0')).json;
    expect(p.households).toHaveLength(1);
    expect(p.entries).toHaveLength(1);
  });
});

describe('stage 7: occasions, custom label, diary date, direction rule', () => {
  const profile = (me: number, upd = T(0)) => ({ myHouseholdId: id(me), increment: null, updatedAt: upd });

  it('accepts the two new occasions and rejects anything else, also at the database level', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    for (const [n, occasion] of [[10, 'GRIHAPRAVESH'], [11, 'MUNDAN']] as const) {
      const r = await push(t, s.accessToken, { households: [hh(1)], events: [{ ...ev(n, 1), occasion }] });
      expect(r.json.rejected).toEqual([]);
    }
    const p = await pull(t, s.accessToken);
    expect(p.json.events.map((e: any) => e.occasion).sort()).toEqual(['GRIHAPRAVESH', 'MUNDAN']);
    await expect(
      t.pg.query(`UPDATE events SET occasion = 'MRITYU_BHOJ' WHERE id = $1`, [id(10)]),
    ).rejects.toThrow();
  });

  it('stores a custom name and details for OTHER (trimmed), ignores them for other occasions, caps their length', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const other = { ...ev(10, 1), occasion: 'OTHER', occasionLabel: '  नामकरण ', occasionNote: 'बेटी का' };
    const shaadi = { ...ev(11, 1), occasionLabel: 'x', occasionNote: 'y' };
    expect((await push(t, s.accessToken, { households: [hh(1)], events: [other, shaadi] })).json.rejected).toEqual([]);
    const p = (await pull(t, s.accessToken)).json.events as any[];
    expect(p.find((e) => e.id === id(10))).toMatchObject({ occasionLabel: 'नामकरण', occasionNote: 'बेटी का' });
    expect(p.find((e) => e.id === id(11))).toMatchObject({ occasionLabel: null, occasionNote: null });
    const long = await push(t, s.accessToken, { events: [{ ...other, id: id(12), occasionLabel: 'क'.repeat(61) }] });
    expect(long.json.rejected).toEqual([{ table: 'events', id: id(12), index: 0, reason: 'invalid_payload:occasionLabel' }]);
    const long2 = await push(t, s.accessToken, { events: [{ ...other, id: id(13), occasionNote: 'क'.repeat(501) }] });
    expect(long2.json.rejected[0].reason).toBe('invalid_payload:occasionNote');
    const edit = await push(t, s.accessToken, { events: [{ ...other, occasionLabel: 'मुंडन के बाद की पूजा', updatedAt: T(5) }] });
    expect(edit.json.accepted.events).toBe(1); // events stay editable (last write wins)
    expect(((await pull(t, s.accessToken)).json.events as any[]).find((e) => e.id === id(10)).occasionLabel).toBe('मुंडन के बाद की पूजा');
  });

  it('keeps the diary date (occurredOn); an older app without it gets the date part of createdAt; bad dates are rejected', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r = await push(t, s.accessToken, {
      households: [hh(1)], events: [ev(10, 1)],
      entries: [en(20, 1, { eventId: id(10), occurredOn: '2019-05-17' }), en(21, 1, { eventId: id(10) }), en(22, 1, { eventId: id(10), occurredOn: '17/05/2019' })],
    });
    expect(r.json.rejected).toEqual([{ table: 'entries', id: id(22), index: 2, reason: 'invalid_payload:occurredOn' }]);
    const e = (await pull(t, s.accessToken)).json.entries as any[];
    expect(e.find((x) => x.id === id(20)).occurredOn).toBe('2019-05-17');
    expect(e.find((x) => x.id === id(21)).occurredOn).toBe(T(21).slice(0, 10));
  });

  it('every entry must name an event', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r = await push(t, s.accessToken, { households: [hh(1)], entries: [en(20, 1, { eventId: null }), { ...en(21, 1), eventId: undefined }] });
    expect(r.json.rejected.map((x: any) => x.reason)).toEqual(['invalid_payload:eventId', 'invalid_payload:eventId']);
  });

  it('direction follows the host: my event = AAYA, another family event = GAYA (batch or stored events/profile)', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    // me = household 1; event 10 hosted by me, event 11 hosted by household 2
    const first = await push(t, s.accessToken, {
      households: [hh(1), hh(2), hh(3)], events: [ev(10, 1), ev(11, 2)], profile: profile(1),
      entries: [
        en(20, 3, { eventId: id(10), direction: 'AAYA' }), // ok
        en(21, 3, { eventId: id(10), direction: 'GAYA' }), // given at my own event: refused
        en(22, 2, { eventId: id(11), direction: 'GAYA' }), // ok
        en(23, 2, { eventId: id(11), direction: 'AAYA' }), // received at someone else's event: refused
      ],
    });
    expect(first.json.rejected).toEqual([
      { table: 'entries', id: id(21), index: 1, reason: 'invalid_payload:direction' },
      { table: 'entries', id: id(23), index: 3, reason: 'invalid_payload:direction' },
    ]);
    expect(first.json.accepted.entries).toBe(2);
    // later batch: events and profile are read from storage
    const later = await push(t, s.accessToken, { entries: [en(24, 3, { eventId: id(10), direction: 'GAYA' }), en(25, 3, { eventId: id(10), direction: 'AAYA' })] });
    expect(later.json.rejected).toEqual([{ table: 'entries', id: id(24), index: 0, reason: 'invalid_payload:direction' }]);
    // voids and corrections inherit their target's direction and are not re-checked
    const exempt = await push(t, s.accessToken, {
      entries: [en(26, 3, { eventId: id(10), direction: 'GAYA', isVoid: true, correctsEntryId: id(20), cashPaise: 0 })],
    });
    expect(exempt.json.rejected).toEqual([]);
  });

  it('without a profile the direction cannot be compared, so the entry is accepted', async () => {
    const t = await setup();
    const s = await signInWithPhone(t);
    const r = await push(t, s.accessToken, { households: [hh(1)], events: [ev(10, 1)], entries: [en(20, 1, { eventId: id(10), direction: 'GAYA' })] });
    expect(r.json.rejected).toEqual([]);
  });
});
