/** Masking for user identifiers shown in the admin panel. Unmasking is a separate, audited action. */

const DOT = '•';

/** +919876543210 -> "+91 98•••••210". Other numbers keep only the last 3 digits. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const m = /^\+91(\d{10})$/.exec(e164);
  if (m) return `+91 ${m[1]!.slice(0, 2)}${DOT.repeat(5)}${m[1]!.slice(-3)}`;
  const d = e164.replace(/\D/g, '');
  return d.length >= 6 ? `${DOT.repeat(Math.max(4, d.length - 3))}${d.slice(-3)}` : DOT.repeat(4);
}

/** gaurav@gmail.com -> "g•••@gmail.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return `${email.slice(0, 1)}${DOT.repeat(3)}`;
  return `${email.slice(0, 1)}${DOT.repeat(3)}${email.slice(at)}`;
}

/** Ramesh -> "R•••". Account display names are masked too; they are not needed to support a user. */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  return `${[...name][0] ?? ''}${DOT.repeat(3)}`;
}

/** Mask a free-form contact the way it looks: e-mail or phone. Anything else is shown as dots. */
export function maskContact(c: string | null | undefined): string | null {
  if (!c) return null;
  if (c.includes('@')) return maskEmail(c);
  const digits = c.replace(/\D/g, '');
  if (digits.length >= 10) return maskPhone(`+${digits.length === 10 ? '91' : ''}${digits}`);
  return DOT.repeat(4);
}

/** Phone-only accounts carry a placeholder e-mail (Better Auth requires one per user). It is not an e-mail: show nothing. */
export const PLACEHOLDER_EMAIL = /@phone\.notra\.invalid$/;
export const realEmail = (e: string | null | undefined): string | null => (!e || PLACEHOLDER_EMAIL.test(e) ? null : e);
