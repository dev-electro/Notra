import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Notice, Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import type { Action } from './lib/roles';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

const Users = lazy(() => import('./pages/Users'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const Tickets = lazy(() => import('./pages/Tickets'));
const Config = lazy(() => import('./pages/Config'));
const Abuse = lazy(() => import('./pages/Abuse'));
const Monitoring = lazy(() => import('./pages/Monitoring'));
const Reports = lazy(() => import('./pages/Reports'));
const Staff = lazy(() => import('./pages/Staff'));
const Audit = lazy(() => import('./pages/Audit'));

function Guard({ need, children }: { need?: Action; children: ReactNode }) {
  const { me, loading, can } = useAuth();
  if (loading) return <Spinner label="Signing in" />;
  if (!me) return <Navigate to="/login" replace />;
  if (need && !can(need)) return <Notice tone="warn">Your role does not have access to this page.</Notice>;
  return <>{children}</>;
}

const page = (need: Action, el: ReactNode) => <Guard need={need}><Suspense fallback={<Spinner />}>{el}</Suspense></Guard>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guard><Layout /></Guard>}>
            <Route index element={page('view_dashboard', <Dashboard />)} />
            <Route path="users" element={page('view_users', <Users />)} />
            <Route path="users/:id" element={page('view_users', <UserDetail />)} />
            <Route path="tickets" element={page('view_tickets', <Tickets />)} />
            <Route path="config" element={page('view_config', <Config />)} />
            <Route path="abuse" element={page('view_abuse', <Abuse />)} />
            <Route path="monitoring" element={page('view_monitoring', <Monitoring />)} />
            <Route path="reports" element={page('view_reports', <Reports />)} />
            <Route path="staff" element={page('manage_staff', <Staff />)} />
            <Route path="audit" element={page('view_audit', <Audit />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
