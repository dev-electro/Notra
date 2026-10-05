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
