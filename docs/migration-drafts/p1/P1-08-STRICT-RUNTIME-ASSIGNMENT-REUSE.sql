-- =====================================================================
-- P1-08 — STRICT RUNTIME ASSIGNMENT REUSE
-- MISSION: PORTAL_REFORM_P1_STRICT_RUNTIME_ASSIGNMENT_REUSE_SOURCE_CLOSURE_08A
-- MODE: SOURCE_ONLY DRAFT — DO NOT APPLY IN THIS MISSION.
--
-- Scope (only the direct-assignment initialization blocker found after P1-07):
--   * EXTEND the existing strict initializer
--       public.initialize_b1_request_workflow_strict(uuid, text)
--     so it can also initialize exactly:
--       october_exam_entry_form | replacement_student_card | grade_appeal
--     No initialize_p1_request_workflow_* is created.
--   * Route the P1 atomic submit path through that same strict initializer.
--   * Department-scope the grade-appeal department_head steps from the
--     appealed course context.
--   * Bind grade_appeal/instructor_review to the authoritative section
--     instructor (course_sections.faculty_profile_id) — contextual EXACT
--     assignment, never a role pool.
--   * Forward-repair ONLY the three existing TEST_ONLY P1 runtimes.
--
-- NOT created: new engine, new runtime table, parallel authz system,
-- role-pool bypass, admin/system_admin bypass, arbitrary fallback.
-- B1 semantics are unchanged except behind explicitly P1-gated branches.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Canonical P1 runtime contract pinning (reuses the B1 snapshot table)
-- ---------------------------------------------------------------------
INSERT INTO public.b1_workflow_runtime_contract_snapshot(
  workflow_id, request_type_code, workflow_version, step_key, step_order,
  unit_code, role_code, action_type, action_code
)
SELECT w.id, rt.code, COALESCE(w.version, 1), c.step_key, c.step_order,
       u.code, r.code, c.action_type, c.action_type
FROM public.request_types rt
JOIN public.request_type_workflows w
  ON w.request_type_id = rt.id AND w.status = 'active' AND w.is_active = true
JOIN public.request_type_workflow_steps c ON c.workflow_id = w.id
JOIN public.request_processing_units u ON u.id = c.processing_unit_id
JOIN public.request_processing_roles r ON r.id = c.processing_role_id AND r.unit_id = u.id
WHERE rt.code IN ('october_exam_entry_form','replacement_student_card','grade_appeal')
  AND NOT EXISTS (
    SELECT 1 FROM public.b1_workflow_runtime_contract_snapshot s
    WHERE s.workflow_id = w.id AND s.step_key = c.step_key
  );

-- Configured contract only. No legacy shape fallback for P1.
INSERT INTO public.service_platform_runtime_flags(service_code, legacy_fallback_enabled)
SELECT x.code, false
FROM (VALUES ('october_exam_entry_form'),('replacement_student_card'),('grade_appeal')) AS x(code)
ON CONFLICT (service_code) DO UPDATE SET legacy_fallback_enabled = false, updated_at = now();

-- ---------------------------------------------------------------------
-- 1. Authoritative grade-appeal context resolvers
-- ---------------------------------------------------------------------

-- Department derived from the appealed course, never from the student
-- profile and never from an unrelated/general department head.
CREATE OR REPLACE FUNCTION public.p1_grade_appeal_department(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.department_id
  FROM public.grade_appeal_details gad
  JOIN public.course_sections cs ON cs.id = gad.course_section_id
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  WHERE gad.request_id = p_request_id;
$function$;

-- Authoritative instructor of the appealed section (validated actor).
CREATE OR REPLACE FUNCTION public.p1_grade_appeal_section_faculty(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cs.faculty_profile_id
  FROM public.grade_appeal_details gad
  JOIN public.course_sections cs ON cs.id = gad.course_section_id
  JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
  WHERE gad.request_id = p_request_id
    AND cs.faculty_profile_id IS NOT NULL
    AND fp.status = 'active'
    AND fp.user_id IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.p1_grade_appeal_section_id(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT gad.course_section_id FROM public.grade_appeal_details gad
  WHERE gad.request_id = p_request_id;
$function$;

-- Single place that decides whether a runtime step is department-scoped.
CREATE OR REPLACE FUNCTION public.p1_runtime_step_department_scope(
  p_canonical_code text, p_step_key text, p_request_id uuid
) RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_canonical_code = 'grade_appeal'
     AND p_step_key IN ('department_head_review','academic_decision')
    THEN public.p1_grade_appeal_department(p_request_id)
    ELSE NULL::uuid
  END;
$function$;

-- The single contextual exception: grade_appeal / instructor_review.
CREATE OR REPLACE FUNCTION public.p1_step_is_contextual_instructor(
  p_canonical_code text, p_step_key text, p_unit_code text, p_role_code text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT p_canonical_code = 'grade_appeal'
     AND p_step_key = 'instructor_review'
     AND p_unit_code = 'department'
     AND p_role_code = 'course_instructor';
$function$;

-- Authorization side of the contextual exception.
-- auth.uid() = assigned faculty profile user_id = current section instructor.
CREATE OR REPLACE FUNCTION public.p1_current_user_is_appeal_section_instructor(p_step_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
    JOIN public.grade_appeal_details gad ON gad.request_id = s.student_request_id
    JOIN public.course_sections cs ON cs.id = gad.course_section_id
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    JOIN public.request_processing_units u ON u.id = s.processing_unit_id
    JOIN public.request_processing_roles pr ON pr.id = s.processing_role_id AND pr.unit_id = u.id
    WHERE s.id = p_step_id
      AND r.request_type = 'grade_appeal'
      AND s.step_key = 'instructor_review'
      AND u.code = 'department'
      AND pr.code = 'course_instructor'
      AND s.assigned_faculty_profile_id IS NOT NULL
      AND s.assigned_faculty_profile_id = cs.faculty_profile_id
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_position_assignment_id IS NULL
      AND fp.status = 'active'
      AND fp.user_id = auth.uid()
      AND (s.metadata->>'assignment_source') = 'course_section_faculty'
      AND (s.metadata->>'course_section_id')::uuid = cs.id
  );
$function$;

-- Department scope check for the appeal department-head steps.
CREATE OR REPLACE FUNCTION public.p1_current_user_matches_appeal_department_scope(p_step_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    SELECT count(*) = 1
    FROM public.student_request_workflow_steps s
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
      AND rpa.department_id = public.p1_grade_appeal_department(s.student_request_id)
    WHERE s.id = p_step_id
      AND s.step_key IN ('department_head_review','academic_decision')
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
  );
$function$;

-- ---------------------------------------------------------------------
-- 2. EXTEND the existing strict initializer (no new initializer)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_b1_request_workflow_strict(
  p_request_id uuid, p_canonical_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.student_requests%ROWTYPE;
  v_request_type_id uuid;
  v_workflow public.request_type_workflows%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_assignment_count integer;
  v_actor_count integer;
  v_runtime_count integer;
  v_returned_count integer;
  v_first_order integer;
  v_department_id uuid;
  v_unit_code text;
  v_role_code text;
  v_active_step_id uuid;
  v_inserted_step_id uuid;
  v_is_p1 boolean := false;
  v_contextual boolean := false;
  v_faculty_profile_id uuid;
  v_section_id uuid;
BEGIN
  PERFORM set_config('b1.atomic_init','1',true);
  LOCK TABLE public.request_processing_assignments IN SHARE MODE;
  LOCK TABLE public.request_type_workflows, public.request_type_workflow_steps IN SHARE MODE;
  SELECT r.* INTO v_request
  FROM public.student_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  v_is_p1 := public.p1_is_atomic_submit_service(p_canonical_code);

  IF NOT v_is_p1 AND p_canonical_code NOT IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) THEN RAISE EXCEPTION 'B1_CANONICAL_CODE_REQUIRED' USING ERRCODE='22023'; END IF;

  IF (CASE v_request.request_type
       WHEN 'absence_excuse' THEN 'excused_absence'
       WHEN 'transfer' THEN 'department_transfer'
       WHEN 'extra_chance' THEN 'final_chance'
       ELSE v_request.request_type
     END) IS DISTINCT FROM p_canonical_code THEN
    RAISE EXCEPTION 'B1_REQUEST_TYPE_MISMATCH' USING ERRCODE='42501';
  END IF;

  SELECT count(*), (array_agg(rt.id ORDER BY rt.id))[1]
    INTO v_assignment_count, v_request_type_id
  FROM public.request_types rt
  WHERE rt.code = v_request.request_type AND rt.is_active = true;
  IF v_assignment_count <> 1 THEN
    RAISE EXCEPTION 'B1_ACTIVE_REQUEST_TYPE_MUST_RESOLVE_ONCE:%', v_assignment_count;
  END IF;

  SELECT count(*) INTO v_assignment_count
  FROM public.request_type_workflows w
  WHERE w.request_type_id = v_request_type_id AND w.status='active' AND w.is_active=true;
  IF v_assignment_count <> 1 THEN
    RAISE EXCEPTION 'B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:%', v_assignment_count;
  END IF;
  SELECT w.* INTO v_workflow FROM public.request_type_workflows w
  WHERE w.request_type_id=v_request_type_id AND w.status='active' AND w.is_active=true
  FOR SHARE;

  SELECT count(*), count(*) FILTER (WHERE status='returned')
    INTO v_runtime_count, v_returned_count
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=p_request_id;

  IF v_runtime_count > 0 THEN
    IF v_request.status NOT IN ('returned','returned_for_completion') OR v_returned_count <> 1
       OR EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                  WHERE s.student_request_id=p_request_id AND s.status='active') THEN
      RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_STATE_INVALID';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps s
      LEFT JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
      LEFT JOIN public.request_processing_units u ON u.id=s.processing_unit_id
      LEFT JOIN public.request_processing_roles r ON r.id=s.processing_role_id AND r.unit_id=u.id
      LEFT JOIN public.request_processing_assignments a
        ON a.id=(s.metadata->>'direct_assignment_id')::uuid
      WHERE s.student_request_id=p_request_id AND (
        c.id IS NULL OR u.id IS NULL OR r.id IS NULL
        OR s.workflow_id IS DISTINCT FROM v_workflow.id
        OR c.workflow_id IS DISTINCT FROM v_workflow.id
        OR s.step_key IS DISTINCT FROM c.step_key
        OR s.step_order IS DISTINCT FROM c.step_order
        OR NOT public.b1_runtime_step_contract_ok(p_canonical_code,s.workflow_id,s.step_key,u.code,r.code,c.action_type)
        OR num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,s.assigned_faculty_profile_id,
             s.assigned_position_assignment_id)<>1
        OR (
          -- P1 contextual instructor step: authoritative section instructor,
          -- no generic request_processing_assignments row exists by design.
          CASE WHEN public.p1_step_is_contextual_instructor(p_canonical_code,s.step_key,u.code,r.code)
            THEN (
              s.assigned_faculty_profile_id IS DISTINCT FROM
                public.p1_grade_appeal_section_faculty(p_request_id)
              OR (s.metadata->>'assignment_source') IS DISTINCT FROM 'course_section_faculty'
            )
          ELSE (
            s.assigned_user_id IS DISTINCT FROM a.user_id
            OR s.assigned_staff_profile_id IS DISTINCT FROM a.staff_profile_id
            OR s.assigned_faculty_profile_id IS DISTINCT FROM a.faculty_profile_id
            OR s.assigned_position_assignment_id IS DISTINCT FROM a.position_assignment_id
            OR NOT public.is_valid_b1_direct_assignment((s.metadata->>'direct_assignment_id')::uuid,
                 CASE WHEN s.step_key='source_department_head_approval' THEN
                   (SELECT d.current_department_id FROM public.transfer_request_details d WHERE d.request_id=p_request_id)
                 WHEN s.step_key='target_department_head_approval' THEN
                   (SELECT d.requested_department_id FROM public.transfer_request_details d WHERE d.request_id=p_request_id)
                 ELSE public.p1_runtime_step_department_scope(p_canonical_code,s.step_key,p_request_id) END,
                 false)
          ) END
        )
        OR (s.step_key IN ('source_department_head_approval','target_department_head_approval')
          AND (a.assignment_type IS DISTINCT FROM 'position_assignment'
            OR a.position_assignment_id IS NULL
            OR a.user_id IS NOT NULL OR a.staff_profile_id IS NOT NULL OR a.faculty_profile_id IS NOT NULL))
      )) THEN RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_CONTRACT_INVALID'; END IF;
    IF v_runtime_count IS DISTINCT FROM (
      SELECT count(*) FROM public.request_type_workflow_steps c WHERE c.workflow_id=v_workflow.id
    ) OR EXISTS (
      SELECT 1 FROM public.request_type_workflow_steps c
      WHERE c.workflow_id=v_workflow.id AND NOT EXISTS (
        SELECT 1 FROM public.student_request_workflow_steps s
        WHERE s.student_request_id=p_request_id AND s.workflow_step_id=c.id
          AND s.step_key=c.step_key AND s.step_order=c.step_order
      )
    ) THEN RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_COVERAGE_INVALID'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps returned_step
      JOIN public.student_request_workflow_steps other
        ON other.student_request_id=returned_step.student_request_id AND other.id<>returned_step.id
      WHERE returned_step.student_request_id=p_request_id AND returned_step.status='returned'
        AND ((other.step_order<returned_step.step_order AND other.status NOT IN ('completed','skipped'))
          OR (other.step_order>returned_step.step_order AND other.status IS DISTINCT FROM 'pending')
          OR other.status IN ('rejected','cancelled'))
    ) THEN RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_SEQUENCE_INVALID'; END IF;
    UPDATE public.student_request_workflow_steps
    SET status='active', entered_at=now(),completed_at=NULL,completed_by=NULL,
      decision=NULL,comment=NULL,updated_at=now()
    WHERE student_request_id=p_request_id AND status='returned'
    RETURNING id INTO v_active_step_id;
    RETURN jsonb_build_object('initialized',false,'resumed',true,'active_step_id',v_active_step_id);
  END IF;

  SELECT min(s.step_order) INTO v_first_order
  FROM public.request_type_workflow_steps s WHERE s.workflow_id=v_workflow.id;
  IF v_first_order IS NULL THEN RAISE EXCEPTION 'B1_WORKFLOW_HAS_NO_STEPS'; END IF;

  FOR v_config IN
    SELECT s.* FROM public.request_type_workflow_steps s
    WHERE s.workflow_id=v_workflow.id ORDER BY s.step_order FOR SHARE
  LOOP
    SELECT u.code, r.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles r ON r.id=v_config.processing_role_id AND r.unit_id=u.id
    WHERE u.id=v_config.processing_unit_id AND u.is_active=true AND r.is_active=true;
    IF NOT FOUND OR NOT public.b1_runtime_step_contract_ok(
      p_canonical_code,v_workflow.id,v_config.step_key,v_unit_code,v_role_code,v_config.action_type
    ) THEN RAISE EXCEPTION 'B1_WORKFLOW_STEP_CONTRACT_INVALID:%',v_config.step_key; END IF;

    v_department_id := NULL;
    IF p_canonical_code='department_transfer'
       AND v_config.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
      SELECT CASE v_config.step_key WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id END INTO v_department_id
      FROM public.transfer_request_details d WHERE d.request_id=p_request_id FOR SHARE;
      IF v_department_id IS NULL THEN RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING'; END IF;
    ELSIF v_is_p1 THEN
      v_department_id := public.p1_runtime_step_department_scope(
        p_canonical_code, v_config.step_key, p_request_id);
      IF p_canonical_code='grade_appeal'
         AND v_config.step_key IN ('department_head_review','academic_decision')
         AND v_department_id IS NULL THEN
        RAISE EXCEPTION 'P1_APPEAL_DEPARTMENT_SCOPE_MISSING:%', v_config.step_key;
      END IF;
    END IF;

    -- ---- P1 contextual EXACT assignment (single permitted exception) ----
    v_contextual := v_is_p1 AND public.p1_step_is_contextual_instructor(
      p_canonical_code, v_config.step_key, v_unit_code, v_role_code);

    IF v_contextual THEN
      v_faculty_profile_id := public.p1_grade_appeal_section_faculty(p_request_id);
      v_section_id := public.p1_grade_appeal_section_id(p_request_id);
      IF v_faculty_profile_id IS NULL OR v_section_id IS NULL THEN
        RAISE EXCEPTION 'P1_SECTION_INSTRUCTOR_CONTEXT_MISSING:%', v_config.step_key;
      END IF;

      INSERT INTO public.student_request_workflow_steps(
        student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,
        processing_unit_id,processing_role_id,assigned_user_id,assigned_staff_profile_id,
        assigned_faculty_profile_id,assigned_position_assignment_id,status,entered_at,metadata
      ) VALUES (
        p_request_id,v_workflow.id,v_config.id,v_config.step_key,v_config.step_name_ar,v_config.step_order,
        v_config.processing_unit_id,v_config.processing_role_id,NULL,NULL,
        v_faculty_profile_id,NULL,
        CASE WHEN v_config.step_order=v_first_order THEN 'active' ELSE 'pending' END,
        CASE WHEN v_config.step_order=v_first_order THEN now() ELSE NULL END,
        jsonb_build_object(
          'action_type',v_config.action_type,
          'assignment_source','course_section_faculty',
          'course_section_id',v_section_id,
          'faculty_profile_id',v_faculty_profile_id)
      ) RETURNING id INTO v_inserted_step_id;
      IF v_config.step_order=v_first_order THEN v_active_step_id:=v_inserted_step_id; END IF;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_assignment_count
    FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)
      AND (v_department_id IS NULL OR (
        a.assignment_type='position_assignment' AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));
    IF v_assignment_count <> 1 THEN
      RAISE EXCEPTION 'B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:%:%',v_config.step_key,v_assignment_count;
    END IF;
    SELECT a.* INTO v_assignment FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)
      AND (v_department_id IS NULL OR (
        a.assignment_type='position_assignment' AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL))
    FOR SHARE;
    v_actor_count := num_nonnulls(v_assignment.user_id,v_assignment.staff_profile_id,
      v_assignment.faculty_profile_id,v_assignment.position_assignment_id);
    IF v_actor_count <> 1 THEN RAISE EXCEPTION 'B1_EXACTLY_ONE_DIRECT_ASSIGNEE_REQUIRED'; END IF;

    INSERT INTO public.student_request_workflow_steps(
      student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,
      processing_unit_id,processing_role_id,assigned_user_id,assigned_staff_profile_id,
      assigned_faculty_profile_id,assigned_position_assignment_id,status,entered_at,metadata
    ) VALUES (
      p_request_id,v_workflow.id,v_config.id,v_config.step_key,v_config.step_name_ar,v_config.step_order,
      v_config.processing_unit_id,v_config.processing_role_id,v_assignment.user_id,v_assignment.staff_profile_id,
      v_assignment.faculty_profile_id,v_assignment.position_assignment_id,
      CASE WHEN v_config.step_order=v_first_order THEN 'active' ELSE 'pending' END,
      CASE WHEN v_config.step_order=v_first_order THEN now() ELSE NULL END,
      jsonb_build_object('action_type',v_config.action_type,'direct_assignment_id',v_assignment.id)
    ) RETURNING id INTO v_inserted_step_id;
    IF v_config.step_order=v_first_order THEN v_active_step_id:=v_inserted_step_id; END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.student_request_workflow_steps s
      WHERE s.student_request_id=p_request_id AND s.status='active') <> 1 THEN
    RAISE EXCEPTION 'B1_EXACTLY_ONE_ACTIVE_STEP_REQUIRED';
  END IF;

  -- ZERO_UNASSIGNED_FUTURE_RUNTIME: every runtime row must carry exactly one
  -- assignee. Anything else rolls the whole submission back.
  IF EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id=p_request_id
      AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
        s.assigned_faculty_profile_id,s.assigned_position_assignment_id) <> 1
  ) THEN RAISE EXCEPTION 'B1_EXACTLY_ONE_DIRECT_ASSIGNEE_REQUIRED'; END IF;

  RETURN jsonb_build_object('initialized',true,'resumed',false,'workflow_id',v_workflow.id,
    'active_step_id',v_active_step_id);
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. Future P1 submit initialization goes through the strict initializer
-- ---------------------------------------------------------------------
-- Only the workflow-initialization tail of submit_student_request_with_details
-- changes; every eligibility/detail branch stays byte-identical to P1-06.
DO $do$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='submit_student_request_with_details';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1_08_SUBMIT_FUNCTION_MISSING';
  END IF;
  IF position('public.initialize_student_request_workflow(v_request_id)' in v_src) = 0 THEN
    IF position('public.initialize_b1_request_workflow_strict(v_request_id' in v_src) > 0 THEN
      RETURN; -- already migrated (idempotent re-apply)
    END IF;
    RAISE EXCEPTION 'P1_08_SUBMIT_INIT_CALLSITE_NOT_FOUND';
  END IF;

  v_new := replace(
    v_src,
    'public.initialize_student_request_workflow(v_request_id)',
    'public.initialize_b1_request_workflow_strict(v_request_id, v_type.code)'
  );
  EXECUTE v_new;
END
$do$;

-- ---------------------------------------------------------------------
-- 4. Authorization: department scope + contextual instructor binding
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  v_src text;
  v_new text;
  v_binding_old text;
  v_binding_new text;
  v_scope_old text;
  v_scope_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='can_current_user_act_on_step';
  IF v_src IS NULL THEN RAISE EXCEPTION 'P1_08_CAN_ACT_FUNCTION_MISSING'; END IF;

  IF position('p1_current_user_is_appeal_section_instructor' in v_src) > 0 THEN
    RETURN; -- idempotent re-apply
  END IF;

  v_binding_old := 'IF NOT v_has_binding AND NOT v_has_e2e THEN' || E'\n' ||
                   '      RETURN false;' || E'\n' ||
                   '    END IF;';
  v_binding_new := 'IF NOT v_has_binding AND NOT v_has_e2e THEN' || E'\n' ||
                   '      -- Single contextual exception: grade_appeal / instructor_review is' || E'\n' ||
                   '      -- bound to the authoritative section instructor, which by design has' || E'\n' ||
                   '      -- no generic request_processing_assignments row. NOT a role bypass.' || E'\n' ||
                   '      IF NOT (v_canonical_request_type = ''grade_appeal''' || E'\n' ||
                   '              AND v_step.step_key = ''instructor_review''' || E'\n' ||
                   '              AND public.p1_current_user_is_appeal_section_instructor(p_step_id)) THEN' || E'\n' ||
                   '        RETURN false;' || E'\n' ||
                   '      END IF;' || E'\n' ||
                   '    END IF;';

  IF position(v_binding_old in v_src) = 0 THEN
    RAISE EXCEPTION 'P1_08_CAN_ACT_BINDING_ANCHOR_NOT_FOUND';
  END IF;
  v_new := replace(v_src, v_binding_old, v_binding_new);

  v_scope_old := 'IF v_canonical_request_type = ''department_transfer''';
  v_scope_new := 'IF v_canonical_request_type = ''grade_appeal''' || E'\n' ||
                 '     AND v_step.step_key IN (''department_head_review'', ''academic_decision'')' || E'\n' ||
                 '     AND NOT public.p1_current_user_matches_appeal_department_scope(p_step_id) THEN' || E'\n' ||
                 '    RETURN false;' || E'\n' ||
                 '  END IF;' || E'\n' || E'\n' ||
                 '  IF v_canonical_request_type = ''department_transfer''';
  IF position(v_scope_old in v_new) = 0 THEN
    RAISE EXCEPTION 'P1_08_CAN_ACT_SCOPE_ANCHOR_NOT_FOUND';
  END IF;
  v_new := replace(v_new, v_scope_old, v_scope_new);

  -- P1 runtime steps must satisfy the pinned configured contract too.
  v_new := replace(v_new,
    'ELSIF v_unit_code IS NULL OR v_role_code IS NULL OR v_config.action_type IS NULL THEN' || E'\n' ||
    '      RETURN false;' || E'\n' ||
    '    END IF;',
    'ELSIF v_unit_code IS NULL OR v_role_code IS NULL OR v_config.action_type IS NULL THEN' || E'\n' ||
    '      RETURN false;' || E'\n' ||
    '    ELSIF v_is_p1 AND NOT public.b1_runtime_step_contract_ok(' || E'\n' ||
    '      v_canonical_request_type, v_step.workflow_id, v_step.step_key,' || E'\n' ||
    '      v_unit_code, v_role_code, v_config.action_type' || E'\n' ||
    '    ) THEN RETURN false;' || E'\n' ||
    '    END IF;');

  EXECUTE v_new;
END
$do$;

-- ---------------------------------------------------------------------
-- 5. Forward repair of the three EXISTING TEST_ONLY P1 runtimes
--    Same resolver as future strict initialization. No recreation,
--    no reset of completed history, TEST_ONLY-gated, fail closed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_repair_testonly_runtime_assignments(p_request_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.student_requests%ROWTYPE;
  v_canonical text;
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_unit_code text;
  v_role_code text;
  v_department_id uuid;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_count integer;
  v_faculty uuid;
  v_section uuid;
  v_repaired integer := 0;
BEGIN
  SELECT r.* INTO v_request FROM public.student_requests r
  WHERE r.request_number = p_request_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P1_REPAIR_REQUEST_NOT_FOUND:%', p_request_number; END IF;

  -- TEST_ONLY gate: never touch a real P1 request.
  IF COALESCE(v_request.form_data->>'p1_e2e_marker','') <> public.p1_e2e_07_marker() THEN
    RAISE EXCEPTION 'P1_REPAIR_NON_TESTONLY_REQUEST_DENIED:%', p_request_number;
  END IF;

  v_canonical := v_request.request_type;
  IF NOT public.p1_is_atomic_submit_service(v_canonical) THEN
    RAISE EXCEPTION 'P1_REPAIR_NOT_A_P1_SERVICE:%', v_canonical;
  END IF;

  FOR v_step IN
    SELECT s.* FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_request.id
      AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
        s.assigned_faculty_profile_id,s.assigned_position_assignment_id) = 0
      AND s.status IN ('active','pending')
    ORDER BY s.step_order
    FOR UPDATE
  LOOP
    SELECT c.* INTO v_config FROM public.request_type_workflow_steps c
    WHERE c.id = v_step.workflow_step_id AND c.workflow_id = v_step.workflow_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'P1_REPAIR_STEP_CONFIG_MISSING:%', v_step.step_key; END IF;

    SELECT u.code, r.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles r ON r.id=v_config.processing_role_id AND r.unit_id=u.id
    WHERE u.id=v_config.processing_unit_id AND u.is_active=true AND r.is_active=true;
    IF NOT FOUND OR NOT public.b1_runtime_step_contract_ok(
      v_canonical, v_step.workflow_id, v_step.step_key, v_unit_code, v_role_code, v_config.action_type
    ) THEN RAISE EXCEPTION 'P1_REPAIR_STEP_CONTRACT_INVALID:%', v_step.step_key; END IF;

    IF public.p1_step_is_contextual_instructor(v_canonical, v_step.step_key, v_unit_code, v_role_code) THEN
      v_faculty := public.p1_grade_appeal_section_faculty(v_request.id);
      v_section := public.p1_grade_appeal_section_id(v_request.id);
      IF v_faculty IS NULL OR v_section IS NULL THEN
        RAISE EXCEPTION 'P1_REPAIR_SECTION_INSTRUCTOR_CONTEXT_MISSING:%', v_step.step_key;
      END IF;
      UPDATE public.student_request_workflow_steps
      SET assigned_user_id=NULL, assigned_staff_profile_id=NULL,
          assigned_position_assignment_id=NULL,
          assigned_faculty_profile_id=v_faculty,
          metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
            'action_type',v_config.action_type,
            'assignment_source','course_section_faculty',
            'course_section_id',v_section,
            'faculty_profile_id',v_faculty,
            'repaired_by','P1-08'),
          updated_at = now()
      WHERE id = v_step.id;
      v_repaired := v_repaired + 1;
      CONTINUE;
    END IF;

    v_department_id := public.p1_runtime_step_department_scope(v_canonical, v_step.step_key, v_request.id);
    IF v_canonical='grade_appeal'
       AND v_step.step_key IN ('department_head_review','academic_decision')
       AND v_department_id IS NULL THEN
      RAISE EXCEPTION 'P1_REPAIR_APPEAL_DEPARTMENT_SCOPE_MISSING:%', v_step.step_key;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)
      AND (v_department_id IS NULL OR (
        a.assignment_type='position_assignment' AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'P1_REPAIR_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:%:%', v_step.step_key, v_count;
    END IF;

    SELECT a.* INTO v_assignment
    FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)
      AND (v_department_id IS NULL OR (
        a.assignment_type='position_assignment' AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL))
    FOR SHARE;
    IF num_nonnulls(v_assignment.user_id,v_assignment.staff_profile_id,
       v_assignment.faculty_profile_id,v_assignment.position_assignment_id) <> 1 THEN
      RAISE EXCEPTION 'P1_REPAIR_EXACTLY_ONE_DIRECT_ASSIGNEE_REQUIRED:%', v_step.step_key;
    END IF;

    UPDATE public.student_request_workflow_steps
    SET assigned_user_id=v_assignment.user_id,
        assigned_staff_profile_id=v_assignment.staff_profile_id,
        assigned_faculty_profile_id=v_assignment.faculty_profile_id,
        assigned_position_assignment_id=v_assignment.position_assignment_id,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
          'action_type',v_config.action_type,
          'direct_assignment_id',v_assignment.id,
          'assignment_source','request_processing_assignment',
          'repaired_by','P1-08'),
        updated_at = now()
    WHERE id = v_step.id;
    v_repaired := v_repaired + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id=v_request.id
      AND s.status IN ('active','pending')
      AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
        s.assigned_faculty_profile_id,s.assigned_position_assignment_id) <> 1
  ) THEN RAISE EXCEPTION 'P1_REPAIR_UNASSIGNED_RUNTIME_REMAINS:%', p_request_number; END IF;

  RETURN jsonb_build_object('request_number',p_request_number,'repaired_steps',v_repaired);
END;
$function$;

REVOKE ALL ON FUNCTION public.p1_repair_testonly_runtime_assignments(text) FROM PUBLIC, anon, authenticated;

-- Forward repair of exactly the three authorized TEST_ONLY requests.
DO $do$
DECLARE
  v_rn text;
  v_real integer;
BEGIN
  SELECT count(*) INTO v_real
  FROM public.student_requests r
  WHERE r.request_type IN ('october_exam_entry_form','replacement_student_card','grade_appeal')
    AND COALESCE(r.form_data->>'p1_e2e_marker','') <> public.p1_e2e_07_marker()
    AND EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                WHERE s.student_request_id=r.id
                  AND num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
                    s.assigned_faculty_profile_id,s.assigned_position_assignment_id)=0);
  IF v_real > 0 THEN
    RAISE EXCEPTION 'P1_08_REAL_P1_RUNTIME_WOULD_BE_TOUCHED:%', v_real;
  END IF;

  FOREACH v_rn IN ARRAY ARRAY[
    'SR-20260816-14A2339B','SR-20260816-F01018CE','SR-20260816-E852B4E3'
  ] LOOP
    IF EXISTS (SELECT 1 FROM public.student_requests r WHERE r.request_number=v_rn) THEN
      PERFORM public.p1_repair_testonly_runtime_assignments(v_rn);
    END IF;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------
-- 6. Grants (read-side helpers only; no execute grant on the repair fn)
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.p1_grade_appeal_department(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_grade_appeal_section_faculty(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_grade_appeal_section_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_runtime_step_department_scope(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_step_is_contextual_instructor(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_current_user_is_appeal_section_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_current_user_matches_appeal_department_scope(uuid) TO authenticated;

COMMIT;
