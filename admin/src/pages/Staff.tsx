import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Input, Notice, PageTitle, Select, Spinner, Table, Td } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/format';
import { ROLE_LABEL, ROLES, type Role } from '../lib/roles';
import { useApi } from '../lib/useApi';

interface StaffRow { user_id: string; role: Role; status: string; created_at: string; phone_masked: string | null; email_masked: string | null; name_masked: string | null }
type Pending = null | { kind: 'role'; row: StaffRow; role: Role | 'user' } | { kind: 'add' };

export default function Staff() {
  const { me } = useAuth();
  const list = useApi<{ items: StaffRow[] }>('/admin/api/staff');
  const [pending, setPending] = useState<Pending>(null);
  const [add, setAdd] = useState({ who: '', role: 'support' as Role });
  const [flash, setFlash] = useState<string | null>(null);

  const addBody = () => (add.who.includes('@') ? { email: add.who.trim() } : /^[0-9a-f-]{36}$/i.test(add.who.trim()) ? { user_id: add.who.trim() } : { phone: add.who.trim() });

  return (
    <>
      <PageTitle title="Staff & roles" sub="Staff are ordinary Notra accounts with a role. They sign in with Google or mobile OTP like anyone else. Only owners manage roles, and there must always be one owner." />
      <Card title="Give someone a role" className="mb-4">
        <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setPending({ kind: 'add' }); }}>
          <div className="sm:col-span-2"><Field label="Mobile number, e-mail or user id" hint="The person must have signed in to Notra once."><Input value={add.who} onChange={(e) => setAdd({ ...add, who: e.target.value })} required /></Field></div>
          <Field label="Role"><Select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          <div className="flex items-end"><Button type="submit" variant="primary">Grant role…</Button></div>
        </form>
      </Card>
      {flash && <div className="mb-3"><Notice tone="good">{flash}</Notice></div>}
      <Card title="Current staff">
        {list.error != null && <ErrorBox error={list.error} retry={list.reload} />}
        {list.loading && !list.data && <Spinner />}
        {list.data && (list.data.items.length === 0 ? <Empty>No staff.</Empty> : (
          <Table caption="Staff" head={['Account', 'Phone', 'E-mail', 'Role', 'Status', 'Since', '']}>
            {list.data.items.map((s) => (
              <tr key={s.user_id}>
                <Td><Link className="font-mono text-xs underline" to={`/users/${s.user_id}`}>{s.user_id.slice(0, 8)}…</Link>{s.user_id === me?.user_id && <> <Badge tone="accent">you</Badge></>}</Td>
                <Td className="tabular-nums">{s.phone_masked ?? '–'}</Td>
                <Td>{s.email_masked ?? '–'}</Td>
                <Td>
                  <Select aria-label={`Role of ${s.user_id}`} className="max-w-32" value={s.role} onChange={(e) => setPending({ kind: 'role', row: s, role: e.target.value as Role })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </Td>
                <Td><Badge tone={s.status === 'active' ? 'good' : 'bad'}>{s.status}</Badge></Td>
                <Td>{fmtDate(s.created_at)}</Td>
                <Td><Button onClick={() => setPending({ kind: 'role', row: s, role: 'user' })}>Remove from staff</Button></Td>
              </tr>
            ))}
          </Table>
        ))}
      </Card>
      <ConfirmDialog
        open={pending !== null} needReason danger={pending?.kind === 'role' && (pending.role === 'user' || pending.row.role === 'owner')}
        title={pending?.kind === 'add' ? `Grant ${ROLE_LABEL[add.role]} role?` : pending?.kind === 'role' ? (pending.role === 'user' ? 'Remove this person from staff?' : `Change role to ${ROLE_LABEL[pending.role]}?`) : ''}
        body={pending?.kind === 'role' && pending.row.user_id === me?.user_id ? 'This is your own account: you may lose access to this page.' : 'The change takes effect on their very next request.'}
        confirmLabel="Confirm" onCancel={() => setPending(null)}
        onConfirm={async ({ reason }) => {
          if (!pending) return;
          if (pending.kind === 'add') await api('/admin/api/staff', { method: 'POST', body: { ...addBody(), role: add.role, reason } });
          else if (pending.role === 'user') await api(`/admin/api/staff/${pending.row.user_id}`, { method: 'DELETE', body: { reason } });
          else await api(`/admin/api/staff/${pending.row.user_id}`, { method: 'PATCH', body: { role: pending.role, reason } });
          setFlash('Role updated.');
          setPending(null);
          setAdd({ ...add, who: '' });
          list.reload();
        }}
      />
    </>
  );
}
