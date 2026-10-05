import { ApiError } from '../errors';
import { audit, iso, oneOf, pageOf, readBody, reasonOf, uuidParam, type Env, type Registry } from './kit';

/**
 * रिश्ते moderation. Staff (support and above) see a profile ONLY here: the queue shows public details (first name, age, gender, height, gotra,
 * education, occupation, place) and never the contact number or the account behind it. Every view of a queue page and every decision is audited.
 * Reads and writes go through the SECURITY DEFINER admin_rishtey_* functions (migration 105); the table itself has no staff policy.
 */
export function rishteyRoutes(r: Registry, _env: Env): void {
  r.get('/rishtey/queue', 'support', async (c) => {
    const q = c.get('q');
    const status = oneOf(c.req.query('status') ?? 'pending', ['pending', 'approved', 'rejected', 'hidden'] as const, 'status');
    const p = pageOf(c);
    const rows = await q.query<{ id: string; status: string; first_name: string; age: number; gender: string; height_cm: number | null; gotra: string | null; education: string | null; occupation: string | null; place: string; published_by: string; submitted_at: string | Date; reject_reason: string | null; total: string | number }>(
      'SELECT * FROM admin_rishtey_queue($1, $2, $3)', [status, p.size, p.offset],
    );
    await audit(c, { action: 'rishtey.queue_view', targetType: 'rishtey_queue', targetId: status, after: { count: rows.length } });
    return c.json({
      page: p.page, size: p.size, total: rows.length ? Number(rows[0]!.total) : 0,
      items: rows.map(({ total: _t, submitted_at, ...x }) => ({ ...x, submitted_at: iso(submitted_at) })),
    });
  });

  // Approve or reject a pending profile. Rejecting needs a reason; the person sees it.
  r.post('/rishtey/profiles/:profileId/review', 'support', async (c) => {
    const id = uuidParam(c, 'profileId');
    const b = await readBody(c);
    const decision = oneOf(b.decision, ['approve', 'reject'] as const, 'decision');
    const reason = reasonOf(b, decision === 'reject');
    const [row] = await c.get('q').query<{ s: string }>('SELECT admin_rishtey_review($1, $2, $3) AS s', [id, decision === 'approve', reason]);
    if (!row) throw new ApiError(404, 'not_found');
    await audit(c, { action: `rishtey.${decision}`, targetType: 'rishtey_profile', targetId: id, reason, before: { status: 'pending' }, after: { status: row.s } });
    return c.json({ ok: true, status: row.s });
  });

  r.get('/rishtey/reports', 'support', async (c) => {
    const status = oneOf(c.req.query('status') ?? 'open', ['open', 'dismissed', 'actioned'] as const, 'status');
    const p = pageOf(c);
    const rows = await c.get('q').query<{ id: string; profile_id: string | null; reason: string; note: string | null; status: string; created_at: string | Date; first_name: string | null; profile_status: string | null; open_reports: string | number; total: string | number }>(
      'SELECT * FROM admin_rishtey_reports($1, $2, $3)', [status, p.size, p.offset],
    );
    return c.json({
      page: p.page, size: p.size, total: rows.length ? Number(rows[0]!.total) : 0,
      items: rows.map(({ total: _t, created_at, open_reports, ...x }) => ({ ...x, open_reports: Number(open_reports), created_at: iso(created_at) })),
    });
  });

  // Close a report: dismiss it, or hide the reported profile (which closes every open report about it).
  r.post('/rishtey/reports/:reportId/resolve', 'support', async (c) => {
    const id = uuidParam(c, 'reportId');
    const b = await readBody(c);
    const action = oneOf(b.action, ['dismiss', 'hide'] as const, 'action');
    const reason = reasonOf(b)!;
    const [row] = await c.get('q').query<{ s: string }>('SELECT admin_rishtey_resolve_report($1, $2, $3) AS s', [id, action, reason]);
    await audit(c, { action: `rishtey.report_${action}`, targetType: 'rishtey_report', targetId: id, reason, after: { status: row!.s } });
    return c.json({ ok: true, status: row!.s });
  });
}
