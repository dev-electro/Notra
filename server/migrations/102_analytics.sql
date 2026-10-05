-- Stage 8: insights without exposing rows.
--
-- Staff never query ledger tables. They call functions in the `analytics` schema. Each function is SECURITY DEFINER, owned by
-- notra_system (which has an explicit RLS policy on the underlying tables), checks app.role (viewer or above), and returns
-- AGGREGATES ONLY. K-ANONYMITY: any group built from fewer than analytics.k() = 5 distinct users is suppressed: its numbers come
-- back NULL with suppressed = true (the API shows "<5"). Region lists drop such groups and report one "<5" bucket instead.
-- Known limit: suppression is per group; differencing two overlapping totals can still narrow a small group. Do not add
-- finer-grained functions (per village, per day) without re-checking this.

CREATE SCHEMA analytics;
GRANT USAGE ON SCHEMA analytics TO notra_app, notra_system;
GRANT CREATE ON SCHEMA analytics TO notra_system;

CREATE FUNCTION analytics.k() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;

-- Entries as the ledger actually counts them: not voided, and not superseded by a later correction.
CREATE VIEW analytics.effective_entries WITH (security_barrier = true) AS
SELECT e.user_id, e.id, e.event_id, e.direction, e.payment_mode, e.created_at, left(e.created_at, 10) AS day,
       (e.cash_paise + e.in_kind_value_paise) AS total_paise,
       (e.in_kind_item IS NOT NULL OR e.in_kind_value_paise > 0) AS has_in_kind
FROM entries e
WHERE NOT e.is_void
  AND NOT EXISTS (SELECT 1 FROM entries c WHERE c.user_id = e.user_id AND c.corrects_entry_id = e.id);

-- ---- north star: Notra events recorded per month ----
CREATE FUNCTION analytics.events_per_month(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (month text, users bigint, events bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    SELECT g.m, CASE WHEN g.u >= analytics.k() THEN g.u END, CASE WHEN g.u >= analytics.k() THEN g.n END, g.u < analytics.k()
    FROM (SELECT left(ev.created_at, 7) AS m, count(DISTINCT ev.user_id) AS u, count(*) AS n FROM events ev
          WHERE (p_from IS NULL OR left(ev.created_at, 10) >= p_from::text) AND (p_to IS NULL OR left(ev.created_at, 10) <= p_to::text)
          GROUP BY 1) g
    ORDER BY g.m;
END $$;

CREATE FUNCTION analytics.events_by_occasion(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (occasion text, users bigint, events bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    SELECT g.o, CASE WHEN g.u >= analytics.k() THEN g.u END, CASE WHEN g.u >= analytics.k() THEN g.n END, g.u < analytics.k()
    FROM (SELECT ev.occasion AS o, count(DISTINCT ev.user_id) AS u, count(*) AS n FROM events ev
          WHERE (p_from IS NULL OR left(ev.created_at, 10) >= p_from::text) AND (p_to IS NULL OR left(ev.created_at, 10) <= p_to::text)
          GROUP BY 1) g
    ORDER BY g.o;
END $$;

-- Entries per event (events that have at least one entry): average, median, p90.
CREATE FUNCTION analytics.entries_per_event(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (users bigint, events bigint, avg_entries numeric, median_entries numeric, p90_entries numeric, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    WITH per AS (
      SELECT x.user_id, x.event_id, count(*) AS n FROM analytics.effective_entries x
      WHERE x.event_id IS NOT NULL AND (p_from IS NULL OR x.day >= p_from::text) AND (p_to IS NULL OR x.day <= p_to::text)
      GROUP BY 1, 2),
    s AS (SELECT count(DISTINCT per.user_id) AS u, count(*) AS ev, avg(per.n) AS a,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY per.n) AS med, percentile_cont(0.9) WITHIN GROUP (ORDER BY per.n) AS p90 FROM per)
    SELECT CASE WHEN s.u >= analytics.k() THEN s.u END, CASE WHEN s.u >= analytics.k() THEN s.ev END,
           CASE WHEN s.u >= analytics.k() THEN round(s.a, 2) END, CASE WHEN s.u >= analytics.k() THEN round(s.med::numeric, 2) END,
           CASE WHEN s.u >= analytics.k() THEN round(s.p90::numeric, 2) END, s.u < analytics.k()
    FROM s;
END $$;

-- Amount distribution (cash + in-kind value per entry) in fixed rupee buckets, across all users.
CREATE FUNCTION analytics.amount_buckets(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (bucket text, sort integer, users bigint, entries bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    SELECT b.label, b.ord, CASE WHEN g.u >= analytics.k() THEN g.u END, CASE WHEN g.u >= analytics.k() THEN g.n END, coalesce(g.u, 0) < analytics.k()
    FROM (VALUES (1, 'Rs 0-100', 0::bigint, 10000::bigint), (2, 'Rs 101-500', 10001, 50000), (3, 'Rs 501-1000', 50001, 100000),
                 (4, 'Rs 1001-5000', 100001, 500000), (5, 'Rs 5000+', 500001, 9223372036854775807)) AS b(ord, label, lo, hi)
    LEFT JOIN LATERAL (SELECT count(DISTINCT x.user_id) AS u, count(*) AS n FROM analytics.effective_entries x
        WHERE x.total_paise BETWEEN b.lo AND b.hi AND (p_from IS NULL OR x.day >= p_from::text) AND (p_to IS NULL OR x.day <= p_to::text)) g ON true
    ORDER BY b.ord;
END $$;

-- Mix facets: payment mode (CASH/UPI), in-kind vs cash-only, and AAYA (received) vs GAYA (given).
CREATE FUNCTION analytics.entry_mix(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (facet text, label text, users bigint, entries bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    WITH x AS (SELECT * FROM analytics.effective_entries e
               WHERE (p_from IS NULL OR e.day >= p_from::text) AND (p_to IS NULL OR e.day <= p_to::text)),
    f AS (
      SELECT 'payment'::text AS facet, x.payment_mode AS label, x.user_id FROM x
      UNION ALL SELECT 'in_kind', CASE WHEN x.has_in_kind THEN 'with in-kind' ELSE 'cash only' END, x.user_id FROM x
      UNION ALL SELECT 'flow', CASE x.direction WHEN 'AAYA' THEN 'received (aaya)' ELSE 'given (gaya)' END, x.user_id FROM x),
    g AS (SELECT f.facet, f.label, count(DISTINCT f.user_id) AS u, count(*) AS n FROM f GROUP BY 1, 2)
    SELECT g.facet, g.label, CASE WHEN g.u >= analytics.k() THEN g.u END, CASE WHEN g.u >= analytics.k() THEN g.n END, g.u < analytics.k()
    FROM g ORDER BY g.facet, g.label;
END $$;

-- Region distribution: users per village of THEIR OWN household ("my household"), only groups of >= k users.
-- Anything smaller is folded into one row labelled '<5' with no numbers. There is no district data, so none is shown.
CREATE FUNCTION analytics.region_distribution()
RETURNS TABLE (region text, users bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    WITH g AS (SELECT h.village AS v, count(DISTINCT p.user_id) AS u FROM profiles p
               JOIN households h ON h.user_id = p.user_id AND h.id = p.my_household_id GROUP BY 1)
    SELECT g.v, g.u, false FROM g WHERE g.u >= analytics.k()
    UNION ALL
    SELECT '<5'::text, NULL::bigint, true WHERE EXISTS (SELECT 1 FROM g WHERE g.u < analytics.k())
    ORDER BY 3, 2 DESC NULLS LAST, 1;
END $$;

-- Weekly signup cohorts -> users active in week 1..p_weeks after signup. Cells under k are suppressed.
CREATE FUNCTION analytics.retention(p_from date, p_to date, p_weeks integer DEFAULT 8)
RETURNS TABLE (cohort_week date, cohort_size bigint, week_no integer, active bigint, suppressed boolean, elapsed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    WITH c AS (SELECT u.id, date_trunc('week', u.created_at AT TIME ZONE 'UTC')::date AS cw FROM users u
               WHERE (u.created_at AT TIME ZONE 'UTC')::date BETWEEN p_from AND p_to),
    a AS (SELECT DISTINCT d.user_id, date_trunc('week', d.day::timestamp)::date AS wk FROM user_activity_daily d),
    sz AS (SELECT c.cw, count(*) AS n FROM c GROUP BY 1),
    wk AS (SELECT generate_series(1, LEAST(GREATEST(p_weeks, 1), 26)) AS w),
    cells AS (SELECT sz.cw, sz.n, wk.w,
                (sz.cw + 7 * wk.w) <= date_trunc('week', now() AT TIME ZONE 'UTC')::date AS el,
                (SELECT count(DISTINCT c.id) FROM c JOIN a ON a.user_id = c.id AND a.wk = sz.cw + 7 * wk.w WHERE c.cw = sz.cw) AS act
              FROM sz CROSS JOIN wk)
    SELECT cells.cw, CASE WHEN cells.n >= analytics.k() THEN cells.n END, cells.w,
           CASE WHEN cells.n >= analytics.k() AND cells.act >= analytics.k() AND cells.el THEN cells.act END,
           cells.n < analytics.k() OR (cells.el AND cells.act < analytics.k()), cells.el
    FROM cells ORDER BY cells.cw, cells.w;
END $$;

-- App versions among users active in the last 30 days.
CREATE FUNCTION analytics.app_versions()
RETURNS TABLE (app_version text, platform text, users bigint, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('viewer');
  RETURN QUERY
    SELECT g.v, g.p, CASE WHEN g.u >= analytics.k() THEN g.u END, g.u < analytics.k()
    FROM (SELECT coalesce(d.app_version, 'unknown') AS v, d.platform AS p, count(DISTINCT d.user_id) AS u FROM user_devices d
          WHERE d.last_seen > now() - interval '30 days' GROUP BY 1, 2) g
    ORDER BY g.u DESC, g.v;
END $$;

-- ---- daily rollup into daily_stats (cron + on-demand). Role: system (cron), admin or owner. ----
CREATE FUNCTION analytics.rollup_internal(p_day date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE d text := p_day::text;
BEGIN
  DELETE FROM daily_stats WHERE day = p_day;
  INSERT INTO daily_stats (day, metric, dim, value, users)
  -- new users (total, then by sign-in method)
  SELECT p_day, 'new_users', '', count(*), count(*) FROM users WHERE (created_at AT TIME ZONE 'UTC')::date = p_day
  UNION ALL SELECT p_day, 'new_users', signup_method, count(*), count(*) FROM users WHERE (created_at AT TIME ZONE 'UTC')::date = p_day GROUP BY signup_method
  -- active users: DAU, trailing 7-day WAU, trailing 30-day MAU
  UNION ALL SELECT p_day, 'dau', '', count(DISTINCT user_id), count(DISTINCT user_id) FROM user_activity_daily WHERE day = p_day
  UNION ALL SELECT p_day, 'wau', '', count(DISTINCT user_id), count(DISTINCT user_id) FROM user_activity_daily WHERE day > p_day - 7 AND day <= p_day
  UNION ALL SELECT p_day, 'mau', '', count(DISTINCT user_id), count(DISTINCT user_id) FROM user_activity_daily WHERE day > p_day - 30 AND day <= p_day
  -- events and entries recorded (by the phone's creation date)
  UNION ALL SELECT p_day, 'events_created', '', count(*), count(DISTINCT user_id) FROM events WHERE created_at >= d AND created_at < (p_day + 1)::text
  UNION ALL SELECT p_day, 'events_by_occasion', occasion, count(*), count(DISTINCT user_id) FROM events WHERE created_at >= d AND created_at < (p_day + 1)::text GROUP BY occasion
  UNION ALL SELECT p_day, 'entries_created', '', count(*), count(DISTINCT user_id) FROM entries WHERE created_at >= d AND created_at < (p_day + 1)::text
  -- sync health
  UNION ALL SELECT p_day, 'sync_requests', '', coalesce(sum(sync_requests), 0), count(DISTINCT user_id) FILTER (WHERE sync_requests > 0) FROM user_activity_daily WHERE day = p_day
  UNION ALL SELECT p_day, 'sync_errors', '', coalesce(sum(sync_errors), 0), count(DISTINCT user_id) FILTER (WHERE sync_errors > 0) FROM user_activity_daily WHERE day = p_day
  -- service metrics (no user dimension)
  UNION ALL SELECT p_day, 'otp_' || kind, '', count(*), NULL FROM otp_events WHERE (at AT TIME ZONE 'UTC')::date = p_day GROUP BY kind
  UNION ALL SELECT p_day, 'account_deletions', '', count(*), NULL FROM account_deletions WHERE (at AT TIME ZONE 'UTC')::date = p_day;
END $$;

CREATE FUNCTION analytics.rollup_day(p_day date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('admin');
  PERFORM analytics.rollup_internal(p_day);
END $$;

-- Reports call this first so "today" is never empty before the nightly cron has run (at most once every 5 minutes).
CREATE FUNCTION analytics.refresh_today() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM app_require_role('viewer');
  IF NOT EXISTS (SELECT 1 FROM daily_stats WHERE day = today AND computed_at > now() - interval '5 minutes') THEN
    PERFORM analytics.rollup_internal(today);
  END IF;
END $$;

-- Service-metric retention of detail tables (so they cannot grow forever). Callable by cron/admin.
CREATE FUNCTION analytics.purge_old() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app_require_role('admin');
  DELETE FROM otp_events WHERE at < now() - interval '90 days';
  DELETE FROM error_log WHERE at < now() - interval '30 days';
  DELETE FROM user_activity_daily WHERE day < (now() AT TIME ZONE 'UTC')::date - 400;
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'analytics' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO notra_system', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO notra_app', f.sig);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION analytics.rollup_internal(date) FROM notra_app;
ALTER VIEW analytics.effective_entries OWNER TO notra_system;
GRANT EXECUTE ON FUNCTION analytics.k() TO notra_app;
-- notra_app gets NO privileges on the views: staff reach aggregates only through the functions above.
GRANT SELECT ON analytics.effective_entries TO notra_system;
