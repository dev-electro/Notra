import { useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Input, Notice, PageTitle, Select, Spinner, Table, Td } from '../components/ui';
import { api } from '../lib/api';
import { Can, useAuth } from '../lib/auth';
import { fmtDateTime, fmtNum, rupees } from '../lib/format';
import { useApi } from '../lib/useApi';

interface OtpStats {
  days: number;
  per_day: { day: string; sends: number; send_failures: number; verify_ok: number; verify_failures: number; blocked: number; sms_cost_paise: number }[];
  top_ips: { ip: string; sends: number; failures: number; blocked: boolean }[];
  top_phones: { phone_masked: string; ref: string; sends: number; failures: number; blocked: boolean }[];
}
interface Block { id: string; kind: 'phone' | 'ip'; value_masked: string; reason: string; created_by: string; created_at: string; expires_at: string | null; active: boolean }

type Pending = null | { kind: 'phone' | 'ip'; value?: string; ref?: string; label: string } | { unblock: Block };

export default function Abuse() {
  const { can } = useAuth();
  const [days, setDays] = useState('7');
  const stats = useApi<OtpStats>('/admin/api/abuse/otp', { days });
  const list = useApi<{ items: Block[] }>('/admin/api/abuse/blocklist');
  const [pending, setPending] = useState<Pending>(null);
  const [form, setForm] = useState({ kind: 'phone', value: '', hours: '' });
  const [err, setErr] = useState<unknown>(null);
  const refresh = () => { stats.reload(); list.reload(); };

  const block = async (p: { kind: 'phone' | 'ip'; value?: string; ref?: string }, reason: string, hours?: string) => {
    await api('/admin/api/abuse/blocklist', { method: 'POST', body: { ...p, reason, expires_in_hours: hours ? Number(hours) : undefined } });
    refresh();
  };

  return (
    <>
      <PageTitle title="Abuse & blocklist" sub="OTP volume, the noisiest IPs and phone numbers (masked), and what is blocked. Blocks apply to OTP start and verify." />
      <Card title="OTP activity" className="mb-4" actions={<Select aria-label="Period" className="max-w-36" value={days} onChange={(e) => setDays(e.target.value)}><option value="1">Last 24 h</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select>}>
        {stats.error != null && <ErrorBox error={stats.error} retry={stats.reload} />}
        {stats.loading && !stats.data && <Spinner />}
        {stats.data && (stats.data.per_day.length === 0 ? <Empty>No OTP activity in this period.</Empty> : (
          <Table caption="OTP per day" head={['Day', 'Sent', 'Send failed', 'Verified', 'Wrong codes', 'Blocked', 'Est. cost']}>
            {stats.data.per_day.map((d) => (
              <tr key={d.day}><Td>{d.day}</Td><Td>{fmtNum(d.sends)}</Td><Td>{fmtNum(d.send_failures)}</Td><Td>{fmtNum(d.verify_ok)}</Td><Td>{fmtNum(d.verify_failures)}</Td><Td>{fmtNum(d.blocked)}</Td><Td>{rupees(d.sms_cost_paise)}</Td></tr>
            ))}
          </Table>
        ))}
      </Card>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Top IP addresses">
          {stats.data && (stats.data.top_ips.length === 0 ? <Empty>None.</Empty> : (
            <Table caption="Top IPs" head={['IP', 'Sent', 'Wrong codes', '']}>
              {stats.data.top_ips.map((r) => (
                <tr key={r.ip}><Td className="font-mono text-xs">{r.ip}</Td><Td>{r.sends}</Td><Td>{r.failures}</Td>
                  <Td>{r.blocked ? <Badge tone="bad">blocked</Badge> : <Can action="manage_blocklist"><Button onClick={() => setPending({ kind: 'ip', value: r.ip, label: r.ip })}>Block</Button></Can>}</Td></tr>
              ))}
            </Table>
          ))}
        </Card>
        <Card title="Top phone numbers (masked)">
          {stats.data && (stats.data.top_phones.length === 0 ? <Empty>None.</Empty> : (
            <Table caption="Top phones" head={['Phone', 'Sent', 'Wrong codes', '']}>
              {stats.data.top_phones.map((r) => (
                <tr key={r.ref}><Td className="tabular-nums">{r.phone_masked}</Td><Td>{r.sends}</Td><Td>{r.failures}</Td>
                  <Td>{r.blocked ? <Badge tone="bad">blocked</Badge> : <Can action="manage_blocklist"><Button onClick={() => setPending({ kind: 'phone', ref: r.ref, label: r.phone_masked })}>Block</Button></Can>}</Td></tr>
              ))}
            </Table>
          ))}
        </Card>
      </div>
      <Can action="manage_blocklist">
        <Card title="Block a phone number or IP" className="mb-4">
          <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setPending({ kind: form.kind as 'phone' | 'ip', value: form.value, label: form.kind === 'phone' ? 'this phone number' : form.value }); }}>
            <Field label="Type"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="phone">Phone number</option><option value="ip">IP address</option></Select></Field>
            <Field label="Value"><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required placeholder={form.kind === 'phone' ? '98765 43210' : '203.0.113.9'} /></Field>
            <Field label="Expires after (hours)" hint="Empty = until removed"><Input type="number" min={1} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></Field>
            <div className="flex items-end"><Button type="submit" variant="primary">Block…</Button></div>
          </form>
        </Card>
      </Can>
      <Card title="Blocklist">
        {err != null && <ErrorBox error={err} />}
        {list.data && (list.data.items.length === 0 ? <Empty>Nothing is blocked.</Empty> : (
          <Table caption="Blocklist" head={['Type', 'Value', 'Reason', 'By', 'Since', 'Expires', '']}>
            {list.data.items.map((b) => (
              <tr key={b.id}><Td>{b.kind}</Td><Td className="tabular-nums">{b.value_masked}</Td><Td>{b.reason}</Td><Td>{b.created_by}</Td><Td>{fmtDateTime(b.created_at)}</Td>
                <Td>{b.expires_at ? <>{fmtDateTime(b.expires_at)} {!b.active && <Badge>expired</Badge>}</> : 'never'}</Td>
                <Td>{can('manage_blocklist') && <Button onClick={() => setPending({ unblock: b })}>Unblock</Button>}</Td></tr>
            ))}
          </Table>
        ))}
      </Card>
      <Notice tone="info">A blocked person gets a plain “blocked” answer when asking for or entering an OTP. Every block and unblock is in the audit log.</Notice>

      <ConfirmDialog
        open={pending !== null}
        title={pending && 'unblock' in pending ? 'Remove this block?' : `Block ${pending?.label ?? ''}?`}
        needReason danger={!(pending && 'unblock' in pending)} confirmLabel={pending && 'unblock' in pending ? 'Unblock' : 'Block'}
        onCancel={() => setPending(null)}
        onConfirm={async ({ reason }) => {
          setErr(null);
          if (pending && 'unblock' in pending) await api(`/admin/api/abuse/blocklist/${pending.unblock.id}`, { method: 'DELETE', body: { reason } }).then(refresh);
          else if (pending) await block({ kind: pending.kind, value: pending.value, ref: pending.ref }, reason, form.hours);
          setPending(null);
        }}
      />
    </>
  );
}
