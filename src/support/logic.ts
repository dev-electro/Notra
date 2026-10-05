/** Support form + consented access: the pure parts (validation, offline queue, grant expiry). No React / Expo / network imports. */

export const CATEGORIES = [
  { id: 'complaint', label: 'शिकायत' },
  { id: 'bug', label: 'गड़बड़ी' },
  { id: 'suggestion', label: 'सुझाव' },
  { id: 'delete_account', label: 'खाता हटाना' },
  { id: 'other', label: 'अन्य' },
] as const;
export type SupportCategory = (typeof CATEGORIES)[number]['id'];

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

export interface SupportDraft {
  category: SupportCategory | null;
  subject: string;
  message: string;
}
export type DraftProblem = 'category' | 'subject' | 'message';

/** What is still missing, in the order the form shows it. Empty = ready to send. */
export function draftProblems(d: SupportDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!d.category) out.push('category');
  const s = d.subject.trim().length;
  if (s < SUBJECT_MIN || s > SUBJECT_MAX) out.push('subject');
  const m = d.message.trim().length;
  if (m < MESSAGE_MIN || m > MESSAGE_MAX) out.push('message');
  return out;
}

export interface QueuedTicket {
  /** Idempotency id so a retry after a lost response is not a duplicate. */
  clientId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  createdAt: string;
  appVersion: string;
}

export const QUEUE_MAX = 20;
export const QUEUE_MAX_AGE_MS = 30 * 86_400_000;

export function parseQueue(raw: string | null): QueuedTicket[] {
  try {
    const j = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(j)) return [];
    return j.filter(
      (t): t is QueuedTicket =>
        !!t && typeof t.clientId === 'string' && typeof t.subject === 'string' && typeof t.message === 'string' && typeof t.category === 'string' && typeof t.createdAt === 'string',
    );
  } catch {
    return [];
  }
}

/** Newest kept; entries older than 30 days dropped; at most 20. */
export function enqueue(queue: QueuedTicket[], t: QueuedTicket, now: number): QueuedTicket[] {
  const fresh = [...queue, t].filter((q) => now - Date.parse(q.createdAt) < QUEUE_MAX_AGE_MS || q.clientId === t.clientId);
  return fresh.slice(-QUEUE_MAX);
}

/** Send result: 'sent' (remove), 'drop' (the server will never accept it: remove), 'retry' (keep for later and stop). */
export type SendResult = 'sent' | 'drop' | 'retry';

/** Try each queued ticket in order; the first 'retry' stops the run (still offline). Returns what is left. */
export async function flushQueue(queue: QueuedTicket[], send: (t: QueuedTicket) => Promise<SendResult>): Promise<QueuedTicket[]> {
  const left = [...queue];
  while (left.length) {
    let r: SendResult;
    try {
      r = await send(left[0]!);
    } catch {
      r = 'retry';
    }
    if (r === 'retry') break;
    left.shift();
  }
  return left;
}

/** Which HTTP statuses mean "never going to work": a validation error (400/422). Everything else (offline, 401, 404, 429, 5xx) retries. */
export const sendResultForStatus = (status: number): SendResult => (status === 400 || status === 422 ? 'drop' : 'retry');

// ---- consented support access ----
export const ACCESS_DAYS = [1, 3, 7] as const;
export type AccessDays = (typeof ACCESS_DAYS)[number];

export interface AccessGrant {
  expiresAt: string;
}

export function parseGrant(raw: unknown): AccessGrant | null {
  const j = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof j !== 'object' || j === null) return null;
  const e = (j as { expiresAt?: unknown; expires_at?: unknown }).expiresAt ?? (j as { expires_at?: unknown }).expires_at;
  return typeof e === 'string' && !Number.isNaN(Date.parse(e)) ? { expiresAt: e } : null;
}
const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export const grantActive = (g: AccessGrant | null, now: number): g is AccessGrant => !!g && Date.parse(g.expiresAt) > now;

export const grantFromDays = (days: AccessDays, now: number): AccessGrant => ({ expiresAt: new Date(now + days * 86_400_000).toISOString() });

/** "आज रात तक" style is overkill: a plain date and time. */
export const expiryLabel = (g: AccessGrant) =>
  new Date(g.expiresAt).toLocaleString('hi-IN', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
