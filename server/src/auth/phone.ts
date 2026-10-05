/** Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null if it is not a valid 10-digit mobile. */
export function normalizeIndianMobile(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) {
    if (!d.startsWith('+91')) return null;
    d = d.slice(3);
  } else if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}
