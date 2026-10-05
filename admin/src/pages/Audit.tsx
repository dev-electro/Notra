import { Fragment, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Pagination, Spinner, Table, Td } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { Paged } from '../lib/types';
import { useApi } from '../lib/useApi';

interface Row {
  id: string; at: string; admin_user_id: string | null; admin_label: string; admin_role: string | null; action: string;
  target_type: string | null; target_id: string | null; reason: string | null; ip: string | null; before: unknown; after: unknown;
}

export default function Audit() {
  const [f, setF] = useState({ admin: '', action: '', target: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useApi<Paged<Row>>('/admin/api/audit', { ...f, page });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <>
      <PageTitle title="Audit log" sub="Every change, every reveal of a phone/e-mail, and every consented look at a user's shared data. Entries cannot be edited or deleted." />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Staff (name or id)"><Input value={f.admin} onChange={set('admin')} /></Field>
          <Field label="Action starts with" hint="user., config., staff., ticket., blocklist., support_data_view"><Input value={f.action} onChange={set('action')} placeholder="user." /></Field>
          <Field label="Target id"><Input value={f.target} onChange={set('target')} /></Field>
          <Field label="From"><Input type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="To"><Input type="date" value={f.to} onChange={set('to')} /></Field>
        </div>
      </Card>
      <Card>
        {list.error != null && <ErrorBox error={list.error} retry={list.reload} />}
        {list.loading && !list.data && <Spinner />}
        {list.data && (list.data.items.length === 0 ? <Empty>No entries.</Empty> : (
          <Table caption="Audit log" head={['When', 'Who', 'Action', 'Target', 'Reason', 'IP', '']}>
            {list.data.items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.at)}</Td>
                  <Td>{r.admin_label} {r.admin_role && <Badge>{r.admin_role}</Badge>}</Td>
                  <Td><Badge tone={r.action.includes('delete') || r.action.includes('suspend') ? 'bad' : r.action.includes('unmask') || r.action === 'support_data_view' ? 'warn' : 'neutral'}>{r.action}</Badge></Td>
                  <Td className="font-mono text-xs">{r.target_type ? `${r.target_type}:` : ''}{r.target_id ? r.target_id.slice(0, 13) : '–'}</Td>
                  <Td className="max-w-64 break-words">{r.reason ?? '–'}</Td>
                  <Td className="font-mono text-xs">{r.ip ?? '–'}</Td>
                  <Td>{(r.before != null || r.after != null) && <Button variant="ghost" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</Button>}</Td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={7} className="bg-surface2 px-3 py-2"><pre className="overflow-x-auto text-xs">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre></td></tr>
                )}
              </Fragment>
            ))}
          </Table>
        ))}
        {list.data && <Pagination page={page} size={list.data.page_size} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
