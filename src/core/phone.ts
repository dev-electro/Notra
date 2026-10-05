/**
 * Phone numbers from the contact picker come in every shape ("098765 43210", "+91 98765-43210", "(0294) 2412345").
 * Returns +91XXXXXXXXXX for an Indian mobile (10 digits starting 6-9, optionally with 0 / 91 / +91 in front); null otherwise.
 */
export function normalizeIndianMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/**
 * Digits of a phone for searching: no spaces, dashes or "+", and without the country code / trunk 0 in front when the
 * rest is a full 10-digit number. "+91 98765 43210" and "09876543210" both give "9876543210". A short typed number is kept as typed.
 */
export function phoneSearchDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Split a search box text into at most 4 lowercase words (every word must match some field). */
export function searchTokens(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
}
