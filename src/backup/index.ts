import { splitForBackup } from '../core';
import { listLedgers } from '../db/ledgers';
import type { Db } from '../db/types';
import { decryptBackup, encryptBackup, type Deps } from './crypto';
import { buildSnapshot, mergeSnapshot, parseSnapshot, type MergeReport } from './snapshot';

export * from './crypto';
export * from './snapshot';

export interface BackupSummary {
  file: string;
  /** Ledgers left out because their PIN has not been entered in this session. */
  skippedLedgers: string[];
  entryCount: number;
}

/** Build the encrypted backup text for every ledger that is open (no PIN, or PIN entered this session). */
export async function createBackup(db: Db, password: string, unlocked: ReadonlySet<string>, deps: Deps, now = new Date()): Promise<BackupSummary> {
  const { included, skipped } = splitForBackup(await listLedgers(db), unlocked);
  const snap = await buildSnapshot(db, included.map((l) => l.id), now);
  return {
    file: await encryptBackup(JSON.stringify(snap), password, deps),
    skippedLedgers: skipped.map((l) => l.name),
    entryCount: snap.entries.length,
  };
}

/** Decrypt, validate and merge a backup file. Throws BackupError for a wrong password / damaged / foreign file. */
export async function restoreBackup(db: Db, fileText: string, password: string): Promise<MergeReport> {
  return mergeSnapshot(db, parseSnapshot(await decryptBackup(fileText, password)));
}

export const backupFileName = (now = new Date()) => `notra-backup-${now.toISOString().slice(0, 10)}.notra`;
