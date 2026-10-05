import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Pagination, Spinner, Stat, Table, Td } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { Paged } from '../lib/types';
import { useApi } from '../lib/useApi';

interface Health {
  ok: boolean; db_latency_ms: number; migration_version: string | null; server_version: string; environment: string;
  errors_24h: number; errors_1h: number; distinct_errors_24h: number; last_rollup_day: string | null; time: string;
}
interface ErrRow { id: string; at: string; method: string; path: string; status: number; error_name: string; error_code: string | null; message: string; occurrences: number }

export default function Monitoring() {
  const h = useApi<Health>('/admin/api/health');
  const [f, setF] = useState({ path: '', status: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const errs = useApi<Paged<ErrRow>>('/admin/api/errors', { ...f, page });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const d = h.data;
  return (
    <>
      <PageTitle title="Monitoring" sub="Server health and unhandled errors. The error log has no request bodies and no personal data; repeats of the same error within a minute are counted, not repeated." actions={<Button onClick={() => { h.reload(); errs.reload(); }}>Refresh</Button>} />
      {h.error != null && <ErrorBox error={h.error} retry={h.reload} />}
      {h.loading && !d && <Spinner />}
      {d && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Database round-trip" value={`${d.db_latency_ms} ms`} tone={d.db_latency_ms > 500 ? 'warn' : 'good'} sub={d.ok ? 'reachable' : 'problem'} />
          <Stat label="Errors (24 h / 1 h)" value={`${d.errors_24h} / ${d.errors_1h}`} tone={d.errors_1h > 0 ? 'warn' : 'good'} sub={`${d.distinct_errors_24h} distinct`} />
          <Stat label="Server version" value={d.server_version} sub={d.environment} />
          <Stat label="Applied migration" value={<span className="text-base">{d.migration_version ?? 'n/a'}</span>} sub={`Last rollup: ${d.last_rollup_day ?? 'never'}`} />
        </div>
      )}
      <Card title="Error log">
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Path contains"><Input value={f.path} onChange={set('path')} placeholder="/v1/sync" /></Field>
          <Field label="Status"><Input value={f.status} onChange={set('status')} placeholder="500" inputMode="numeric" /></Field>
          <Field label="Message contains"><Input value={f.q} onChange={set('q')} /></Field>
          <Field label="From"><Input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="To"><Input type="date" value={f.to} onChange={set('to')} /></Field>
        </div>
        {errs.error != null && <ErrorBox error={errs.error} retry={errs.reload} />}
        {errs.data && (errs.data.items.length === 0 ? <Empty>No errors. 🎉</Empty> : (
          <Table caption="Errors" head={['Last seen', 'Request', 'Status', 'Error', 'Message', 'Count']}>
            {errs.data.items.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(e.at)}</Td>
                <Td className="font-mono text-xs">{e.method} {e.path}</Td>
                <Td><Badge tone={e.status >= 500 ? 'bad' : 'warn'}>{e.status}</Badge></Td>
                <Td>{e.error_name}{e.error_code ? ` (${e.error_code})` : ''}</Td>
                <Td className="max-w-md break-words text-xs">{e.message}</Td>
                <Td>{e.occurrences}</Td>
              </tr>
            ))}
          </Table>
        ))}
        {errs.data && <Pagination page={page} size={errs.data.page_size} total={errs.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
