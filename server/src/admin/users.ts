import { ApiError } from '../errors';
import { rank } from './auth';
import { audit, dateParam, iso, oneOf, pageOf, readBody, reasonOf, str, uuidParam, UUID_RE, type AdminContext, type Env, type Registry } from './kit';
import { maskEmail, maskName, maskPhone } from './mask';

interface ListRow {
  id: string; signup_method: string; has_google: boolean; has_phone: boolean; phone_e164: string | null; email: string | null;
  display_name: string | null; status: string; created_at: string | Date; last_seen: string | Date | null;
  app_version: string | null; platform: string | null;
}

/** Account metadata only. Phone, e-mail and name are masked; unmasking is a separate, audited, admin-only action. */
const summary = (r: ListRow) => ({
  id: r.id,
  signup_method: r.signup_method,
  sign_in_methods: [...(r.has_google ? ['google'] : []), ...(r.has_phone ? ['phone'] : [])],
  phone_masked: maskPhone(r.phone_e164),
  email_masked: maskEmail(r.email),
  name_masked: maskName(r.display_name),
  status: r.status,
  created_at: iso(r.created_at),
  last_active_at: iso(r.last_seen),
  app_version: r.app_version,
  platform: r.platform,
});

const SELECT = `
  SELECT u.id, u.signup_method, u.google_sub IS NOT NULL AS has_google, u.phone_e164 IS NOT NULL AS has_phone, u.phone_e164, real_email(u.email) AS email,
         u.display_name, u.status, u.created_at, d.last_seen, d.app_version, d.platform
  FROM users u
  LEFT JOIN LATERAL (SELECT last_seen, app_version, platform FROM user_devices WHERE user_id = u.id ORDER BY last_seen DESC LIMIT 1) d ON true`;

const like = (s: string) => `%${s.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;

export function userRoutes(r: Registry, _env: Env): void {
  // Search: user id, e-mail (substring), phone suffix (last 3-10 digits); filter by sign-in method, status, created / last-active range.
  r.get('/users', 'viewer', async (c) => {
    const q = c.get('q');
    const { page, size, offset } = pageOf(c);
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
    const term = (c.req.query('q') ?? '').trim().slice(0, 100);
    if (term) {
      if (UUID_RE.test(term)) add('u.id = ?::uuid', term.toLowerCase());
      else if (/^[\d\s+()-]+$/.test(term)) {
        const digits = term.replace(/\D/g, '');
        if (digits.length < 3) throw new ApiError(400, 'invalid_input', { detail: 'Enter at least the last 3 digits of the phone number.' });
        add('u.phone_e164 LIKE ?', `%${digits}`);
      } else add(`lower(real_email(u.email)) LIKE ? ESCAPE '\\'`, like(term));
    }
    const method = c.req.query('method');
    if (method) where.push(oneOf(method, ['google', 'phone'], 'method') === 'google' ? 'u.google_sub IS NOT NULL' : 'u.phone_e164 IS NOT NULL');
    const status = c.req.query('status');
    if (status) add('u.status = ?', oneOf(status, ['active', 'suspended'], 'status'));
    const cf = dateParam(c, 'created_from');
    const ct = dateParam(c, 'created_to');
    const af = dateParam(c, 'active_from');
    const at = dateParam(c, 'active_to');
    if (cf) add(`(u.created_at AT TIME ZONE 'UTC')::date >= ?::date`, cf);
    if (ct) add(`(u.created_at AT TIME ZONE 'UTC')::date <= ?::date`, ct);
    if (af) add(`(d.last_seen AT TIME ZONE 'UTC')::date >= ?::date`, af);
    if (at) add(`(d.last_seen AT TIME ZONE 'UTC')::date <= ?::date`, at);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [cnt] = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users u LEFT JOIN LATERAL (SELECT last_seen FROM user_devices WHERE user_id = u.id ORDER BY last_seen DESC LIMIT 1) d ON true ${w}`, p,
    );
    const rows = await q.query<ListRow>(`${SELECT} ${w} ORDER BY u.created_at DESC, u.id LIMIT ${size} OFFSET ${offset}`, p);
    return c.json({ items: rows.map(summary), page, page_size: size, total: cnt?.n ?? 0 });
  });

  r.get('/users/:userId', 'viewer', async (c) => {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const [u] = await q.query<ListRow & { suspended_at: string | Date | null; suspended_reason: string | null }>(
      `${SELECT.replace('u.display_name,', 'u.display_name, u.suspended_at, u.suspended_reason,')} WHERE u.id = $1`, [id],
    );
    if (!u) throw new ApiError(404, 'not_found');
    // Record counts come from a SECURITY DEFINER function that returns four integers: no ledger row is ever readable here.
    const [counts] = await q.query<Record<string, number>>('SELECT households, events, entries, ledgers FROM admin_user_counts($1)', [id]);
    const [act] = await q.query<Record<string, number>>(
      `SELECT
         (SELECT coalesce(sum(sync_errors), 0) FROM user_activity_daily WHERE user_id = $1 AND day > (now() AT TIME ZONE 'UTC')::date - 7)::int AS sync_errors_7d,
         (SELECT coalesce(sum(sync_requests), 0) FROM user_activity_daily WHERE user_id = $1 AND day > (now() AT TIME ZONE 'UTC')::date - 7)::int AS sync_requests_7d,
         (SELECT count(*) FROM support_tickets WHERE user_id = $1)::int AS tickets,
         admin_active_sessions($1) AS active_sessions`,
      [id],
    );
    const devices = await q.query<{ platform: string; app_version: string | null; os_version: string | null; first_seen: string | Date; last_seen: string | Date; last_sync_at: string | Date | null }>(
      'SELECT platform, app_version, os_version, first_seen, last_seen, last_sync_at FROM user_devices WHERE user_id = $1 ORDER BY last_seen DESC', [id],
    );
    const [grant] = await q.query<{ expires_at: string | Date }>(
      'SELECT expires_at FROM support_access_grants WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY expires_at DESC LIMIT 1', [id],
    );
    const lastSync = devices.map((d) => d.last_sync_at).filter(Boolean).map((d) => new Date(d as string).getTime());
    return c.json({
      ...summary(u),
      last_sync_at: lastSync.length ? new Date(Math.max(...lastSync)).toISOString() : null,
      suspended_at: iso(u.suspended_at),
      suspended_reason: u.suspended_reason,
      devices: devices.map((d) => ({ ...d, first_seen: iso(d.first_seen), last_seen: iso(d.last_seen), last_sync_at: iso(d.last_sync_at) })),
      counts: { ...counts, ...act },
      support_access: { active: !!grant, expires_at: iso(grant?.expires_at) },
    });
  });

  // Unmask one identifier: admin or owner, a reason, and an audit row (the revealed value is NOT written to the audit log).
  r.post('/users/:userId/unmask', 'admin', async (c) => {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const b = await readBody(c);
    const field = oneOf(b.field, ['phone', 'email'], 'field');
    const reason = reasonOf(b);
    const [u] = await q.query<{ phone_e164: string | null; email: string | null }>('SELECT phone_e164, real_email(email) AS email FROM users WHERE id = $1', [id]);
    if (!u) throw new ApiError(404, 'not_found');
    await audit(c, { action: 'user.unmask', targetType: 'user', targetId: id, reason, after: { field } });
    return c.json({ field, value: field === 'phone' ? u.phone_e164 : u.email });
  });

  async function setStatus(c: AdminContext, to: 'active' | 'suspended') {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const reason = reasonOf(await readBody(c));
    const [cur] = await q.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [id]);
    if (!cur) throw new ApiError(404, 'not_found');
    if (cur.status === to) throw new ApiError(409, to === 'suspended' ? 'already_suspended' : 'not_suspended');
    await q.query('SELECT admin_set_user_status($1, $2, $3)', [id, to, reason]);
    await audit(c, {
      action: to === 'suspended' ? 'user.suspend' : 'user.unsuspend', targetType: 'user', targetId: id, reason,
      before: { status: cur.status }, after: { status: to },
    });
    return c.json({ ok: true, status: to });
  }
  r.post('/users/:userId/suspend', 'support', (c) => setStatus(c, 'suspended'));
  r.post('/users/:userId/unsuspend', 'support', (c) => setStatus(c, 'active'));

  // Revoke every refresh token. The phone's current access token (max 15 min) keeps working until it expires; suspend for instant effect.
  r.post('/users/:userId/signout', 'support', async (c) => {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const reason = reasonOf(await readBody(c));
    const [u] = await q.query('SELECT 1 FROM users WHERE id = $1', [id]);
    if (!u) throw new ApiError(404, 'not_found');
    const [n] = await q.query<{ n: number }>('SELECT admin_force_signout($1) AS n', [id]);
    await audit(c, { action: 'user.force_signout', targetType: 'user', targetId: id, reason, after: { revoked_tokens: n?.n ?? 0 } });
    return c.json({ ok: true, revoked_tokens: n?.n ?? 0 });
  });

  // Delete the account on request: admin/owner, a reason, and the typed confirmation "delete <first 8 characters of the user id>".
  r.post('/users/:userId/delete', 'admin', async (c) => {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const b = await readBody(c);
    const reason = reasonOf(b);
    const expected = `delete ${id.slice(0, 8)}`;
    if (typeof b.confirm !== 'string' || b.confirm.trim().toLowerCase() !== expected) {
      throw new ApiError(400, 'confirmation_required', { detail: `Type "${expected}" to confirm.` });
    }
    const [u] = await q.query<{ status: string; signup_method: string }>('SELECT status, signup_method FROM users WHERE id = $1', [id]);
    if (!u) throw new ApiError(404, 'not_found');
    // Audit row and deletion are in the same request transaction: both happen or neither does.
    await audit(c, { action: 'user.delete', targetType: 'user', targetId: id, reason, before: { status: u.status, signup_method: u.signup_method } });
    await q.query('SELECT admin_delete_user($1)', [id]);
    return c.json({ ok: true });
  });

  // Internal support notes (never shown to the user).
  r.get('/users/:userId/notes', 'support', async (c) => {
    const id = uuidParam(c, 'userId');
    const rows = await c.get('q').query<{ id: string; admin_label: string; body: string; at: string | Date }>(
      'SELECT id::text, admin_label, body, at FROM user_notes WHERE user_id = $1 ORDER BY at DESC, id DESC LIMIT 200', [id],
    );
    return c.json({ items: rows.map((n) => ({ ...n, at: iso(n.at) })) });
  });
  r.post('/users/:userId/notes', 'support', async (c) => {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const body = str(await readBody(c), 'body', { max: 2000 })!;
    const [u] = await q.query('SELECT 1 FROM users WHERE id = $1', [id]);
    if (!u) throw new ApiError(404, 'not_found');
    await q.query('INSERT INTO user_notes (user_id, admin_label, body) VALUES ($1, $2, $3)', [id, c.get('admin').label, body]);
    await audit(c, { action: 'user.note_add', targetType: 'user', targetId: id, after: { length: body.length } });
    return c.json({ ok: true }, 201);
  });
}

export const canUnmask = (role: Parameters<typeof rank>[0]) => rank(role) >= rank('admin');
