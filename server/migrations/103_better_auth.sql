-- Better Auth (self-hosted, inside the Worker) replaces the hand-written Google / OTP / JWT / refresh-token code.
-- See docs/AUTH.md for the design. Summary:
--   * Better Auth's `user` model IS our `users` table (same uuid ids), so every foreign key, RLS policy and SECURITY DEFINER
--     function that already points at users(id) keeps working. Its extra tables are prefixed `auth_`.
--   * Better Auth runs BEFORE a user id is known (sign-in, OTP verification), so its queries cannot use `app.user_id`. Every statement it
--     issues runs in a transaction that sets `app.auth = '1'` (server/src/auth/dialect.ts); the policies below admit that and nothing
--     else. Sync / admin / support code never sets it, so it cannot read the auth tables.
--   * Old tokens are not migrated: refresh_tokens is dropped, so every person is signed out once and signs in again (their data is
--     untouched; existing Google and phone identities are carried over below so they land on the SAME user id).

-- ---- the users table as Better Auth's `user` model ----
ALTER TABLE users
  ADD COLUMN email_verified boolean     NOT NULL DEFAULT false,
  ADD COLUMN image          text,
  ADD COLUMN updated_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN phone_verified boolean     NOT NULL DEFAULT false;
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- Better Auth creates the user row first and the Google account row after it, so the "at least one identity" check cannot hold.
ALTER TABLE users DROP CONSTRAINT users_check;
UPDATE users SET phone_verified = true WHERE phone_e164 IS NOT NULL;
UPDATE users SET email_verified = true WHERE email IS NOT NULL AND google_sub IS NOT NULL;

-- Phone-only people have no e-mail, but Better Auth requires one per user: a reserved, undeliverable placeholder (`.invalid`, RFC 2606).
-- Staff views treat it as "no e-mail" through real_email().
CREATE FUNCTION real_email(p_email text) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$ SELECT CASE WHEN p_email IS NULL OR p_email LIKE '%@phone.notra.invalid' THEN NULL ELSE p_email END $$;

CREATE FUNCTION users_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.signup_method := CASE WHEN NEW.phone_e164 IS NOT NULL THEN 'phone' ELSE 'google' END;
    IF NEW.email IS NULL AND NEW.phone_e164 IS NOT NULL THEN
      NEW.email := 'p' || substr(NEW.phone_e164, 2) || '@phone.notra.invalid';
    END IF;
  END IF;
  NEW.display_name := nullif(NEW.display_name, '');
  RETURN NEW;
END $$;
CREATE TRIGGER users_before_write BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION users_before_write();
-- existing phone-only rows get the placeholder through the same rule (fires the trigger; display_name '' -> NULL is harmless)
UPDATE users SET email = 'p' || substr(phone_e164, 2) || '@phone.notra.invalid' WHERE email IS NULL AND phone_e164 IS NOT NULL;

-- ---- Better Auth tables ----
CREATE TABLE auth_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

-- One row per linked sign-in method. Google: provider_id 'google', account_id = the Google `sub`. Tokens are never stored (see hooks).
CREATE TABLE auth_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id               text        NOT NULL,
  provider_id              text        NOT NULL,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  password                 text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX auth_accounts_user_idx ON auth_accounts (user_id);

-- Phone OTPs in flight: identifier = E.164 number, value = '<code>:<failed attempts>'. Short lived (5 min), consumed on use.
CREATE TABLE auth_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text        NOT NULL,
  value       text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verifications_identifier_idx ON auth_verifications (identifier, created_at DESC);

-- Better Auth's request rate limiter (Workers are stateless, so the counters live in the database).
CREATE TABLE auth_rate_limits (
  id            uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text   NOT NULL UNIQUE,
  count         integer NOT NULL,
  last_request  bigint NOT NULL
);

-- ---- carry the existing identities over: the same user ids, no duplicates ----
INSERT INTO auth_accounts (user_id, account_id, provider_id) SELECT id, google_sub, 'google' FROM users WHERE google_sub IS NOT NULL;

-- ---- "app.auth": the auth library's own context (no user known yet) ----
CREATE FUNCTION app_auth() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.auth', true), '') = '1' $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['auth_sessions', 'auth_accounts', 'auth_verifications', 'auth_rate_limits']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY system_all ON %I FOR ALL TO notra_system USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY auth_ctx ON %I FOR ALL TO notra_app USING (app_auth()) WITH CHECK (app_auth())', t);
  END LOOP;
  -- a person's own sessions / linked accounts (account deletion, "sign out everywhere")
  FOREACH t IN ARRAY ARRAY['auth_sessions', 'auth_accounts']
  LOOP
    EXECUTE format('CREATE POLICY own_all ON %I FOR ALL TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions, auth_accounts, auth_verifications, auth_rate_limits TO notra_app, notra_system;

-- users: in the auth context Better Auth may find, create and update identity columns. It can never touch status / suspension / role.
-- (google_sub is maintained by the trigger below, never written by the application.)
REVOKE UPDATE (google_sub) ON users FROM notra_app;
GRANT INSERT (id, display_name, email, email_verified, image, phone_e164, phone_verified, created_at, updated_at) ON users TO notra_app;
GRANT UPDATE (email_verified, image, phone_verified, updated_at) ON users TO notra_app;
CREATE POLICY auth_ctx_select ON users FOR SELECT TO notra_app USING (app_auth());
CREATE POLICY auth_ctx_insert ON users FOR INSERT TO notra_app WITH CHECK (app_auth());
CREATE POLICY auth_ctx_update ON users FOR UPDATE TO notra_app USING (app_auth()) WITH CHECK (app_auth());

-- Keep users.google_sub (read by the admin panel and the app's "has Google") in step with the Google account row.
CREATE FUNCTION auth_sync_google_sub() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.provider_id = 'google' THEN UPDATE users SET google_sub = NULL WHERE id = OLD.user_id AND google_sub = OLD.account_id; END IF;
    RETURN OLD;
  END IF;
  IF NEW.provider_id = 'google' THEN UPDATE users SET google_sub = NEW.account_id WHERE id = NEW.user_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_accounts_google_sub AFTER INSERT OR DELETE ON auth_accounts FOR EACH ROW EXECUTE FUNCTION auth_sync_google_sub();

-- ---- retire the hand-written auth ----
DROP FUNCTION auth_find_or_create_user(text, text, text, text);
DROP FUNCTION auth_identity_owner(text, text);
DROP FUNCTION auth_refresh_lookup(text);
DROP FUNCTION auth_revoke_family(text);
DROP FUNCTION admin_force_signout(uuid);
DROP FUNCTION admin_delete_user(uuid);
DROP TABLE refresh_tokens;
DROP TABLE otp_requests;

CREATE FUNCTION admin_force_signout(p_user uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  PERFORM app_require_role('support');
  DELETE FROM auth_sessions WHERE user_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION admin_active_sessions(p_user uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN (SELECT count(*) FROM auth_sessions WHERE user_id = p_user AND expires_at > now())::integer;
END $$;

-- Delete an account on request (same steps as server/src/account.ts, in one transaction). Sessions and linked accounts go with the user (cascade).
CREATE FUNCTION admin_delete_user(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ph text;
BEGIN
  PERFORM app_require_role('admin');
  PERFORM pg_advisory_xact_lock(hashtext('sync:' || p_user::text));
  SELECT phone_e164 INTO ph FROM users WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002'; END IF;
  DELETE FROM entries WHERE user_id = p_user;
  DELETE FROM events WHERE user_id = p_user;
  DELETE FROM households WHERE user_id = p_user;
  DELETE FROM ledgers WHERE user_id = p_user;
  DELETE FROM profiles WHERE user_id = p_user;
  DELETE FROM auth_sessions WHERE user_id = p_user;
  DELETE FROM auth_accounts WHERE user_id = p_user;
  IF ph IS NOT NULL THEN
    DELETE FROM auth_verifications WHERE identifier = ph;
    DELETE FROM otp_events WHERE phone_e164 = ph;
  END IF;
  DELETE FROM users WHERE id = p_user;
  INSERT INTO account_deletions (source) VALUES ('admin');
END $$;

-- Staff list: the placeholder e-mail is not an e-mail.
DROP FUNCTION staff_list();
CREATE FUNCTION staff_list() RETURNS TABLE (user_id uuid, role text, phone_e164 text, email text, display_name text, created_at timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('owner');
  RETURN QUERY SELECT p.user_id, p.role::text, u.phone_e164, real_email(u.email), u.display_name, u.created_at, u.status
    FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.role <> 'user' ORDER BY u.created_at;
END $$;

-- Ownership + execute grants for every SECURITY DEFINER function created by this migration (same rule as 101).
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prosecdef AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO notra_system', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO notra_app', f.sig);
  END LOOP;
END $$;
