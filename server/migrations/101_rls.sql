-- Stage 8: Row Level Security.
--
-- MODEL
--   * The Worker connects as a LOGIN role that is a MEMBER of `notra_app` (see docs/ADMIN.md). Migrations run as the table owner
--     (MIGRATION_DATABASE_URL). The runtime role does not own tables and has no BYPASSRLS, so RLS cannot be skipped by it.
--   * Every request runs in one transaction that starts with
--       select set_config('app.user_id', <uuid>, true), set_config('app.role', <role>, true)
--     (server/src/db.ts withUserTx). Policies read those settings.
--   * Ledger tables (households, events, entries, ledgers) and the synced profile: a row is visible/writable ONLY when
--     user_id = app.user_id. NO policy gives staff (viewer/support/admin/owner) access to another user's ledger rows,
--     so even a valid admin token cannot read anyone's diary. The single exception is SELECT during an ACTIVE, USER-CREATED
--     support_access_grant (<= 7 days, revocable), read-only.
--   * Staff see aggregates only, through SECURITY DEFINER functions in the `analytics` schema (k-anonymity, see 102).
--   * `notra_system` (NOLOGIN) owns the SECURITY DEFINER functions and has an explicit policy on each table. It is never
--     used as a login; the runtime role cannot SET ROLE to it. Functions are the ONLY way to reach it. Keep them few.
--   * New user-data tables MUST be added here (ENABLE + FORCE RLS + policies). A test fails if a table with a user_id column lacks FORCE RLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'notra_app') THEN CREATE ROLE notra_app NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'notra_system') THEN CREATE ROLE notra_system NOLOGIN NOBYPASSRLS; END IF;
END $$;
-- The migration role must be allowed to hand function ownership to notra_system.
GRANT notra_system TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO notra_app, notra_system;
GRANT CREATE ON SCHEMA public TO notra_system;

-- ---- session settings ----
CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'user') $$;
CREATE FUNCTION app_role_rank(r text) RETURNS integer LANGUAGE sql IMMUTABLE AS
  $$ SELECT CASE r WHEN 'viewer' THEN 1 WHEN 'support' THEN 2 WHEN 'admin' THEN 3 WHEN 'owner' THEN 4 WHEN 'system' THEN 5 ELSE 0 END $$;
CREATE FUNCTION app_require_role(min_role text) RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF app_role_rank(app_role()) < app_role_rank(min_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
END $$;
-- viewer and above: account metadata and aggregates.   support and above: may act on tickets/users.
CREATE FUNCTION app_sees_meta() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app_role_rank(app_role()) >= 1 $$;
CREATE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app_role_rank(app_role()) >= 2 $$;

-- Does this user have an active (not revoked, not expired) consented support-access grant? SECURITY DEFINER so the
-- policy below can look at the grants table without recursing through that table's own RLS.
CREATE FUNCTION app_has_grant(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT EXISTS (SELECT 1 FROM support_access_grants g WHERE g.user_id = p_user AND g.revoked_at IS NULL AND g.expires_at > now()) $$;

-- ---- table privileges (RLS then narrows rows; column privileges narrow what may be written) ----
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO notra_app, notra_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO notra_app, notra_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO notra_app, notra_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO notra_app, notra_system;

DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN REVOKE ALL ON schema_migrations FROM notra_app; END IF;
END $$;

-- users: rows are created only by auth_find_or_create_user(); a user may edit identity columns of their own row, never status/suspension.
REVOKE INSERT, UPDATE ON users FROM notra_app;
GRANT UPDATE (google_sub, phone_e164, display_name, email) ON users TO notra_app;
-- profiles: `role` is writable only through staff_set_role(); the sync code writes the other columns.
REVOKE INSERT, UPDATE ON profiles FROM notra_app;
GRANT INSERT (user_id, my_household_id, increment, updated_at, server_seq, display_name) ON profiles TO notra_app;
GRANT UPDATE (my_household_id, increment, updated_at, server_seq, display_name) ON profiles TO notra_app;
-- the audit trail is append-only for the application, and aggregates are written only by rollup_day().
REVOKE UPDATE, DELETE ON admin_audit_log FROM notra_app;
REVOKE INSERT, UPDATE, DELETE ON daily_stats FROM notra_app;

-- ---- RLS on every user-data table ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'households', 'events', 'entries', 'ledgers', 'profiles', 'user_devices', 'user_activity_daily',
                           'refresh_tokens', 'support_tickets', 'ticket_notes', 'user_notes', 'support_access_grants']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY system_all ON %I FOR ALL TO notra_system USING (true) WITH CHECK (true)', t);
  END LOOP;

  -- Ledger tables: owner only. SELECT additionally during an active consented grant, for support/admin/owner.
  FOREACH t IN ARRAY ARRAY['households', 'events', 'entries', 'ledgers']
  LOOP
    EXECUTE format($p$CREATE POLICY own_select ON %I FOR SELECT TO notra_app USING (
        user_id = app_user() OR (app_role_rank(app_role()) >= 2 AND app_has_grant(user_id)))$p$, t);
    EXECUTE format('CREATE POLICY own_insert ON %I FOR INSERT TO notra_app WITH CHECK (user_id = app_user())', t);
    EXECUTE format('CREATE POLICY own_update ON %I FOR UPDATE TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user())', t);
    EXECUTE format('CREATE POLICY own_delete ON %I FOR DELETE TO notra_app USING (user_id = app_user())', t);
  END LOOP;

  -- Own rows only (all commands): synced profile settings, tokens, device/activity counters.
  FOREACH t IN ARRAY ARRAY['profiles', 'refresh_tokens']
  LOOP
    EXECUTE format('CREATE POLICY own_all ON %I FOR ALL TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['user_devices', 'user_activity_daily', 'support_access_grants']
  LOOP
    EXECUTE format('CREATE POLICY own_all ON %I FOR ALL TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user())', t);
    -- staff may SEE metadata (never change it); for grants this is how support learns that access exists.
    EXECUTE format('CREATE POLICY staff_select ON %I FOR SELECT TO notra_app USING (app_sees_meta())', t);
  END LOOP;
END $$;

-- users: own row, or account metadata for staff (masking is applied by the API). Status changes go through admin_set_user_status().
CREATE POLICY own_or_meta_select ON users FOR SELECT TO notra_app USING (id = app_user() OR app_sees_meta());
CREATE POLICY own_update ON users FOR UPDATE TO notra_app USING (id = app_user()) WITH CHECK (id = app_user());
CREATE POLICY own_delete ON users FOR DELETE TO notra_app USING (id = app_user());

-- tickets: the user sees/creates their own; staff see all; support+ may update. Notes are staff-only.
CREATE POLICY own_or_meta_select ON support_tickets FOR SELECT TO notra_app USING (user_id = app_user() OR app_sees_meta());
CREATE POLICY own_or_staff_insert ON support_tickets FOR INSERT TO notra_app WITH CHECK (user_id = app_user() OR app_is_staff());
CREATE POLICY staff_update ON support_tickets FOR UPDATE TO notra_app USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY staff_all ON ticket_notes FOR ALL TO notra_app USING (app_is_staff()) WITH CHECK (app_is_staff());
CREATE POLICY staff_all ON user_notes FOR ALL TO notra_app USING (app_is_staff()) WITH CHECK (app_is_staff());

-- =====================================================================================================================
-- SECURITY DEFINER functions. Each is owned by notra_system (end of file), pins search_path, and is minimal.
-- =====================================================================================================================

-- ---- sign-in bootstrap: these run before a user id is known ----

-- Account state for an already-verified access token: used on every authenticated request.
CREATE FUNCTION auth_state(p_user uuid) RETURNS TABLE (status text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.status, coalesce(p.role::text, 'user') FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = p_user
$$;

-- Google or phone sign-in: find the user, or create it on first sign-in (race-safe). Returns the user row.
CREATE FUNCTION auth_find_or_create_user(p_google_sub text, p_phone text, p_name text, p_email text) RETURNS SETOF users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_google_sub IS NOT NULL THEN
    INSERT INTO users (id, google_sub, display_name, email, signup_method)
      VALUES (gen_random_uuid(), p_google_sub, p_name, p_email, 'google') ON CONFLICT (google_sub) DO NOTHING;
    IF p_email IS NOT NULL THEN
      UPDATE users SET email = p_email WHERE google_sub = p_google_sub AND email IS DISTINCT FROM p_email;
    END IF;
    RETURN QUERY SELECT * FROM users WHERE google_sub = p_google_sub;
  ELSIF p_phone IS NOT NULL THEN
    INSERT INTO users (id, phone_e164, signup_method) VALUES (gen_random_uuid(), p_phone, 'phone') ON CONFLICT (phone_e164) DO NOTHING;
    RETURN QUERY SELECT * FROM users WHERE phone_e164 = p_phone;
  END IF;
END $$;

-- Linking a second sign-in method: who already owns this identity? (needs to see other users' identity rows, nothing else)
CREATE FUNCTION auth_identity_owner(p_google_sub text, p_phone text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM users WHERE (p_google_sub IS NOT NULL AND google_sub = p_google_sub) OR (p_phone IS NOT NULL AND phone_e164 = p_phone) LIMIT 1
$$;

-- Refresh-token rotation: find a token by its hash (locking it); the rest of the rotation runs as that user.
CREATE FUNCTION auth_refresh_lookup(p_hash text)
RETURNS TABLE (id uuid, user_id uuid, family_id uuid, revoked boolean, expired boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.id, t.user_id, t.family_id, t.revoked_at IS NOT NULL, t.expires_at <= now() FROM refresh_tokens t WHERE t.token_hash = p_hash FOR UPDATE
$$;
CREATE FUNCTION auth_revoke_family(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE refresh_tokens SET revoked_at = now()
  WHERE revoked_at IS NULL AND family_id IN (SELECT family_id FROM refresh_tokens WHERE token_hash = p_hash)
$$;

-- ---- staff operations (each checks app.role itself, in addition to the API's role gate) ----

-- Record counts only. No row ever leaves this function.
CREATE FUNCTION admin_user_counts(p_user uuid) RETURNS TABLE (households integer, events integer, entries integer, ledgers integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY SELECT
    (SELECT count(*) FROM households h WHERE h.user_id = p_user)::integer,
    (SELECT count(*) FROM events e WHERE e.user_id = p_user)::integer,
    (SELECT count(*) FROM entries n WHERE n.user_id = p_user)::integer,
    (SELECT count(*) FROM ledgers l WHERE l.user_id = p_user)::integer;
END $$;

CREATE FUNCTION admin_set_user_status(p_user uuid, p_status text, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prev text;
BEGIN
  PERFORM app_require_role('support');
  IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT status INTO prev FROM users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002'; END IF;
  UPDATE users SET status = p_status,
    suspended_at = CASE WHEN p_status = 'suspended' THEN now() END,
    suspended_reason = CASE WHEN p_status = 'suspended' THEN p_reason END WHERE id = p_user;
  RETURN prev;
END $$;

CREATE FUNCTION admin_force_signout(p_user uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  PERFORM app_require_role('support');
  UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = p_user AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Delete an account on request (same steps as server/src/account.ts, in one transaction).
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
  DELETE FROM refresh_tokens WHERE user_id = p_user;
  IF ph IS NOT NULL THEN
    DELETE FROM otp_requests WHERE phone_e164 = ph;
    DELETE FROM otp_events WHERE phone_e164 = ph;
  END IF;
  DELETE FROM users WHERE id = p_user;
  INSERT INTO account_deletions (source) VALUES ('admin');
END $$;

-- Staff list (owner only): every user whose role is not 'user'. Raw identifiers; the API masks them per viewer.
CREATE FUNCTION staff_list() RETURNS TABLE (user_id uuid, role text, phone_e164 text, email text, display_name text, created_at timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('owner');
  RETURN QUERY SELECT p.user_id, p.role::text, u.phone_e164, u.email, u.display_name, u.created_at, u.status
    FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.role <> 'user' ORDER BY u.created_at;
END $$;

-- Change a user's role (owner only). The last owner can never be demoted. Returns the previous role.
CREATE FUNCTION staff_set_role(p_user uuid, p_role text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prev text;
BEGIN
  PERFORM app_require_role('owner');
  IF p_role NOT IN ('user', 'viewer', 'support', 'admin', 'owner') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('staff_roles'));
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user) THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT coalesce((SELECT role::text FROM profiles WHERE user_id = p_user), 'user') INTO prev;
  IF prev = 'owner' AND p_role <> 'owner' AND (SELECT count(*) FROM profiles WHERE role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'last_owner' USING ERRCODE = 'P0001';
  END IF;
  -- profiles also carries the synced profile; a row created here has server_seq 0 so it is never pulled by the app.
  INSERT INTO profiles (user_id, updated_at, server_seq, role) VALUES (p_user, '1970-01-01T00:00:00.000Z', 0, p_role::user_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN prev;
END $$;

-- Latest applied migration name (schema_migrations is not readable by the runtime role).
CREATE FUNCTION admin_migration_version() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  PERFORM app_require_role('viewer');
  IF to_regclass('public.schema_migrations') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT max(name) FROM schema_migrations' INTO v;
  RETURN v;
END $$;

-- Own ownership of the above, and lock execute down to the runtime role.
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
