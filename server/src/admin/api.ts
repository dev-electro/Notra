import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Deps } from '../app';
import { withUserTx } from '../db';
import { realEmail } from './mask';
import type { Auth } from '../auth/better-auth';
import { abuseRoutes } from './abuse';
import { authenticateAdmin, type AdminDeps } from './auth';
import { configRoutes } from './config';
import { Registry, type AdminVars, type Env, type RouteInfo } from './kit';
import { monitoringRoutes } from './monitoring';
import { findForbidden } from './privacy';
import { reportRoutes } from './reports';
import { staffRoutes } from './staff';
import { supportViewRoutes, SUPPORT_VIEW_PREFIX } from './supportview';
import { ticketRoutes } from './tickets';
import { userRoutes } from './users';

class Rollback extends Error {}

/**
 * The admin API, mounted at /admin/api. Staff sign in with the app's own Better Auth flow (Google / mobile OTP) and send the session as a cookie or
 * `Authorization: Bearer <session token>`. Per request: verify token -> read the role from the database -> open ONE transaction with the RLS
 * context (app.user_id = the staff member, app.role = their role) -> run the handler -> roll back on any error.
 * Handlers only see what Postgres lets that role see: account metadata, and aggregates through SECURITY DEFINER functions.
 */
export function createAdminApi(deps: Deps, admin: AdminDeps, auth: Auth): { app: Hono<AdminVars>; routes: RouteInfo[] } {
  const app = new Hono<AdminVars>();
  const now = () => (deps.now ?? (() => new Date()))();
  const env: Env = { deps, admin, now };

  if (admin.allowedOrigin) {
    app.use('*', cors({ origin: admin.allowedOrigin, allowHeaders: ['authorization', 'content-type'], credentials: true, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], maxAge: 600 }));
  }

  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const who = await authenticateAdmin(c, deps.db, auth);
    try {
      await withUserTx(deps.db, who.id, who.role, async (q) => {
        const [u] = await q.query<{ email: string | null; phone_e164: string | null }>('SELECT email, phone_e164 FROM users WHERE id = $1', [who.id]);
        c.set('admin', { ...who, label: realEmail(u?.email) ?? u?.phone_e164 ?? who.id });
        c.set('q', q);
        await next();
        if (c.error || c.res.status >= 400) throw new Rollback(); // an error response commits nothing (including audit rows of the failed action)
        // PRIVACY GUARD: no admin response may carry ledger fields (names, villages, amounts...). The one exemption is the
        // consent-gated support view. If a handler ever leaks one, fail closed and roll back.
        if (!c.req.path.includes(SUPPORT_VIEW_PREFIX) && (c.res.headers.get('content-type') ?? '').includes('application/json')) {
          const leaked = findForbidden(JSON.parse(await c.res.clone().text()));
          if (leaked.length) {
            console.error('admin privacy guard blocked a response', c.req.method, c.req.path, leaked.slice(0, 5));
            c.res = new Response(JSON.stringify({ error: 'privacy_guard' }), { status: 500, headers: { 'content-type': 'application/json' } });
            throw new Rollback();
          }
        }
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });

  const reg = new Registry(app);
  monitoringRoutes(reg, env);
  userRoutes(reg, env);
  staffRoutes(reg, env);
  configRoutes(reg, env);
  ticketRoutes(reg, env);
  abuseRoutes(reg, env);
  reportRoutes(reg, env);
  supportViewRoutes(reg, env);
  return { app, routes: reg.routes };
}

