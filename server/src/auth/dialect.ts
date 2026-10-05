import {
  PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler,
  type CompiledQuery, type DatabaseConnection, type Dialect, type Driver, type Kysely, type QueryResult,
} from 'kysely';
import type { Db, Row } from '../db';

/**
 * Kysely dialect over the Worker's own `Db` (so Better Auth uses the same `postgres` / pglite connection as everything else; no `pg`,
 * no second pool). Two things make it fit this app's Row Level Security:
 *
 *  1. EVERY statement runs in its own transaction that starts with set_config('app.auth', '1', true). Better Auth works before any user
 *     id is known, so its tables (and the identity columns of `users`) are opened to exactly this context by policies in
 *     migration 103; the setting is transaction-local, so it never leaks to the next request on a pooled connection.
 *  2. UPDATE / DELETE without RETURNING are wrapped to report an affected-row count (Better Auth's updateMany / deleteMany read it).
 *
 * Transactions are not offered (Better Auth is configured with transaction: false): its hooks call back into the app's own `Db`,
 * which on a single connection must not happen while another transaction holds it.
 */
export const AUTH_CONTEXT_SQL = `SELECT set_config('app.auth', '1', true)`;

const WRITE = /^\s*(insert|update|delete)\b/i;
const RETURNING = /\sreturning\s/i;

class AuthConnection implements DatabaseConnection {
  constructor(private readonly db: Db) {}

  async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
    const params = [...q.parameters];
    const counted = WRITE.test(q.sql) && !RETURNING.test(q.sql);
    const text = counted ? `WITH w AS (${q.sql} RETURNING 1) SELECT count(*)::int AS n FROM w` : q.sql;
    const rows = await this.db.tx(async (t) => {
      await t.query(AUTH_CONTEXT_SQL);
      return t.query<Row>(text, params);
    });
    if (counted) return { rows: [], numAffectedRows: BigInt(Number(rows[0]?.n ?? 0)) };
    return { rows: rows as R[] };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery(): AsyncIterableIterator<never> {
    throw new Error('streaming is not supported');
  }
}

class AuthDriver implements Driver {
  constructor(private readonly db: Db) {}
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new AuthConnection(this.db);
  }
  async beginTransaction(): Promise<void> {
    throw new Error('Better Auth transactions are disabled in this app (transaction: false)');
  }
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

export function dbDialect(db: Db): Dialect {
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new AuthDriver(db),
    createIntrospector: (k: Kysely<unknown>) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
}
