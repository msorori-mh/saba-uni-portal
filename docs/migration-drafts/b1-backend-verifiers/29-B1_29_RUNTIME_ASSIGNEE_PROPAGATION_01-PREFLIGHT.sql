-- READ ONLY
-- Preflight for B1 order 29 (RUNTIME_ASSIGNEE_PROPAGATION_01)
-- Global identity-boundary lock revision.
BEGIN;
DO $$
DECLARE v_tbl text;
BEGIN
  -- Required predecessors.
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

  -- Every table carrying the mutation side of the lock contract must exist.
  FOREACH v_tbl IN ARRAY ARRAY[
    'public.request_processing_assignments',
    'public.position_assignments',
    'public.staff_profiles',
    'public.faculty_profiles',
    'public.transfer_request_details'
  ] LOOP
    IF to_regclass(v_tbl) IS NULL THEN
      RAISE EXCEPTION 'PREFLIGHT_FAIL: lock contract table % missing for order 29', v_tbl;
    END IF;
  END LOOP;

  -- Columns the profile triggers name must exist with those exact names.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_profiles'
                   AND column_name IN ('user_id','status') GROUP BY table_name
                 HAVING count(*) = 2) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: staff_profiles identity columns missing for order 29';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='faculty_profiles'
                   AND column_name IN ('user_id','status','department_id') GROUP BY table_name
                 HAVING count(*) = 3) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: faculty_profiles identity columns missing for order 29';
  END IF;

  -- Double-apply protection (final revision objects).
  IF to_regprocedure('public.b1_assignment_identity_lock_key()') IS NOT NULL
     OR to_regprocedure('public.b1_lock_assignment_identity_boundary()') IS NOT NULL
     OR to_regprocedure('public.b1_lock_assignment_identity_row()') IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: order 29 already applied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_request_workflow_steps'::regclass
      AND tgname = 'trg_guard_b1_runtime_step_activation'
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: order 29 already applied';
  END IF;

  -- Stale / partial earlier revision (scoped-key design) must be detected too.
  IF to_regprocedure('public.b1_assignment_scope_lock_key(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.b1_lock_assignment_scopes(bigint[])') IS NOT NULL
     OR to_regprocedure('public.b1_lock_processing_assignment_scope()') IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: incomplete earlier revision of order 29 detected';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname IN ('trg_b1_lock_processing_assignment_scope',
                     'trg_b1_lock_position_assignment_scope',
                     'trg_b1_lock_staff_profile_identity',
                     'trg_b1_lock_staff_profile_identity_delete',
                     'trg_b1_lock_faculty_profile_identity',
                     'trg_b1_lock_faculty_profile_identity_delete',
                     'trg_b1_lock_transfer_department_scope')
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: incomplete earlier revision of order 29 detected';
  END IF;
END $$;
ROLLBACK;
