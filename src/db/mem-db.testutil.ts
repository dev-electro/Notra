import type { Db } from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

/** In-memory Db on Node's built-in SQLite, a stand-in for expo-sqlite in tests. */
export function memDb(): Db {
  const sql = new DatabaseSync(':memory:');
  type P = (string | number | null)[];
  return {
    execAsync: async (s) => void sql.exec(s),
    runAsync: async (s, p: P) => sql.prepare(s).run(...p),
    getAllAsync: async <T,>(s: string, p: P) => sql.prepare(s).all(...p) as T[],
    getFirstAsync: async <T,>(s: string, p: P) => (sql.prepare(s).get(...p) as T | undefined) ?? null,
    withTransactionAsync: async (task) => {
      sql.exec('BEGIN');
      try { await task(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
}
