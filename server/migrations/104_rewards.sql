-- Rewards (इनाम) phase 2-3: daily check-in, rewarded video, referrals. Points are an achievement score ONLY: there is no cash
-- redemption anywhere in the schema or the API.
--
-- * reward_ledger is APPEND-ONLY for the app role (no UPDATE / DELETE privilege). A user sees and inserts only their own rows.
--   Double claims are prevented by unique indexes, not by application code:
--     checkin       one per user per IST day
--     video         `ref` is the slot number '1'..'3' of the IST day: at most 3 per user per day
--     streak_bonus  `ref` = '<streak length>:<first day of that streak>': once per streak and milestone
--     referral      `ref` = invitee id (inviter's row) or 'from:<invitee id>' (invitee's row): once per invitee
-- * `day` is the Indian (IST) calendar day, decided by the server, never by the phone.
-- * Referral qualification needs facts about ANOTHER user (how many entries the invitee synced), so it runs inside SECURITY DEFINER
--   functions owned by notra_system; they return only a count / status, never ledger content.
CREATE TABLE reward_ledger (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('checkin', 'streak_bonus', 'video', 'referral')),
  points      integer NOT NULL CHECK (points > 0 AND points <= 100),
  day         date NOT NULL,
  ref         text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'video' OR ref IN ('1', '2', '3')),
  CHECK (kind NOT IN ('streak_bonus', 'referral') OR ref IS NOT NULL)
);
CREATE UNIQUE INDEX reward_ledger_checkin_once ON reward_ledger (user_id, day) WHERE kind = 'checkin';
CREATE UNIQUE INDEX reward_ledger_video_slot ON reward_ledger (user_id, day, ref) WHERE kind = 'video';
CREATE UNIQUE INDEX reward_ledger_once_per_ref ON reward_ledger (user_id, kind, ref) WHERE kind IN ('streak_bonus', 'referral');
CREATE INDEX reward_ledger_user_idx ON reward_ledger (user_id, day DESC, id DESC);
CREATE INDEX reward_ledger_day_idx ON reward_ledger (day);

CREATE TABLE referral_codes (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,12}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE referrals (
  inviter_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,   -- an account can be invited once
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  qualified_at  timestamptz,
  CHECK (inviter_id <> invitee_id)
);
CREATE INDEX referrals_inviter_idx ON referrals (inviter_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reward_ledger', 'referral_codes', 'referrals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY system_all ON %I FOR ALL TO notra_system USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

CREATE POLICY own_select ON reward_ledger FOR SELECT TO notra_app USING (user_id = app_user());
CREATE POLICY own_insert ON reward_ledger FOR INSERT TO notra_app WITH CHECK (user_id = app_user());
CREATE POLICY own_all ON referral_codes FOR ALL TO notra_app USING (user_id = app_user()) WITH CHECK (user_id = app_user());
CREATE POLICY party_select ON referrals FOR SELECT TO notra_app USING (inviter_id = app_user() OR invitee_id = app_user());
-- no insert/update policy on referrals for notra_app: rows are created and qualified only by the functions below.

-- default privileges (101) hand every new table full DML: take it back so the ledger is append-only and referrals change only via the functions.
REVOKE ALL ON reward_ledger, referrals FROM notra_app;
GRANT SELECT, INSERT ON reward_ledger TO notra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON referral_codes TO notra_app;
GRANT SELECT ON referrals TO notra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON reward_ledger, referral_codes, referrals TO notra_system;

-- Redeem someone's code. Returns 'ok' | 'invalid_code' | 'self' | 'too_old' | 'already_redeemed'.
-- p_now is passed by the Worker (so tests control the clock). The invitee must be an account younger than 7 days.
CREATE FUNCTION rewards_redeem_referral(p_code text, p_now timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me uuid := app_user(); inviter uuid; created timestamptz;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO inviter FROM referral_codes WHERE code = upper(trim(p_code));
  IF inviter IS NULL THEN RETURN 'invalid_code'; END IF;
  IF inviter = me THEN RETURN 'self'; END IF;
  SELECT u.created_at INTO created FROM users u WHERE u.id = me;
  IF created IS NULL OR created < p_now - interval '7 days' THEN RETURN 'too_old'; END IF;
  INSERT INTO referrals (inviter_id, invitee_id) VALUES (inviter, me) ON CONFLICT (invitee_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'already_redeemed'; END IF;
  RETURN 'ok';
END $$;

-- Qualify the caller's pending referrals (as inviter or as invitee) whose invitee has synced at least 5 entries, and award
-- +50 (inviter) / +20 (invitee) exactly once. Returns how many referrals qualified now. p_day = the IST day.
CREATE FUNCTION rewards_evaluate_referrals(p_day date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me uuid := app_user(); r record; n integer := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  FOR r IN SELECT inviter_id, invitee_id FROM referrals
           WHERE status = 'pending' AND (inviter_id = me OR invitee_id = me) FOR UPDATE
  LOOP
    IF (SELECT count(*) FROM entries e WHERE e.user_id = r.invitee_id) >= 5 THEN
      UPDATE referrals SET status = 'qualified', qualified_at = now() WHERE invitee_id = r.invitee_id AND status = 'pending';
      IF FOUND THEN
        INSERT INTO reward_ledger (user_id, kind, points, day, ref) VALUES (r.inviter_id, 'referral', 50, p_day, r.invitee_id::text) ON CONFLICT DO NOTHING;
        INSERT INTO reward_ledger (user_id, kind, points, day, ref) VALUES (r.invitee_id, 'referral', 20, p_day, 'from:' || r.invitee_id::text) ON CONFLICT DO NOTHING;
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- Staff statistics: per IST day, points issued and counts. AGGREGATES ONLY; a day built from fewer than 5 distinct users is suppressed.
CREATE FUNCTION analytics.rewards_daily(p_from date, p_to date)
RETURNS TABLE (day date, users bigint, points bigint, checkins bigint, videos bigint, referrals bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    SELECT g.d, CASE WHEN g.u >= analytics.k() THEN g.u END, CASE WHEN g.u >= analytics.k() THEN g.p END,
           CASE WHEN g.u >= analytics.k() THEN g.c END, CASE WHEN g.u >= analytics.k() THEN g.v END, CASE WHEN g.u >= analytics.k() THEN g.r END,
           g.u < analytics.k()
    FROM (SELECT l.day AS d, count(DISTINCT l.user_id) AS u, sum(l.points)::bigint AS p,
                 count(*) FILTER (WHERE l.kind = 'checkin') AS c, count(*) FILTER (WHERE l.kind = 'video') AS v,
                 count(*) FILTER (WHERE l.kind = 'referral' AND l.ref NOT LIKE 'from:%') AS r
          FROM reward_ledger l WHERE l.day BETWEEN p_from AND p_to GROUP BY l.day) g
    ORDER BY g.d;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['rewards_redeem_referral(text, timestamptz)', 'rewards_evaluate_referrals(date)', 'analytics.rewards_daily(date, date)']
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO notra_system', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO notra_app', f);
  END LOOP;
END $$;
