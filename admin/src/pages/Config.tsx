import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Input, Notice, PageTitle, Select, Spinner, Table, Td, Textarea, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { Can, useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import type { ConfigEntry, ConfigKey } from '../lib/types';
import { useApi } from '../lib/useApi';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});

/** What the in-app banner looks like (Hindi), so admins see what users will see. */
function BannerPreview({ tone, children, label }: { tone: 'info' | 'warning' | 'critical'; children: ReactNode; label: string }) {
  const cls = { info: 'bg-info-soft text-info', warning: 'bg-warn-soft text-warn', critical: 'bg-bad-soft text-bad' }[tone];
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">Preview in the app: {label}</p>
      <div className="mx-auto max-w-xs rounded-2xl border border-line bg-bg p-3">
        <div className={`hi rounded-xl px-3 py-2.5 ${cls}`}>{children}</div>
      </div>
    </div>
  );
}

export default function Config() {
  const cfg = useApi<{ items: ConfigEntry[] }>('/admin/api/config');
  const hist = useApi<{ items: { id: string; key: string; before: unknown; after: unknown; changed_by: string; reason: string | null; at: string }[] }>('/admin/api/config-history', { page: 1 });
  const { can } = useAuth();
  const by = (k: ConfigKey) => cfg.data?.items.find((e) => e.key === k);
  const saved = () => { cfg.reload(); hist.reload(); };
  const editable = can('edit_config');

  return (
    <>
      <PageTitle title="Remote config" sub="Served to the app at GET /v1/config (cached for 5 minutes, so changes reach phones within about 5 minutes). Every change is kept in the history and the audit log." />
      {!editable && <div className="mb-3"><Notice tone="info">Your role can read the config but not change it.</Notice></div>}
      {cfg.error != null && <ErrorBox error={cfg.error} retry={cfg.reload} />}
      {cfg.loading && !cfg.data && <Spinner />}
      {cfg.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Maintenance entry={by('maintenance')!} editable={editable} onSaved={saved} />
          <Versions min={by('min_supported_version')!} latest={by('latest_version')!} msg={by('force_update_message_hi')!} editable={editable} onSaved={saved} />
          <Announcement entry={by('announcement')!} editable={editable} onSaved={saved} />
          <Ads entry={by('ads')!} editable={editable} onSaved={saved} />
          <Features entry={by('features')!} editable={editable} onSaved={saved} />
        </div>
      )}
      <Can action="view_config">
        <Card title="Change history" className="mt-4">
          {hist.data && (hist.data.items.length === 0 ? <Empty>No changes yet.</Empty> : (
            <Table caption="Config history" head={['When', 'Key', 'By', 'Reason', 'Before', 'After']}>
              {hist.data.items.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(h.at)}</Td><Td>{h.key}</Td><Td>{h.changed_by}</Td><Td>{h.reason ?? '–'}</Td>
                  <Td><code className="block max-w-56 truncate text-xs" title={JSON.stringify(h.before)}>{h.before === null ? '(default)' : JSON.stringify(h.before)}</code></Td>
                  <Td><code className="block max-w-56 truncate text-xs" title={JSON.stringify(h.after)}>{JSON.stringify(h.after)}</code></Td>
                </tr>
              ))}
            </Table>
          ))}
        </Card>
      </Can>
    </>
  );
}

interface CardProps { editable: boolean; onSaved: () => void }

/** Shared save logic: PUT /config/:key with an optional confirm dialog for risky changes. */
function useSave(key: ConfigKey, onSaved: () => void) {
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState(false);
  const save = async (value: unknown, reason: string | null) => {
    setErr(null);
    try {
      await api(`/admin/api/config/${key}`, { method: 'PUT', body: { value, reason: reason ?? undefined } });
      setOk(true);
      onSaved();
    } catch (e) { setErr(e); throw e; }
  };
  return { err, ok, save, clear: () => { setOk(false); setErr(null); } };
}

function Meta({ e }: { e: ConfigEntry }) {
  return <p className="mt-2 text-xs text-muted">{e.is_default ? 'Using the built-in default.' : `Last changed ${fmtDateTime(e.updated_at)} by ${e.updated_by}.`}</p>;
}

function Maintenance({ entry, editable, onSaved }: { entry: ConfigEntry } & CardProps) {
  const v = obj(entry.value);
  const [s, setS] = useState({ enabled: !!v.enabled, message_hi: String(v.message_hi ?? ''), message_en: String(v.message_en ?? '') });
  useEffect(() => setS({ enabled: !!v.enabled, message_hi: String(v.message_hi ?? ''), message_en: String(v.message_en ?? '') }), [entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const { err, ok, save, clear } = useSave('maintenance', onSaved);
  const [confirm, setConfirm] = useState(false);
  const turningOn = s.enabled && !v.enabled;
  return (
    <Card title="Maintenance mode" actions={v.enabled ? <Badge tone="bad">ON</Badge> : <Badge tone="good">off</Badge>}>
      <div className="space-y-3">
        <Toggle label="Maintenance on (sign-in and sync return 503 with the message below)" checked={s.enabled} disabled={!editable} onChange={(enabled) => { clear(); setS({ ...s, enabled }); }} />
        <Field label="Message (Hindi)"><Textarea className="hi" value={s.message_hi} disabled={!editable} onChange={(e) => setS({ ...s, message_hi: e.target.value })} /></Field>
        <Field label="Message (English)"><Input value={s.message_en} disabled={!editable} onChange={(e) => setS({ ...s, message_en: e.target.value })} /></Field>
        <BannerPreview tone="warning" label="maintenance screen">{s.message_hi || '…'}</BannerPreview>
        {err != null && <ErrorBox error={err} />}
        {ok && <Notice tone="good">Saved.</Notice>}
        <Can action="edit_config"><Button variant={turningOn ? 'danger' : 'primary'} onClick={() => (turningOn ? setConfirm(true) : void save(s, null).catch(() => undefined))}>Save</Button></Can>
      </div>
      <Meta e={entry} />
      <ConfirmDialog open={confirm} title="Turn maintenance mode ON?" danger needReason confirmLabel="Turn on" onCancel={() => setConfirm(false)}
        body="Everyone's sign-in and sync will stop and show the message until you turn this off. Phones keep working offline. Health and this admin panel stay up."
        onConfirm={async ({ reason }) => { await save(s, reason); setConfirm(false); }} />
    </Card>
  );
}

const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
function Versions({ min, latest, msg, editable, onSaved }: { min: ConfigEntry; latest: ConfigEntry; msg: ConfigEntry } & CardProps) {
  const [s, setS] = useState({ min: String(min.value), latest: String(latest.value), msg: String(msg.value) });
  useEffect(() => setS({ min: String(min.value), latest: String(latest.value), msg: String(msg.value) }), [min, latest, msg]);
  const a = useSave('latest_version', onSaved);
  const b = useSave('min_supported_version', onSaved);
  const c = useSave('force_update_message_hi', onSaved);
  const [confirm, setConfirm] = useState(false);
  const valid = SEMVER.test(s.min) && SEMVER.test(s.latest);
  const raising = s.min !== String(min.value);
  const run = async (reason: string | null) => {
    // order matters for the server's min <= latest check
    const raiseLatest = s.latest !== String(latest.value) && s.latest > String(latest.value);
    if (raiseLatest) await a.save(s.latest, reason);
    if (s.min !== String(min.value)) await b.save(s.min, reason);
    if (!raiseLatest && s.latest !== String(latest.value)) await a.save(s.latest, reason);
    if (s.msg !== String(msg.value)) await c.save(s.msg, reason);
  };
  return (
    <Card title="Versions and forced update">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latest version" hint="Shown as “update available”"><Input value={s.latest} disabled={!editable} onChange={(e) => setS({ ...s, latest: e.target.value })} placeholder="1.4.0" /></Field>
          <Field label="Minimum supported" hint="Older apps are forced to update"><Input value={s.min} disabled={!editable} onChange={(e) => setS({ ...s, min: e.target.value })} placeholder="1.2.0" /></Field>
        </div>
        <Field label="Force-update message (Hindi)"><Textarea className="hi" value={s.msg} disabled={!editable} onChange={(e) => setS({ ...s, msg: e.target.value })} /></Field>
        <BannerPreview tone="critical" label={`apps older than ${s.min || '…'}`}>{s.msg || '…'}</BannerPreview>
        {[a.err, b.err, c.err].map((e, i) => (e != null ? <ErrorBox key={i} error={e} /> : null))}
        {(a.ok || b.ok || c.ok) && <Notice tone="good">Saved.</Notice>}
        <Can action="edit_config"><Button variant={raising ? 'danger' : 'primary'} disabled={!valid} onClick={() => (raising ? setConfirm(true) : void run(null).catch(() => undefined))}>Save</Button></Can>
      </div>
      <Meta e={min} />
      <ConfirmDialog open={confirm} title="Change the minimum supported version?" danger needReason confirmLabel="Save" onCancel={() => setConfirm(false)}
        body={`Every app older than ${s.min} will be blocked behind the update screen. Make sure ${s.min} is already live on the Play Store.`}
        onConfirm={async ({ reason }) => { await run(reason); setConfirm(false); }} />
    </Card>
  );
}

const toLocal = (iso: unknown) => (typeof iso === 'string' && iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : null);

function Announcement({ entry, editable, onSaved }: { entry: ConfigEntry } & CardProps) {
  const v = obj(entry.value);
  const init = () => ({ enabled: !!v.enabled, message_hi: String(v.message_hi ?? ''), level: String(v.level ?? 'info'), starts_at: toLocal(v.starts_at), ends_at: toLocal(v.ends_at) });
  const [s, setS] = useState(init);
  useEffect(() => setS(init()), [entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const { err, ok, save, clear } = useSave('announcement', onSaved);
  const set = (k: keyof typeof s) => (e: { target: { value: string } }) => { clear(); setS({ ...s, [k]: e.target.value }); };
  return (
    <Card title="Announcement banner" actions={v.enabled ? <Badge tone="accent">ON</Badge> : <Badge>off</Badge>}>
      <div className="space-y-3">
        <Toggle label="Show the announcement" checked={s.enabled} disabled={!editable} onChange={(enabled) => { clear(); setS({ ...s, enabled }); }} />
        <Field label="Message (Hindi)"><Textarea className="hi" value={s.message_hi} disabled={!editable} onChange={set('message_hi')} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Level"><Select value={s.level} disabled={!editable} onChange={set('level')}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></Select></Field>
          <Field label="Starts"><Input type="datetime-local" value={s.starts_at} disabled={!editable} onChange={set('starts_at')} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={s.ends_at} disabled={!editable} onChange={set('ends_at')} /></Field>
        </div>
        <BannerPreview tone={s.level as 'info' | 'warning' | 'critical'} label="home screen banner">{s.message_hi || '…'}</BannerPreview>
        {err != null && <ErrorBox error={err} />}
        {ok && <Notice tone="good">Saved.</Notice>}
        <Can action="edit_config"><Button variant="primary" onClick={() => void save({ enabled: s.enabled, message_hi: s.message_hi, level: s.level, starts_at: fromLocal(s.starts_at), ends_at: fromLocal(s.ends_at) }, null).catch(() => undefined)}>Save</Button></Can>
      </div>
      <Meta e={entry} />
    </Card>
  );
}

function Ads({ entry, editable, onSaved }: { entry: ConfigEntry } & CardProps) {
  const v = obj(entry.value);
  const init = () => ({
    enabled: !!v.enabled, banner: !!v.banner, native: !!v.native, interstitial: !!v.interstitial, rewarded: !!v.rewarded, first_day_ads_free: !!v.first_day_ads_free,
    interstitial_min_interval_sec: String(v.interstitial_min_interval_sec ?? 300), native_every_n_items: String(v.native_every_n_items ?? 8),
  });
  const [s, setS] = useState(init);
  useEffect(() => setS(init()), [entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const { err, ok, save, clear } = useSave('ads', onSaved);
  const flag = (k: 'enabled' | 'banner' | 'native' | 'interstitial' | 'rewarded' | 'first_day_ads_free', label: string) => (
    <Toggle key={k} label={label} checked={s[k]} disabled={!editable || (k !== 'enabled' && !s.enabled)} onChange={(x) => { clear(); setS({ ...s, [k]: x }); }} />
  );
  return (
    <Card title="Ads" actions={v.enabled ? <Badge tone="accent">ON</Badge> : <Badge>off</Badge>}>
      <div className="space-y-3">
        {flag('enabled', 'Ads enabled (master switch)')}
        <div className="grid grid-cols-2 gap-2">
          {flag('banner', 'Banner')}{flag('native', 'Native (in lists)')}{flag('interstitial', 'Interstitial')}{flag('rewarded', 'Rewarded')}
        </div>
        {flag('first_day_ads_free', 'First day is ad-free for new users')}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interstitial min. interval (sec)" hint="30 to 86400"><Input type="number" value={s.interstitial_min_interval_sec} disabled={!editable} onChange={(e) => setS({ ...s, interstitial_min_interval_sec: e.target.value })} /></Field>
          <Field label="Native ad every N items" hint="2 to 50"><Input type="number" value={s.native_every_n_items} disabled={!editable} onChange={(e) => setS({ ...s, native_every_n_items: e.target.value })} /></Field>
        </div>
        {err != null && <ErrorBox error={err} />}
        {ok && <Notice tone="good">Saved.</Notice>}
        <Can action="edit_config"><Button variant="primary" onClick={() => void save({ ...s, interstitial_min_interval_sec: Number(s.interstitial_min_interval_sec), native_every_n_items: Number(s.native_every_n_items) }, null).catch(() => undefined)}>Save</Button></Can>
      </div>
      <Meta e={entry} />
    </Card>
  );
}

function Features({ entry, editable, onSaved }: { entry: ConfigEntry } & CardProps) {
  const v = obj(entry.value);
  const [s, setS] = useState({ web_app: !!v.web_app, ocr: !!v.ocr, invitation_cards: !!v.invitation_cards });
  useEffect(() => setS({ web_app: !!v.web_app, ocr: !!v.ocr, invitation_cards: !!v.invitation_cards }), [entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const { err, ok, save, clear } = useSave('features', onSaved);
  return (
    <Card title="Feature flags">
      <div className="space-y-3">
        <Toggle label="Web app" checked={s.web_app} disabled={!editable} onChange={(x) => { clear(); setS({ ...s, web_app: x }); }} />
        <Toggle label="OCR (read from a photo)" checked={s.ocr} disabled={!editable} onChange={(x) => { clear(); setS({ ...s, ocr: x }); }} />
        <Toggle label="Invitation cards" checked={s.invitation_cards} disabled={!editable} onChange={(x) => { clear(); setS({ ...s, invitation_cards: x }); }} />
        {err != null && <ErrorBox error={err} />}
        {ok && <Notice tone="good">Saved.</Notice>}
        <Can action="edit_config"><Button variant="primary" onClick={() => void save(s, null).catch(() => undefined)}>Save</Button></Can>
      </div>
      <Meta e={entry} />
    </Card>
  );
}
