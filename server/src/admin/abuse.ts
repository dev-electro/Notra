import { normalizeIndianMobile } from '../auth/phone';
import { sha256Hex } from '../crypto';
import { ApiError } from '../errors';
import { audit, iso, oneOf, readBody, reasonOf, uuidParam, type Env, type Registry } from './kit';
import { maskPhone } from './mask';

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;
const phoneRef = async (phone: string) => (await sha256Hex(`notra-phone-ref|${phone}`)).slice(0, 16);

/** OTP abuse control: aggregates, top offenders (phones masked), and the blocklist enforced in OTP start/verify. */
export function abuseRoutes(r: Registry, env: Env): void {
  r.get('/abuse/otp', 'viewer', async (c) => {
    const q = c.get('q');
    const days = Math.max(1, Math.min(30, Number.parseInt(c.req.query('days') ?? '7', 10) || 7));
    const perDay = await q.query<{ day: string | Date; sends: number; send_failures: number; verify_ok: number; verify_failures: number; blocked: number }>(
      `SELECT (at AT TIME ZONE 'UTC')::date AS day,
              count(*) FILTER (WHERE kind = 'send')::int AS sends, count(*) FILTER (WHERE kind = 'send_fail')::int AS send_failures,
              count(*) FILTER (WHERE kind = 'verify_ok')::int AS verify_ok, count(*) FILTER (WHERE kind = 'verify_fail')::int AS verify_failures,
              count(*) FILTER (WHERE kind = 'blocked')::int AS blocked
       FROM otp_events WHERE at > now() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1`, [String(days)],
    );
    const ips = await q.query<{ ip: string; sends: number; failures: number; blocked: boolean }>(
      `SELECT e.ip, count(*) FILTER (WHERE e.kind = 'send')::int AS sends, count(*) FILTER (WHERE e.kind = 'verify_fail')::int AS failures,
              EXISTS (SELECT 1 FROM blocklist b WHERE b.kind = 'ip' AND b.value = e.ip AND (b.expires_at IS NULL OR b.expires_at > now())) AS blocked
       FROM otp_events e WHERE e.at > now() - ($1 || ' days')::interval AND e.ip IS NOT NULL AND e.ip <> 'unknown'
       GROUP BY e.ip ORDER BY sends DESC, failures DESC LIMIT 20`, [String(days)],
    );
    const phones = await q.query<{ phone_e164: string; sends: number; failures: number; blocked: boolean }>(
      `SELECT e.phone_e164, count(*) FILTER (WHERE e.kind = 'send')::int AS sends, count(*) FILTER (WHERE e.kind = 'verify_fail')::int AS failures,
              EXISTS (SELECT 1 FROM blocklist b WHERE b.kind = 'phone' AND b.value = e.phone_e164 AND (b.expires_at IS NULL OR b.expires_at > now())) AS blocked
       FROM otp_events e WHERE e.at > now() - ($1 || ' days')::interval AND e.phone_e164 IS NOT NULL
       GROUP BY e.phone_e164 ORDER BY sends DESC, failures DESC LIMIT 20`, [String(days)],
    );
    return c.json({
      days,
      per_day: perDay.map((d) => ({ ...d, day: iso(d.day)!.slice(0, 10), sms_cost_paise: (d.sends - d.send_failures) * env.admin.smsCostPaise })),
      top_ips: ips,
      top_phones: await Promise.all(phones.map(async (p) => ({ phone_masked: maskPhone(p.phone_e164), ref: await phoneRef(p.phone_e164), sends: p.sends, failures: p.failures, blocked: p.blocked }))),
    });
  });

  r.get('/abuse/blocklist', 'viewer', async (c) => {
    const rows = await c.get('q').query<{ id: string; kind: string; value: string; reason: string; created_by: string; created_at: string | Date; expires_at: string | Date | null }>(
      'SELECT id, kind, value, reason, created_by, created_at, expires_at FROM blocklist ORDER BY created_at DESC LIMIT 500',
    );
    return c.json({
      items: rows.map((b) => ({
        id: b.id, kind: b.kind, value_masked: b.kind === 'phone' ? maskPhone(b.value) : b.value, reason: b.reason, created_by: b.created_by,
        created_at: iso(b.created_at), expires_at: iso(b.expires_at), active: !b.expires_at || new Date(b.expires_at) > env.now(),
      })),
    });
  });

  // Block a phone number (typed in full, or picked from the top list by `ref`) or an IP address, optionally for N hours.
  r.post('/abuse/blocklist', 'support', async (c) => {
    const q = c.get('q');
    const b = await readBody(c);
    const kind = oneOf(b.kind, ['phone', 'ip'] as const, 'kind');
    const reason = reasonOf(b)!;
    let value: string | null = null;
    if (kind === 'phone') {
      if (typeof b.ref === 'string') {
        const all = await q.query<{ phone_e164: string }>('SELECT DISTINCT phone_e164 FROM otp_events WHERE phone_e164 IS NOT NULL');
        for (const p of all) if ((await phoneRef(p.phone_e164)) === b.ref) value = p.phone_e164;
      } else value = normalizeIndianMobile(b.value);
      if (!value) throw new ApiError(400, 'invalid_input', { detail: 'Not a valid Indian mobile number.' });
    } else {
      const v = typeof b.value === 'string' ? b.value.trim() : '';
      if (!IPV4.test(v) && !(v.includes(':') && IPV6.test(v))) throw new ApiError(400, 'invalid_input', { detail: 'Not a valid IP address.' });
      value = v.toLowerCase();
    }
    let expires: Date | null = null;
    if (b.expires_in_hours !== undefined && b.expires_in_hours !== null) {
      const h = Number(b.expires_in_hours);
      if (!Number.isFinite(h) || h <= 0 || h > 24 * 365) throw new ApiError(400, 'invalid_input', { detail: 'expires_in_hours must be between 1 and 8760.' });
      expires = new Date(env.now().getTime() + h * 3600_000);
    }
    const id = crypto.randomUUID();
    const rows = await q.query(
      `INSERT INTO blocklist (id, kind, value, reason, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (kind, value) DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = now(), expires_at = EXCLUDED.expires_at
       RETURNING id`,
      [id, kind, value, reason, c.get('admin').label, expires],
    );
    await audit(c, { action: 'blocklist.add', targetType: kind, targetId: kind === 'phone' ? maskPhone(value)! : value, reason, after: { kind, expires_at: expires?.toISOString() ?? null } });
    return c.json({ ok: true, id: (rows[0] as { id: string }).id }, 201);
  });

  r.delete('/abuse/blocklist/:blockId', 'support', async (c) => {
    const id = uuidParam(c, 'blockId');
    const reason = reasonOf(await readBody(c, true))!;
    const [row] = await c.get('q').query<{ kind: string; value: string }>('DELETE FROM blocklist WHERE id = $1 RETURNING kind, value', [id]);
    if (!row) throw new ApiError(404, 'not_found');
    await audit(c, { action: 'blocklist.remove', targetType: row.kind, targetId: row.kind === 'phone' ? maskPhone(row.value)! : row.value, reason });
    return c.json({ ok: true });
  });
}
