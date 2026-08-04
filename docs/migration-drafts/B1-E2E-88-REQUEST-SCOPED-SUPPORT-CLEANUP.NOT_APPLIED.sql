-- B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP
-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- NOT_APPLIED. Explicit operator invocation only after dual review.
--
-- Closes E2E executions, deactivates bindings, restores runtime assignees,
-- preserves request + audit evidence, never touches request_processing_assignments,
-- never touches the 19 authoritative fixtures, never mutates student_visible.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.cleanup_b1_e2e_88_package(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_RPC_MISSING';
  END IF;
END;
$pre$;

-- Close every open execution and deactivate bindings (preserve evidence tables).
SELECT public.cleanup_b1_e2e_88_package(NULL, true);

-- Optional fingerprint asserts (read-only). Operator fills expected digests.
DO $assert$
DECLARE
  v_rpa bigint;
  v_fix bigint;
  v_vis_five bigint;
  v_vis_enroll boolean;
BEGIN
  SELECT count(*) INTO v_rpa
  FROM public.request_processing_assignments
  WHERE is_active;

  SELECT count(*) INTO v_fix
  FROM public.student_requests
  WHERE request_number LIKE 'SR-20260801-13%';

  SELECT count(*) INTO v_vis_five
  FROM public.request_types
  WHERE code IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) AND student_visible IS DISTINCT FROM false;

  SELECT student_visible INTO v_vis_enroll
  FROM public.request_types
  WHERE code = 'enrollment_certificate';

  IF v_fix IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_FIXTURE_DRIFT:%', v_fix;
  END IF;
  IF v_vis_five <> 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_VISIBILITY_DRIFT';
  END IF;
  IF v_vis_enroll IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1_E2E_88_CLEANUP_ENROLLMENT_VISIBILITY_DRIFT';
  END IF;

  RAISE NOTICE 'B1_E2E_88_CLEANUP_FINGERPRINT rpa_active=% fixtures=%', v_rpa, v_fix;
END;
$assert$;

-- NOTE: Restoring pre-package function bodies is a separate forward-only
-- migration and is intentionally not included here.

COMMIT;
