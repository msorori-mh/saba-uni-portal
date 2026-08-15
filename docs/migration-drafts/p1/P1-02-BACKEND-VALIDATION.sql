-- PORTAL_REFORM_P1_STUDENT_SERVICES_SOURCE_CLOSURE_02
-- P1-02 — AUTHORITATIVE server-side validation for P1.
-- The portal UI is advisory only; every rule below is recomputed on the server
-- from the academic model of record. FORWARD-ONLY. IDEMPOTENT.
--
-- Security principle: role membership NEVER authorizes a step. Only the exact
-- direct runtime assignment does (admin / system_admin / dean / registrar have
-- no global bypass).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_active_student_profile(p_user uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sp.id FROM public.student_profiles sp
  WHERE sp.user_id = p_user AND sp.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.p1_current_level_number(p_student uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT al.level_number
  FROM public.student_academic_status sas
  JOIN public.academic_levels al ON al.id = sas.level_id
  WHERE sas.student_profile_id = p_student
  ORDER BY sas.updated_at DESC, sas.created_at DESC
  LIMIT 1
$$;

-- Total awarded / maximum score for one enrollment, approved rows only.
CREATE OR REPLACE FUNCTION public.p1_enrollment_result(p_enrollment uuid)
RETURNS TABLE (total numeric, max_total numeric, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(sg.score), 0)::numeric,
    COALESCE(SUM(gc.max_score), 0)::numeric,
    MAX(sg.approved_at)
  FROM public.student_grades sg
  JOIN public.grade_components gc ON gc.id = sg.grade_component_id
  WHERE sg.student_enrollment_id = p_enrollment
    AND sg.status = 'approved'
$$;

-- A course counts as PASSED only on an approved published result >= 48%
-- (approved university pass mark = 48/100, normalized against max_total).
CREATE OR REPLACE FUNCTION public.p1_passed_course_ids(p_student uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT co.course_id), '{}'::uuid[])
  FROM public.student_enrollments se
  JOIN public.course_sections cs  ON cs.id = se.course_section_id
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  CROSS JOIN LATERAL public.p1_enrollment_result(se.id) r
  WHERE se.student_profile_id = p_student
    AND r.max_total > 0
    AND r.published_at IS NOT NULL
    AND (r.total / r.max_total) >= 0.48
$$;

-- ---------------------------------------------------------------------------
-- 1. October exam entry — LEVEL 4 AND 1..4 remaining required courses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_october_remaining_requirements(p_student uuid)
RETURNS TABLE (
  requirement_id uuid,
  course_id      uuid,
  course_code    text,
  course_name_ar text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (spc.course_id)
         spc.id, spc.course_id, c.code, c.name_ar
  FROM public.student_profiles sp
  JOIN public.study_plans stp
    ON stp.program_id = sp.program_id AND stp.is_active AND stp.status = 'active'
  JOIN public.study_plan_courses spc ON spc.study_plan_id = stp.id
  JOIN public.courses c ON c.id = spc.course_id
  WHERE sp.id = p_student
    AND spc.is_required
    AND NOT (spc.course_id = ANY (public.p1_passed_course_ids(p_student)))
  ORDER BY spc.course_id, spc.sort_order
$$;

CREATE OR REPLACE FUNCTION public.p1_assert_october_eligibility(
  p_student  uuid,
  p_selected uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_level     integer;
  v_eligible  uuid[];
  v_count     integer;
  v_selected  uuid[];
BEGIN
  v_level := public.p1_current_level_number(p_student);

  SELECT COALESCE(array_agg(requirement_id), '{}'::uuid[]), count(*)
    INTO v_eligible, v_count
  FROM public.p1_october_remaining_requirements(p_student);

  IF v_level IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'OCTOBER_NOT_LEVEL_4' USING ERRCODE = 'check_violation';
  END IF;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'OCTOBER_NO_REMAINING_REQUIRED_COURSES' USING ERRCODE = 'check_violation';
  END IF;
  IF v_count > 4 THEN
    RAISE EXCEPTION 'OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT' USING ERRCODE = 'check_violation';
  END IF;

  IF p_selected IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_selected
    FROM unnest(p_selected) s;

    IF coalesce(array_length(v_selected, 1), 0) = 0
       OR array_length(v_selected, 1) > 4
       OR NOT (v_selected <@ v_eligible) THEN
      RAISE EXCEPTION 'OCTOBER_SELECTION_NOT_AUTHORITATIVE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'academic_level_order', v_level,
    'remaining_courses_count', v_count,
    'eligible_requirement_ids', to_jsonb(v_eligible)
  );
END $$;

-- ---------------------------------------------------------------------------
-- 2. Replacement student card — active student, no open duplicate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_assert_replacement_card_eligibility(p_student uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE id = p_student AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'REPLACEMENT_CARD_STUDENT_NOT_ACTIVE' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_requests sr
    WHERE sr.student_profile_id = p_student
      AND sr.request_type = 'replacement_student_card'
      AND sr.status IN ('draft','submitted','in_review','under_review','in_progress',
                        'returned','returned_for_completion','awaiting_payment','payment_confirmed')
  ) THEN
    RAISE EXCEPTION 'REPLACEMENT_CARD_DUPLICATE_OPEN_REQUEST' USING ERRCODE = 'check_violation';
  END IF;

  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Final result appeal — 7 days from the published approved final result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_final_result_published_at(p_enrollment uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.published_at
  FROM public.p1_enrollment_result(p_enrollment) r
  WHERE r.max_total > 0
$$;

CREATE OR REPLACE FUNCTION public.p1_assert_final_result_appeal_eligibility(
  p_student    uuid,
  p_enrollment uuid,
  p_now        timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_published timestamptz;
  v_window_end timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    WHERE se.id = p_enrollment AND se.student_profile_id = p_student
  ) THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_NO_ENROLLMENT' USING ERRCODE = 'check_violation';
  END IF;

  v_published := public.p1_final_result_published_at(p_enrollment);
  IF v_published IS NULL THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_RESULT_NOT_PUBLISHED' USING ERRCODE = 'check_violation';
  END IF;

  v_window_end := v_published + interval '7 days';
  IF p_now > v_window_end THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_WINDOW_EXPIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grade_appeal_details gad
    JOIN public.student_requests sr ON sr.id = gad.request_id
    WHERE gad.student_enrollment_id = p_enrollment
      AND sr.request_type = 'grade_appeal'
      AND sr.status IN ('draft','submitted','in_review','under_review','in_progress',
                        'returned','returned_for_completion')
  ) THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_DUPLICATE_OPEN' USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'final_result_published_at', v_published,
    'appeal_window_end', v_window_end
  );
END $$;

-- ---------------------------------------------------------------------------
-- 4. Department transfer — level 1 students are denied
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_assert_department_transfer_level(p_student uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_level integer;
BEGIN
  v_level := public.p1_current_level_number(p_student);
  IF v_level IS NULL OR v_level < 2 THEN
    RAISE EXCEPTION 'DEPARTMENT_TRANSFER_LEVEL_1_NOT_ELIGIBLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Shared step authorization — exact direct assignment, no role bypass
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_assert_step_actor(
  p_request  uuid,
  p_step_key text,
  p_actor    uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  SELECT * INTO v_step
  FROM public.student_request_workflow_steps
  WHERE student_request_id = p_request AND step_key = p_step_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_STEP' USING ERRCODE = 'check_violation';
  END IF;

  IF v_step.status NOT IN ('pending','in_progress','active') THEN
    RAISE EXCEPTION 'STEP_NOT_CURRENT' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = p_request
      AND s.status IN ('pending','in_progress','active')
    HAVING min(s.step_order) = v_step.step_order
  ) THEN
    RAISE EXCEPTION 'STEP_NOT_CURRENT' USING ERRCODE = 'check_violation';
  END IF;

  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'DIRECT_ASSIGNMENT_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Direct runtime assignment wins outright.
  IF v_step.assigned_user_id IS NOT NULL THEN
    IF v_step.assigned_user_id = p_actor THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'DIRECT_ASSIGNMENT_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Otherwise the actor must hold an ACTIVE processing assignment for the exact
  -- (unit, role) pair pinned on this runtime step. Global roles are ignored.
  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN
    RAISE EXCEPTION 'EXACT_PROCESSING_BINDING_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_processing_assignments a
    LEFT JOIN public.staff_profiles   stp ON stp.id = a.staff_profile_id
    LEFT JOIN public.faculty_profiles fp  ON fp.id  = a.faculty_profile_id
    WHERE a.is_active
      AND a.unit_id = v_step.processing_unit_id
      AND a.role_id = v_step.processing_role_id
      AND (a.starts_at IS NULL OR a.starts_at <= now())
      AND (a.ends_at   IS NULL OR a.ends_at   >  now())
      AND COALESCE(a.user_id, stp.user_id, fp.user_id) = p_actor
  ) THEN
    RAISE EXCEPTION 'EXACT_PROCESSING_BINDING_REQUIRED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Revenue gate — external payment confirmation before downstream steps
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_assert_payment_confirmed(p_request uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = p_request
      AND s.step_key = 'payment_confirmation'
  ) THEN
    -- Free service: nothing to confirm, and no financial row is fabricated.
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = p_request
      AND s.step_key = 'payment_confirmation'
      AND s.status = 'completed'
      AND s.decision IN ('confirmed','approved','payment_confirmed')
  ) THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 7. execution surface
-- ---------------------------------------------------------------------------
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'p1_active_student_profile(uuid)',
    'p1_current_level_number(uuid)',
    'p1_enrollment_result(uuid)',
    'p1_passed_course_ids(uuid)',
    'p1_october_remaining_requirements(uuid)',
    'p1_assert_october_eligibility(uuid,uuid[])',
    'p1_assert_replacement_card_eligibility(uuid)',
    'p1_final_result_published_at(uuid)',
    'p1_assert_final_result_appeal_eligibility(uuid,uuid,timestamptz)',
    'p1_assert_department_transfer_level(uuid)',
    'p1_assert_step_actor(uuid,text,uuid)',
    'p1_assert_payment_confirmed(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

COMMIT;
