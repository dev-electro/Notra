/**
 * Masking helpers. The server already returns masked values by default; these are used to (a) re-mask a value that was revealed with
 * the audited "unmask" action once the reveal timer ends, and (b) mask anything an admin types into a form before it is displayed again.
 * Same rules as server/src/admin/mask.ts.
 */
const DOT = '•';

/** +919876543210 -> "+91 98•••••210" */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^\+91(\d{10})$/.exec(value.replace(/\s/g, ''));
  if (m) return `+91 ${m[1]!.slice(0, 2)}${DOT.repeat(5)}${m[1]!.slice(-3)}`;
  const d = value.replace(/\D/g, '');
  return d.length >= 6 ? `${DOT.repeat(Math.max(4, d.length - 3))}${d.slice(-3)}` : DOT.repeat(4);
}

/** gaurav@gmail.com -> "g•••@gmail.com" */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return '';
  const at = value.lastIndexOf('@');
  if (at < 1) return `${value.slice(0, 1)}${DOT.repeat(3)}`;
  return `${value.slice(0, 1)}${DOT.repeat(3)}${value.slice(at)}`;
}

/** Mask whichever of phone / e-mail it looks like. */
export function maskAny(value: string | null | undefined): string {
  if (!value) return '';
  return value.includes('@') ? maskEmail(value) : maskPhone(value.replace(/\D/g, '').length === 10 ? `+91${value.replace(/\D/g, '')}` : value);
}

export const isMasked = (v: string | null | undefined): boolean => !!v && v.includes(DOT);
