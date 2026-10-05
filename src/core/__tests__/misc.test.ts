import { notraCalendar } from '../calendar';
import { shiftDate, todayIso, displayDate } from '../date';
import { explainSuggestion } from '../explain';
import { eventLedgerHtml, escapeHtml, personLedgerHtml } from '../exportHtml';
import { OCCASION_LABEL } from '../labels';
import type { Entry, Household, NotraEvent } from '../types';

const ev = (id: string, date: string): NotraEvent => ({
  id, hostHouseholdId: 'me', occasion: 'SHAADI', date, panchApproved: true, invitationType: 'KUMKUM', status: 'PLANNED',
});
const hh: Household = { id: 'h1', headName: 'रमेश <b>', fatherName: 'कालू', village: 'सरवन', jati: 'भील', atak: 'डामोर', fala: 'ऊपला', panchayat: '', tehsil: '', district: '', kind: 'FAMILY' };
const entry = (id: string, dir: 'AAYA' | 'GAYA', cash: number, extra: Partial<Entry> = {}): Entry => ({
  id, otherHouseholdId: 'h1', direction: dir, cashPaise: cash, inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'me',
  createdAt: `2026-01-0${id}T00:00:00Z`, ...extra,
});

describe('calendar', () => {
  it('groups one year by month in date order', () => {
    const c = notraCalendar([ev('a', '2026-11-21'), ev('b', '2026-02-03'), ev('c', '2026-11-02'), ev('d', '2025-11-02')], 2026);
    expect(c.map((m) => m.month)).toEqual([2, 11]);
    expect(c[1].events.map((e) => e.id)).toEqual(['c', 'a']);
  });
});

describe('date', () => {
  it('shifts with clamping', () => {
    expect(shiftDate('2026-01-31', { months: 1 })).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', { days: 1 })).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', { months: -3 })).toBe('2025-12-01');
    expect(shiftDate('2024-02-29', { years: 1 })).toBe('2025-02-28');
  });
  it('formats', () => {
    expect(todayIso(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(displayDate('2026-10-05')).toBe('05/10/2026');
  });
});

describe('explainSuggestion', () => {
  it('explains or says none', () => {
    expect(explainSuggestion(50100, 55100, { type: 'FIXED', rupees: 51 })).toContain('₹551');
    expect(explainSuggestion(0, null, { type: 'FIXED', rupees: 51 })).toContain('कोई सुझाव नहीं');
    expect(explainSuggestion(50100, 55100, { type: 'PERCENT', pct: 10 })).toContain('10%');
  });
});

describe('export html', () => {
  it('escapes and uses neutral wording; superseded entries are excluded', () => {
    expect(escapeHtml('<a>&"')).toBe('&lt;a&gt;&amp;&quot;');
    const entries = [entry('1', 'AAYA', 50100), entry('2', 'AAYA', 60100, { correctsEntryId: '1' }), entry('3', 'GAYA', 10100)];
    const p = personLedgerHtml(hh, entries);
    expect(p).toContain('लौटाना बाकी: ₹500');
    expect(p).not.toContain('रमेश <b>');
    expect(p).not.toMatch(/defaulter|चूक/);
    const e = eventLedgerHtml(ev('e', '2026-11-21'), undefined, [entry('1', 'AAYA', 50100), entry('2', 'AAYA', 60100, { correctsEntryId: '1' })], [hh]);
    expect(e).toContain('₹601');
    expect(e).not.toContain('₹501');
    expect(e).toContain(OCCASION_LABEL.SHAADI);
    expect(e).toContain('1 परिवार');
  });
});
