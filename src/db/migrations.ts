import type { Db } from './types';

/**
 * Ordered, append-only migrations. The schema version is stored in PRAGMA user_version.
 * Never edit a released migration; add a new one.
 *
 * Sync-readiness: UUID text primary keys, created_at/updated_at (ISO strings) on every table,
 * and entries are append-only (no UPDATE/DELETE paths in the repository).
 */
export const MIGRATIONS: readonly string[] = [
  // v1
  `
  CREATE TABLE households (
    id TEXT PRIMARY KEY NOT NULL,
    head_name TEXT NOT NULL,
    father_name TEXT NOT NULL,
    jati TEXT NOT NULL,
    atak TEXT NOT NULL,
    village TEXT NOT NULL,
    fala TEXT NOT NULL,
    phone TEXT,
    photo_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_households_name ON households(head_name);

  CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    host_household_id TEXT NOT NULL REFERENCES households(id),
    occasion TEXT NOT NULL CHECK (occasion IN ('SHAADI','BIMARI','MAKAAN','OTHER')),
    date TEXT NOT NULL,
    panch_approved INTEGER NOT NULL DEFAULT 0,
    invitation_type TEXT NOT NULL CHECK (invitation_type IN ('YELLOW_RICE','KUMKUM','CARD')),
    lekhak_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('PLANNED','HELD','SETTLED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_date ON events(date);

  CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT REFERENCES events(id),
    other_household_id TEXT NOT NULL REFERENCES households(id),
    direction TEXT NOT NULL CHECK (direction IN ('AAYA','GAYA')),
    cash_paise INTEGER NOT NULL CHECK (cash_paise >= 0),
    in_kind_item TEXT,
    in_kind_value_paise INTEGER NOT NULL DEFAULT 0 CHECK (in_kind_value_paise >= 0),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('CASH','UPI')),
    recorded_by TEXT NOT NULL,
    voice_note_uri TEXT,
    created_at TEXT NOT NULL,
    corrects_entry_id TEXT REFERENCES entries(id)
  );
  CREATE INDEX idx_entries_other ON entries(other_household_id);
  CREATE INDEX idx_entries_event ON entries(event_id);
  CREATE INDEX idx_entries_created ON entries(created_at);

  -- Entries are immutable: block UPDATE and DELETE at the database level.
  CREATE TRIGGER entries_no_update BEFORE UPDATE ON entries
  BEGIN SELECT RAISE(ABORT, 'entries are immutable; insert a correcting entry instead'); END;
  CREATE TRIGGER entries_no_delete BEFORE DELETE ON entries
  BEGIN SELECT RAISE(ABORT, 'entries are append-only'); END;

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

export const LATEST_VERSION = MIGRATIONS.length;

/** Apply pending migrations inside one transaction each. Returns the resulting version. */
export async function migrate(db: Db): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${next};`);
    });
    version = next;
  }
  return version;
}
