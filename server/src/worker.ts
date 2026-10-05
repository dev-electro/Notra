import postgres from 'postgres';
import { createApp } from './app';
import { googleKeys } from './auth/google';
import { loadConfig, smsFromEnv, type Env } from './config';
import { fromPostgres } from './db';

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
    if (!url) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
    // One short-lived connection per request. prepare:false keeps it compatible with poolers (PgBouncer, Hyperdrive,
    // Supabase pooler); fetch_types:false saves a round trip.
    const sql = postgres(url, { max: 1, prepare: false, fetch_types: false, connect_timeout: 10, idle_timeout: 5 });
    try {
      const app = createApp({ db: fromPostgres(sql), config: loadConfig(env), sms: smsFromEnv(env), googleKeys: googleKeys() });
      return await app.fetch(req, env, ctx as unknown as Parameters<typeof app.fetch>[2]);
    } catch (e) {
      console.error('startup', e instanceof Error ? e.message : e);
      return Response.json({ error: 'server_misconfigured' }, { status: 500 });
    } finally {
      ctx.waitUntil(sql.end({ timeout: 5 }));
    }
  },
};
