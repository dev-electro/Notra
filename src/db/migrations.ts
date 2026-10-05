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
  // v7: Stage 7. (1) two new occasions and a custom name + details for "अन्य" (occasion_label, occasion_note): SQLite cannot alter a CHECK, so `events` is rebuilt (copied column by column).
  // (2) entries.occurred_on: the real (diary) date; existing rows get the date part of created_at. (3) Every entry belongs to an
  // event and its direction follows the event's host: entries without an event (old data) are attached to an automatic
  // "पुराना हिसाब" event (mine for AAYA, one per household for GAYA; ids are deterministic, see core/eventRules.ts). This is a
  // one-time structural fix, so the immutability trigger is dropped first and re-created (now with occurred_on) afterwards.
  // (4) triggers that enforce the event + direction rule; (5) search indexes; (6) entry_settlement: उतार/चढ़ाव per active entry.
  `
  CREATE TABLE events_new (
    id TEXT PRIMARY KEY NOT NULL,
    host_household_id TEXT NOT NULL REFERENCES households(id),
    occasion TEXT NOT NULL CHECK (occasion IN ('SHAADI','GRIHAPRAVESH','MUNDAN','BIMARI','MAKAAN','OTHER')),
    date TEXT NOT NULL,
    panch_approved INTEGER NOT NULL DEFAULT 0,
    invitation_type TEXT NOT NULL CHECK (invitation_type IN ('YELLOW_RICE','KUMKUM','CARD')),
    lekhak_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('PLANNED','HELD','SETTLED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 1,
    sync_error TEXT,
    ledger_id TEXT NOT NULL DEFAULT '${DEFAULT_LEDGER_ID}',
    occasion_label TEXT,
    occasion_note TEXT
  );
  INSERT INTO events_new (id, host_household_id, occasion, date, panch_approved, invitation_type, lekhak_name, status,
                          created_at, updated_at, dirty, sync_error, ledger_id)
    SELECT id, host_household_id, occasion, date, panch_approved, invitation_type, lekhak_name, status,
           created_at, updated_at, dirty, sync_error, ledger_id FROM events;
  DROP TABLE events;
  ALTER TABLE events_new RENAME TO events;
  CREATE INDEX idx_events_date ON events(date);
  CREATE INDEX idx_events_dirty ON events(dirty) WHERE dirty = 1;
  CREATE INDEX idx_events_ledger ON events(ledger_id, date);
  CREATE INDEX idx_events_host ON events(host_household_id, date);

  DROP VIEW active_entries;
  DROP TRIGGER entries_no_update;
  ALTER TABLE entries ADD COLUMN occurred_on TEXT NOT NULL DEFAULT '';
  UPDATE entries SET occurred_on = substr(created_at, 1, 10);

  INSERT OR IGNORE INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at, dirty, ledger_id)
    SELECT 'a1a1a1a1-' || substr(e.ledger_id, 10),
           COALESCE((SELECT value FROM settings WHERE key = 'my_household_id'), MIN(e.other_household_id)),
           'OTHER', MIN(e.occurred_on), 0, 'CARD', 'SETTLED',
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1, e.ledger_id
    FROM entries e WHERE e.event_id IS NULL AND e.direction = 'AAYA' GROUP BY e.ledger_id;
  UPDATE entries SET event_id = 'a1a1a1a1-' || substr(ledger_id, 10) WHERE event_id IS NULL AND direction = 'AAYA';
  INSERT OR IGNORE INTO events (id, host_household_id, occasion, date, panch_approved, invitation_type, status, created_at, updated_at, dirty, ledger_id)
    SELECT 'b2b2b2b2-' || substr(e.other_household_id, 10, 4) || '-' || substr(e.other_household_id, 15, 4) || '-' ||
           substr(e.other_household_id, 20, 4) || '-' || substr(e.ledger_id, 25, 12),
           e.other_household_id, 'OTHER', MIN(e.occurred_on), 0, 'CARD', 'SETTLED',
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1, e.ledger_id
    FROM entries e WHERE e.event_id IS NULL AND e.direction = 'GAYA' GROUP BY e.ledger_id, e.other_household_id;
  UPDATE entries SET event_id = 'b2b2b2b2-' || substr(other_household_id, 10, 4) || '-' || substr(other_household_id, 15, 4) || '-' ||
           substr(other_household_id, 20, 4) || '-' || substr(ledger_id, 25, 12)
    WHERE event_id IS NULL AND direction = 'GAYA';

  CREATE TRIGGER entries_no_update BEFORE UPDATE ON entries
  WHEN OLD.id IS NOT NEW.id OR OLD.event_id IS NOT NEW.event_id OR OLD.other_household_id IS NOT NEW.other_household_id
    OR OLD.direction IS NOT NEW.direction OR OLD.cash_paise IS NOT NEW.cash_paise OR OLD.in_kind_item IS NOT NEW.in_kind_item
    OR OLD.in_kind_value_paise IS NOT NEW.in_kind_value_paise OR OLD.payment_mode IS NOT NEW.payment_mode
    OR OLD.recorded_by IS NOT NEW.recorded_by OR OLD.voice_note_uri IS NOT NEW.voice_note_uri
    OR OLD.created_at IS NOT NEW.created_at OR OLD.corrects_entry_id IS NOT NEW.corrects_entry_id OR OLD.is_void IS NOT NEW.is_void
    OR OLD.ledger_id IS NOT NEW.ledger_id OR OLD.occurred_on IS NOT NEW.occurred_on
  BEGIN SELECT RAISE(ABORT, 'entries are immutable; insert a correcting entry instead'); END;
  CREATE TRIGGER entries_occurred_valid BEFORE INSERT ON entries
  WHEN NEW.occurred_on NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  BEGIN SELECT RAISE(ABORT, 'occurred_on must be a date (YYYY-MM-DD)'); END;
  CREATE TRIGGER entries_need_event BEFORE INSERT ON entries WHEN NEW.event_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'every entry belongs to an event'); END;
  -- Direction follows the host: my event = AAYA (received), another family's event = GAYA (given). Skipped while my household
  -- is not known, for voids, for corrections that keep the target's event + direction, and while a sync/backup page is applied.
  CREATE TRIGGER entries_direction_rule BEFORE INSERT ON entries
  WHEN NEW.is_void = 0 AND NEW.event_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'sync_applying')
    AND (SELECT value FROM settings WHERE key = 'my_household_id') IS NOT NULL
    AND NEW.direction <> CASE WHEN (SELECT host_household_id FROM events WHERE id = NEW.event_id) = (SELECT value FROM settings WHERE key = 'my_household_id') THEN 'AAYA' ELSE 'GAYA' END
    AND NOT EXISTS (SELECT 1 FROM entries t WHERE t.id = NEW.corrects_entry_id AND t.event_id IS NEW.event_id AND t.direction = NEW.direction)
  BEGIN SELECT RAISE(ABORT, 'direction must follow the event host: my event = received, another family event = given'); END;

  CREATE VIEW active_entries AS
    SELECT e.rowid AS rid, e.* FROM entries e
    WHERE e.is_void = 0 AND NOT EXISTS (SELECT 1 FROM entries c WHERE c.corrects_entry_id = e.id);
  CREATE INDEX idx_entries_ledger_occ ON entries(ledger_id, occurred_on, created_at);
  CREATE INDEX idx_entries_other_occ ON entries(other_household_id, occurred_on, created_at);
  CREATE INDEX idx_entries_event_h ON entries(event_id, other_household_id);
  CREATE INDEX idx_households_father ON households(father_name);
  CREATE INDEX idx_households_fala ON households(fala);
  CREATE INDEX idx_households_phone ON households(phone);

  -- उतार / चढ़ाव for every active entry: net_before = received - given with the same household before this entry (diary order).
  -- GAYA repays what I owed (net_before > 0); AAYA repays what they owed me (net_before < 0); the rest is चढ़ाव.
  CREATE VIEW entry_settlement AS
    SELECT s.*,
      CASE WHEN s.direction = 'GAYA' THEN MIN(s.val, MAX(s.net_before, 0)) ELSE MIN(s.val, MAX(-s.net_before, 0)) END AS utar,
      s.val - CASE WHEN s.direction = 'GAYA' THEN MIN(s.val, MAX(s.net_before, 0)) ELSE MIN(s.val, MAX(-s.net_before, 0)) END AS chadhav
    FROM (
      SELECT a.rid, a.id, a.event_id, a.other_household_id, a.direction, a.cash_paise, a.in_kind_item, a.in_kind_value_paise,
             a.created_at, a.occurred_on, a.ledger_id, a.cash_paise + a.in_kind_value_paise AS val,
             COALESCE(SUM(CASE WHEN a.direction = 'AAYA' THEN a.cash_paise + a.in_kind_value_paise ELSE -(a.cash_paise + a.in_kind_value_paise) END)
               OVER (PARTITION BY a.ledger_id, a.other_household_id ORDER BY a.occurred_on, a.created_at, a.rid
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS net_before
      FROM active_entries a
    ) s;
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
    // Rebuilding a table (v7) needs foreign keys OFF, and that pragma is ignored inside a transaction: switch it here.
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(MIGRATIONS[version]);
        await db.execAsync(`PRAGMA user_version = ${next};`);
      });
    } finally {
      await db.execAsync('PRAGMA foreign_keys = ON;');
    }
    version = next;
  }
  return version;
}
