import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Pagination, Select, Spinner, Table, Td } from '../components/ui';
import { fmtDate, timeAgo } from '../lib/format';
import type { Paged, UserSummary } from '../lib/types';
import { useApi } from '../lib/useApi';

const EMPTY = { q: '', method: '', status: '', created_from: '', created_to: '', active_from: '', active_to: '' };

export default function Users() {
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const list = useApi<Paged<UserSummary>>('/admin/api/users', { ...filters, page });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <>
      <PageTitle title="Users" sub="Account metadata only: phone and e-mail are masked, and no diary data can be opened from here." />
      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters(draft); }}>
          <Field label="Search" hint="User id, e-mail, or last 3+ digits of the phone"><Input value={draft.q} onChange={set('q')} placeholder="e.g. 3210 or name@gmail.com" /></Field>
          <Field label="Sign-in method">
            <Select value={draft.method} onChange={set('method')}><option value="">Any</option><option value="google">Google</option><option value="phone">Mobile OTP</option></Select>
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={set('status')}><option value="">Any</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
          </Field>
          <div />
          <Field label="Created from"><Input type="date" value={draft.created_from} onChange={set('created_from')} /></Field>
          <Field label="Created to"><Input type="date" value={draft.created_to} onChange={set('created_to')} /></Field>
          <Field label="Last active from"><Input type="date" value={draft.active_from} onChange={set('active_from')} /></Field>
          <Field label="Last active to"><Input type="date" value={draft.active_to} onChange={set('active_to')} /></Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" variant="primary">Search</Button>
            <Button onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(1); }}>Clear</Button>
          </div>
        </form>
      </Card>
      <Card>
        {list.error != null && <ErrorBox error={list.error} retry={list.reload} />}
        {list.loading && !list.data && <Spinner />}
        {list.data && (list.data.items.length === 0 ? <Empty>No users match.</Empty> : (
          <Table caption="Users" head={['User', 'Phone', 'E-mail', 'Method', 'Status', 'App', 'Created', 'Last active']}>
            {list.data.items.map((u) => (
              <tr key={u.id} className="hover:bg-surface2/60">
                <Td><Link className="font-mono text-xs text-accent underline" to={`/users/${u.id}`}>{u.id.slice(0, 8)}…</Link></Td>
                <Td className="tabular-nums">{u.phone_masked ?? '–'}</Td>
                <Td>{u.email_masked ?? '–'}</Td>
                <Td>{u.sign_in_methods.join(' + ') || u.signup_method}</Td>
                <Td><Badge tone={u.status === 'active' ? 'good' : 'bad'}>{u.status}</Badge></Td>
                <Td>{u.app_version ? `${u.app_version} (${u.platform})` : '–'}</Td>
                <Td>{fmtDate(u.created_at)}</Td>
                <Td>{timeAgo(u.last_active_at)}</Td>
              </tr>
            ))}
          </Table>
        ))}
        {list.data && <Pagination page={page} size={list.data.page_size} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
