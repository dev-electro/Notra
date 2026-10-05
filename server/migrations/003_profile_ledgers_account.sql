-- Stage 5. Ledgers (household + per-family-member personal ledgers), the synced profile ("my household" + village
-- increment), and ledger_id on events/entries. PINs are local to the phone and are never stored here.
-- The default household ledger has the same fixed id on every phone; rows written before this migration belong to it.
ALTER TABLE events  ADD COLUMN ledger_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE entries ADD COLUMN ledger_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

CREATE TABLE ledgers (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('HOUSEHOLD','PERSONAL')),
  created_at  text NOT NULL,
  updated_at  text NOT NULL,            -- ISO-8601 UTC with milliseconds; compared as text for last-write-wins
  server_seq  bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX ledgers_seq_idx ON ledgers (user_id, server_seq);

-- One row per user: which household is "me" on the phone, and the village's return increment ({"type":"FIXED","rupees":51}
-- or {"type":"PERCENT","pct":10}). A restored phone reads this and skips first-run setup. Last write wins.
CREATE TABLE profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  my_household_id  uuid,
  increment        jsonb,
  updated_at       text NOT NULL,
  server_seq       bigint NOT NULL
);
