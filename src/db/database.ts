import * as SQLite from 'expo-sqlite';
import { getOrCreateDbKey } from './key';
import { migrate } from './migrations';
import type { Db } from './types';

const DB_NAME = 'notra-diary.db';
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open (once) the encrypted database and run migrations.
 * With `useSQLCipher: true` in app.json, `PRAGMA key` must be the first statement.
 * (Expo Go ships plain SQLite, where the pragma is a harmless no-op: use a dev build to test encryption.)
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    const key = await getOrCreateDbKey();
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await migrate(db as unknown as Db);
    return db;
  })().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}
