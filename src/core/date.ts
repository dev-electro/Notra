/** Tiny ISO-date helpers (YYYY-MM-DD) without a date library. All UTC-safe string maths. */

export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Shift an ISO date by whole days/months/years; the day is clamped (31 Jan + 1 month = 28/29 Feb). */
export function shiftDate(iso: string, delta: { days?: number; months?: number; years?: number }): string {
  const [y0, m0, d0] = iso.split('-').map(Number);
  let y = y0 + (delta.years ?? 0);
  let m = m0 - 1 + (delta.months ?? 0);
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const d = Math.min(d0, daysInMonth(y, m + 1));
  const t = Date.UTC(y, m, d) + (delta.days ?? 0) * 86400000;
  const out = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${out.getUTCFullYear()}-${p(out.getUTCMonth() + 1)}-${p(out.getUTCDate())}`;
}

/** dd/mm/yyyy for display in Hindi UI. */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
