import { displayDate, yearRange } from './date';

/** A report's date filter: one year (null = all years), or a from/to range that takes over from the year. */
export interface ReportFilter {
  year: number | null;
  from?: string;
  to?: string;
}

export const defaultFilter = (today: string): ReportFilter => ({ year: Number(today.slice(0, 4)) });

/** The ISO window this filter selects ({} = everything). */
export function filterRange(f: ReportFilter): { from?: string; to?: string } {
  if (f.from || f.to) return { from: f.from, to: f.to };
  return f.year === null ? {} : yearRange(f.year);
}

/** The filter as printed in the report header: "साल: 2026", "साल: सभी", "तारीख: 01/01/2026 से 31/03/2026". */
export function filterLabels(f: ReportFilter): string[] {
  if (f.from || f.to) return [`तारीख: ${f.from ? displayDate(f.from) : 'शुरू'} से ${f.to ? displayDate(f.to) : 'आज तक'}`];
  return [f.year === null ? 'साल: सभी' : `साल: ${f.year}`];
}
