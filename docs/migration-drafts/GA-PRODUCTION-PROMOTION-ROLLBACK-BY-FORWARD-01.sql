-- PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
-- Rollback-by-forward recovery package.
-- READ-ONLY decision support. No destructive DROP/RESET/CLEANUP.
-- Run after a failure to determine the safe recovery state.
--
-- Scenarios:
--   A. Foundation applied / Completion failed
--   B. Completion applied / AUTH04 failed
--   C. AUTH04 applied / operational configuration incomplete
--
-- Each scenario returns either a safe HOLD with exact reason, or a green
-- "RECOVERY_STATE_SAFE" confirmation. Any mutation (re-apply, config, flags)
-- is out of scope for this package and requires a separate governed artifact.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_foundation_applied boolean;
  v_completion_applied boolean;
  v_auth04_applied boolean;
  v_foundation_objects integer;
  v_completion_objects integer;
  v_ga_functions integer;
  v_ga_policies integer;
BEGIN
  -- Determine ledger state (tolerate missing ledger table in disposable PG17).
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    v_foundation_applied := exists (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE name = '20260808210000_ga_mvp_foundation_01'
    );
    v_completion_applied := exists (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE name = '20260808210100_ga_mvp_completion_01'
    );
    v_auth04_applied := exists (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE name = '20260808210200_ga_authorization_04'
    );
  ELSE
    v_foundation_applied := false;
    v_completion_applied := false;
    v_auth04_applied := false;
  END IF;

  -- Scenario C: AUTH04 applied / operational configuration incomplete.
  -- Safe state: all three migrations are in the ledger, RLS policies exist,
  -- no feature flags enabled, no destructive action needed.
  IF v_auth04_applied THEN
    SELECT count(*) INTO v_ga_policies
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'graduate_%';

    IF v_ga_policies < 7 THEN
      RAISE EXCEPTION 'HOLD-SCENARIO-C: AUTH04 is in ledger but only % GA policies exist (expected 7). DO NOT enable feature flags. Investigate policy surface before any operational config.', v_ga_policies;
    END IF;

    RAISE NOTICE 'RECOVERY_STATE_SAFE: AUTH04 applied. Operational config incomplete is a controlled state: feature flags remain OFF; staff assignments and continuity policy are governed by separate operational runbooks.';
    RETURN;
  END IF;

  -- Scenario B: Completion applied / AUTH04 failed.
  -- Safe state: Foundation + Completion objects exist, no AUTH04 policies/functions surface.
  IF v_completion_applied THEN
    SELECT count(*) INTO v_ga_policies
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'graduate_%';

    IF v_ga_policies > 0 THEN
      RAISE EXCEPTION 'HOLD-SCENARIO-B: Completion is in ledger but % GA policies already exist (AUTH04 surface partially present). DO NOT re-apply AUTH04 without inspecting partial state.', v_ga_policies;
    END IF;

    -- Verify completion objects are complete (not a partial-apply).
    SELECT count(*) INTO v_completion_objects
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('graduate_followups','graduate_communication_events','graduate_account_continuity_policies')
      AND c.relkind = 'r';
    IF v_completion_objects <> 3 THEN
      RAISE EXCEPTION 'HOLD-SCENARIO-B: Completion is in ledger but only %/3 completion tables exist. Partial apply detected. DO NOT proceed to AUTH04.', v_completion_objects;
    END IF;

    RAISE NOTICE 'RECOVERY_STATE_SAFE: Completion applied, AUTH04 not applied. Safe state: GA tables default-deny (RLS enabled, no policies). Re-apply AUTH04 only after a new governed authorization package is approved.';
    RETURN;
  END IF;

  -- Scenario A: Foundation applied / Completion failed.
  -- Safe state: Foundation objects exist, no Completion objects.
  IF v_foundation_applied THEN
    SELECT count(*) INTO v_completion_objects
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('graduate_followups','graduate_communication_events','graduate_account_continuity_policies')
      AND c.relkind = 'r';

    IF v_completion_objects > 0 THEN
      RAISE EXCEPTION 'HOLD-SCENARIO-A: Foundation is in ledger but % completion table(s) already exist. Partial apply detected. DO NOT re-apply Completion without inspecting partial state.', v_completion_objects;
    END IF;

    -- Verify foundation objects are complete.
    SELECT count(*) INTO v_foundation_objects
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'graduate_official_decisions','graduate_records','graduate_profiles',
        'graduate_contact_points','graduate_consents','graduate_employers',
        'graduate_employment_events','graduate_opportunities','graduate_surveys',
        'graduate_survey_versions','graduate_survey_responses','graduate_events',
        'graduate_event_registrations','graduate_domain_events'
      )
      AND c.relkind = 'r';
    IF v_foundation_objects <> 14 THEN
      RAISE EXCEPTION 'HOLD-SCENARIO-A: Foundation is in ledger but only %/14 foundation tables exist. Partial apply detected.', v_foundation_objects;
    END IF;

    RAISE NOTICE 'RECOVERY_STATE_SAFE: Foundation applied, Completion not applied. Safe state: GA domain exists, default-deny. Re-apply Completion only after a new governed completion package is approved.';
    RETURN;
  END IF;

  -- No GA migrations in ledger.
  RAISE NOTICE 'RECOVERY_STATE_SAFE: no GA migrations applied. Return to normal preflight flow.';
END $$;

SELECT
  'ROLLBACK_BY_FORWARD_DECISION_COMPLETE' AS status,
  'See NOTICE messages above for scenario-specific safe state.' AS note;
