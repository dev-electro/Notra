import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Notice, PageTitle, Pagination, Spinner, Table, Td, Textarea } from '../components/ui';
import { api, errorText } from '../lib/api';
import { Can, useAuth } from '../lib/auth';
import { fmtDateTime, timeAgo } from '../lib/format';
import type { UserDetail as Detail } from '../lib/types';
import { useApi } from '../lib/useApi';

type Dialog = null | 'suspend' | 'unsuspend' | 'signout' | 'delete' | { unmask: 'phone' | 'email' };

export default function UserDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const u = useApi<Detail>(`/admin/api/users/${id}`);
  const notes = useApi<{ items: { id: string; admin_label: string; body: string; at: string }[] }>(can('add_user_note') ? `/admin/api/users/${id}/notes` : null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [revealed, setRevealed] = useState<{ field: 'phone' | 'email'; value: string } | null>(null);
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  // A revealed value is shown for 30 seconds, then masked again.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(null), 30_000);
    return () => clearTimeout(t);
  }, [revealed]);

  const d = u.data;
  const post = async (path: string, body: unknown, ok: string) => {
    await api(`/admin/api/users/${id}/${path}`, { method: 'POST', body });
    setFlash(ok);
    u.reload();
    notes.reload();
  };

  return (
    <>
      <PageTitle
        title="User"
        sub={<><Link to="/users" className="underline">All users</Link> · <span className="font-mono text-xs">{id}</span></>}
      />
      {u.error != null && <ErrorBox error={u.error} retry={u.reload} />}
      {u.loading && !d && <Spinner />}
      {flash && <div className="mb-3"><Notice tone="good">{flash}</Notice></div>}
      {err != null && <div className="mb-3"><ErrorBox error={err} /></div>}
      {d && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Account" className="lg:col-span-2">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Status</dt>
              <dd>
                <Badge tone={d.status === 'active' ? 'good' : 'bad'}>{d.status}</Badge>
                {d.status === 'suspended' && <span className="ml-2 text-muted">{fmtDateTime(d.suspended_at)} · {d.suspended_reason}</span>}
              </dd>
              <dt className="text-muted">Phone</dt>
              <dd className="tabular-nums">
                {revealed?.field === 'phone' ? <strong>{revealed.value}</strong> : (d.phone_masked ?? '–')}
                {d.phone_masked && <Reveal field="phone" shown={revealed?.field === 'phone'} onReveal={() => setDialog({ unmask: 'phone' })} onHide={() => setRevealed(null)} />}
              </dd>
              <dt className="text-muted">E-mail</dt>
              <dd>
                {revealed?.field === 'email' ? <strong>{revealed.value}</strong> : (d.email_masked ?? '–')}
                {d.email_masked && <Reveal field="email" shown={revealed?.field === 'email'} onReveal={() => setDialog({ unmask: 'email' })} onHide={() => setRevealed(null)} />}
              </dd>
              <dt className="text-muted">Sign-in methods</dt><dd>{d.sign_in_methods.join(', ') || '–'} <span className="text-muted">(signed up with {d.signup_method})</span></dd>
              <dt className="text-muted">Created</dt><dd>{fmtDateTime(d.created_at)}</dd>
              <dt className="text-muted">Last active</dt><dd>{fmtDateTime(d.last_active_at)} <span className="text-muted">({timeAgo(d.last_active_at)})</span></dd>
              <dt className="text-muted">Last sync</dt><dd>{fmtDateTime(d.last_sync_at)}</dd>
              <dt className="text-muted">App</dt><dd>{d.app_version ? `${d.app_version} on ${d.platform}` : 'unknown (older app build)'}</dd>
            </dl>
          </Card>

          <Card title="Actions">
            <div className="flex flex-col gap-2">
              <Can action="suspend_user" fallback={<p className="text-sm text-muted">Your role can view this account but not change it.</p>}>
                {d.status === 'active'
                  ? <Button variant="danger" onClick={() => setDialog('suspend')}>Suspend account</Button>
                  : <Button variant="primary" onClick={() => setDialog('unsuspend')}>Unsuspend account</Button>}
                <Button onClick={() => setDialog('signout')}>Force sign-out (all devices)</Button>
              </Can>
              <Can action="delete_user">
                <Button variant="danger" onClick={() => setDialog('delete')}>Delete account…</Button>
              </Can>
            </div>
          </Card>

          <Card title="Records (counts only)" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['Households', d.counts.households], ['Events', d.counts.events], ['Entries', d.counts.entries], ['Ledgers', d.counts.ledgers]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface2 p-3"><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">
              Sync last 7 days: {d.counts.sync_requests_7d} requests, {d.counts.sync_errors_7d} failed · {d.counts.active_sessions} active sign-ins · {d.counts.tickets} tickets.
              Diary contents (names, villages, amounts) cannot be opened from this panel.
            </p>
          </Card>

          <Card title="Devices">
            {d.devices.length === 0 ? <Empty>No device seen yet.</Empty> : (
              <ul className="space-y-2 text-sm">
                {d.devices.map((x) => <li key={x.platform}><strong>{x.platform}</strong> · app {x.app_version ?? '?'} · OS {x.os_version ?? '?'}<br /><span className="text-muted">seen {timeAgo(x.last_seen)}</span></li>)}
              </ul>
            )}
          </Card>

          <Can action="add_user_note">
            <Card title="Internal notes (never shown to the user)" className="lg:col-span-3">
              <form className="mb-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void post('notes', { body: note }, 'Note added.').then(() => setNote('')).catch(setErr); }}>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called on 12 Oct, lost phone, restored via OTP" aria-label="New note" />
                <Button type="submit" variant="primary" disabled={!note.trim()}>Add note</Button>
              </form>
              {notes.data?.items.length ? (
                <ul className="divide-y divide-line text-sm">
                  {notes.data.items.map((n) => <li key={n.id} className="py-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="text-xs text-muted">{n.admin_label} · {fmtDateTime(n.at)}</p></li>)}
                </ul>
              ) : <Empty>No notes yet.</Empty>}
            </Card>
          </Can>

          <Can action="view_consented_data">
            <div className="lg:col-span-3"><SharedData userId={id} active={d.support_access.active} expiresAt={d.support_access.expires_at} /></div>
          </Can>
        </div>
      )}

      <ConfirmDialog open={dialog === 'suspend'} title="Suspend this account?" needReason danger confirmLabel="Suspend" onCancel={() => setDialog(null)}
        body="The user is signed out of sync immediately and sees a Hindi message asking them to contact support."
        onConfirm={async ({ reason }) => { await post('suspend', { reason }, 'Account suspended.'); setDialog(null); }} />
      <ConfirmDialog open={dialog === 'unsuspend'} title="Unsuspend this account?" needReason confirmLabel="Unsuspend" onCancel={() => setDialog(null)}
        onConfirm={async ({ reason }) => { await post('unsuspend', { reason }, 'Account unsuspended.'); setDialog(null); }} />
      <ConfirmDialog open={dialog === 'signout'} title="Force sign-out on all devices?" needReason confirmLabel="Sign out" onCancel={() => setDialog(null)}
        body="All of the person's sessions are deleted now: every phone is signed out on its next request (the diary on the phone is untouched). They can sign in again; suspend the account to stop that."
        onConfirm={async ({ reason }) => { await post('signout', { reason }, 'Signed out on all devices.'); setDialog(null); }} />
      <ConfirmDialog open={dialog === 'delete'} title="Delete this account and all its data?" needReason danger confirmLabel="Delete forever" typeToConfirm={`delete ${id.slice(0, 8)}`} onCancel={() => setDialog(null)}
        body="This permanently erases the user's account, ledgers, households, events and entries from the server (their phone keeps its local copy). It cannot be undone."
        onConfirm={async ({ reason, typed }) => { await post('delete', { reason, confirm: typed }, 'Account deleted.'); nav('/users'); }} />
      <ConfirmDialog open={typeof dialog === 'object' && dialog !== null} title="Reveal this value?" needReason confirmLabel="Reveal for 30 seconds" onCancel={() => setDialog(null)}
        body="Revealing a phone number or e-mail is written to the audit log with your name and reason."
        onConfirm={async ({ reason }) => {
          if (typeof dialog !== 'object' || dialog === null) return;
          const field = dialog.unmask;
          const r = await api<{ field: 'phone' | 'email'; value: string }>(`/admin/api/users/${id}/unmask`, { method: 'POST', body: { field, reason } });
          setRevealed({ field: r.field, value: r.value });
          setDialog(null);
        }} />
    </>
  );
}

function Reveal({ field, shown, onReveal, onHide }: { field: string; shown: boolean; onReveal: () => void; onHide: () => void }) {
  const { can } = useAuth();
  if (!can('unmask_user')) return null;
  return <button type="button" className="ml-2 text-xs text-accent underline" onClick={shown ? onHide : onReveal} aria-label={`${shown ? 'Hide' : 'Reveal'} ${field}`}>{shown ? 'hide' : 'reveal'}</button>;
}

/** Consented support access. The user has to switch this on in the app; the server refuses (and the database returns nothing) otherwise. */
function SharedData({ userId, active, expiresAt }: { userId: string; active: boolean; expiresAt: string | null }) {
  const [table, setTable] = useState<'households' | 'events' | 'entries' | 'ledgers'>('households');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const rows = useApi<{ items: Record<string, unknown>[]; page_size: number }>(open && active ? `/admin/api/support-view/${userId}/${table}` : null, { page });
  return (
    <Card title="Data the user chose to share with support">
      {!active ? (
        <p className="text-sm text-muted">The user has not shared their data. They can switch this on in the app (“सहायता को मेरा डेटा 7 दिन दिखाएं”); access is read-only, expires after at most 7 days, and every view is logged.</p>
      ) : (
        <>
          <Notice tone="warn">Shared by the user until {fmtDateTime(expiresAt)}. Read-only. Your views are written to the audit log.</Notice>
          {!open ? <div className="mt-3"><Button onClick={() => setOpen(true)}>Open shared data</Button></div> : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['households', 'events', 'entries', 'ledgers'] as const).map((t) => <Button key={t} variant={t === table ? 'primary' : 'secondary'} onClick={() => { setTable(t); setPage(1); }}>{t}</Button>)}
              </div>
              {rows.error != null && <p className="text-sm text-bad">{errorText(rows.error)}</p>}
              {rows.data && (rows.data.items.length === 0 ? <Empty>Nothing here.</Empty> : (
                <Table caption={table} head={Object.keys(rows.data.items[0]!)}>
                  {rows.data.items.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <Td key={j} className="max-w-56 truncate">{v === null ? '–' : String(v)}</Td>)}</tr>)}
                </Table>
              ))}
              {rows.data && <Pagination page={page} size={rows.data.page_size} total={rows.data.items.length < rows.data.page_size ? (page - 1) * rows.data.page_size + rows.data.items.length : page * rows.data.page_size + 1} onPage={setPage} />}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

