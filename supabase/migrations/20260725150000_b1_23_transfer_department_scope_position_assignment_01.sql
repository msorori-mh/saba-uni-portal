-- SOURCE PROMOTION (not applied).
-- Track: PORTAL-B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01 / order 23
-- Source draft: docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql
-- DO NOT apply from CI. Manual reviewed apply only.

-- B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01
-- FORWARD-ONLY DRAFT. SOURCE ONLY. DO NOT APPLY WITHOUT SEPARATE APPROVAL.
--
-- Closes the authorization gap exposed by integrated runtime E2E:
-- submit_b1 / initialize_b1_workflow_runtime require position_assignment for
-- source/target department_head steps, but current_user_matches_transfer_department_scope
-- still matched only assigned_faculty_profile_id (faculty path), denying the
-- legitimate direct position assignee.
--
-- Body aligned with DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01 function
-- contract (position_assignment + department-scoped processing assignment),
-- without production-specific data postchecks.

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.current_user_matches_transfer_department_scope(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'B1_TRANSFER_SCOPE_PREREQUISITE_MISSING';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid,
  p_step_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    SELECT count(*) = 1
    FROM public.student_request_workflow_steps s
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
      AND pa.user_id = auth.uid()
      AND pa.is_active
      AND pa.assigned_from <= CURRENT_DATE
      AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id = pa.id
      AND rpa.assignment_type = 'position_assignment'
      AND rpa.is_active
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = s.processing_unit_id
      AND rpa.role_id = s.processing_role_id
    WHERE s.id = p_step_id
      AND s.step_key = p_step_key
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND (
        (p_step_key = 'source_department_head_approval'
          AND rpa.department_id = d.current_department_id)
        OR (p_step_key = 'target_department_head_approval'
          AND rpa.department_id = d.requested_department_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text)
  TO authenticated, service_role;

DO $post$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(
    'public.current_user_matches_transfer_department_scope(uuid,text)'::regprocedure
  ) INTO v_body;
  IF position('assigned_position_assignment_id' IN v_body) = 0
     OR position('faculty_profiles' IN v_body) > 0 THEN
    RAISE EXCEPTION 'B1_TRANSFER_SCOPE_FUNCTION_CONTRACT_MISMATCH';
  END IF;
  IF has_function_privilege(
       'anon',
       'public.current_user_matches_transfer_department_scope(uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'B1_TRANSFER_SCOPE_ANON_EXECUTE_FORBIDDEN';
  END IF;
END;
$post$;

COMMIT;
