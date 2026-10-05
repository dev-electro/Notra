import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { errorText } from '../lib/api';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90',
  secondary: 'bg-surface2 text-ink border border-line hover:bg-line/50',
  danger: 'bg-bad text-accent-contrast hover:opacity-90',
  ghost: 'text-ink hover:bg-surface2',
};
export function Button({ variant = 'secondary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], className)}
    />
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-4 shadow-sm', className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {sub && <p className="mt-0.5 max-w-3xl text-sm text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface2 text-muted',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1 block font-medium">{label}</label>
      <div id={id}>{children}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const INPUT = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-muted disabled:opacity-60';
export const inputClass = INPUT;
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(INPUT, p.className)} />;
}
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(INPUT, p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(INPUT, 'min-h-20', p.className)} />;
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('flex items-center gap-2 text-sm', disabled && 'opacity-60')}>
      <input type="checkbox" role="switch" className="size-4 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <p role="status" className="py-6 text-center text-sm text-muted">{label}…</p>;
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-sm text-bad">
      <span>{errorText(error)}</span>
      {retry && <Button variant="secondary" onClick={retry}>Retry</Button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'good'; children: ReactNode }) {
  const t = { info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', good: 'bg-good-soft text-good' }[tone];
  return <div className={cx('rounded-md px-3 py-2 text-sm', t)}>{children}</div>;
}

/** Responsive table wrapper: scrolls horizontally inside the card on phones. */
export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-max text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-2 py-2 align-top', className)}>{children}</td>;

export function Pagination({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted">
      <span>{total === 0 ? 'No results' : `${(page - 1) * size + 1}–${Math.min(total, page * size)} of ${total}`}</span>
      <span className="flex items-center gap-2">
        <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} / {pages}</span>
        <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </div>
  );
}

/** Modal dialog with focus trap-lite (focus first field, Esc closes). */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50" aria-label={title}>
      <div className="p-5">
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Confirm dialog for risky actions: optional reason (the server requires one for most actions) and optional typed confirmation.
 */
export function ConfirmDialog({
  open, title, body, confirmLabel = 'Confirm', danger, needReason, typeToConfirm, onCancel, onConfirm,
}: {
  open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; needReason?: boolean; typeToConfirm?: string;
  onCancel: () => void; onConfirm: (v: { reason: string; typed: string }) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (open) { setReason(''); setTyped(''); setErr(null); } }, [open]);
  const ok = (!needReason || reason.trim().length >= 5) && (!typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase());
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="space-y-3">
        {body && <div className="text-sm text-muted">{body}</div>}
        {needReason && (
          <Field label="Reason (saved in the audit log)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 5 characters" />
          </Field>
        )}
        {typeToConfirm && (
          <Field label={`Type “${typeToConfirm}” to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        )}
        {err != null && <ErrorBox error={err} />}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try { await onConfirm({ reason: reason.trim(), typed: typed.trim() }); } catch (e) { setErr(e); } finally { setBusy(false); }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'good' | 'warn' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tabular-nums', tone === 'bad' && 'text-bad', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
