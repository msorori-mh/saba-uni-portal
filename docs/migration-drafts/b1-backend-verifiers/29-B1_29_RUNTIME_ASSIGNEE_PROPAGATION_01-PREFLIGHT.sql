-- READ ONLY
-- Preflight for B1 order 29 (RUNTIME_ASSIGNEE_PROPAGATION_01)
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.is_valid_b1_direct_assignment(uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: is_valid_b1_direct_assignment missing for order 29';
  END IF;
  IF to_regprocedure('public.is_b1_stored_request_type(text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: is_b1_stored_request_type missing for order 29';
  END IF;
  IF to_regprocedure('public.initialize_b1_request_workflow_strict(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: initialize_b1_request_workflow_strict missing for order 29';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_request_workflow_steps'::regclass
      AND tgname = 'trg_guard_b1_runtime_mutation_boundary'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: atomic boundary guard missing for order 29';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_request_workflow_steps'::regclass
      AND tgname = 'trg_guard_b1_runtime_step_activation'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: order 29 already applied';
  END IF;
  IF to_regprocedure('public.b1_lock_assignment_scopes(bigint[])') IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: order 29 already applied';
  END IF;
  -- Tables carrying the mutation side of the lock contract must exist.
  IF to_regclass('public.request_processing_assignments') IS NULL
     OR to_regclass('public.position_assignments') IS NULL
     OR to_regclass('public.transfer_request_details') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: lock contract tables missing for order 29';
  END IF;
END $$;
ROLLBACK;
