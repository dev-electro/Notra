import { Link } from 'react-router-dom';
import { BarChart, LineChart } from '../components/charts';
import { Card, ErrorBox, PageTitle, Spinner, Stat } from '../components/ui';
import { daysAgoISO, fmtNum, rupees, todayISO } from '../lib/format';
import type { Overview, Report } from '../lib/types';
import { useApi } from '../lib/useApi';

const range = { from: daysAgoISO(29), to: todayISO() };

export default function Dashboard() {
  const ov = useApi<Overview>('/admin/api/overview');
  const monthly = useApi<Report>('/admin/api/reports/events-monthly');
  const active = useApi<Report>('/admin/api/reports/active', range);
  const signups = useApi<Report>('/admin/api/reports/signups', range);
  const sync = useApi<Report>('/admin/api/reports/sync', range);

  const o = ov.data;
  const col = (r: Report | null, key: string) => (r?.rows ?? []).map((x) => x[key] ?? null);
  const days = (r: Report | null) => (r?.rows ?? []).map((x) => String(x.day ?? '').slice(5));

  return (
    <>
      <PageTitle title="Dashboard" sub="Anonymous totals across all users. Any number built from fewer than 5 users is shown as “<5”." />
      {ov.error != null && <ErrorBox error={ov.error} retry={ov.reload} />}
      {ov.loading && !o && <Spinner />}
      {o && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Events this month" value={fmtNum(o.events_this_month)} sub="North star: Notra events recorded" />
          <Stat label="Active today (DAU)" value={fmtNum(o.active.dau)} sub={`WAU ${fmtNum(o.active.wau)} · MAU ${fmtNum(o.active.mau)}`} />
          <Stat label="New users (7 days)" value={fmtNum(o.totals.new_7d)} sub={`30 days: ${fmtNum(o.totals.new_30d)} · total ${fmtNum(o.totals.users)}`} />
          <Stat label="Sync failures today" value={o.sync_today.error_rate_pct === null ? '–' : `${o.sync_today.error_rate_pct}%`} sub={`${fmtNum(o.sync_today.errors)} of ${fmtNum(o.sync_today.requests)} requests`} tone={(o.sync_today.error_rate_pct ?? 0) > 5 ? 'bad' : undefined} />
          <Stat label="OTP SMS today" value={fmtNum(o.otp_today.sends)} sub={`≈ ${rupees(o.otp_today.sms_cost_paise)}`} />
          <Stat label="Open grievances" value={o.tickets.open_grievances} sub={<Link className="underline" to="/tickets">{o.tickets.open} open tickets</Link>} />
          <Stat label="Overdue (30-day SLA)" value={o.tickets.overdue} tone={o.tickets.overdue > 0 ? 'bad' : 'good'} sub={<Link className="underline" to="/tickets">Review tickets</Link>} />
          <Stat label="Errors (24 h)" value={o.errors_24h} tone={o.errors_24h > 0 ? 'warn' : 'good'} sub={<Link className="underline" to="/monitoring">Monitoring</Link>} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Notra events recorded per month (north star)">
          {monthly.error != null ? <ErrorBox error={monthly.error} retry={monthly.reload} /> : monthly.data ? (
            <BarChart labels={(monthly.data.rows).map((r) => String(r.month))} values={col(monthly.data, 'events')} label="Events recorded per month" />
          ) : <Spinner />}
        </Card>
        <Card title="Active users, last 30 days">
          {active.error != null ? <ErrorBox error={active.error} retry={active.reload} /> : active.data ? (
            <LineChart labels={days(active.data)} label="Daily and monthly active users" series={[{ name: 'DAU', values: col(active.data, 'dau') }, { name: 'MAU', values: col(active.data, 'mau') }]} />
          ) : <Spinner />}
        </Card>
        <Card title="New users per day">
          {signups.error != null ? <ErrorBox error={signups.error} retry={signups.reload} /> : signups.data ? (
            <BarChart labels={days(signups.data)} values={col(signups.data, 'total')} label="New users per day" color="var(--chart-2)" />
          ) : <Spinner />}
        </Card>
        <Card title="Sync health: failure rate %">
          {sync.error != null ? <ErrorBox error={sync.error} retry={sync.reload} /> : sync.data ? (
            <LineChart labels={days(sync.data)} label="Sync failure rate percent" series={[{ name: 'Failure %', values: col(sync.data, 'error_rate_pct'), color: 'var(--chart-3)' }]} />
          ) : <Spinner />}
        </Card>
      </div>
    </>
  );
}
