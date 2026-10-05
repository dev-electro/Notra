import { useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Notice, PageTitle, Pagination, Select, Spinner, Table, Td } from '../components/ui';
import { api } from '../lib/api';
import { Can } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';

interface QueueItem {
  id: string; status: string; first_name: string; age: number; gender: string; height_cm: number | null; gotra: string | null;
  education: string | null; occupation: string | null; place: string; published_by: string; submitted_at: string; reject_reason: string | null;
}
interface ReportItem { id: string; profile_id: string | null; reason: string; note: string | null; status: string; created_at: string; first_name: string | null; profile_status: string | null; open_reports: number }
type Paged<T> = { items: T[]; total: number; size: number; page: number } & Record<string, unknown>;

type Pending = null | { kind: 'review'; item: QueueItem; decision: 'approve' | 'reject' } | { kind: 'report'; item: ReportItem; action: 'dismiss' | 'hide' };

/**
 * Moderation for community रिश्ते profiles. The ONLY place staff see a profile: public details, never the contact number or the account.
 * Opening a queue page is recorded in the audit log, and so is every decision.
 */
export default function Rishtey() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [rstatus, setRstatus] = useState('open');
  const [rpage, setRpage] = useState(1);
  const [pending, setPending] = useState<Pending>(null);
  const queue = useApi<Paged<QueueItem>>('/admin/api/rishtey/queue', { status, page });
  const reports = useApi<Paged<ReportItem>>('/admin/api/rishtey/reports', { status: rstatus, page: rpage });
  const refresh = () => { queue.reload(); reports.reload(); };

  return (
    <>
      <PageTitle title="Rishtey moderation" sub="Approve or reject community profiles before anyone can see them. You see public details only (no phone number, no account). Each view and decision is audited." />
      <Notice tone="warn">Check for fake or misleading details, phone numbers or links typed into free-text fields, and profiles that look like a minor or a stranger posting for someone else.</Notice>
      <Card title="Profiles" className="my-4" actions={<Select aria-label="Status" className="max-w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="pending">Waiting for review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="hidden">Hidden</option></Select>}>
        {queue.error != null && <ErrorBox error={queue.error} retry={queue.reload} />}
        {queue.loading && !queue.data && <Spinner />}
        {queue.data && (queue.data.items.length === 0 ? <Empty>Nothing here.</Empty> : (
          <Table caption="Profiles" head={['Profile', 'Education / work', 'Place', 'Posted by', 'Submitted', '']}>
            {queue.data.items.map((p) => (
              <tr key={p.id}>
                <Td><div className="font-medium">{p.first_name}, {p.age}</div><div className="text-xs text-muted">{p.gender}{p.height_cm ? ` · ${p.height_cm} cm` : ''}{p.gotra ? ` · gotra ${p.gotra}` : ''}</div></Td>
                <Td>{[p.education, p.occupation].filter(Boolean).join(' · ') || '–'}</Td>
                <Td>{p.place || '–'}</Td>
                <Td><Badge>{p.published_by}</Badge></Td>
                <Td>{fmtDateTime(p.submitted_at)}{p.reject_reason && <div className="text-xs text-muted">Reason: {p.reject_reason}</div>}</Td>
                <Td>{p.status === 'pending' && (
                  <Can action="moderate_rishtey"><div className="flex gap-2">
                    <Button variant="primary" onClick={() => setPending({ kind: 'review', item: p, decision: 'approve' })}>Approve</Button>
                    <Button variant="danger" onClick={() => setPending({ kind: 'review', item: p, decision: 'reject' })}>Reject…</Button>
                  </div></Can>
                )}</Td>
              </tr>
            ))}
          </Table>
        ))}
        {queue.data && <Pagination page={page} size={queue.data.size} total={queue.data.total} onPage={setPage} />}
      </Card>

      <Card title="Reports" actions={<Select aria-label="Report status" className="max-w-40" value={rstatus} onChange={(e) => { setRstatus(e.target.value); setRpage(1); }}><option value="open">Open</option><option value="dismissed">Dismissed</option><option value="actioned">Actioned</option></Select>}>
        {reports.error != null && <ErrorBox error={reports.error} retry={reports.reload} />}
        {reports.loading && !reports.data && <Spinner />}
        {reports.data && (reports.data.items.length === 0 ? <Empty>No reports.</Empty> : (
          <Table caption="Reports" head={['Profile', 'Reason', 'Note', 'Reported', '']}>
            {reports.data.items.map((r) => (
              <tr key={r.id}>
                <Td>{r.first_name ?? 'deleted profile'} {r.profile_status && <Badge tone={r.profile_status === 'hidden' ? 'bad' : 'neutral'}>{r.profile_status}</Badge>}{r.status === 'open' && r.open_reports > 1 && <div className="text-xs text-muted">{r.open_reports} open reports</div>}</Td>
                <Td>{r.reason}</Td>
                <Td className="max-w-xs whitespace-pre-wrap">{r.note ?? '–'}</Td>
                <Td>{fmtDateTime(r.created_at)}</Td>
                <Td>{r.status === 'open' && (
                  <Can action="moderate_rishtey"><div className="flex gap-2">
                    <Button onClick={() => setPending({ kind: 'report', item: r, action: 'dismiss' })}>Dismiss</Button>
                    <Button variant="danger" onClick={() => setPending({ kind: 'report', item: r, action: 'hide' })}>Hide profile…</Button>
                  </div></Can>
                )}</Td>
              </tr>
            ))}
          </Table>
        ))}
        {reports.data && <Pagination page={rpage} size={reports.data.size} total={reports.data.total} onPage={setRpage} />}
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'review' ? `${pending.decision === 'approve' ? 'Approve' : 'Reject'} ${pending.item.first_name}?` : pending?.action === 'hide' ? 'Hide this profile?' : 'Dismiss this report?'}
        body={pending?.kind === 'review' && pending.decision === 'reject' ? 'The person will see this reason, so keep it short and kind.' : undefined}
        needReason={!(pending?.kind === 'review' && pending.decision === 'approve')}
        danger={pending?.kind === 'review' ? pending.decision === 'reject' : pending?.action === 'hide'}
        confirmLabel={pending?.kind === 'review' ? (pending.decision === 'approve' ? 'Approve' : 'Reject') : pending?.action === 'hide' ? 'Hide' : 'Dismiss'}
        onCancel={() => setPending(null)}
        onConfirm={async ({ reason }) => {
          if (!pending) return;
          if (pending.kind === 'review') await api(`/admin/api/rishtey/profiles/${pending.item.id}/review`, { method: 'POST', body: { decision: pending.decision, reason } });
          else await api(`/admin/api/rishtey/reports/${pending.item.id}/resolve`, { method: 'POST', body: { action: pending.action, reason } });
          setPending(null);
          refresh();
        }}
      />
    </>
  );
}
