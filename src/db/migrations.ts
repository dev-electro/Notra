import { DEFAULT_LEDGER_ID, DEFAULT_LEDGER_NAME } from '../core/ledgers';
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
    lekhak_name TEXT, -- unused since Stage 3 (no lekhak role); kept to avoid a destructive migration
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
  // v2: query performance. `active_entries` = entries not superseded by a correction (same rule as core activeEntries).
  `
  CREATE INDEX idx_entries_corrects ON entries(corrects_entry_id);
  CREATE INDEX idx_entries_other_dir ON entries(other_household_id, direction, created_at);
  CREATE INDEX idx_households_village ON households(village);
  CREATE VIEW active_entries AS
    SELECT e.rowid AS rid, e.* FROM entries e
    WHERE NOT EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id);
  `,
  // v3: void entries. A void is a NEW entry (corrects_entry_id = target, zero amounts, is_void = 1): the target
  // becomes superseded and the void itself counts as nothing, so undo stays append-only.
  `
  ALTER TABLE entries ADD COLUMN is_void INTEGER NOT NULL DEFAULT 0 CHECK (is_void IN (0,1));
  CREATE TRIGGER entries_void_valid BEFORE INSERT ON entries
  WHEN NEW.is_void = 1 AND (NEW.corrects_entry_id IS NULL OR NEW.cash_paise <> 0 OR NEW.in_kind_value_paise <> 0)
  BEGIN SELECT RAISE(ABORT, 'a void must point at an entry and carry zero amounts'); END;
  DROP VIEW active_entries;
  CREATE VIEW active_entries AS
    SELECT e.rowid AS rid, e.* FROM entries e
    WHERE e.is_void = 0 AND NOT EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id);
  `,
  // v4: cloud sync bookkeeping. dirty = 1 means "not yet pushed". Existing rows default to dirty so the first
  // sync uploads them. Entries stay immutable except for the dirty flag. Entries have no updated_at (immutable).
  `
  ALTER TABLE households ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE events ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE entries ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX idx_households_dirty ON households(dirty) WHERE dirty = 1;
  CREATE INDEX idx_events_dirty ON events(dirty) WHERE dirty = 1;
  CREATE INDEX idx_entries_dirty ON entries(dirty) WHERE dirty = 1;
  DROP TRIGGER entries_no_update;
  CREATE TRIGGER entries_no_update BEFORE UPDATE ON entries
  WHEN OLD.id IS NOT NEW.id OR OLD.event_id IS NOT NEW.event_id OR OLD.other_household_id IS NOT NEW.other_household_id
    OR OLD.direction IS NOT NEW.direction OR OLD.cash_paise IS NOT NEW.cash_paise OR OLD.in_kind_item IS NOT NEW.in_kind_item
    OR OLD.in_kind_value_paise IS NOT NEW.in_kind_value_paise OR OLD.payment_mode IS NOT NEW.payment_mode
    OR OLD.recorded_by IS NOT NEW.recorded_by OR OLD.voice_note_uri IS NOT NEW.voice_note_uri
    OR OLD.created_at IS NOT NEW.created_at OR OLD.corrects_entry_id IS NOT NEW.corrects_entry_id OR OLD.is_void IS NOT NEW.is_void
  BEGIN SELECT RAISE(ABORT, 'entries are immutable; insert a correcting entry instead'); END;

  CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cursor INTEGER NOT NULL DEFAULT 0,
    user_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 0,
    last_sync_at TEXT
  );
  INSERT INTO sync_state (id) VALUES (1);
  `,
  // v5: poison-row handling + profile sync. `sync_error` is set when the server rejected a row (bad data): the row stops
  // being retried (dirty stays 1 so it is still known) until it is edited or the person taps "retry".
  // sync_state.profile_dirty = 1 means "my household / village custom changed, not yet pushed".
  `
  ALTER TABLE households ADD COLUMN sync_error TEXT;
  ALTER TABLE events ADD COLUMN sync_error TEXT;
  ALTER TABLE entries ADD COLUMN sync_error TEXT;
  ALTER TABLE sync_state ADD COLUMN profile_dirty INTEGER NOT NULL DEFAULT 0;
  `,
  // v6: ledgers. The household ledger (fixed id, same on every phone) is the default; a family member may add personal
  // ledgers. pin_salt/pin_hash are local only and never synced. Existing entries/events default to the household ledger.
  // The active_entries view is rebuilt so `e.*` picks up the new columns, and the immutability trigger now covers ledger_id.
  `
  CREATE TABLE ledgers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('HOUSEHOLD','PERSONAL')),
    pin_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    sync_error TEXT
  );
  CREATE INDEX idx_ledgers_dirty ON ledgers(dirty) WHERE dirty = 1;
  INSERT INTO ledgers (id, name, kind, created_at, updated_at, dirty)
    VALUES ('${DEFAULT_LEDGER_ID}', '${DEFAULT_LEDGER_NAME}', 'HOUSEHOLD', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z', 0);

  DROP VIEW active_entries;
  ALTER TABLE entries ADD COLUMN ledger_id TEXT NOT NULL DEFAULT '${DEFAULT_LEDGER_ID}';
  ALTER TABLE events ADD COLUMN ledger_id TEXT NOT NULL DEFAULT '${DEFAULT_LEDGER_ID}';
  CREATE INDEX idx_entries_ledger ON entries(ledger_id, created_at);
  CREATE INDEX idx_events_ledger ON events(ledger_id, date);
  DROP TRIGGER entries_no_update;
  CREATE TRIGGER entries_no_update BEFORE UPDATE ON entries
  WHEN OLD.id IS NOT NEW.id OR OLD.event_id IS NOT NEW.event_id OR OLD.other_household_id IS NOT NEW.other_household_id
    OR OLD.direction IS NOT NEW.direction OR OLD.cash_paise IS NOT NEW.cash_paise OR OLD.in_kind_item IS NOT NEW.in_kind_item
    OR OLD.in_kind_value_paise IS NOT NEW.in_kind_value_paise OR OLD.payment_mode IS NOT NEW.payment_mode
    OR OLD.recorded_by IS NOT NEW.recorded_by OR OLD.voice_note_uri IS NOT NEW.voice_note_uri
    OR OLD.created_at IS NOT NEW.created_at OR OLD.corrects_entry_id IS NOT NEW.corrects_entry_id OR OLD.is_void IS NOT NEW.is_void
    OR OLD.ledger_id IS NOT NEW.ledger_id
  BEGIN SELECT RAISE(ABORT, 'entries are immutable; insert a correcting entry instead'); END;
  CREATE VIEW active_entries AS
    SELECT e.rowid AS rid, e.* FROM entries e
    WHERE e.is_void = 0 AND NOT EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id);
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
