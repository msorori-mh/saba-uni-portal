-- =====================================================================
-- DRAFT MIGRATION — NOT YET APPLIED
-- Phase: STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING-SOURCE-ONLY-01
-- Location: docs/migration-drafts/ (INTENTIONALLY OUTSIDE supabase/migrations/)
-- Purpose: Close the workflow authorization bypass discovered in the
--          preceding audit (registrar/admin universal override in
--          user_matches_workflow_runtime_step, and dean role-only shortcut
--          in is_current_user_dean_for_student).
--
-- Design contract (see docs/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-IMPACT-AUDIT-01-REPORT.md):
--   Order of authorization checks, first non-null wins:
--     1. Direct user assignment on the runtime step (assigned_user_id).
--     2. Direct staff assignment  (assigned_staff_profile_id  -> staff_profiles.user_id).
--     3. Direct faculty assignment (assigned_faculty_profile_id -> faculty_profiles.user_id).
--     4. Direct position assignment (assigned_position_assignment_id -> position_assignments.user_id).
--     5. Fallback ONLY when no direct assignee was set: an ACTIVE
--        request_processing_assignments row whose (unit_id, role_id) match
--        the runtime step's (processing_unit_id, processing_role_id) AND
--        whose actor-linked user_id resolves to auth.uid().
--        - unit alone is NOT enough
--        - role alone is NOT enough
--        - staff cannot execute a faculty-only step and vice versa unless
--          they hold an independent matching request_processing_assignments row
--   On mismatch: RAISE 42501 in write paths.
--
-- Removed bypasses:
--   * is_current_user_registrar()      inside user_matches_workflow_runtime_step
--   * is_current_user_admin_actor()    inside user_matches_workflow_runtime_step
--   * has_any_role('dean')             inside is_current_user_dean_for_student
--   * broad "roles.includes(dean/registrar/admin)" fast paths in inbox RPC
--
-- Explicitly NOT included in this hardening (documented for follow-up):
--   * A separate admin override RPC (e.g. admin_force_workflow_step_transition)
--     with mandatory audit_logs entry — TO BE DESIGNED, NOT executed now.
--   * A separate admin read-only oversight RPC (e.g. get_admin_request_oversight_inbox)
--     to avoid contaminating the actor inbox with non-actionable rows.
--
-- This file MUST NOT be moved into supabase/migrations/ by this phase.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. user_matches_workflow_runtime_step: strict assignee match
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_has_direct_assignee boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 1. Direct user assignment
  IF v_step.assigned_user_id IS NOT NULL THEN
    RETURN v_step.assigned_user_id = v_uid;
  END IF;

  -- 2. Direct staff profile assignment
  IF v_step.assigned_staff_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = v_step.assigned_staff_profile_id
        AND sp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. Direct faculty profile assignment
  IF v_step.assigned_faculty_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.faculty_profiles fp
      WHERE fp.id = v_step.assigned_faculty_profile_id
        AND fp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 4. Direct position assignment
  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.position_assignments pa
      WHERE pa.id = v_step.assigned_position_assignment_id
        AND pa.user_id = v_uid
        AND pa.is_active = true
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- If a direct assignee was set but did not match, reject.
  IF v_has_direct_assignee THEN
    RETURN false;
  END IF;

  -- 5. Fallback: active processing assignment matching BOTH unit AND role
  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN
    -- Do not fall back on unit-only or role-only matching.
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments rpa
    LEFT JOIN public.staff_profiles    sp ON sp.id = rpa.staff_profile_id
    LEFT JOIN public.faculty_profiles  fp ON fp.id = rpa.faculty_profile_id
    LEFT JOIN public.position_assignments pa ON pa.id = rpa.position_assignment_id
    WHERE rpa.is_active = true
      AND (rpa.ends_at   IS NULL OR rpa.ends_at   > now())
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND rpa.unit_id = v_step.processing_unit_id
      AND rpa.role_id = v_step.processing_role_id
      AND (
        rpa.user_id = v_uid
        OR sp.user_id = v_uid
        OR fp.user_id = v_uid
        OR pa.user_id = v_uid
      )
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. is_current_user_dean_for_student: no global 'dean' role bypass.
--    Restrict to an active dean position assignment scoped to the
--    student's college (via department -> college).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_dean_for_student(p_student_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_student_department_id uuid;
BEGIN
  IF v_uid IS NULL OR p_student_profile_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT sp.department_id
  INTO v_student_department_id
  FROM public.student_profiles sp
  WHERE sp.id = p_student_profile_id;

  IF v_student_department_id IS NULL THEN
    -- Cannot prove college scope: refuse rather than widen.
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.position_assignments pa
    JOIN public.organizational_positions op ON op.id = pa.position_id
    JOIN public.departments d ON d.id = v_student_department_id
    WHERE pa.user_id = v_uid
      AND pa.is_active = true
      AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
      AND op.code = 'dean'
      AND (
        -- Scope: position tied to the student's department directly ...
        op.department_id = v_student_department_id
        -- ... or to the parent college of the student's department
        OR op.department_id = d.parent_department_id
      )
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. get_my_request_actor_inbox: remove universal registrar/admin
--    inclusion, and drive is_actionable through the strict check.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_request_actor_inbox(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  workflow_step_runtime_id uuid, student_request_id uuid,
  request_type_code text, request_type_name_ar text,
  student_id uuid, student_name text,
  department_id uuid, department_name_ar text,
  step_key text, step_name_ar text, step_status text,
  processing_unit_id uuid, processing_unit_name_ar text,
  processing_role_id uuid, processing_role_name_ar text,
  submitted_at timestamp with time zone, is_actionable boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_safe_limit integer;
  v_safe_offset integer;
  v_status_filter text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  v_safe_limit  := GREATEST(LEAST(COALESCE(p_limit,  50), 200), 1);
  v_safe_offset := GREATEST(COALESCE(p_offset, 0), 0);

  IF p_filters ? 'status' THEN
    SELECT array_agg(x::text) INTO v_status_filter
    FROM jsonb_array_elements_text(p_filters -> 'status') AS x;
  ELSE
    v_status_filter := ARRAY['pending', 'active'];
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    sr.id,
    sr.request_type,
    rt.name_ar,
    sp.id,
    sp.full_name_ar,
    sp.department_id,
    d.name_ar,
    s.step_key,
    s.step_name_ar,
    s.status,
    s.processing_unit_id,
    rpu.name_ar,
    s.processing_role_id,
    rpr.name_ar,
    sr.submitted_at,
    (
      s.status = 'active'
      AND public.can_current_user_act_on_step(s.id, 'approve')
    ) AS is_actionable
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests sr ON sr.id = s.student_request_id
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  LEFT JOIN public.departments d ON d.id = sp.department_id
  LEFT JOIN public.request_processing_units rpu ON rpu.id = s.processing_unit_id
  LEFT JOIN public.request_processing_roles rpr ON rpr.id = s.processing_role_id
  WHERE s.status = ANY(v_status_filter)
    -- STRICT visibility: only steps this user actually matches.
    -- Admin oversight belongs in a separate read-only RPC, not here.
    AND public.user_matches_workflow_runtime_step(s.id)
    AND (NOT (p_filters ? 'processing_unit_code') OR rpu.code = p_filters ->> 'processing_unit_code')
    AND (NOT (p_filters ? 'request_type_code')    OR sr.request_type = p_filters ->> 'request_type_code')
    AND (NOT (p_filters ? 'department_id')         OR sp.department_id::text = p_filters ->> 'department_id')
    AND (
      NOT (p_filters ? 'search')
      OR sr.request_number ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.full_name_ar    ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.academic_number ILIKE '%' || (p_filters ->> 'search') || '%'
    )
  ORDER BY COALESCE(sr.submitted_at, s.created_at) DESC, s.step_order ASC
  LIMIT v_safe_limit
  OFFSET v_safe_offset;
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. can_current_user_act_on_step: remove the admin skip shortcut so no
--    admin can silently step past assignments through act_on_student_request_step.
--    (Admin overrides, if ever needed, will be a separate audited RPC.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_valid_actor_request_action(p_action) THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.is_owner_of_request(v_uid, v_step.student_request_id) THEN
    RETURN false;
  END IF;

  -- Comment-on-completed remains gated by strict assignee match.
  IF v_step.status NOT IN ('active', 'pending') THEN
    IF p_action = 'comment' AND v_step.status = 'completed' THEN
      RETURN public.user_matches_workflow_runtime_step(p_step_id);
    END IF;
    RETURN false;
  END IF;

  -- Strict assignee match ALWAYS required (no admin/registrar bypass).
  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN
    RETURN false;
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;

  IF p_action = 'skip' THEN
    IF v_config.id IS NULL OR NOT COALESCE(v_config.can_skip, false) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_action = 'reject' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_reject, true) THEN
    RETURN false;
  END IF;

  IF p_action = 'return' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_return_to_student, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. issue_enrollment_certificate_from_workflow_step and
--    archive_enrollment_certificate_from_workflow_step already rely on
--    can_current_user_act_on_step at their entry point, so the strict
--    check above transitively covers document issuance and archive.
--    NO admin bypass paths exist in those functions post-hardening.
-- ---------------------------------------------------------------------

COMMIT;

-- =====================================================================
-- POST-APPROVAL FOLLOW-UP (separate migrations, NOT included here):
--   * admin_force_workflow_step_transition RPC with mandatory audit_logs.
--   * get_admin_request_oversight_inbox read-only RPC for admin oversight.
--   * Data remediation for historical unauthorized executions listed in
--     docs/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-IMPACT-AUDIT-01-REPORT.md
--     (out of scope for the hardening migration itself).
-- =====================================================================
