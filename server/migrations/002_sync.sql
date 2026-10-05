-- Synced data mirrors the phone's schema (photos and voice notes are not synced yet).
-- Every row belongs to one user (user_id); every query filters by it. Primary keys include user_id so a
-- user can never collide with, overwrite, or even probe another user's ids.
-- server_seq comes from one global sequence and is re-assigned on every insert/update; clients pull
-- "everything with server_seq > cursor". Ids are UUIDs minted on the phone.
CREATE SEQUENCE sync_seq;

CREATE TABLE households (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id           uuid NOT NULL,
  head_name    text NOT NULL,
  father_name  text NOT NULL,
  jati         text NOT NULL,
  atak         text NOT NULL,
  village      text NOT NULL,
  fala         text NOT NULL,
  phone        text,
  created_at   text NOT NULL,
  updated_at   text NOT NULL,           -- ISO-8601 UTC with milliseconds; compared as text for last-write-wins
  server_seq   bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX households_seq_idx ON households (user_id, server_seq);

CREATE TABLE events (
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 uuid NOT NULL,
  host_household_id  uuid NOT NULL,
  occasion           text NOT NULL CHECK (occasion IN ('SHAADI','BIMARI','MAKAAN','OTHER')),
  date               text NOT NULL,
  panch_approved     boolean NOT NULL,
  invitation_type    text NOT NULL CHECK (invitation_type IN ('YELLOW_RICE','KUMKUM','CARD')),
  status             text NOT NULL CHECK (status IN ('PLANNED','HELD','SETTLED')),
  created_at         text NOT NULL,
  updated_at         text NOT NULL,
  server_seq         bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX events_seq_idx ON events (user_id, server_seq);

-- Entries are append-only/immutable: no UPDATE path exists, inserts use ON CONFLICT DO NOTHING.
-- A correction points at its target via corrects_entry_id; a void is a correction with is_void = true.
CREATE TABLE entries (
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                   uuid NOT NULL,
  event_id             uuid,
  other_household_id   uuid NOT NULL,
  direction            text NOT NULL CHECK (direction IN ('AAYA','GAYA')),
  cash_paise           bigint NOT NULL CHECK (cash_paise >= 0),
  in_kind_item         text,
  in_kind_value_paise  bigint NOT NULL DEFAULT 0 CHECK (in_kind_value_paise >= 0),
  payment_mode         text NOT NULL CHECK (payment_mode IN ('CASH','UPI')),
  recorded_by          text NOT NULL,
  created_at           text NOT NULL,
  corrects_entry_id    uuid,
  is_void              boolean NOT NULL DEFAULT false,
  server_seq           bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX entries_seq_idx ON entries (user_id, server_seq);
