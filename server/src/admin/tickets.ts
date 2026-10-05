import { ApiError } from '../errors';
import { createTicket, TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from '../support';
import { audit, iso, oneOf, pageOf, readBody, reasonOf, str, uuidParam, UUID_RE, type Env, type Registry } from './kit';
import { maskContact } from './mask';

interface TicketRow {
  id: string; user_id: string | null; channel: string; category: string; subject: string; body: string; contact: string | null;
  status: string; priority: string; assignee: string | null; created_at: string | Date; updated_at: string | Date;
  due_at: string | Date | null; resolved_at: string | Date | null; resolution: string | null; overdue: boolean;
}

const COLS = `id, user_id, channel, category, subject, body, contact, status, priority, assignee, created_at, updated_at, due_at, resolved_at, resolution,
  (due_at IS NOT NULL AND due_at < now() AND status IN ('open', 'in_progress')) AS overdue`;

const view = (t: TicketRow, withBody: boolean) => ({
  id: t.id, user_id: t.user_id, channel: t.channel, category: t.category, subject: t.subject, ...(withBody ? { body: t.body } : {}),
  contact_masked: maskContact(t.contact), status: t.status, priority: t.priority, assignee: t.assignee,
  created_at: iso(t.created_at), updated_at: iso(t.updated_at), due_at: iso(t.due_at), resolved_at: iso(t.resolved_at),
  resolution: t.resolution, overdue: t.overdue,
});

/** Support and grievance tickets (DPDP: grievances are answered within 30 days; overdue ones are flagged). */
export function ticketRoutes(r: Registry, _env: Env): void {
  r.get('/tickets', 'viewer', async (c) => {
    const { page, size, offset } = pageOf(c);
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
    const g = (k: string) => c.req.query(k) || undefined;
    if (g('status')) add('status = ?', oneOf(g('status'), TICKET_STATUSES, 'status'));
    if (g('category')) add('category = ?', oneOf(g('category'), TICKET_CATEGORIES, 'category'));
    if (g('priority')) add('priority = ?', oneOf(g('priority'), TICKET_PRIORITIES, 'priority'));
    if (g('assignee')) add('assignee = ?', g('assignee'));
    if (g('overdue') === '1') where.push(`due_at IS NOT NULL AND due_at < now() AND status IN ('open', 'in_progress')`);
    if (g('q')) add('subject ILIKE ?', `%${g('q')!.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const q = c.get('q');
    const [cnt] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM support_tickets ${w}`, p);
    const rows = await q.query<TicketRow>(
      `SELECT ${COLS} FROM support_tickets ${w} ORDER BY (status IN ('open','in_progress')) DESC, overdue DESC, due_at NULLS LAST, created_at DESC LIMIT ${size} OFFSET ${offset}`, p,
    );
    const [sum] = await q.query<{ open: number; overdue: number }>(
      `SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
              count(*) FILTER (WHERE due_at < now() AND status IN ('open','in_progress'))::int AS overdue FROM support_tickets`,
    );
    return c.json({ items: rows.map((t) => view(t, false)), page, page_size: size, total: cnt?.n ?? 0, summary: sum });
  });

  r.get('/tickets/:ticketId', 'viewer', async (c) => {
    const id = uuidParam(c, 'ticketId');
    const q = c.get('q');
    const [t] = await q.query<TicketRow>(`SELECT ${COLS} FROM support_tickets WHERE id = $1`, [id]);
    if (!t) throw new ApiError(404, 'not_found');
    const notes = c.get('admin').role === 'viewer' ? [] : await q.query<{ id: string; admin_label: string; kind: string; body: string; at: string | Date }>(
      'SELECT id::text, admin_label, kind, body, at FROM ticket_notes WHERE ticket_id = $1 ORDER BY at, id', [id],
    );
    return c.json({ ...view(t, true), notes: notes.map((n) => ({ ...n, at: iso(n.at) })) });
  });

  // A ticket that came in by e-mail / phone / web form: staff log it so it has a due date and an owner.
  r.post('/tickets', 'support', async (c) => {
    const b = await readBody(c);
    if (b.user_id !== undefined && b.user_id !== null && (typeof b.user_id !== 'string' || !UUID_RE.test(b.user_id))) throw new ApiError(400, 'invalid_id');
    const userId = typeof b.user_id === 'string' ? b.user_id.toLowerCase() : null;
    const t = await createTicket(c.get('q'), {
      userId, channel: oneOf(b.channel ?? 'email', TICKET_CHANNELS, 'channel'), category: oneOf(b.category, TICKET_CATEGORIES, 'category'),
      subject: str(b, 'subject', { min: 3, max: 150 })!, body: str(b, 'body', { min: 3, max: 4000 })!,
      contact: str(b, 'contact', { max: 200, optional: true }) ?? null, priority: b.priority === undefined ? 'normal' : oneOf(b.priority, TICKET_PRIORITIES, 'priority'),
    });
    await audit(c, { action: 'ticket.create', targetType: 'ticket', targetId: t.id, after: { category: b.category, channel: b.channel ?? 'email' } });
    return c.json({ ok: true, id: t.id, due_at: t.due_at }, 201);
  });

  r.patch('/tickets/:ticketId', 'support', async (c) => {
    const id = uuidParam(c, 'ticketId');
    const b = await readBody(c);
    const q = c.get('q');
    const [cur] = await q.query<{ status: string; priority: string; assignee: string | null }>('SELECT status, priority, assignee FROM support_tickets WHERE id = $1 FOR UPDATE', [id]);
    if (!cur) throw new ApiError(404, 'not_found');
    const next = {
      status: b.status === undefined ? cur.status : oneOf(b.status, ['open', 'in_progress'] as const, 'status'),
      priority: b.priority === undefined ? cur.priority : oneOf(b.priority, TICKET_PRIORITIES, 'priority'),
      assignee: b.assignee === undefined ? cur.assignee : b.assignee === null || b.assignee === '' ? null : str(b, 'assignee', { max: 120 })!,
    };
    await q.query('UPDATE support_tickets SET status = $2, priority = $3, assignee = $4, updated_at = now() WHERE id = $1', [id, next.status, next.priority, next.assignee]);
    await audit(c, { action: 'ticket.update', targetType: 'ticket', targetId: id, before: cur, after: next });
    return c.json({ ok: true });
  });

  r.post('/tickets/:ticketId/notes', 'support', async (c) => {
    const id = uuidParam(c, 'ticketId');
    const b = await readBody(c);
    const kind = oneOf(b.kind ?? 'note', ['note', 'reply'] as const, 'kind');
    const body = str(b, 'body', { max: 4000 })!;
    const q = c.get('q');
    const [t] = await q.query('SELECT 1 FROM support_tickets WHERE id = $1', [id]);
    if (!t) throw new ApiError(404, 'not_found');
    await q.query('INSERT INTO ticket_notes (ticket_id, admin_label, kind, body) VALUES ($1, $2, $3, $4)', [id, c.get('admin').label, kind, body]);
    await q.query(`UPDATE support_tickets SET updated_at = now(), status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END WHERE id = $1`, [id]);
    await audit(c, { action: 'ticket.note', targetType: 'ticket', targetId: id, after: { kind, length: body.length } });
    return c.json({ ok: true }, 201);
  });

  r.post('/tickets/:ticketId/resolve', 'support', async (c) => {
    const id = uuidParam(c, 'ticketId');
    const b = await readBody(c);
    const status = oneOf(b.status ?? 'resolved', ['resolved', 'closed'] as const, 'status');
    const resolution = str(b, 'resolution', { min: 3, max: 4000 })!;
    const reason = reasonOf(b, false);
    const q = c.get('q');
    const [cur] = await q.query<{ status: string }>('SELECT status FROM support_tickets WHERE id = $1 FOR UPDATE', [id]);
    if (!cur) throw new ApiError(404, 'not_found');
    await q.query('UPDATE support_tickets SET status = $2, resolution = $3, resolved_at = now(), updated_at = now() WHERE id = $1', [id, status, resolution]);
    await audit(c, { action: 'ticket.resolve', targetType: 'ticket', targetId: id, reason, before: { status: cur.status }, after: { status } });
    return c.json({ ok: true });
  });
}
