-- रिश्ते phase 2: community discovery (behind the `rishtey_discovery` flag, default OFF; legal review pending).
--
-- PRIVACY MODEL
--   * rishtey_profiles holds the person's OWN published profile. RLS: the owner only. Nobody else (staff included) can SELECT the table.
--   * Everything other people may see goes through SECURITY DEFINER functions that return PUBLIC columns only:
--       first name, age, gender, height, gotra, education, occupation, district, state, who published it.
--     `contact` is never returned by search / detail / queue. rishtey_contact() releases it only after an interest was ACCEPTED
--     (both sides consented) and neither side blocked the other.
--   * Age is stored as a number (+ the date it was stated), never a date of birth.
--   * A user can only ever move a profile to draft / pending / hidden (trigger rishtey_guard_status). approved / rejected are set by moderators
--     through admin_rishtey_review() (support role and above), which records who reviewed and why.
--   * Interests are capped at 10 per rolling 24 h per sender, enforced in rishtey_send_interest().
--   * A sender is never told that an interest was declined (it keeps showing as "sent").
-- New user-data tables are FORCE RLS like 101_rls.sql; notra_system (owner of the functions) gets an explicit policy on each.

CREATE TABLE rishtey_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- the only id other people ever see (never user_id)
  user_id      uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'hidden')),
  published_by text NOT NULL DEFAULT 'self' CHECK (published_by IN ('self', 'parent', 'guardian', 'sibling')),
  gender       text CHECK (gender IN ('male', 'female')),
  -- public
  first_name   text CHECK (char_length(first_name) BETWEEN 1 AND 40),
  age          smallint CHECK (age BETWEEN 18 AND 80),
  age_at       date NOT NULL DEFAULT current_date,           -- the day `age` was stated; the shown age grows from it
  height_cm    smallint CHECK (height_cm BETWEEN 100 AND 230),
  gotra        text CHECK (char_length(gotra) <= 60),
  education    text CHECK (char_length(education) <= 80),
  occupation   text CHECK (char_length(occupation) <= 80),
  district     text CHECK (char_length(district) <= 60),
  state        text CHECK (char_length(state) <= 60),
  -- private
  contact      text CHECK (char_length(contact) <= 20),
  -- consent + moderation
  consent_at   timestamptz,
  reject_reason text,
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- nothing can be submitted for review without the basics, a contact and a recorded consent
  CONSTRAINT rishtey_complete CHECK (status IN ('draft', 'hidden') OR
    (first_name IS NOT NULL AND age IS NOT NULL AND gender IS NOT NULL AND contact IS NOT NULL AND consent_at IS NOT NULL))
);
CREATE INDEX rishtey_profiles_search ON rishtey_profiles (gender, state, district) WHERE status = 'approved';
CREATE INDEX rishtey_profiles_queue ON rishtey_profiles (updated_at) WHERE status = 'pending';

CREATE TABLE rishtey_interests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (from_user, to_user),
  CHECK (from_user <> to_user)
);
CREATE INDEX rishtey_interests_to ON rishtey_interests (to_user, created_at DESC);
CREATE INDEX rishtey_interests_from ON rishtey_interests (from_user, created_at DESC);

CREATE TABLE rishtey_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,          -- the reporter
  profile_id   uuid REFERENCES rishtey_profiles(id) ON DELETE SET NULL,       -- kept for staff even if the profile is deleted
  reason       text NOT NULL CHECK (reason IN ('fake', 'inappropriate', 'spam', 'harassment', 'other')),
  note         text CHECK (char_length(note) <= 500),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  resolved_by  uuid,
  resolved_at  timestamptz,
  resolution   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rishtey_reports_once ON rishtey_reports (user_id, profile_id) WHERE status = 'open';
CREATE INDEX rishtey_reports_open ON rishtey_reports (created_at) WHERE status = 'open';

CREATE TABLE rishtey_blocks (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,       -- the blocker
  blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_user_id),
  CHECK (user_id <> blocked_user_id)
);
CREATE INDEX rishtey_blocks_blocked ON rishtey_blocks (blocked_user_id);

-- ---- privileges: column grants narrow what the runtime role may write ----
REVOKE INSERT, UPDATE ON rishtey_profiles, rishtey_interests, rishtey_reports FROM notra_app;
GRANT INSERT (user_id, status, published_by, gender, first_name, age, age_at, height_cm, gotra, education, occupation, district, state, contact, consent_at, updated_at)
  ON rishtey_profiles TO notra_app;
GRANT UPDATE (status, published_by, gender, first_name, age, age_at, height_cm, gotra, education, occupation, district, state, contact, consent_at, updated_at)
  ON rishtey_profiles TO notra_app;
GRANT UPDATE (status, responded_at) ON rishtey_interests TO notra_app;   -- the recipient answering; rows are created only by rishtey_send_interest()

-- ---- RLS ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rishtey_profiles', 'rishtey_interests', 'rishtey_reports', 'rishtey_blocks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY system_all ON %I FOR ALL TO notra_system USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Own profile only. A user can never write approved / rejected. NO staff policy: staff reach profiles only through admin_rishtey_*().
CREATE POLICY own_select ON rishtey_profiles FOR SELECT TO notra_app USING (user_id = app_user());
CREATE POLICY own_insert ON rishtey_profiles FOR INSERT TO notra_app WITH CHECK (user_id = app_user());
CREATE POLICY own_update ON rishtey_profiles FOR UPDATE TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user());

-- Moderation can't be skipped: only notra_system (the owner of the admin_rishtey_* functions) may MOVE a profile into approved / rejected, and an
-- approved profile's public details can't change while it stays approved (the API sends it back to pending). The runtime role is not a member of
-- notra_system, so no query it can run gets past this, whatever the application code does.
CREATE FUNCTION rishtey_guard_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_has_role(current_user, 'notra_system', 'USAGE') THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'rejected') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status = 'approved'
     AND (NEW.first_name, NEW.age, NEW.gender, NEW.height_cm, NEW.gotra, NEW.education, NEW.occupation, NEW.district, NEW.state, NEW.published_by)
         IS DISTINCT FROM (OLD.first_name, OLD.age, OLD.gender, OLD.height_cm, OLD.gotra, OLD.education, OLD.occupation, OLD.district, OLD.state, OLD.published_by) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rishtey_guard_status BEFORE INSERT OR UPDATE ON rishtey_profiles FOR EACH ROW EXECUTE FUNCTION rishtey_guard_status();
CREATE POLICY own_delete ON rishtey_profiles FOR DELETE TO notra_app USING (user_id = app_user());

CREATE POLICY party_select ON rishtey_interests FOR SELECT TO notra_app USING (from_user = app_user() OR to_user = app_user());
CREATE POLICY party_delete ON rishtey_interests FOR DELETE TO notra_app USING (from_user = app_user() OR to_user = app_user());
CREATE POLICY recipient_answer ON rishtey_interests FOR UPDATE TO notra_app
  USING (to_user = app_user() AND status = 'sent') WITH CHECK (to_user = app_user() AND status IN ('accepted', 'declined'));

CREATE POLICY own_select ON rishtey_reports FOR SELECT TO notra_app USING (user_id = app_user());
CREATE POLICY own_all ON rishtey_blocks FOR ALL TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user());

-- =====================================================================================================================
-- Public reads and guarded writes. All SECURITY DEFINER (owner notra_system, set at the end), search_path pinned.
-- Errors are plain messages that server/src/rishtey.ts maps to HTTP codes.
-- =====================================================================================================================

-- Shared visibility rule: may `me` see / act on this profile? (approved, owner active, nobody blocked anybody)
CREATE FUNCTION rishtey_visible(p_me uuid, p_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM rishtey_profiles rp JOIN users u ON u.id = rp.user_id
    WHERE rp.id = p_profile AND rp.status = 'approved' AND u.status = 'active' AND rp.user_id <> p_me
      AND NOT EXISTS (SELECT 1 FROM rishtey_blocks b WHERE (b.user_id = p_me AND b.blocked_user_id = rp.user_id) OR (b.user_id = rp.user_id AND b.blocked_user_id = p_me)))
$$;

-- The caller's own profile must be approved to look at or contact anyone else.
CREATE FUNCTION rishtey_require_approved() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_user() IS NULL OR NOT EXISTS (SELECT 1 FROM rishtey_profiles WHERE user_id = app_user() AND status = 'approved') THEN
    RAISE EXCEPTION 'profile_not_approved';
  END IF;
END $$;

-- Search approved profiles: PUBLIC columns only. `my_interest`: null | sent | received | accepted (a decline is never shown to the sender).
CREATE FUNCTION rishtey_search(p_gender text, p_age_min int, p_age_max int, p_district text, p_state text, p_same_gotra boolean, p_limit int, p_offset int)
RETURNS TABLE (id uuid, first_name text, age int, gender text, height_cm int, gotra text, education text, occupation text, district text, state text, published_by text, my_interest text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE me uuid := app_user(); my_gotra text;
BEGIN
  PERFORM rishtey_require_approved();
  SELECT lower(btrim(mp.gotra)) INTO my_gotra FROM rishtey_profiles mp WHERE mp.user_id = me;
  RETURN QUERY
  SELECT rp.id, rp.first_name, (rp.age + date_part('year', age(current_date, rp.age_at))::int), rp.gender, rp.height_cm::int, rp.gotra, rp.education, rp.occupation,
         rp.district, rp.state, rp.published_by,
         (SELECT CASE WHEN i.from_user = me THEN (CASE i.status WHEN 'declined' THEN 'sent' ELSE i.status END)
                      ELSE (CASE i.status WHEN 'sent' THEN 'received' ELSE i.status END) END
          FROM rishtey_interests i WHERE (i.from_user = me AND i.to_user = rp.user_id) OR (i.from_user = rp.user_id AND i.to_user = me) LIMIT 1)
  FROM rishtey_profiles rp JOIN users u ON u.id = rp.user_id
  WHERE rp.status = 'approved' AND u.status = 'active' AND rp.user_id <> me
    AND (p_gender IS NULL OR rp.gender = p_gender)
    AND (p_age_min IS NULL OR rp.age + date_part('year', age(current_date, rp.age_at))::int >= p_age_min)
    AND (p_age_max IS NULL OR rp.age + date_part('year', age(current_date, rp.age_at))::int <= p_age_max)
    AND (p_district IS NULL OR lower(btrim(rp.district)) = lower(btrim(p_district)))
    AND (p_state IS NULL OR lower(btrim(rp.state)) = lower(btrim(p_state)))
    AND (p_same_gotra OR my_gotra IS NULL OR my_gotra = '' OR lower(btrim(coalesce(rp.gotra, ''))) <> my_gotra)
    AND NOT EXISTS (SELECT 1 FROM rishtey_blocks b WHERE (b.user_id = me AND b.blocked_user_id = rp.user_id) OR (b.user_id = rp.user_id AND b.blocked_user_id = me))
  ORDER BY rp.published_at DESC NULLS LAST, rp.id
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

-- One approved profile (same public columns).
CREATE FUNCTION rishtey_get_public(p_profile uuid)
RETURNS TABLE (id uuid, first_name text, age int, gender text, height_cm int, gotra text, education text, occupation text, district text, state text, published_by text, my_interest text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE me uuid := app_user();
BEGIN
  PERFORM rishtey_require_approved();
  IF NOT rishtey_visible(me, p_profile) THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN QUERY
  SELECT rp.id, rp.first_name, (rp.age + date_part('year', age(current_date, rp.age_at))::int), rp.gender, rp.height_cm::int, rp.gotra, rp.education, rp.occupation,
         rp.district, rp.state, rp.published_by,
         (SELECT CASE WHEN i.from_user = me THEN (CASE i.status WHEN 'declined' THEN 'sent' ELSE i.status END)
                      ELSE (CASE i.status WHEN 'sent' THEN 'received' ELSE i.status END) END
          FROM rishtey_interests i WHERE (i.from_user = me AND i.to_user = rp.user_id) OR (i.from_user = rp.user_id AND i.to_user = me) LIMIT 1)
  FROM rishtey_profiles rp WHERE rp.id = p_profile;
END $$;

-- Send an interest. Cap: 10 per rolling 24 h per sender. If the other person already sent one to me, this accepts it. Returns sent | accepted.
CREATE FUNCTION rishtey_send_interest(p_profile uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me uuid := app_user(); target uuid; rev uuid;
BEGIN
  PERFORM rishtey_require_approved();
  IF NOT rishtey_visible(me, p_profile) THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT user_id INTO target FROM rishtey_profiles WHERE id = p_profile;
  PERFORM pg_advisory_xact_lock(hashtext('rishtey_interest:' || me::text));
  SELECT i.id INTO rev FROM rishtey_interests i WHERE i.from_user = target AND i.to_user = me AND i.status = 'sent';
  IF rev IS NOT NULL THEN
    UPDATE rishtey_interests SET status = 'accepted', responded_at = now() WHERE id = rev;
    RETURN 'accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM rishtey_interests i WHERE (i.from_user = me AND i.to_user = target) OR (i.from_user = target AND i.to_user = me)) THEN
    RAISE EXCEPTION 'interest_exists';
  END IF;
  IF (SELECT count(*) FROM rishtey_interests i WHERE i.from_user = me AND i.created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'interest_cap';
  END IF;
  INSERT INTO rishtey_interests (from_user, to_user) VALUES (me, target);
  RETURN 'sent';
END $$;

-- My interests: box = 'received' | 'sent'. The OTHER person's public columns (only while they are still approved and not blocked either way).
CREATE FUNCTION rishtey_interests_list(p_box text)
RETURNS TABLE (id uuid, status text, created_at timestamptz, profile_id uuid, first_name text, age int, gender text, height_cm int, gotra text, education text, occupation text, district text, state text, published_by text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE me uuid := app_user();
BEGIN
  IF p_box NOT IN ('received', 'sent') THEN RAISE EXCEPTION 'invalid_input'; END IF;
  RETURN QUERY
  SELECT i.id, CASE WHEN p_box = 'sent' AND i.status = 'declined' THEN 'sent' ELSE i.status END, i.created_at,
         rp.id, rp.first_name, (rp.age + date_part('year', age(current_date, rp.age_at))::int), rp.gender, rp.height_cm::int, rp.gotra, rp.education, rp.occupation,
         rp.district, rp.state, rp.published_by
  FROM rishtey_interests i
  JOIN rishtey_profiles rp ON rp.user_id = (CASE WHEN p_box = 'sent' THEN i.to_user ELSE i.from_user END) AND rp.status = 'approved'
  JOIN users u ON u.id = rp.user_id AND u.status = 'active'
  WHERE (CASE WHEN p_box = 'sent' THEN i.from_user ELSE i.to_user END) = me
    AND NOT (p_box = 'received' AND i.status = 'declined')
    AND NOT EXISTS (SELECT 1 FROM rishtey_blocks b WHERE (b.user_id = me AND b.blocked_user_id = rp.user_id) OR (b.user_id = rp.user_id AND b.blocked_user_id = me))
  ORDER BY i.created_at DESC LIMIT 100;
END $$;

-- The other person's contact: ONLY when an interest between us was accepted, both profiles are approved and nobody blocked anybody.
CREATE FUNCTION rishtey_contact(p_profile uuid) RETURNS TABLE (first_name text, contact text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE me uuid := app_user(); target uuid;
BEGIN
  PERFORM rishtey_require_approved();
  IF NOT rishtey_visible(me, p_profile) THEN RAISE EXCEPTION 'contact_not_allowed'; END IF;
  SELECT rp.user_id INTO target FROM rishtey_profiles rp WHERE rp.id = p_profile;
  IF NOT EXISTS (SELECT 1 FROM rishtey_interests i WHERE i.status = 'accepted'
                 AND ((i.from_user = me AND i.to_user = target) OR (i.from_user = target AND i.to_user = me))) THEN
    RAISE EXCEPTION 'contact_not_allowed';
  END IF;
  RETURN QUERY SELECT rp.first_name, rp.contact FROM rishtey_profiles rp WHERE rp.id = p_profile;
END $$;

-- Block a person (by their profile id). Hides both profiles from each other, and any interest they sent me is declined.
CREATE FUNCTION rishtey_block(p_profile uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me uuid := app_user(); target uuid;
BEGIN
  SELECT user_id INTO target FROM rishtey_profiles WHERE id = p_profile;
  IF target IS NULL OR target = me THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO rishtey_blocks (user_id, blocked_user_id) VALUES (me, target) ON CONFLICT DO NOTHING;
  UPDATE rishtey_interests SET status = 'declined', responded_at = now() WHERE from_user = target AND to_user = me AND status = 'sent';
END $$;

-- Report a profile. One open report per reporter and profile; 3 different open reporters hide the profile until staff look at it.
CREATE FUNCTION rishtey_report(p_profile uuid, p_reason text, p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me uuid := app_user(); target uuid;
BEGIN
  SELECT user_id INTO target FROM rishtey_profiles WHERE id = p_profile;
  IF target IS NULL OR target = me THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO rishtey_reports (user_id, profile_id, reason, note) VALUES (me, p_profile, p_reason, nullif(btrim(p_note), '')) ON CONFLICT DO NOTHING;
  IF (SELECT count(DISTINCT r.user_id) FROM rishtey_reports r WHERE r.profile_id = p_profile AND r.status = 'open') >= 3 THEN
    UPDATE rishtey_profiles SET status = 'hidden', updated_at = now() WHERE id = p_profile AND status = 'approved';
  END IF;
END $$;

-- ---- staff: the moderation queue. Public columns only (never contact, never user ids). ----
CREATE FUNCTION admin_rishtey_queue(p_status text, p_limit int, p_offset int)
RETURNS TABLE (id uuid, status text, first_name text, age int, gender text, height_cm int, gotra text, education text, occupation text, place text, published_by text, submitted_at timestamptz, reject_reason text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  PERFORM app_require_role('support');
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'hidden') THEN RAISE EXCEPTION 'invalid_input'; END IF;
  RETURN QUERY
  SELECT rp.id, rp.status, rp.first_name, (rp.age + date_part('year', age(current_date, rp.age_at))::int), rp.gender, rp.height_cm::int, rp.gotra, rp.education, rp.occupation,
         concat_ws(', ', nullif(btrim(rp.district), ''), nullif(btrim(rp.state), '')), rp.published_by, rp.updated_at, rp.reject_reason, count(*) OVER ()
  FROM rishtey_profiles rp WHERE rp.status = p_status
  ORDER BY rp.updated_at, rp.id LIMIT greatest(1, least(coalesce(p_limit, 25), 100)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

-- Approve or reject a PENDING profile. Rejection needs a reason (shown to the user). Returns the new status.
CREATE FUNCTION admin_rishtey_review(p_profile uuid, p_approve boolean, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cur text; nxt text;
BEGIN
  PERFORM app_require_role('support');
  SELECT status INTO cur FROM rishtey_profiles WHERE id = p_profile FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  IF cur <> 'pending' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  nxt := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  UPDATE rishtey_profiles SET status = nxt, reject_reason = CASE WHEN p_approve THEN NULL ELSE p_reason END, reviewed_by = app_user(), reviewed_at = now(),
    published_at = CASE WHEN p_approve THEN now() ELSE published_at END, updated_at = now() WHERE id = p_profile;
  RETURN nxt;
END $$;

CREATE FUNCTION admin_rishtey_reports(p_status text, p_limit int, p_offset int)
RETURNS TABLE (id uuid, profile_id uuid, reason text, note text, status text, created_at timestamptz, first_name text, profile_status text, open_reports bigint, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  PERFORM app_require_role('support');
  IF p_status NOT IN ('open', 'dismissed', 'actioned') THEN RAISE EXCEPTION 'invalid_input'; END IF;
  RETURN QUERY
  SELECT r.id, r.profile_id, r.reason, r.note, r.status, r.created_at, rp.first_name, rp.status,
         (SELECT count(*) FROM rishtey_reports o WHERE o.profile_id = r.profile_id AND o.status = 'open'), count(*) OVER ()
  FROM rishtey_reports r LEFT JOIN rishtey_profiles rp ON rp.id = r.profile_id WHERE r.status = p_status
  ORDER BY r.created_at DESC LIMIT greatest(1, least(coalesce(p_limit, 25), 100)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

-- Close a report: 'dismiss', or 'hide' (hides the profile and closes every open report about it). Returns the new report status.
CREATE FUNCTION admin_rishtey_resolve_report(p_report uuid, p_action text, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prof uuid; cur text; nxt text;
BEGIN
  PERFORM app_require_role('support');
  IF p_action NOT IN ('dismiss', 'hide') THEN RAISE EXCEPTION 'invalid_input'; END IF;
  SELECT profile_id, status INTO prof, cur FROM rishtey_reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002'; END IF;
  IF cur <> 'open' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  nxt := CASE WHEN p_action = 'hide' THEN 'actioned' ELSE 'dismissed' END;
  IF p_action = 'hide' AND prof IS NOT NULL THEN
    UPDATE rishtey_profiles SET status = 'hidden', updated_at = now() WHERE id = prof AND status IN ('approved', 'pending');
    UPDATE rishtey_reports SET status = 'actioned', resolved_by = app_user(), resolved_at = now(), resolution = p_reason WHERE profile_id = prof AND status = 'open';
  ELSE
    UPDATE rishtey_reports SET status = nxt, resolved_by = app_user(), resolved_at = now(), resolution = p_reason WHERE id = p_report;
  END IF;
  RETURN nxt;
END $$;

-- Own the new functions as notra_system and open EXECUTE to the runtime role only.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prosecdef AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
             AND (p.proname LIKE 'rishtey\_%' OR p.proname LIKE 'admin\_rishtey\_%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO notra_system', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO notra_app', f.sig);
  END LOOP;
END $$;
