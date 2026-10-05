-- Stage 7. Two new occasions, a custom name + details for "अन्य" (OTHER), and the real (diary) date of an entry.
-- Entries keep event_id nullable here only because rows written by older apps have none; the sync push now requires it.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_occasion_check;
ALTER TABLE events ADD CONSTRAINT events_occasion_check
  CHECK (occasion IN ('SHAADI','GRIHAPRAVESH','MUNDAN','BIMARI','MAKAAN','OTHER'));
ALTER TABLE events ADD COLUMN occasion_label text CHECK (occasion_label IS NULL OR char_length(occasion_label) <= 60);
ALTER TABLE events ADD COLUMN occasion_note  text CHECK (occasion_note  IS NULL OR char_length(occasion_note)  <= 500);

-- occurred_on: YYYY-MM-DD. Existing rows get the date part of created_at (the same rule the phone's v7 migration uses).
ALTER TABLE entries ADD COLUMN occurred_on text;
UPDATE entries SET occurred_on = substr(created_at, 1, 10);
ALTER TABLE entries ALTER COLUMN occurred_on SET NOT NULL;
ALTER TABLE entries ADD CONSTRAINT entries_occurred_on_check CHECK (occurred_on ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
CREATE INDEX entries_occurred_idx ON entries (user_id, ledger_id, occurred_on);
