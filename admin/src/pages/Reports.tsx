import { useState } from 'react';
import { BarChart, LineChart } from '../components/charts';
import { Button, Card, Empty, ErrorBox, Field, Input, Notice, PageTitle, Select, Spinner, Table, Td } from '../components/ui';
import { api, download } from '../lib/api';
import { Can } from '../lib/auth';
import { daysAgoISO, fmtNum, todayISO } from '../lib/format';
import type { Report } from '../lib/types';
import { useApi } from '../lib/useApi';

const REPORTS: { id: string; label: string; days?: boolean; chart?: { x: string; y: string[]; kind: 'bar' | 'line' } }[] = [
  { id: 'events-monthly', label: 'North star: events per month', chart: { x: 'month', y: ['events'], kind: 'bar' } },
  { id: 'events', label: 'Events per day', days: true, chart: { x: 'day', y: ['events'], kind: 'bar' } },
  { id: 'entries', label: 'Entries per day', days: true, chart: { x: 'day', y: ['entries'], kind: 'bar' } },
  { id: 'signups', label: 'New users (by sign-in method)', days: true, chart: { x: 'day', y: ['total'], kind: 'bar' } },
  { id: 'active', label: 'Active users (DAU / WAU / MAU)', days: true, chart: { x: 'day', y: ['dau', 'wau', 'mau'], kind: 'line' } },
  { id: 'retention', label: 'Retention cohorts', days: true },
  { id: 'sync', label: 'Sync requests and failures', days: true, chart: { x: 'day', y: ['error_rate_pct'], kind: 'line' } },
  { id: 'otp', label: 'OTP volume and SMS cost', days: true, chart: { x: 'day', y: ['sends'], kind: 'bar' } },
  { id: 'deletions', label: 'Account deletions', days: true },
  { id: 'occasions', label: 'Occasion mix', days: true },
  { id: 'amounts', label: 'Entry amount distribution', days: true },
  { id: 'entry-mix', label: 'Cash vs UPI, in-kind, received vs given', days: true },
  { id: 'entries-per-event', label: 'Entries per event (avg / median / p90)', days: true },
  { id: 'regions', label: 'Regions (villages with ≥ 5 users)' },
  { id: 'versions', label: 'App versions' },
  { id: 'support-sla', label: 'Grievance SLA' },
];

export default function Reports() {
  const [id, setId] = useState('events-monthly');
  const [from, setFrom] = useState(daysAgoISO(29));
  const [to, setTo] = useState(todayISO());
  const meta = REPORTS.find((r) => r.id === id)!;
  const rep = useApi<Report>(`/admin/api/reports/${id}`, meta.days || id === 'events-monthly' ? { from: id === 'events-monthly' ? undefined : from, to } : undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const r = rep.data;
  const cells = r?.rows.flatMap((x) => Object.values(x)) ?? [];

  return (
    <>
      <PageTitle title="Reports" sub="Aggregates only. A number built from fewer than 5 users is shown as “<5”. CSV exports contain exactly what you see." />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2"><Field label="Report"><Select value={id} onChange={(e) => setId(e.target.value)}>{REPORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field></div>
          {(meta.days || id === 'events-monthly') && <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} disabled={id === 'events-monthly'} /></Field>}
          {(meta.days || id === 'events-monthly') && <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>}
          <div className="flex items-end gap-2">
            <Button disabled={!r} onClick={() => void download(`/admin/api/reports/${id}`, { format: 'csv', ...(meta.days ? { from, to } : {}) }, `notra-${id}.csv`).catch(setErr)}>Export CSV</Button>
          </div>
        </div>
        <Can action="recompute_reports">
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm text-muted">
            <span>Daily totals are computed nightly. Recompute this date range now:</span>
            <Button onClick={() => void api<{ days: number }>('/admin/api/reports/recompute', { method: 'POST', body: { from, to, reason: 'manual recompute from the admin panel' } }).then((x) => { setMsg(`Recomputed ${x.days} day(s).`); rep.reload(); }).catch(setErr)}>Recompute</Button>
          </div>
        </Can>
      </Card>
      {msg && <div className="mb-3"><Notice tone="good">{msg}</Notice></div>}
      {err != null && <div className="mb-3"><ErrorBox error={err} /></div>}
      {rep.error != null && <ErrorBox error={rep.error} retry={rep.reload} />}
      {rep.loading && !r && <Spinner />}
      {r && (
        <Card title={r.title}>
          {meta.chart && r.rows.length > 1 && (
            <div className="mb-4">
              {meta.chart.kind === 'bar'
                ? <BarChart labels={r.rows.map((x) => String(x[meta.chart!.x]).slice(id === 'events-monthly' ? 0 : 5))} values={r.rows.map((x) => x[meta.chart!.y[0]!] ?? null)} label={r.title} />
                : <LineChart labels={r.rows.map((x) => String(x[meta.chart!.x]).slice(5))} label={r.title} series={meta.chart.y.map((k) => ({ name: r.columns.find((c) => c.key === k)?.label ?? k, values: r.rows.map((x) => x[k] ?? null) }))} />}
            </div>
          )}
          {r.rows.length === 0 ? <Empty>No data in this range.</Empty> : (
            <Table caption={r.title} head={r.columns.map((c) => c.label)}>
              {r.rows.map((row, i) => (
                <tr key={i}>{r.columns.map((c) => <Td key={c.key} className="tabular-nums">{typeof row[c.key] === 'number' ? fmtNum(row[c.key]) : (row[c.key] ?? '–')}</Td>)}</tr>
              ))}
            </Table>
          )}
          {r.note && <p className="mt-3 text-xs text-muted">{r.note}</p>}
          {cells.includes('<5') && <p className="mt-2 text-xs text-muted">“&lt;5” means fewer than 5 users are behind that number, so it is hidden to protect privacy.</p>}
        </Card>
      )}
    </>
  );
}
