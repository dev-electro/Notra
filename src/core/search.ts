import { phoneSearchDigits } from './phone';
import type { Household } from './types';

export interface ParsedSearch {
  /** lowercase words; each must match name, father's name, village, panchayat, tehsil or district (or the phone, when it has 3+ digits) */
  tokens: string[];
  /** set when the whole box looks like a phone number ("+91 98765 43210"): then only the phone is searched */
  phone: string | null;
}

/** One search box for name, father, village, panchayat, tehsil, district and phone. Phone digits ignore +91, a leading 0, spaces and dashes. */
export function parseSearch(q: string): ParsedSearch {
  const t = q.trim();
  if (!t) return { tokens: [], phone: null };
  if (/^[\d\s+\-()]+$/.test(t)) {
    const d = phoneSearchDigits(t);
    if (d.length >= 3) return { tokens: [], phone: d };
  }
  return { tokens: t.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4), phone: null };
}

export const storedPhoneDigits = (phone: string | undefined | null): string => (phone ?? '').replace(/\D/g, '');

/** The tested reference for `searchHouseholds` in src/db/queries.ts (SQL must give the same rows). */
export function matchesSearch(h: Pick<Household, 'headName' | 'fatherName' | 'village' | 'phone'> & Partial<Pick<Household, 'panchayat' | 'tehsil' | 'district'>>, q: string): boolean {
  const { tokens, phone } = parseSearch(q);
  const digits = storedPhoneDigits(h.phone);
  if (phone) return digits.includes(phone);
  const fields = [h.headName, h.fatherName, h.village, h.panchayat, h.tehsil, h.district].map((s) => (s ?? '').toLowerCase());
  return tokens.every((tok) => {
    if (fields.some((f) => f.includes(tok))) return true;
    return /^\d{3,}$/.test(tok) && digits.includes(tok);
  });
}
