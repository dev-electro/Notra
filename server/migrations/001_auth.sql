-- Identity. Notra has no password; users sign in with Google or a mobile OTP. Nothing here is synced data.
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  google_sub    text UNIQUE,
  phone_e164    text UNIQUE,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (google_sub IS NOT NULL OR phone_e164 IS NOT NULL)
);

-- One row per OTP sent. Only the newest unconsumed row for a phone is valid. Rate limits are counted from here.
CREATE TABLE otp_requests (
  id           uuid PRIMARY KEY,
  phone_e164   text NOT NULL,
  code_hash    text NOT NULL,           -- sha256(code + phone + OTP_PEPPER), hex
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ip           text NOT NULL
);
CREATE INDEX otp_requests_phone_idx ON otp_requests (phone_e164, created_at DESC);
CREATE INDEX otp_requests_ip_idx ON otp_requests (ip, created_at DESC);

-- Refresh tokens are stored hashed, rotated on every use; reuse of a rotated token revokes the whole family.
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,    -- sha256(token), hex
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
