import type { Sql } from 'postgres';

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  /** Run `fn` in one transaction (rolled back if it throws). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

/** Adapt a `postgres` (porsager) client. Plain SQL with $n params, so any Postgres (Neon, Supabase, Hyperdrive) works. */
export function fromPostgres(sql: Sql): Db {
  type Params = Parameters<Sql['unsafe']>[1];
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      [...(await sql.unsafe<never[]>(text, params as Params))] as T[],
    tx: (fn) =>
      sql.begin(async (t) =>
        fn({ query: async <T>(text: string, params: unknown[] = []) => [...(await t.unsafe<never[]>(text, params as Params))] as T[] }),
      ) as Promise<never>,
  };
}

/** Nil uuid used as app.user_id for system work (cron) that acts on no particular user. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Run `fn` in ONE transaction with the Row Level Security context set: policies read app.user_id / app.role
 * (set_config(..., true) = local to this transaction, so nothing leaks to the next request on a pooled connection).
 * Every query on a user-data table must go through this (or a SECURITY DEFINER function): outside it the context is empty
 * and RLS returns no rows. `role` must come from the database (auth_state), never from the request.
 */
export function withUserTx<T>(db: Db, userId: string, role: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return db.tx(async (q) => {
    await q.query(`SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`, [userId, role]);
    return fn(q);
  });
}

/** Change the acting user inside an open transaction (refresh-token rotation learns the user after the token lookup). */
export async function setUserContext(q: Queryable, userId: string, role = 'user'): Promise<void> {
  await q.query(`SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`, [userId, role]);
}
