import type { Queryable } from '../db';
import { ApiError } from '../errors';
import { audit, dateParam, iso, readBody, reasonOf, type AdminContext, type Env, type Registry } from './kit';

/**
 * Metrics & reports: AGGREGATES ONLY. Day-level series come from `daily_stats` (filled by the nightly rollup); everything
 * else comes from the analytics.* SECURITY DEFINER functions. Any group built from fewer than 5 distinct users is shown as "<5".
 */
type Cell = number | string | null;
interface Column { key: string; label: string }
export interface Report { report: string; title: string; columns: Column[]; rows: Record<string, Cell>[]; from: string; to: string; note?: string }

export const SUPPRESSED = '<5';
const DAY_MS = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** Counts of users: 1-4 are shown as "<5". */
const small = (n: number): Cell => (n > 0 && n < 5 ? SUPPRESSED : n);
const cell = (v: unknown, suppressed: boolean): Cell => (suppressed ? SUPPRESSED : num(v));

function range(c: AdminContext, now: Date, defaultDays = 30): { from: string; to: string } {
  const to = dateParam(c, 'to') ?? day(now);
  const from = dateParam(c, 'from') ?? day(new Date(Date.parse(to) - (defaultDays - 1) * DAY_MS));
  if (from > to) throw new ApiError(400, 'invalid_input', { detail: 'from must not be after to' });
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 731) throw new ApiError(400, 'invalid_input', { detail: 'Range is limited to two years.' });
  return { from, to };
}
const days = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY_MS) out.push(day(new Date(t)));
  return out;
};

type Stat = { value: number; users: number | null };
async function loadStats(q: Queryable, from: string, to: string, metrics: string[]): Promise<Map<string, Stat>> {
  const rows = await q.query<{ day: string | Date; metric: string; dim: string; value: string | number; users: number | null }>(
    `SELECT day, metric, dim, value, users FROM daily_stats WHERE day BETWEEN $1::date AND $2::date AND metric = ANY(string_to_array($3, ','))`, [from, to, metrics.join(',')],
  );
  return new Map(rows.map((r) => [`${iso(r.day)!.slice(0, 10)}|${r.metric}|${r.dim}`, { value: Number(r.value), users: r.users }]));
}
/** A stat cell: 0 when absent; "<5" when 1-4 distinct users stand behind it. */
function stat(m: Map<string, Stat>, d: string, metric: string, dim = ''): Cell {
  const s = m.get(`${d}|${metric}|${dim}`);
  if (!s) return 0;
  return s.users !== null && s.users > 0 && s.users < 5 ? SUPPRESSED : s.value;
}

type Builder = (c: AdminContext, q: Queryable, env: Env, from: string, to: string) => Promise<Omit<Report, 'report' | 'from' | 'to'>>;

const BUILDERS: Record<string, Builder> = {
  signups: async (_c, q, _e, from, to) => {
    const m = await loadStats(q, from, to, ['new_users']);
    return {
      title: 'New users per day', columns: [{ key: 'day', label: 'Day' }, { key: 'via_google', label: 'Google' }, { key: 'via_otp', label: 'Mobile OTP' }, { key: 'total', label: 'Total' }],
      rows: days(from, to).map((d) => ({ day: d, via_google: stat(m, d, 'new_users', 'google'), via_otp: stat(m, d, 'new_users', 'phone'), total: stat(m, d, 'new_users') })),
    };
  },
  active: async (_c, q, _e, from, to) => {
    const m = await loadStats(q, from, to, ['dau', 'wau', 'mau']);
    return {
      title: 'Active users (DAU / WAU / MAU)', columns: [{ key: 'day', label: 'Day' }, { key: 'dau', label: 'DAU' }, { key: 'wau', label: 'WAU (7d)' }, { key: 'mau', label: 'MAU (30d)' }],
      rows: days(from, to).map((d) => ({ day: d, dau: stat(m, d, 'dau'), wau: stat(m, d, 'wau'), mau: stat(m, d, 'mau') })),
    };
  },
  events: async (_c, q, _e, from, to) => {
    const m = await loadStats(q, from, to, ['events_created']);
    return { title: 'Notra events recorded per day', columns: [{ key: 'day', label: 'Day' }, { key: 'events', label: 'Events' }], rows: days(from, to).map((d) => ({ day: d, events: stat(m, d, 'events_created') })) };
  },
  'events-monthly': async (_c, q, _e, from, to) => {
    const rows = await q.query<{ month: string; users: number | null; events: number | null; suppressed: boolean }>('SELECT month, users, events, suppressed FROM analytics.events_per_month($1::date, $2::date)', [from, to]);
    return {
      title: 'North star: Notra events recorded per month', columns: [{ key: 'month', label: 'Month' }, { key: 'events', label: 'Events' }, { key: 'users', label: 'Users recording' }],
      rows: rows.map((r) => ({ month: r.month, events: cell(r.events, r.suppressed), users: cell(r.users, r.suppressed) })),
    };
  },
  entries: async (_c, q, _e, from, to) => {
    const m = await loadStats(q, from, to, ['entries_created']);
    return { title: 'Entries recorded per day', columns: [{ key: 'day', label: 'Day' }, { key: 'entries', label: 'Entries' }], rows: days(from, to).map((d) => ({ day: d, entries: stat(m, d, 'entries_created') })) };
  },
  sync: async (_c, q, _e, from, to) => {
    const m = await loadStats(q, from, to, ['sync_requests', 'sync_errors']);
    return {
      title: 'Sync requests and failures', columns: [{ key: 'day', label: 'Day' }, { key: 'requests', label: 'Requests' }, { key: 'errors', label: 'Failures' }, { key: 'error_rate_pct', label: 'Failure rate %' }],
      rows: days(from, to).map((d) => {
        const rq = stat(m, d, 'sync_requests');
        const er = stat(m, d, 'sync_errors');
        return { day: d, requests: rq, errors: er, error_rate_pct: typeof rq === 'number' && typeof er === 'number' && rq > 0 ? Math.round((er / rq) * 1000) / 10 : null };
      }),
    };
  },
  otp: async (_c, q, env, from, to) => {
    const m = await loadStats(q, from, to, ['otp_send', 'otp_send_fail', 'otp_verify_ok', 'otp_verify_fail', 'otp_blocked']);
    return {
      title: 'OTP volume and estimated SMS cost',
      columns: [{ key: 'day', label: 'Day' }, { key: 'sends', label: 'OTP sent' }, { key: 'send_failures', label: 'Send failures' }, { key: 'verified', label: 'Verified' }, { key: 'verify_failures', label: 'Wrong codes' }, { key: 'blocked', label: 'Blocked' }, { key: 'sms_cost_paise', label: 'Est. SMS cost (paise)' }],
      rows: days(from, to).map((d) => {
        const sends = stat(m, d, 'otp_send') as number;
        const fails = stat(m, d, 'otp_send_fail') as number;
        return { day: d, sends, send_failures: fails, verified: stat(m, d, 'otp_verify_ok'), verify_failures: stat(m, d, 'otp_verify_fail'), blocked: stat(m, d, 'otp_blocked'), sms_cost_paise: (sends - fails) * env.admin.smsCostPaise };
      }),
      note: `Cost = (sent - failed) x SMS_COST_PAISE (${env.admin.smsCostPaise} paise).`,
    };
  },
  deletions: async (_c, q, _e, from, to) => {
    const m = await loadStats(q, from, to, ['account_deletions']);
    return { title: 'Account deletions per day', columns: [{ key: 'day', label: 'Day' }, { key: 'deletions', label: 'Deletions' }], rows: days(from, to).map((d) => ({ day: d, deletions: stat(m, d, 'account_deletions') })) };
  },
  occasions: async (_c, q, _e, from, to) => {
    const rows = await q.query<{ occasion: string; users: number | null; events: number | null; suppressed: boolean }>('SELECT occasion, users, events, suppressed FROM analytics.events_by_occasion($1::date, $2::date)', [from, to]);
    return { title: 'Occasion mix (events per occasion type)', columns: [{ key: 'occasion', label: 'Occasion' }, { key: 'events', label: 'Events' }, { key: 'users', label: 'Users' }], rows: rows.map((r) => ({ occasion: r.occasion, events: cell(r.events, r.suppressed), users: cell(r.users, r.suppressed) })) };
  },
  amounts: async (_c, q, _e, from, to) => {
    const rows = await q.query<{ bucket: string; users: number | null; entries: number | null; suppressed: boolean }>('SELECT bucket, users, entries, suppressed FROM analytics.amount_buckets($1::date, $2::date) ORDER BY sort', [from, to]);
    return { title: 'Entry amount distribution (all users)', columns: [{ key: 'bucket', label: 'Amount' }, { key: 'entries', label: 'Entries' }, { key: 'users', label: 'Users' }], rows: rows.map((r) => ({ bucket: r.bucket, entries: cell(r.entries, r.suppressed), users: cell(r.users, r.suppressed) })) };
  },
  'entry-mix': async (_c, q, _e, from, to) => {
    const rows = await q.query<{ facet: string; label: string; users: number | null; entries: number | null; suppressed: boolean }>('SELECT facet, label, users, entries, suppressed FROM analytics.entry_mix($1::date, $2::date)', [from, to]);
    return { title: 'Cash vs UPI, in-kind share, received vs given', columns: [{ key: 'facet', label: 'Facet' }, { key: 'label', label: 'Value' }, { key: 'entries', label: 'Entries' }, { key: 'users', label: 'Users' }], rows: rows.map((r) => ({ facet: r.facet, label: r.label, entries: cell(r.entries, r.suppressed), users: cell(r.users, r.suppressed) })) };
  },
  'entries-per-event': async (_c, q, _e, from, to) => {
    const [r] = await q.query<{ users: number | null; events: number | null; avg_entries: string | null; median_entries: string | null; p90_entries: string | null; suppressed: boolean }>('SELECT * FROM analytics.entries_per_event($1::date, $2::date)', [from, to]);
    const s = r?.suppressed ?? true;
    return { title: 'Entries per event', columns: [{ key: 'events', label: 'Events with entries' }, { key: 'avg', label: 'Average' }, { key: 'median', label: 'Median' }, { key: 'p90', label: 'P90' }], rows: [{ events: cell(r?.events, s), avg: cell(r?.avg_entries, s), median: cell(r?.median_entries, s), p90: cell(r?.p90_entries, s) }] };
  },
  regions: async (_c, q) => {
    const rows = await q.query<{ region: string; users: number | null; suppressed: boolean }>('SELECT region, users, suppressed FROM analytics.region_distribution()');
    return {
      title: 'Region distribution (users per village of their own household)', columns: [{ key: 'region', label: 'Region' }, { key: 'users', label: 'Users' }],
      rows: rows.map((r) => ({ region: r.region, users: cell(r.users, r.suppressed) })),
      note: 'Only regions with at least 5 users are listed; smaller ones are folded into "<5". District is not derivable and is not shown.',
    };
  },
  retention: async (_c, q, _e, from, to) => {
    const rows = await q.query<{ cohort_week: string | Date; cohort_size: number | null; week_no: number; active: number | null; suppressed: boolean; elapsed: boolean }>('SELECT cohort_week, cohort_size, week_no, active, suppressed, elapsed FROM analytics.retention($1::date, $2::date, 8)', [from, to]);
    const byWeek = new Map<string, Record<string, Cell>>();
    for (const r of rows) {
      const k = iso(r.cohort_week)!.slice(0, 10);
      const row = byWeek.get(k) ?? { cohort_week: k, cohort_size: cell(r.cohort_size, r.cohort_size === null) };
      const size = r.cohort_size;
      row[`w${r.week_no}`] = !r.elapsed ? null : r.suppressed || size === null || r.active === null ? SUPPRESSED : Math.round((Number(r.active) / Number(size)) * 1000) / 10;
      byWeek.set(k, row);
    }
    return {
      title: 'Retention: weekly signup cohort, % active in week N after signup',
      columns: [{ key: 'cohort_week', label: 'Cohort (week of)' }, { key: 'cohort_size', label: 'Users' }, ...Array.from({ length: 8 }, (_, i) => ({ key: `w${i + 1}`, label: `W${i + 1} %` }))],
      rows: [...byWeek.values()],
    };
  },
  versions: async (_c, q) => {
    const rows = await q.query<{ app_version: string; platform: string; users: number | null; suppressed: boolean }>('SELECT app_version, platform, users, suppressed FROM analytics.app_versions()');
    return { title: 'App versions (users active in the last 30 days)', columns: [{ key: 'app_version', label: 'Version' }, { key: 'platform', label: 'Platform' }, { key: 'users', label: 'Users' }], rows: rows.map((r) => ({ app_version: r.app_version, platform: r.platform, users: cell(r.users, r.suppressed) })) };
  },
  'support-sla': async (_c, q) => {
    const [r] = await q.query<Record<string, number | null>>(
      `SELECT count(*) FILTER (WHERE category = 'grievance')::int AS grievances,
              count(*) FILTER (WHERE category = 'grievance' AND status IN ('open','in_progress'))::int AS open_grievances,
              count(*) FILTER (WHERE category = 'grievance' AND status IN ('open','in_progress') AND due_at < now())::int AS overdue,
              count(*) FILTER (WHERE category = 'grievance' AND resolved_at IS NOT NULL AND resolved_at <= due_at)::int AS resolved_in_sla,
              count(*) FILTER (WHERE category = 'grievance' AND resolved_at IS NOT NULL)::int AS resolved,
              round(avg(extract(epoch FROM resolved_at - created_at) / 86400) FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1)::float8 AS avg_days_to_resolve
       FROM support_tickets`,
    );
    return { title: 'Grievance SLA (30 days)', columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }], rows: Object.entries(r ?? {}).map(([metric, value]) => ({ metric, value: num(value) })) };
  },
};

const csvCell = (v: Cell): string => {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`; // spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (r: Report): string =>
  [r.columns.map((c) => csvCell(c.label)).join(','), ...r.rows.map((row) => r.columns.map((c) => csvCell(row[c.key] ?? null)).join(','))].join('\n') + '\n';

export const REPORT_NAMES = Object.keys(BUILDERS);

export async function buildReport(c: AdminContext, env: Env, name: string): Promise<Report> {
  const b = BUILDERS[name];
  if (!b) throw new ApiError(404, 'unknown_report');
  const q = c.get('q');
  let { from, to } = range(c, env.now(), name === 'events-monthly' ? 365 : name === 'retention' ? 90 : 30);
  if (name === 'events-monthly' && !c.req.query('from')) from = `${from.slice(0, 7)}-01`;
  await q.query('SELECT analytics.refresh_today()');
  return { report: name, from, to, ...(await b(c, q, env, from, to)) };
}

export function reportRoutes(r: Registry, env: Env): void {
  r.get('/reports', 'viewer', async (c) => c.json({ reports: REPORT_NAMES }));

  r.get('/reports/:report', 'viewer', async (c) => {
    const rep = await buildReport(c, env, c.req.param('report') ?? '');
    if (c.req.query('format') === 'csv') {
      return new Response(toCsv(rep), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="notra-${rep.report}-${rep.from}_${rep.to}.csv"` } });
    }
    return c.json(rep);
  });

  // Recompute daily_stats for a date range (the nightly cron only refreshes the last 7 days).
  r.post('/reports/recompute', 'admin', async (c) => {
    const b = await readBody(c);
    const reason = reasonOf(b, false);
    const from = String(b.from ?? '');
    const to = String(b.to ?? '');
    const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
    if (!ok(from) || !ok(to) || from > to) throw new ApiError(400, 'invalid_input', { detail: 'from and to must be YYYY-MM-DD, from <= to.' });
    const list = days(from, to);
    if (list.length > 400) throw new ApiError(400, 'invalid_input', { detail: 'At most 400 days at a time.' });
    const q = c.get('q');
    for (const d of list) await q.query('SELECT analytics.rollup_day($1::date)', [d]);
    await audit(c, { action: 'stats.recompute', targetType: 'daily_stats', targetId: `${from}..${to}`, reason, after: { days: list.length } });
    return c.json({ ok: true, days: list.length });
  });

  // Dashboard numbers (aggregates only; small groups are shown as "<5").
  r.get('/overview', 'viewer', async (c) => {
    const q = c.get('q');
    await q.query('SELECT analytics.refresh_today()');
    const today = day(env.now());
    const [u] = await q.query<{ users: number; suspended: number; new7: number; new30: number }>(
      `SELECT count(*)::int AS users, count(*) FILTER (WHERE status = 'suspended')::int AS suspended,
              count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30 FROM users`,
    );
    const m = await loadStats(q, today, today, ['dau', 'wau', 'mau', 'sync_requests', 'sync_errors', 'otp_send', 'otp_send_fail']);
    const [t] = await q.query<{ open: number; overdue: number; open_grievances: number }>(
      `SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
              count(*) FILTER (WHERE due_at < now() AND status IN ('open','in_progress'))::int AS overdue,
              count(*) FILTER (WHERE category = 'grievance' AND status IN ('open','in_progress'))::int AS open_grievances FROM support_tickets`,
    );
    const [e] = await q.query<{ e24: number }>(`SELECT coalesce(sum(occurrences), 0)::int AS e24 FROM error_log WHERE at > now() - interval '24 hours'`);
    const sends = stat(m, today, 'otp_send') as number;
    const fails = stat(m, today, 'otp_send_fail') as number;
    const rq = stat(m, today, 'sync_requests');
    const er = stat(m, today, 'sync_errors');
    const month = await q.query<{ events: number | null; suppressed: boolean }>('SELECT events, suppressed FROM analytics.events_per_month($1::date, $2::date)', [`${today.slice(0, 7)}-01`, today]);
    return c.json({
      today,
      totals: { users: u?.users ?? 0, suspended: u?.suspended ?? 0, new_7d: small(u?.new7 ?? 0), new_30d: small(u?.new30 ?? 0) },
      active: { dau: stat(m, today, 'dau'), wau: stat(m, today, 'wau'), mau: stat(m, today, 'mau') },
      events_this_month: month[0] ? cell(month[0].events, month[0].suppressed) : 0,
      sync_today: { requests: rq, errors: er, error_rate_pct: typeof rq === 'number' && typeof er === 'number' && rq > 0 ? Math.round((er / rq) * 1000) / 10 : null },
      otp_today: { sends, sms_cost_paise: (sends - fails) * env.admin.smsCostPaise },
      tickets: t,
      errors_24h: e?.e24 ?? 0,
    });
  });
}
