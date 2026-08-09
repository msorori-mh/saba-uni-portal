-- PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
-- Production read-only preflight for FOUNDATION apply.
-- READ-ONLY. No DML, no RPC mutation, no production write.
-- Run as a privileged read-only role against the production/staging database.
-- Returns: READY_FOR_APPLY_FOUNDATION or raises exact HOLD.
--
-- Report every production read. This script issues only SELECT/catalog queries.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_unit_ok boolean;
  v_roles_ok boolean;
  v_missing_tables text[] := ARRAY[]::text[];
  v_ga_objects text[] := ARRAY[]::text[];
  v_mixed boolean := false;
  v_manager_count integer;
  v_specialist_count integer;
  v_ambiguous_staff_users integer;
  v_specialist_without_scope integer;
  v_continuity_policy_count integer;
  v_manager_direct_bad integer;
  v_specialist_direct_bad integer;
BEGIN
  -- 1. Migration ledger: none of the promoted GA migrations may be recorded.
  -- Tolerate missing ledger table (disposable PG17) as "no migrations found".
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE name IN (
        '20260808210000_ga_mvp_foundation_01',
        '20260808210100_ga_mvp_completion_01',
        '20260808210200_ga_authorization_04'
      )
    ) THEN
      RAISE EXCEPTION 'HOLD: GA migration ledger already contains one or more promoted GA migrations';
    END IF;
  END IF;

  -- 2. GA migration absence/presence: no graduate_* domain objects yet for FOUNDATION readiness.
  SELECT array_agg(c.relname)
  INTO v_ga_objects
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'graduate_%'
    AND c.relkind IN ('r','v','m','S','t');

  IF v_ga_objects IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: graduate_%% objects already present: %', array_to_string(v_ga_objects, ', ');
  END IF;

  -- 3. Canonical unit.
  SELECT EXISTS (
    SELECT 1 FROM public.request_processing_units
    WHERE code = 'graduate_affairs' AND is_active
  ) INTO v_unit_ok;
  IF NOT v_unit_ok THEN
    RAISE EXCEPTION 'HOLD: canonical graduate_affairs unit missing or inactive';
  END IF;

  -- 4. Canonical roles.
  SELECT count(*) = 2
  INTO v_roles_ok
  FROM public.request_processing_roles r
  JOIN public.request_processing_units u ON u.id = r.unit_id
  WHERE u.code = 'graduate_affairs'
    AND r.code IN ('graduate_affairs_manager', 'graduate_affairs_specialist')
    AND r.is_active;
  IF NOT v_roles_ok THEN
    RAISE EXCEPTION 'HOLD: canonical graduate_affairs_manager/specialist roles missing or inactive';
  END IF;

  -- 5. Required upstream schema.
  SELECT array_agg(t)
  INTO v_missing_tables
  FROM (
    VALUES
      ('public.student_profiles'),
      ('public.staff_profiles'),
      ('public.departments'),
      ('public.programs'),
      ('public.staff_profile_departments'),
      ('public.request_processing_units'),
      ('public.request_processing_roles'),
      ('public.request_processing_assignments'),
      ('auth.users')
  ) AS required(t)
  WHERE to_regclass(required.t) IS NULL;

  IF v_missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: required upstream tables missing: %', array_to_string(v_missing_tables, ', ');
  END IF;

  -- 6. Profile ambiguity: no user owns more than one active staff_profile.
  -- Direct-user GA assignments fail-closed on >1 active profile; ambiguous
  -- prestate must be resolved before GA staff authority becomes meaningful.
  SELECT count(DISTINCT sp.user_id)
  INTO v_ambiguous_staff_users
  FROM public.staff_profiles sp
  WHERE sp.status = 'active'
  GROUP BY sp.user_id
  HAVING count(*) > 1;

  IF v_ambiguous_staff_users > 0 THEN
    RAISE EXCEPTION 'HOLD: % user(s) have more than one active staff_profile; resolve before GA staff assignments', v_ambiguous_staff_users;
  END IF;

  -- 7. Manager assignment readiness (advisory hard check): if any GA manager
  -- assignment exists, it must resolve to exactly one active staff profile.
  SELECT count(DISTINCT a.staff_profile_id)
  INTO v_manager_count
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_manager'
  JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.assignment_type = 'staff_profile'
    AND sp.status = 'active';

  -- direct user assignments must also resolve unambiguously
  SELECT count(DISTINCT a.user_id)
  INTO v_manager_direct_bad
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_manager'
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.assignment_type = 'user'
    AND (
      SELECT count(*)
      FROM public.staff_profiles sp
      WHERE sp.user_id = a.user_id AND sp.status = 'active'
    ) <> 1;

  IF v_manager_direct_bad > 0 THEN
    RAISE EXCEPTION 'HOLD: direct-user graduate_affairs_manager assignment(s) do not resolve to exactly one active staff_profile';
  END IF;

  -- 8. Specialist assignment readiness.
  SELECT count(DISTINCT a.staff_profile_id)
  INTO v_specialist_count
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
  JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.assignment_type = 'staff_profile'
    AND sp.status = 'active';

  SELECT count(DISTINCT a.user_id)
  INTO v_specialist_direct_bad
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.assignment_type = 'user'
    AND (
      SELECT count(*)
      FROM public.staff_profiles sp
      WHERE sp.user_id = a.user_id AND sp.status = 'active'
    ) <> 1;

  IF v_specialist_direct_bad > 0 THEN
    RAISE EXCEPTION 'HOLD: direct-user graduate_affairs_specialist assignment(s) do not resolve to exactly one active staff_profile';
  END IF;

  -- 9. Specialist department scope: every active staff_profile GA specialist
  -- assignment must have at least one department scope (fail-closed on empty scope).
  SELECT count(*)
  INTO v_specialist_without_scope
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'graduate_affairs'
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code = 'graduate_affairs_specialist'
  JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.assignment_type = 'staff_profile'
    AND sp.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_profile_departments spd
      WHERE spd.staff_profile_id = a.staff_profile_id
    );

  IF v_specialist_without_scope > 0 THEN
    RAISE EXCEPTION 'HOLD: % active graduate_affairs_specialist assignment(s) lack department scope', v_specialist_without_scope;
  END IF;

  -- 10. Continuity policy readiness: no current policy should exist pre-apply.
  -- (The operational config creates the first current policy after AUTH04.)
  IF to_regclass('public.graduate_account_continuity_policies') IS NOT NULL THEN
    SELECT count(*)
    INTO v_continuity_policy_count
    FROM public.graduate_account_continuity_policies
    WHERE is_current;

    IF v_continuity_policy_count > 0 THEN
      RAISE EXCEPTION 'HOLD: graduate_account_continuity_policies already has % current row(s) before migration', v_continuity_policy_count;
    END IF;
  END IF;

  -- 11. No mixed state: confirm no GA functions/types/policies exist either.
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname LIKE 'graduate_%'
  ) THEN
    RAISE EXCEPTION 'HOLD: graduate_%% types already present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'graduate_%'
  ) THEN
    RAISE EXCEPTION 'HOLD: graduate_%% functions already present';
  END IF;

  -- 12. Feature flags source state: verify staffGraduatesAffairs and
  -- studentGraduatesAffairs remain OFF in src/lib/feature-flags.ts (or equivalent).
  -- This is a source-level check; the SQL preflight cannot read source files.
  -- The runbook documents manual confirmation.

  -- All hard checks passed.
  RAISE NOTICE 'READY_FOR_APPLY_FOUNDATION';
END $$;

-- Final visible result for automated callers.
SELECT 'READY_FOR_APPLY_FOUNDATION' AS preflight_status,
       'PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09' AS mission,
       '20260808210000_ga_mvp_foundation_01.sql' AS foundation_migration;
