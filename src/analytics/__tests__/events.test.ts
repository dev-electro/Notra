import fs from 'fs';
import path from 'path';
import { EVENTS, looksLeaky, pagesBucket, sanitizeEvent, SCREENS, screenFromSegments, supportCategory } from '../events';

describe('sanitizeEvent', () => {
  it('drops unknown events (including prototype keys) and non-strings', () => {
    for (const n of ['purchase', 'entry_saved_with_amount', '__proto__', 'constructor', 'toString', '', 5, null, undefined]) expect(sanitizeEvent(n, {})).toBeNull();
  });

  it('keeps declared params with allowed values; booleans become 1/0', () => {
    expect(sanitizeEvent('entry_saved', { side: 'mine_receive', has_in_kind: true, payment_mode: 'UPI' })).toEqual({
      name: 'entry_saved',
      params: { side: 'mine_receive', has_in_kind: 1, payment_mode: 'UPI' },
    });
    expect(sanitizeEvent('event_created', { occasion: 'SHAADI', is_mine: false, is_old_record: true })?.params).toEqual({ occasion: 'SHAADI', is_mine: 0, is_old_record: 1 });
    expect(sanitizeEvent('support_access_granted', { days: 3 })?.params).toEqual({ days: 3 });
    expect(sanitizeEvent('report_exported', { report: 'person', format: 'pdf', pages: '2-3' })?.params).toEqual({ report: 'person', format: 'pdf', pages: '2-3' });
  });

  it('drops every param that is not in the allow-list, and values outside it', () => {
    const r = sanitizeEvent('entry_saved', {
      side: 'others_give', has_in_kind: false, payment_mode: 'CASH',
      amount: 5000, cash_paise: 500000, name: 'Ramesh', father: 'Kalu', village: 'Dungarpur', phone: '9876543210', item: 'थाली', note: 'free text', household_id: 'abc',
    });
    expect(Object.keys(r!.params).sort()).toEqual(['has_in_kind', 'payment_mode', 'side']);
    expect(sanitizeEvent('entry_saved', { side: 'Ramesh gave 5001', payment_mode: 'CHEQUE', has_in_kind: 'yes' })!.params).toEqual({});
    expect(sanitizeEvent('event_created', { occasion: 'नामकरण', is_mine: true })!.params).toEqual({ is_mine: 1 }); // custom label never passes
    expect(sanitizeEvent('support_access_granted', { days: 30 })!.params).toEqual({});
    expect(sanitizeEvent('screen_view', { screen_name: '/events/12345678' })!.params).toEqual({}); // a real id is not a template
  });

  it('events without params never carry any', () => {
    expect(sanitizeEvent('entry_voided', { amount: 100000, who: 'x' })).toEqual({ name: 'entry_voided', params: {} });
    expect(sanitizeEvent('app_open_ready', 'junk')).toEqual({ name: 'app_open_ready', params: {} });
    expect(sanitizeEvent('app_open_ready', ['a'])).toEqual({ name: 'app_open_ready', params: {} });
  });

  it('ABSOLUTE guard: nothing long or with 4+ digits survives, whatever the allow-list says', () => {
    expect(looksLeaky('a'.repeat(41))).toBe(true);
    expect(looksLeaky('a'.repeat(40))).toBe(false);
    expect(looksLeaky('9876543210')).toBe(true);
    expect(looksLeaky('rs 5000')).toBe(true);
    expect(looksLeaky('123')).toBe(false);
    expect(looksLeaky(5000)).toBe(true);
    expect(looksLeaky(7)).toBe(false);
    expect(looksLeaky(Number.NaN)).toBe(true);
    // every value in the allow-list passes the guard (so the guard never silently eats a legitimate event)
    for (const spec of Object.values(EVENTS)) for (const v of Object.values(spec)) if (v !== 'boolean') (v as readonly (string | number)[]).forEach((x) => expect(looksLeaky(x)).toBe(false));
  });

  it('no allow-listed value looks like a name, id, phone or amount', () => {
    for (const spec of Object.values(EVENTS)) for (const v of Object.values(spec)) {
      if (v === 'boolean') continue;
      for (const x of v as readonly (string | number)[]) {
        const t = String(x);
        expect(t.length).toBeLessThanOrEqual(40);
        expect(/\d{4,}/.test(t)).toBe(false);
        expect(/[ऀ-ॿ]/.test(t)).toBe(false); // no Hindi text (which could only be user content)
      }
    }
  });

  it('every event name is 40 chars or less, lower snake case', () => {
    for (const n of Object.keys(EVENTS)) expect(n).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });
});

describe('buckets and mapping', () => {
  it('pagesBucket is coarse', () => {
    expect([0, 1, 2, 3, 4, 9, 10, 50].map(pagesBucket)).toEqual(['1', '1', '2-3', '2-3', '4-9', '4-9', '10+', '10+']);
  });
  it('supportCategory falls back to other', () => {
    expect(supportCategory('bug')).toBe('bug');
    expect(supportCategory('anything else')).toBe('other');
    expect(supportCategory(null)).toBe('other');
  });
});

describe('screens', () => {
  it('turns router segments into route templates', () => {
    expect(screenFromSegments([])).toBe('/');
    expect(screenFromSegments(['(tabs)'])).toBe('/');
    expect(screenFromSegments(['(tabs)', 'index'])).toBe('/');
    expect(screenFromSegments(['(tabs)', 'mera'])).toBe('/mera');
    expect(screenFromSegments(['events', '[id]'])).toBe('/events/[id]');
    expect(screenFromSegments(['events', '[id]', 'ledger'])).toBe('/events/[id]/ledger');
    expect(screenFromSegments(['reports', 'person'])).toBe('/reports/person');
    expect(screenFromSegments(['legal', '[id]'])).toBe('/legal/[id]');
  });
  it('real ids and unknown routes are not screens', () => {
    expect(screenFromSegments(['events', 'a1b2c3d4e5'])).toBeNull();
    expect(screenFromSegments(['+not-found'])).toBeNull();
    expect(screenFromSegments(['households', 'Ramesh'])).toBeNull();
  });
  it('SCREENS matches the route files in src/app exactly (add a screen => update the list)', () => {
    const root = path.join(__dirname, '../../app');
    const out: string[] = [];
    const walk = (dir: string, rel: string[]) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory()) walk(path.join(dir, f.name), [...rel, f.name]);
        else if (/\.tsx?$/.test(f.name) && !f.name.startsWith('_')) {
          const base = f.name.replace(/\.tsx?$/, '');
          const segs = [...rel, base].filter((s) => !(s.startsWith('(') && s.endsWith(')')) && s !== 'index');
          out.push(segs.length ? '/' + segs.join('/') : '/');
        }
      }
    };
    walk(root, []);
    expect([...SCREENS].sort()).toEqual([...new Set(out)].sort());
  });
});
