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
