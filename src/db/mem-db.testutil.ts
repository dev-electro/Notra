import type { Entry } from '../core';
import { addEntry, createEvent } from './repository';
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


const autoEvents = new WeakMap<Db, Map<string, string>>();
/**
 * Test helper: addEntry for tests that do not care about the program. Every entry needs an event, so one is made (once per db and
 * household, hosted by that household) when `eventId` is not given. With "my household" unset the direction is not checked.
 */
export async function addE(
  db: Db, input: Omit<Entry, 'id' | 'createdAt' | 'occurredOn'> & { id?: string; createdAt?: string; occurredOn?: string },
): Promise<Entry> {
  if (input.eventId) return addEntry(db, input);
  const per = autoEvents.get(db) ?? new Map<string, string>();
  autoEvents.set(db, per);
  const key = `${input.ledgerId ?? ''}|${input.otherHouseholdId}`;
  let id = per.get(key);
  if (!id) {
    id = (await createEvent(db, {
      hostHouseholdId: input.otherHouseholdId, occasion: 'OTHER', date: '2026-01-01', panchApproved: false,
      invitationType: 'CARD', status: 'HELD', ledgerId: input.ledgerId,
    })).id;
    per.set(key, id);
  }
  return addEntry(db, { ...input, eventId: id });
}
