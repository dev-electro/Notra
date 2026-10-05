import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, Notice, PageTitle, Pagination, Select, Spinner, Table, Td, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { Can } from '../lib/auth';
import { fmtDate, fmtDateTime } from '../lib/format';
import type { Paged, Ticket } from '../lib/types';
import { useApi } from '../lib/useApi';

const PRIORITY_TONE = { low: 'neutral', normal: 'info', high: 'warn', urgent: 'bad' } as const;
const STATUS_TONE = { open: 'warn', in_progress: 'info', resolved: 'good', closed: 'neutral' } as const;

export default function Tickets() {
  const [f, setF] = useState({ status: '', category: '', priority: '', overdue: '', q: '' });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useApi<Paged<Ticket> & { summary: { open: number; overdue: number } }>('/admin/api/tickets', { ...f, page });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  return (
    <>
      <PageTitle
        title="Tickets & grievances"
        sub="DPDP: a grievance must be answered within 30 days. Overdue ones are highlighted."
        actions={<Can action="manage_tickets"><Button variant="primary" onClick={() => setCreating(true)}>Log a ticket</Button></Can>}
      />
      {list.data && list.data.summary.overdue > 0 && <div className="mb-3"><Notice tone="warn">{list.data.summary.overdue} ticket(s) are past their due date.</Notice></div>}
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Status"><Select value={f.status} onChange={set('status')}><option value="">Any</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select></Field>
          <Field label="Category"><Select value={f.category} onChange={set('category')}><option value="">Any</option>{['grievance', 'bug', 'feedback', 'deletion', 'other'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Priority"><Select value={f.priority} onChange={set('priority')}><option value="">Any</option>{['low', 'normal', 'high', 'urgent'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Overdue"><Select value={f.overdue} onChange={set('overdue')}><option value="">All</option><option value="1">Overdue only</option></Select></Field>
          <Field label="Subject contains"><Input value={f.q} onChange={set('q')} /></Field>
        </div>
      </Card>
      <Card>
        {list.error != null && <ErrorBox error={list.error} retry={list.reload} />}
        {list.loading && !list.data && <Spinner />}
        {list.data && (list.data.items.length === 0 ? <Empty>No tickets.</Empty> : (
          <Table caption="Tickets" head={['Subject', 'Category', 'Status', 'Priority', 'Assignee', 'Due', 'Created']}>
            {list.data.items.map((t) => (
              <tr key={t.id} className={t.overdue ? 'bg-bad-soft/60' : 'hover:bg-surface2/60'}>
                <Td><button type="button" className="text-left font-medium text-accent underline" onClick={() => setSel(t.id)}>{t.subject}</button></Td>
                <Td>{t.category}</Td>
                <Td><Badge tone={STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></Td>
                <Td><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></Td>
                <Td>{t.assignee ?? '–'}</Td>
                <Td>{t.due_at ? <>{fmtDate(t.due_at)} {t.overdue && <Badge tone="bad">overdue</Badge>}</> : '–'}</Td>
                <Td>{fmtDate(t.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ))}
        {list.data && <Pagination page={page} size={list.data.page_size} total={list.data.total} onPage={setPage} />}
      </Card>
      {sel && <TicketModal id={sel} onClose={() => { setSel(null); list.reload(); }} />}
      {creating && <CreateModal onClose={(created) => { setCreating(false); if (created) list.reload(); }} />}
    </>
  );
}

function TicketModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useApi<Ticket>(`/admin/api/tickets/${id}`);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'note' | 'reply'>('note');
  const [resolution, setResolution] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [assignee, setAssignee] = useState('');
  const d = t.data;
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); t.reload(); } catch (e) { setErr(e); } };

  return (
    <Modal open title={d?.subject ?? 'Ticket'} onClose={onClose}>
      {!d ? <Spinner /> : (
        <div className="space-y-3 text-sm">
          <p className="flex flex-wrap gap-2"><Badge tone={STATUS_TONE[d.status]}>{d.status.replace('_', ' ')}</Badge><Badge tone={PRIORITY_TONE[d.priority]}>{d.priority}</Badge><Badge>{d.category}</Badge>{d.overdue && <Badge tone="bad">overdue</Badge>}</p>
          <p className="whitespace-pre-wrap rounded-md bg-surface2 p-3">{d.body}</p>
          <p className="text-xs text-muted">
            via {d.channel} · created {fmtDateTime(d.created_at)} · due {fmtDateTime(d.due_at)}
            {d.user_id && <> · <Link className="underline" to={`/users/${d.user_id}`}>user {d.user_id.slice(0, 8)}…</Link></>}
            {d.contact_masked && <> · contact {d.contact_masked}</>}
          </p>
          {d.resolution && <Notice tone="good"><strong>Resolution:</strong> {d.resolution}</Notice>}
          <Can action="manage_tickets" fallback={<p className="text-muted">Viewers can read tickets but not change them.</p>}>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Priority">
                <Select value={d.priority} onChange={(e) => void run(() => api(`/admin/api/tickets/${id}`, { method: 'PATCH', body: { priority: e.target.value } }))}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</Select>
              </Field>
              <Field label="Status">
                <Select value={['open', 'in_progress'].includes(d.status) ? d.status : ''} onChange={(e) => void run(() => api(`/admin/api/tickets/${id}`, { method: 'PATCH', body: { status: e.target.value } }))}>
                  <option value="" disabled>{d.status}</option><option value="open">open</option><option value="in_progress">in progress</option>
                </Select>
              </Field>
              <Field label={`Assignee${d.assignee ? ` (${d.assignee})` : ''}`}>
                <div className="flex gap-1"><Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="name" /><Button onClick={() => void run(() => api(`/admin/api/tickets/${id}`, { method: 'PATCH', body: { assignee } }))}>Set</Button></div>
              </Field>
            </div>
            <div className="space-y-2">
              <Field label="Add a note or reply">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex items-center gap-2">
                <Select className="max-w-32" value={kind} onChange={(e) => setKind(e.target.value as 'note' | 'reply')} aria-label="Kind"><option value="note">Internal note</option><option value="reply">Reply sent to user</option></Select>
                <Button disabled={!note.trim()} onClick={() => void run(async () => { await api(`/admin/api/tickets/${id}/notes`, { method: 'POST', body: { body: note, kind } }); setNote(''); })}>Add</Button>
              </div>
            </div>
            {['open', 'in_progress'].includes(d.status) && (
              <div className="space-y-2 border-t border-line pt-3">
                <Field label="Resolution (what we told the user)"><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
                <Button variant="primary" disabled={resolution.trim().length < 3} onClick={() => void run(() => api(`/admin/api/tickets/${id}/resolve`, { method: 'POST', body: { resolution, status: 'resolved' } }))}>Mark resolved</Button>
              </div>
            )}
          </Can>
          {d.notes && d.notes.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {d.notes.map((n) => <li key={n.id} className="py-2"><Badge tone={n.kind === 'reply' ? 'info' : 'neutral'}>{n.kind}</Badge> <span className="whitespace-pre-wrap">{n.body}</span><p className="text-xs text-muted">{n.admin_label} · {fmtDateTime(n.at)}</p></li>)}
            </ul>
          )}
          {err != null && <ErrorBox error={err} />}
          <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
        </div>
      )}
    </Modal>
  );
}

function CreateModal({ onClose }: { onClose: (created: boolean) => void }) {
  const [v, setV] = useState({ category: 'grievance', channel: 'email', subject: '', body: '', contact: '' });
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal open title="Log a ticket (received outside the app)" onClose={() => onClose(false)}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void api('/admin/api/tickets', { method: 'POST', body: { ...v, contact: v.contact || undefined } }).then(() => onClose(true)).catch(setErr); }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category"><Select value={v.category} onChange={set('category')}>{['grievance', 'bug', 'feedback', 'deletion', 'other'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Channel"><Select value={v.channel} onChange={set('channel')}>{['email', 'phone', 'web', 'other'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Subject"><Input value={v.subject} onChange={set('subject')} required minLength={3} /></Field>
        <Field label="Details"><Textarea value={v.body} onChange={set('body')} required minLength={3} /></Field>
        <Field label="Contact (phone or e-mail, shown masked)"><Input value={v.contact} onChange={set('contact')} /></Field>
        {err != null && <ErrorBox error={err} />}
        <div className="flex justify-end gap-2"><Button onClick={() => onClose(false)}>Cancel</Button><Button type="submit" variant="primary">Create</Button></div>
      </form>
    </Modal>
  );
}
