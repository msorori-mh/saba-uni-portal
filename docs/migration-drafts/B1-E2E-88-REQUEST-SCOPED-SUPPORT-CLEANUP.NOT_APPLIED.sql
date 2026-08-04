-- B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP / DECOMMISSION
-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- NOT_APPLIED. Explicit operator invocation only after dual review.
--
-- Distinguishes:
--   A) Operational cleanup  — close executions, CAS-restore assignees, disable bindings,
--      preserve TEST_ONLY requests + append-only audit evidence.
--   B) Package decommission — restore pre-package production function bodies from
--      base 092ba053d8a0ede536b619c0ff01c39a5ca9ba0a, revoke operational entry points,
--      refuse when open executions / active bindings / CAS drift / fingerprint drift.
--
-- Never touches: request_processing_assignments, 19 fixtures, student_visible,
-- enrollment_certificate.

BEGIN;

DO $pre$
DECLARE
  v_open bigint;
  v_active bigint;
BEGIN
  IF to_regprocedure('public.cleanup_b1_e2e_88_package(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_RPC_MISSING';
  END IF;

  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL AND expires_at > now();

  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings
  WHERE active;

  -- Operational cleanup may run with open executions (it closes them).
  -- Decommission section below refuses unless both are zero after cleanup.
  RAISE NOTICE 'B1_E2E_88_CLEANUP_PREFLIGHT open=% active=%', v_open, v_active;
END;
$pre$;

-- ---------------------------------------------------------------------------
-- A) Operational cleanup (CAS-validated)
-- ---------------------------------------------------------------------------
SELECT public.cleanup_b1_e2e_88_package(NULL, true);

DO $assert_ops$
DECLARE
  v_open bigint;
  v_active bigint;
  v_rpa bigint;
  v_fix bigint;
  v_vis_five bigint;
  v_vis_enroll boolean;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;

  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings
  WHERE active;

  IF v_open <> 0 OR v_active <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_STILL_ACTIVE open=% active=%', v_open, v_active;
  END IF;

  SELECT count(*) INTO v_rpa FROM public.request_processing_assignments WHERE is_active;
  SELECT count(*) INTO v_fix
  FROM public.student_requests WHERE request_number LIKE 'SR-20260801-13%';
  SELECT count(*) INTO v_vis_five FROM public.request_types
  WHERE code IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;
  SELECT student_visible INTO v_vis_enroll
  FROM public.request_types WHERE code = 'enrollment_certificate';

  IF v_fix IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_FIXTURE_DRIFT:%', v_fix;
  END IF;
  IF v_vis_five <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_VISIBILITY_DRIFT';
  END IF;
  IF v_vis_enroll IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_ENROLLMENT_VISIBILITY_DRIFT';
  END IF;

  RAISE NOTICE 'B1_E2E_88_OPS_CLEANUP_OK rpa_active=% fixtures=%', v_rpa, v_fix;
END;
$assert_ops$;

-- ---------------------------------------------------------------------------
-- B) Package decommission (optional second phase — still NOT_APPLIED)
-- Restore exact pre-package function definitions from base lineage migrations:
--   create_student_request              ← 20260710140000_student_request_types_rpc_rls.sql
--   user_matches_workflow_runtime_step  ← 20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql
--   current_user_matches_transfer_dept  ← 20260727065220_7419d7c9-9a04-49a4-a2ae-935ad100ba03.sql
--   can_current_user_act_on_step        ← 20260727072354_608688a7-56dd-460a-9e6e-ead8f23d934a.sql
-- Operator must paste those CREATE OR REPLACE bodies verbatim from
-- git show 092ba053:<path> before executing this phase.
-- ---------------------------------------------------------------------------
DO $decommission_guard$
DECLARE
  v_open bigint;
  v_active bigint;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.b1_e2e_88_executions
  WHERE status = 'active' AND closed_at IS NULL;
  SELECT count(*) INTO v_active
  FROM public.b1_e2e_88_actor_bindings
  WHERE active;

  IF v_open <> 0 OR v_active <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_DECOMMISSION_REFUSED_OPEN_STATE open=% active=%', v_open, v_active;
  END IF;

  -- Evidence remains in b1_e2e_88_audit_events (append-only) and TEST_ONLY requests.
  -- Operational entry points are revoked (not dropped) so audit helpers stay readable
  -- by service_role while client execute stays denied.
  REVOKE ALL ON FUNCTION public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.close_b1_e2e_88_execution(uuid,text)
    FROM PUBLIC, anon, authenticated, service_role;
  -- cleanup remains service_role-callable only if re-granted by a later mandate.

  RAISE NOTICE 'B1_E2E_88_DECOMMISSION_ENTRYPOINTS_REVOKED';
  RAISE NOTICE 'B1_E2E_88_DECOMMISSION_FUNCTION_RESTORE_REQUIRED_FROM_BASE_092ba053';
END;
$decommission_guard$;

COMMIT;
