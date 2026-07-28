-- ============================================================================
-- B1-RUNTIME-ASSIGNEE-PROPAGATION-01
-- Forward-only. NOT APPLIED. Source-only draft.
--
-- Purpose
--   Generic fail-closed re-validation of the effective direct assignee at the
--   moment ANY B1 runtime step becomes 'active', regardless of which engine
--   performs the activation (act_on_b1_student_request_step_atomic,
--   apply_student_request_workflow_transition, specialized action RPCs,
--   or resubmit resume inside initialize_b1_request_workflow_strict).
--
--   Assignment identities are already resolved and stored at initialization
--   time by initialize_b1_request_workflow_strict (one identity per step,
--   department-scoped for the two department_transfer head steps). The
--   remaining gap is temporal: an assignment may be deactivated, ended,
--   re-scoped, duplicated, or detached between submit and activation, and no
--   engine re-checks it before flipping pending -> active. This migration
--   closes that gap.
--
-- Legacy impact
--   The guard is a strict no-op for every non-B1 request type, including
--   enrollment_certificate: the trigger function returns immediately when
--   is_b1_stored_request_type(request_type) is false. No legacy function,
--   policy, grant, or row is modified.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Effective-identity re-resolver (read-only, fail-closed)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical text;
  v_department_id uuid;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_count integer;
  v_assignment_id uuid;
BEGIN
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Legacy / non-B1: untouched behaviour.
  IF NOT public.is_b1_stored_request_type(v_request_type) THEN
    RETURN;
  END IF;

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  -- Department scope: source head resolves ONLY the head of
  -- current_department_id, target head ONLY the head of requested_department_id.
  IF v_canonical = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
    SELECT CASE v_step.step_key
             WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id
           END
      INTO v_department_id
    FROM public.transfer_request_details d
    WHERE d.request_id = v_step.student_request_id;
    IF v_department_id IS NULL THEN
      RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING:%', v_step.step_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Exactly one effective assignment for (unit, role, department scope).
  SELECT count(*) INTO v_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, v_count
      USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  -- Exactly one identity kind stored on the resolved assignment.
  IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
       v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_NOT_SINGULAR:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Exactly one identity kind stored on the runtime step.
  IF num_nonnulls(v_step.assigned_user_id, v_step.assigned_staff_profile_id,
       v_step.assigned_faculty_profile_id, v_step.assigned_position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, 0
      USING ERRCODE = '42501';
  END IF;

  -- Stored runtime identity must still equal the effective identity.
  IF v_step.assigned_user_id IS DISTINCT FROM v_assignment.user_id
     OR v_step.assigned_staff_profile_id IS DISTINCT FROM v_assignment.staff_profile_id
     OR v_step.assigned_faculty_profile_id IS DISTINCT FROM v_assignment.faculty_profile_id
     OR v_step.assigned_position_assignment_id IS DISTINCT FROM v_assignment.position_assignment_id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Provenance pin, when recorded at initialization.
  v_assignment_id := (v_step.metadata ->> 'direct_assignment_id')::uuid;
  IF v_assignment_id IS NOT NULL AND v_assignment_id IS DISTINCT FROM v_assignment.id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_PROVENANCE_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2. Activation guard trigger (generic, engine-agnostic)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_b1_runtime_step_assignee_effective(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_b1_runtime_step_activation
  ON public.student_request_workflow_steps;

-- Name is intentionally ordered AFTER trg_guard_b1_runtime_mutation_boundary
-- so the atomic-boundary guard still runs first.
CREATE TRIGGER trg_guard_b1_runtime_step_activation
BEFORE UPDATE OF status ON public.student_request_workflow_steps
FOR EACH ROW
WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
EXECUTE FUNCTION public.guard_b1_runtime_step_activation();

COMMIT;

-- ============================================================================
-- Fail-closed semantics
--   Any RAISE above aborts the whole calling transaction. Therefore:
--     * the predecessor step is NOT completed,
--     * no workflow event row is created,
--     * the active-step count stays exactly as it was (never 0, never >1),
--     * no partial mutation persists,
--     * a retry after the assignment data is corrected is idempotent.
--   Pre-existing 'pending' steps (including SR-20260727-88D885F0 steps 2 and 3)
--   are covered without any backfill: the guard runs at their activation.
-- ============================================================================
