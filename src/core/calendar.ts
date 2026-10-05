import { MONTHS_HI } from './labels';
import type { NotraEvent } from './types';

export interface CalendarMonth {
  year: number;
  /** 1..12 */
  month: number;
  events: NotraEvent[];
}

/** Yearly Notra calendar: events of `year` grouped by month, months and events in date order. */
export function notraCalendar(events: readonly NotraEvent[], year: number): CalendarMonth[] {
  const byMonth = new Map<number, NotraEvent[]>();
  for (const e of events) {
    const y = Number(e.date.slice(0, 4));
    if (y !== year) continue;
    const m = Number(e.date.slice(5, 7));
    const list = byMonth.get(m) ?? [];
    list.push(e);
    byMonth.set(m, list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, list]) => ({
      year,
      month,
      events: list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    }));
}

export const WEEKDAYS_HI: readonly string[] = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** First and last ISO day of a month. */
export function monthRange(year: number, month1: number): { from: string; to: string } {
  return { from: `${year}-${p2(month1)}-01`, to: `${year}-${p2(month1)}-${p2(daysInMonth(year, month1))}` };
}

/**
 * Month grid for a calendar: weeks (Sunday first) of 7 cells; a cell is an ISO date or null (blank before the 1st / after the last).
 * Only as many weeks as the month needs (4 to 6).
 */
export function monthGrid(year: number, month1: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
  const n = daysInMonth(year, month1);
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(`${year}-${p2(month1)}-${p2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Hindi long date for headings: "5 अक्टूबर 2026". */
export function longDateHi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_HI[m - 1]} ${y}`;
}
