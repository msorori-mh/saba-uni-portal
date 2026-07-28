-- READ ONLY
-- Post-verifier for B1 order 29 (RUNTIME_ASSIGNEE_PROPAGATION_01)
BEGIN;
DO $$
DECLARE v_def text;
BEGIN
  IF to_regprocedure('public.assert_b1_runtime_step_assignee_effective(uuid)') IS NULL THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assert_b1_runtime_step_assignee_effective missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_request_workflow_steps'::regclass
      AND tgname = 'trg_guard_b1_runtime_step_activation'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: activation guard trigger missing';
  END IF;

  v_def := pg_get_functiondef('public.assert_b1_runtime_step_assignee_effective(uuid)'::regprocedure);
  IF v_def NOT LIKE '%is_b1_stored_request_type%'
     OR v_def NOT LIKE '%B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE%'
     OR v_def NOT LIKE '%B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH%'
     OR v_def NOT LIKE '%current_department_id%'
     OR v_def NOT LIKE '%requested_department_id%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assignee assert contract incomplete';
  END IF;
  IF v_def ILIKE '%is_current_user_admin_actor%'
     OR v_def ILIKE '%is_current_user_registrar%'
     OR v_def ILIKE '%has_role(%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: role bypass detected in assignee assert';
  END IF;

  -- Lock contract must exist as real objects, not as comments.
  IF to_regprocedure('public.b1_assignment_scope_lock_key(uuid,uuid)') IS NULL
     OR to_regprocedure('public.b1_lock_assignment_scopes(bigint[])') IS NULL THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assignment scope lock primitive missing';
  END IF;
  IF pg_get_functiondef('public.b1_lock_assignment_scopes(bigint[])'::regprocedure)
       NOT LIKE '%pg_advisory_xact_lock%'
     OR pg_get_functiondef('public.b1_lock_assignment_scopes(bigint[])'::regprocedure)
       NOT LIKE '%ORDER BY k%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: scope lock is not an ordered transaction-scoped lock';
  END IF;
  IF v_def NOT LIKE '%b1_lock_assignment_scopes%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: activation path does not take the shared scope lock';
  END IF;
  -- Lock must be taken BEFORE the effective-assignment read (TOCTOU closure).
  IF position('b1_lock_assignment_scopes' in v_def)
     > position('FROM public.request_processing_assignments' in v_def) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: scope lock taken after the assignment read';
  END IF;
  -- Mutation side of the same contract.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.request_processing_assignments'::regclass
                   AND tgname = 'trg_b1_lock_processing_assignment_scope'
                   AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assignment mutation lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.position_assignments'::regclass
                   AND tgname = 'trg_b1_lock_position_assignment_scope'
                   AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: position assignment lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.transfer_request_details'::regclass
                   AND tgname = 'trg_b1_lock_transfer_department_scope'
                   AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: transfer department scope lock trigger missing';
  END IF;

  -- Every existing B1 runtime step still carries exactly one identity.
  IF EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
    WHERE public.is_b1_stored_request_type(r.request_type)
      AND num_nonnulls(s.assigned_user_id, s.assigned_staff_profile_id,
            s.assigned_faculty_profile_id, s.assigned_position_assignment_id) <> 1
  ) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: B1 runtime step without exactly one assignee';
  END IF;

  -- Exactly one active step per non-terminal B1 request.
  IF EXISTS (
    SELECT 1
    FROM public.student_requests r
    JOIN public.student_request_workflow_steps s ON s.student_request_id = r.id
    WHERE public.is_b1_stored_request_type(r.request_type)
      AND r.status IN ('submitted','in_review')
    GROUP BY r.id
    HAVING count(*) FILTER (WHERE s.status = 'active') <> 1
  ) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: active-step invariant broken';
  END IF;
END $$;
ROLLBACK;
