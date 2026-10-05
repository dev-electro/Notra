import postgres from 'postgres';
import { createApp } from './app';
import { googleKeys } from './auth/google';
import { adminFromEnv, loadConfig, smsFromEnv, type Env } from './config';
import { fromPostgres } from './db';
import { runScheduled } from './rollup';

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

/** One short-lived connection per request. prepare:false keeps it compatible with poolers (PgBouncer, Hyperdrive,
 * Supabase pooler); fetch_types:false saves a round trip. DATABASE_URL must be the restricted runtime role (member of notra_app). */
const connect = (env: Env) => {
  const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  return url ? postgres(url, { max: 1, prepare: false, fetch_types: false, connect_timeout: 10, idle_timeout: 5 }) : null;
};

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const sql = connect(env);
    if (!sql) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
    try {
      const config = loadConfig(env);
      const app = createApp({
        db: fromPostgres(sql), config, sms: smsFromEnv(env), googleKeys: googleKeys(), admin: adminFromEnv(env),
      });
      return await app.fetch(req, env, ctx as unknown as Parameters<typeof app.fetch>[2]);
    } catch (e) {
      console.error('startup', e instanceof Error ? e.message : e);
      return Response.json({ error: 'server_misconfigured' }, { status: 500 });
    } finally {
      ctx.waitUntil(sql.end({ timeout: 5 }));
    }
  },

  /** Cron Trigger (see wrangler.toml): daily rollups into daily_stats. */
  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    const sql = connect(env);
    if (!sql) throw new Error('DATABASE_URL is not set');
    try {
      const r = await runScheduled(fromPostgres(sql), new Date());
      console.log('rollup done', r.days[0], '..', r.days[r.days.length - 1]);
    } finally {
      ctx.waitUntil(sql.end({ timeout: 5 }));
    }
  },
};
