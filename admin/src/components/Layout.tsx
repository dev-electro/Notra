import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL, type Action } from '../lib/roles';
import { Badge, Button, cx } from './ui';

const NAV: { to: string; label: string; need: Action }[] = [
  { to: '/', label: 'Dashboard', need: 'view_dashboard' },
  { to: '/users', label: 'Users', need: 'view_users' },
  { to: '/tickets', label: 'Tickets', need: 'view_tickets' },
  { to: '/config', label: 'Remote config', need: 'view_config' },
  { to: '/abuse', label: 'Abuse & blocklist', need: 'view_abuse' },
  { to: '/monitoring', label: 'Monitoring', need: 'view_monitoring' },
  { to: '/reports', label: 'Reports', need: 'view_reports' },
  { to: '/rishtey', label: 'Rishtey moderation', need: 'moderate_rishtey' },
  { to: '/staff', label: 'Staff & roles', need: 'manage_staff' },
  { to: '/audit', label: 'Audit log', need: 'view_audit' },
];

type Theme = 'system' | 'light' | 'dark';
function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', t);
}
export function initTheme() {
  try { applyTheme((localStorage.getItem('notra-admin-theme') as Theme | null) ?? 'system'); } catch { /* storage blocked */ }
}

export default function Layout() {
  const { me, signOut, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => { try { return (localStorage.getItem('notra-admin-theme') as Theme | null) ?? 'system'; } catch { return 'system'; } });
  useEffect(() => { applyTheme(theme); try { localStorage.setItem('notra-admin-theme', theme); } catch { /* ignore */ } }, [theme]);
  const nav = NAV.filter((n) => can(n.need));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden">
        <span className="font-semibold">Notra Admin</span>
        <Button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="side-nav">Menu</Button>
      </header>
      <aside id="side-nav" className={cx('border-r border-line bg-surface md:block md:min-h-screen', open ? 'block' : 'hidden')}>
        <div className="hidden px-4 py-4 md:block">
          <p className="text-lg font-semibold">Notra <span className="text-accent">Admin</span></p>
          <p className="text-xs text-muted">Account metadata and aggregates only</p>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-2 pb-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cx('rounded-md px-3 py-2 text-sm', isActive ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-surface2')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line px-4 py-3 text-xs text-muted">
          <p className="break-all">{me?.label}</p>
          {me && <Badge tone="accent">{ROLE_LABEL[me.role]}</Badge>}
          <div className="flex items-center gap-2 pt-1">
            <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)} className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink">
              <option value="system">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-5 md:px-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
