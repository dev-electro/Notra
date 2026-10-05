import { dateParam, iso, pageOf, type Env, type Registry } from './kit';

export function monitoringRoutes(r: Registry, env: Env): void {
  r.get('/me', 'viewer', async (c) => {
    const a = c.get('admin');
    return c.json({ user_id: a.id, label: a.label, role: a.role });
  });

  // DB round-trip latency, applied migration, server version, error counts. No user data.
  r.get('/health', 'viewer', async (c) => {
    const q = c.get('q');
    const t0 = Date.now();
    await q.query('SELECT 1');
    const latency = Date.now() - t0;
    const [mig] = await q.query<{ v: string | null }>('SELECT admin_migration_version() AS v');
    const [err] = await q.query<{ e24: number; e1: number; kinds: number }>(
      `SELECT coalesce(sum(occurrences) FILTER (WHERE at > now() - interval '24 hours'), 0)::int AS e24,
              coalesce(sum(occurrences) FILTER (WHERE at > now() - interval '1 hour'), 0)::int AS e1,
              count(DISTINCT fingerprint) FILTER (WHERE at > now() - interval '24 hours')::int AS kinds FROM error_log`,
    );
    const [roll] = await q.query<{ d: string | Date | null }>('SELECT max(day) AS d FROM daily_stats');
    return c.json({
      ok: true, db_latency_ms: latency, migration_version: mig?.v ?? null, server_version: env.admin.serverVersion,
      environment: env.admin.environment ?? 'production', errors_24h: err?.e24 ?? 0, errors_1h: err?.e1 ?? 0, distinct_errors_24h: err?.kinds ?? 0,
      last_rollup_day: roll?.d ? iso(roll.d)!.slice(0, 10) : null, time: env.now().toISOString(),
    });
  });

  // Unhandled-error log: method, normalised path, status, error class, scrubbed message. Sampled (one row per error per minute).
  r.get('/errors', 'viewer', async (c) => {
    const { page, size, offset } = pageOf(c, 50);
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
    const from = dateParam(c, 'from');
    const to = dateParam(c, 'to');
    if (from) add(`(at AT TIME ZONE 'UTC')::date >= ?::date`, from);
    if (to) add(`(at AT TIME ZONE 'UTC')::date <= ?::date`, to);
    if (c.req.query('status')) add('status = ?', Number.parseInt(c.req.query('status')!, 10) || 0);
    if (c.req.query('path')) add(`path ILIKE ? ESCAPE '\\'`, `%${c.req.query('path')!.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`);
    if (c.req.query('q')) add(`(message ILIKE ? ESCAPE '\\')`, `%${c.req.query('q')!.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const q = c.get('q');
    const [cnt] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM error_log ${w}`, p);
    const rows = await q.query<{ id: string; at: string | Date; method: string; path: string; status: number; error_name: string; error_code: string | null; message: string; occurrences: number }>(
      `SELECT id::text, at, method, path, status, error_name, error_code, message, occurrences FROM error_log ${w} ORDER BY at DESC, id DESC LIMIT ${size} OFFSET ${offset}`, p,
    );
    return c.json({ items: rows.map((e) => ({ ...e, at: iso(e.at) })), page, page_size: size, total: cnt?.n ?? 0 });
  });

  // Audit log (admin and owner): every mutation, unmask and consented support read.
  r.get('/audit', 'admin', async (c) => {
    const { page, size, offset } = pageOf(c, 50);
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
    const g = (k: string) => c.req.query(k) || undefined;
    if (g('admin')) {
      const v = g('admin')!;
      p.push(`%${v.slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`, v);
      where.push(`(admin_label ILIKE $${p.length - 1} ESCAPE '\\' OR admin_user_id::text = $${p.length})`);
    }
    if (g('action')) add(`action LIKE ? ESCAPE '\\'`, `${g('action')!.slice(0, 60).replace(/[\\%_]/g, '\\$&')}%`);
    if (g('target')) add('target_id = ?', g('target'));
    const from = dateParam(c, 'from');
    const to = dateParam(c, 'to');
    if (from) add(`(at AT TIME ZONE 'UTC')::date >= ?::date`, from);
    if (to) add(`(at AT TIME ZONE 'UTC')::date <= ?::date`, to);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const q = c.get('q');
    const [cnt] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM admin_audit_log ${w}`, p);
    const rows = await q.query<{ id: string; at: string | Date; admin_user_id: string | null; admin_label: string; admin_role: string | null; action: string; target_type: string | null; target_id: string | null; reason: string | null; ip: string | null; before_meta: string | null; after_meta: string | null }>(
      `SELECT id::text, at, admin_user_id, admin_label, admin_role, action, target_type, target_id, reason, ip, before_meta::text, after_meta::text
       FROM admin_audit_log ${w} ORDER BY at DESC, id DESC LIMIT ${size} OFFSET ${offset}`, p,
    );
    return c.json({
      items: rows.map(({ before_meta, after_meta, ...a }) => ({
        ...a, at: iso(a.at), before: before_meta ? JSON.parse(before_meta) : null, after: after_meta ? JSON.parse(after_meta) : null,
      })),
      page, page_size: size, total: cnt?.n ?? 0,
    });
  });
}

