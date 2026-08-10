-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- observer/02-observer-cleanup.sql
--
-- Explicit bounded cleanup of observer artifacts. No DROP OWNED.
-- Every observer function created in 01-observer-functions.sql is dropped by
-- exact signature; the observer role is dropped only after that.
-- ============================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_residue int := 0;
BEGIN
  -- Drop the narrow harness helper first because it references observer
  -- functions; this avoids a dependency error when dropping observers.
  DROP FUNCTION IF EXISTS public.b1_harness_run_negative_case(uuid,text,text,text,text,text);

  DROP FUNCTION IF EXISTS public.b1_observer_auth_uid();
  DROP FUNCTION IF EXISTS public.b1_observer_auth_role();
  DROP FUNCTION IF EXISTS public.b1_observer_fixture_state();
  DROP FUNCTION IF EXISTS public.b1_observer_allowed_request_numbers();
  DROP FUNCTION IF EXISTS public.b1_observer_request_id_by_number(text);
  DROP FUNCTION IF EXISTS public.b1_observer_is_allowed_request(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_is_allowed_step(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_fingerprint();
  DROP FUNCTION IF EXISTS public.b1_observer_request_state(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_step_state(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_step_assignee_count(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_step_processing(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_step_direct_assignee_user_id(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_step_active_binding_count(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_transfer_scope(uuid);
  DROP FUNCTION IF EXISTS public.b1_observer_predecessors(uuid);

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_observer') THEN
    DROP ROLE b1_matrix_observer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'b1_matrix_observer') THEN
    v_residue := v_residue + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'b1_observer_%') THEN
    v_residue := v_residue + 1;
  END IF;

  IF v_residue <> 0 THEN
    RAISE EXCEPTION 'OBSERVER_CLEANUP_FAIL: residue = %', v_residue;
  END IF;

  RAISE NOTICE 'OBSERVER_CLEANUP_PASS: observer role and functions removed';
END $$;
