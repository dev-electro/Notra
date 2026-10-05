-- Stage 8: admin panel, remote config, support tickets, abuse control, monitoring, metrics.
-- Numbered 100+ so it never collides with app-side migrations (004+). Nothing here stores ledger content:
-- admin tables hold account-level metadata and aggregate counters only.

-- ---- users: account-level metadata the admin panel needs ----
ALTER TABLE users
  ADD COLUMN email            text,
  ADD COLUMN signup_method    text,
  ADD COLUMN status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  ADD COLUMN suspended_at     timestamptz,
  ADD COLUMN suspended_reason text;
UPDATE users SET signup_method = CASE WHEN google_sub IS NOT NULL THEN 'google' ELSE 'phone' END;
ALTER TABLE users ALTER COLUMN signup_method SET NOT NULL;
ALTER TABLE users ALTER COLUMN signup_method SET DEFAULT 'phone';
ALTER TABLE users ADD CONSTRAINT users_signup_method_chk CHECK (signup_method IN ('google', 'phone'));
CREATE INDEX users_created_idx ON users (created_at);
CREATE INDEX users_email_idx ON users (lower(email));

-- Cheap indexes so the daily rollups can count by creation time without scanning every row.
CREATE INDEX events_created_idx ON events (created_at);
CREATE INDEX entries_created_idx ON entries (created_at);

-- ---- what the app is running on (updated on auth and sync; headers X-App-Version / X-Platform / X-OS-Version) ----
CREATE TABLE user_devices (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     text NOT NULL DEFAULT 'unknown',
  app_version  text,
  os_version   text,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  PRIMARY KEY (user_id, platform)
);
CREATE INDEX user_devices_last_seen_idx ON user_devices (last_seen);

-- One row per user per UTC day they were active: the source for DAU/WAU/MAU and retention. Counters only.
CREATE TABLE user_activity_daily (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            date NOT NULL,
  sync_requests  integer NOT NULL DEFAULT 0,
  sync_errors    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX user_activity_day_idx ON user_activity_daily (day);

-- ---- staff roles live on profiles.role (the same row the app syncs its profile settings in). Staff sign in with the
-- app's own Google / mobile-OTP flow; there is no separate admin account table. Only SECURITY DEFINER functions can change it. ----
CREATE TYPE user_role AS ENUM ('user', 'viewer', 'support', 'admin', 'owner');
ALTER TABLE profiles
  ADD COLUMN role         user_role NOT NULL DEFAULT 'user',
  ADD COLUMN display_name text,
  ADD COLUMN created_at   timestamptz NOT NULL DEFAULT now();

-- Append-only record of every admin mutation (and every unmask). before/after hold metadata only, never ledger content.
CREATE TABLE admin_audit_log (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  admin_user_id uuid,                   -- no FK: the trail must outlive the account
  admin_label  text NOT NULL,           -- masked phone or e-mail of the staff member, as shown in the panel
  admin_role   text,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  reason       text,
  ip           text,
  before_meta  jsonb,
  after_meta   jsonb
);
CREATE INDEX admin_audit_at_idx ON admin_audit_log (at DESC);
CREATE INDEX admin_audit_admin_idx ON admin_audit_log (admin_user_id, at DESC);
CREATE INDEX admin_audit_action_idx ON admin_audit_log (action, at DESC);

CREATE TABLE user_notes (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_label text NOT NULL,
  body        text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_notes_user_idx ON user_notes (user_id, at DESC);

-- ---- remote config ----
CREATE TABLE app_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE config_history (
  id            bigserial PRIMARY KEY,
  key           text NOT NULL,
  before_value  jsonb,
  after_value   jsonb NOT NULL,
  changed_by    text NOT NULL,
  reason        text,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX config_history_key_idx ON config_history (key, at DESC);

-- ---- support / grievance tickets (DPDP: grievances are answered within 30 days) ----
CREATE TABLE support_tickets (
  id           uuid PRIMARY KEY,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  channel      text NOT NULL DEFAULT 'app' CHECK (channel IN ('app', 'email', 'phone', 'web', 'other')),
  category     text NOT NULL CHECK (category IN ('grievance', 'bug', 'feedback', 'deletion', 'other')),
  subject      text NOT NULL,
  body         text NOT NULL,
  contact      text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority     text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  due_at       timestamptz,
  resolved_at  timestamptz,
  resolution   text
);
CREATE INDEX support_tickets_status_idx ON support_tickets (status, created_at DESC);
CREATE INDEX support_tickets_user_idx ON support_tickets (user_id, created_at DESC);
CREATE TABLE ticket_notes (
  id          bigserial PRIMARY KEY,
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_label text NOT NULL,
  kind        text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'reply')),
  body        text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_notes_ticket_idx ON ticket_notes (ticket_id, at);

-- ---- abuse control ----
CREATE TABLE blocklist (
  id          uuid PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('phone', 'ip')),
  value       text NOT NULL,
  reason      text NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  UNIQUE (kind, value)
);
-- Durable OTP activity (otp_requests is purged after a day). Used for abuse aggregates and SMS cost.
CREATE TABLE otp_events (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind IN ('send', 'send_fail', 'verify_ok', 'verify_fail', 'blocked')),
  phone_e164  text,
  ip          text
);
CREATE INDEX otp_events_at_idx ON otp_events (at);
CREATE INDEX otp_events_ip_idx ON otp_events (ip, at);
CREATE INDEX otp_events_phone_idx ON otp_events (phone_e164, at);

-- ---- monitoring: one row per (error fingerprint, minute); `occurrences` counts the rest. No bodies, no user ids, no PII ----
CREATE TABLE error_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  minute_bucket timestamptz NOT NULL,
  fingerprint   text NOT NULL,
  method        text,
  path          text,
  status        integer,
  error_name    text,
  error_code    text,
  message       text,
  occurrences   integer NOT NULL DEFAULT 1,
  UNIQUE (fingerprint, minute_bucket)
);
CREATE INDEX error_log_at_idx ON error_log (at DESC);

-- ---- aggregate metrics (long format: one row per day / metric / dimension) ----
CREATE TABLE daily_stats (
  day          date NOT NULL,
  metric       text NOT NULL,
  dim          text NOT NULL DEFAULT '',
  value        bigint NOT NULL,
  users        integer,                 -- distinct users behind `value` (NULL for service metrics); < 5 is suppressed when shown
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, metric, dim)
);

-- ---- consented support access: the USER grants staff a read-only window on their own data (max 7 days) ----
CREATE TABLE support_access_grants (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id   uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  CHECK (expires_at > granted_at AND expires_at <= granted_at + interval '7 days')
);
CREATE INDEX support_access_user_idx ON support_access_grants (user_id, expires_at DESC);

-- Deletion counter (no user id): feeds the "account deletions" report.
CREATE TABLE account_deletions (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  source  text NOT NULL CHECK (source IN ('self', 'admin'))
);
CREATE INDEX account_deletions_at_idx ON account_deletions (at);
