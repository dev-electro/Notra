export const SUPPRESSED = '<5';

/** Aggregate cell from the API: a number, null, or "<5" (small group hidden by k-anonymity). */
export type Cell = number | string | null;

export const isSuppressed = (v: unknown): boolean => v === SUPPRESSED;

export function fmtNum(v: Cell | undefined): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'string') return v;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(v);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const todayISO = (): string => new Date().toISOString().slice(0, 10);
export const daysAgoISO = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
