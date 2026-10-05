import type { Queryable } from './db';
import { ApiError } from './errors';

export const TICKET_CATEGORIES = ['grievance', 'bug', 'feedback', 'deletion', 'other'] as const;
export const TICKET_CHANNELS = ['app', 'email', 'phone', 'web', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKETS_PER_USER_PER_HOUR = 5;
/** DPDP: a grievance gets a reply within 30 days. */
export const GRIEVANCE_SLA_DAYS = 30;

export interface NewTicket {
  userId: string | null;
  channel: (typeof TICKET_CHANNELS)[number];
  category: TicketCategory;
  subject: string;
  body: string;
  contact?: string | null;
  priority?: (typeof TICKET_PRIORITIES)[number];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate the app's POST /v1/support body. Throws ApiError(400). */
export function parseTicketInput(b: unknown): { category: TicketCategory; subject: string; body: string } {
  if (!isObj(b)) throw new ApiError(400, 'invalid_input');
  const category = b.category;
  if (typeof category !== 'string' || !(TICKET_CATEGORIES as readonly string[]).includes(category)) throw new ApiError(400, 'invalid_category');
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if (subject.length < 3 || subject.length > 150) throw new ApiError(400, 'invalid_subject');
  if (body.length < 3 || body.length > 4000) throw new ApiError(400, 'invalid_body');
  return { category: category as TicketCategory, subject, body };
}

/** Insert a ticket; grievances get due_at = created + 30 days. Returns the new id. */
export async function createTicket(q: Queryable, t: NewTicket): Promise<{ id: string; due_at: string | null }> {
  const id = crypto.randomUUID();
  const [r] = await q.query<{ due_at: string | Date | null }>(
    `INSERT INTO support_tickets (id, user_id, channel, category, subject, body, contact, priority, due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $4 = 'grievance' THEN now() + ($9 || ' days')::interval END)
     RETURNING due_at`,
    [id, t.userId, t.channel, t.category, t.subject, t.body, t.contact ?? null, t.priority ?? 'normal', String(GRIEVANCE_SLA_DAYS)],
  );
  return { id, due_at: r?.due_at ? new Date(r.due_at).toISOString() : null };
}

/** App-side submit with a per-user rate limit (5 per hour), counted in SQL. */
export async function submitFromApp(q: Queryable, userId: string, input: { category: TicketCategory; subject: string; body: string }) {
  const [r] = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM support_tickets WHERE user_id = $1 AND channel = 'app' AND created_at > now() - interval '1 hour'`,
    [userId],
  );
  if ((r?.n ?? 0) >= TICKETS_PER_USER_PER_HOUR) throw new ApiError(429, 'too_many_requests', { retryAfter: 3600 });
  return createTicket(q, { userId, channel: 'app', ...input });
}

export interface Grant { id: string; grantedAt: string; expiresAt: string }

/**
 * "सहायता को मेरा डेटा 7 दिन दिखाएं": the USER lets support read their data, read-only, for up to 7 days (168 hours).
 * Only the user can create it (the INSERT policy requires user_id = app.user_id); revoking is immediate.
 */
export async function grantAccess(q: Queryable, userId: string, hours: number, ticketId: string | null): Promise<Grant> {
  if (ticketId) {
    const [t] = await q.query('SELECT 1 FROM support_tickets WHERE id = $1 AND user_id = $2', [ticketId, userId]);
    if (!t) throw new ApiError(404, 'ticket_not_found');
  }
  await q.query('UPDATE support_access_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  const id = crypto.randomUUID();
  const [r] = await q.query<{ granted_at: string | Date; expires_at: string | Date }>(
    `INSERT INTO support_access_grants (id, user_id, ticket_id, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
     RETURNING granted_at, expires_at`,
    [id, userId, ticketId, String(Math.floor(hours))],
  );
  return { id, grantedAt: new Date(r!.granted_at).toISOString(), expiresAt: new Date(r!.expires_at).toISOString() };
}

export async function revokeAccess(q: Queryable, userId: string): Promise<number> {
  return (await q.query('UPDATE support_access_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING 1', [userId])).length;
}

export async function activeGrant(q: Queryable, userId: string): Promise<Grant | null> {
  const [r] = await q.query<{ id: string; granted_at: string | Date; expires_at: string | Date }>(
    'SELECT id, granted_at, expires_at FROM support_access_grants WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY expires_at DESC LIMIT 1', [userId],
  );
  return r ? { id: r.id, grantedAt: new Date(r.granted_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString() } : null;
}
