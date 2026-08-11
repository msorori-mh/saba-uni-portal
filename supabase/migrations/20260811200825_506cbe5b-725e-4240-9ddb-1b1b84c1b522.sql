-- 1) Catalog: minimum completed academic years
INSERT INTO public.request_eligibility_rule_catalog
  (code, name_ar, description_ar, param_schema, default_message_ar, is_active, sort_order)
VALUES (
  'MIN_COMPLETED_ACADEMIC_YEARS',
  'الحد الأدنى للسنوات الدراسية المكتملة',
  'يشترط أن يكون الطالب قد أكمل عددًا محددًا من السنوات الدراسية قبل تقديم الطلب.',
  '{"min": {"type": "integer", "required": true}}'::jsonb,
  'لا يحق تقديم هذا الطلب قبل إكمال سنة دراسية واحدة على الأقل.',
  true,
  5
)
ON CONFLICT (code) DO UPDATE
  SET name_ar = EXCLUDED.name_ar,
      description_ar = EXCLUDED.description_ar,
      param_schema = EXCLUDED.param_schema,
      default_message_ar = EXCLUDED.default_message_ar,
      is_active = true,
      updated_at = now();

-- 2) Context: expose completed academic years and current level number
CREATE OR REPLACE FUNCTION public.get_student_request_eligibility_context(p_student_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row record;
  v_academic record;
  v_completed_years integer := 0;
  v_level_number integer;
BEGIN
  PERFORM public.assert_can_read_student_eligibility_context(p_student_profile_id);

  SELECT
    sp.id,
    sp.user_id,
    sp.academic_number,
    sp.full_name_ar,
    sp.status AS profile_status,
    sp.department_id,
    sp.program_id,
    sp.student_study_status,
    sp.transferred_current_year,
    sp.previous_suspension_semesters_count,
    sp.consecutive_suspension_years_count
  INTO v_row
  FROM public.student_profiles sp
  WHERE sp.id = p_student_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    sas.level_id,
    sas.enrollment_status,
    sas.academic_year_id,
    sas.semester_id
  INTO v_academic
  FROM public.student_academic_status sas
  WHERE sas.student_profile_id = p_student_profile_id
  ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC
  LIMIT 1;

  -- Completed academic years = distinct enrolled academic years already ended.
  SELECT COUNT(DISTINCT sas.academic_year_id)
  INTO v_completed_years
  FROM public.student_academic_status sas
  JOIN public.academic_years ay ON ay.id = sas.academic_year_id
  WHERE sas.student_profile_id = p_student_profile_id
    AND ay.end_date < CURRENT_DATE;

  SELECT al.level_number INTO v_level_number
  FROM public.academic_levels al
  WHERE al.id = v_academic.level_id;

  RETURN jsonb_build_object(
    'student_profile_id', v_row.id,
    'profile_status', v_row.profile_status,
    'academic_number', v_row.academic_number,
    'full_name_ar', v_row.full_name_ar,
    'department_id', v_row.department_id,
    'program_id', v_row.program_id,
    'student_study_status', v_row.student_study_status,
    'transferred_current_year', v_row.transferred_current_year,
    'previous_suspension_semesters_count', v_row.previous_suspension_semesters_count,
    'consecutive_suspension_years_count', v_row.consecutive_suspension_years_count,
    'current_level_id', v_academic.level_id,
    'current_level_number', v_level_number,
    'completed_academic_years_count', COALESCE(v_completed_years, 0),
    'current_enrollment_status', v_academic.enrollment_status,
    'current_academic_year_id', v_academic.academic_year_id,
    'current_semester_id', v_academic.semester_id,
    'decisions', jsonb_build_object(
      'u_cert_1', 'enrollment_certificate is college-internal only',
      'u_susp_1_min_completed_years', 1,
      'u_susp_1_max_consecutive_years', 2,
      'u_susp_1_max_previous_semesters', 4,
      'u_oct_1', 'failed_or_remaining_courses_without_approved_success'
    ),
    'foundation_phase', 'P1'
  );
END;
$fn$;

-- 3) Evaluator: support the new rule (unknown codes still fail closed)
CREATE OR REPLACE FUNCTION public.evaluate_request_eligibility_rules(
  p_request_type_code text,
  p_context jsonb
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reasons text[] := ARRAY[]::text[];
  r RECORD;
  v_ok boolean;
BEGIN
  FOR r IN
    SELECT er.rule_code, er.params, er.message_ar
    FROM public.request_type_eligibility_rules er
    JOIN public.request_types rt ON rt.id = er.request_type_id
    JOIN public.request_eligibility_rule_catalog c ON c.code = er.rule_code
    WHERE rt.code = p_request_type_code
      AND er.is_active = true
      AND c.is_active = true
    ORDER BY er.sort_order, er.created_at
  LOOP
    v_ok := true;

    CASE r.rule_code
      WHEN 'STUDENT_STUDY_STATUS_IN' THEN
        v_ok := COALESCE(p_context->>'student_study_status', '') IN (
          SELECT jsonb_array_elements_text(COALESCE(r.params->'values', '[]'::jsonb))
        );

      WHEN 'MIN_COMPLETED_ACADEMIC_YEARS' THEN
        v_ok := COALESCE((p_context->>'completed_academic_years_count')::integer, 0)
                >= COALESCE((r.params->>'min')::integer, 1);

      WHEN 'MAX_CONSECUTIVE_SUSPENSION_YEARS' THEN
        v_ok := COALESCE((p_context->>'consecutive_suspension_years_count')::integer, 0)
                < COALESCE((r.params->>'max')::integer, 2147483647);

      WHEN 'MAX_SUSPENSION_SEMESTERS' THEN
        v_ok := COALESCE((p_context->>'previous_suspension_semesters_count')::integer, 0)
                < COALESCE((r.params->>'max')::integer, 2147483647);

      WHEN 'NOT_TRANSFERRED_CURRENT_YEAR' THEN
        v_ok := NOT COALESCE((p_context->>'transferred_current_year')::boolean, false);

      ELSE
        v_ok := false;
    END CASE;

    IF NOT v_ok THEN
      v_reasons := array_append(v_reasons, r.message_ar);
    END IF;
  END LOOP;

  RETURN v_reasons;
END;
$fn$;

-- 4) Configure enrollment_suspension rules per the authoritative eligibility
INSERT INTO public.request_type_eligibility_rules
  (request_type_id, rule_code, params, message_ar, is_active, sort_order)
SELECT rt.id,
       'MIN_COMPLETED_ACADEMIC_YEARS',
       '{"min": 1}'::jsonb,
       'لا يحق تقديم طلب وقف القيد قبل إكمال سنة دراسية واحدة على الأقل.',
       true,
       1
FROM public.request_types rt
WHERE rt.code = 'enrollment_suspension'
ON CONFLICT (request_type_id, rule_code) DO UPDATE
  SET params = EXCLUDED.params,
      message_ar = EXCLUDED.message_ar,
      is_active = true,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

-- The "study status = new" rule contradicts the completed-year requirement.
UPDATE public.request_type_eligibility_rules er
SET is_active = false, updated_at = now()
FROM public.request_types rt
WHERE rt.id = er.request_type_id
  AND rt.code = 'enrollment_suspension'
  AND er.rule_code = 'STUDENT_STUDY_STATUS_IN';

-- 5) Fail-closed backend gate reused by draft creation and submission
CREATE OR REPLACE FUNCTION public.assert_student_request_eligibility_rules(
  p_student_profile_id uuid,
  p_request_type_code text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ctx jsonb;
  v_reasons text[];
BEGIN
  IF p_student_profile_id IS NULL OR nullif(btrim(coalesce(p_request_type_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ELIGIBILITY_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_type_eligibility_rules er
    JOIN public.request_types rt ON rt.id = er.request_type_id
    JOIN public.request_eligibility_rule_catalog c ON c.code = er.rule_code
    WHERE rt.code = p_request_type_code
      AND er.is_active = true
      AND c.is_active = true
  ) THEN
    RETURN;
  END IF;

  v_ctx := public.get_student_request_eligibility_context(p_student_profile_id);
  v_reasons := public.evaluate_request_eligibility_rules(p_request_type_code, v_ctx);

  IF array_length(v_reasons, 1) IS NOT NULL THEN
    RAISE EXCEPTION '%', array_to_string(v_reasons, ' | ')
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.assert_student_request_eligibility_rules(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_student_request_eligibility_rules(uuid, text) TO authenticated;