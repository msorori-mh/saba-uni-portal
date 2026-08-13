-- STUDENT-REQUEST-ELIGIBILITY-CONTEXT-REQUEST-TYPE-CODE-FIX-01
-- Forward-only. No data writes, no drops, no ACL/RLS changes.
--
-- Defect: public.get_student_request_eligibility_context joins
--   public.request_types rt ON rt.id = sr.request_type_id
-- but public.student_requests has NO request_type_id column; the canonical
-- column is student_requests.request_type (text) holding the request type CODE.
-- Every call therefore fails with: column sr.request_type_id does not exist,
-- which blocks the student services list and every B1 draft/submit path.
--
-- Fix: keep the production query shape (JOIN public.request_types) and change
-- ONLY the bad join key to rt.code = sr.request_type, still aggregating
-- jsonb_agg(DISTINCT rt.code). SECURITY DEFINER, STABLE, search_path, the
-- authorization guard, the status exclusion set and the returned JSON shape
-- are all preserved. Everything else in the function body is unchanged.

CREATE OR REPLACE FUNCTION public.get_student_request_eligibility_context(p_student_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_academic record;
  v_ended_years integer := 0;
  v_level_number integer;
  v_completed_years integer := 0;
  v_open jsonb := '[]'::jsonb;
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

  SELECT COUNT(DISTINCT sas.academic_year_id)
  INTO v_ended_years
  FROM public.student_academic_status sas
  JOIN public.academic_years ay ON ay.id = sas.academic_year_id
  WHERE sas.student_profile_id = p_student_profile_id
    AND ay.end_date < CURRENT_DATE;

  SELECT al.level_number INTO v_level_number
  FROM public.academic_levels al
  WHERE al.id = v_academic.level_id;

  -- FIX (join key ONLY): student_requests has no request_type_id column; the
  -- canonical column is student_requests.request_type (text) holding the CODE.
  -- The production query shape (JOIN request_types + jsonb_agg(rt.code)) is
  -- preserved verbatim; only the join key changes to rt.code = sr.request_type.
  SELECT COALESCE(jsonb_agg(DISTINCT rt.code), '[]'::jsonb)
  INTO v_open
  FROM public.student_requests sr
  JOIN public.request_types rt
    ON rt.code = sr.request_type
  WHERE sr.student_profile_id = p_student_profile_id
    AND sr.status NOT IN ('completed','rejected','cancelled','archived','withdrawn');

  v_completed_years := GREATEST(
    COALESCE(v_ended_years, 0),
    GREATEST(COALESCE(v_level_number, 1) - 1, 0)
  );

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
    'completed_academic_years_count', v_completed_years,
    'completed_academic_years_from_history', COALESCE(v_ended_years, 0),
    'current_enrollment_status', v_academic.enrollment_status,
    'current_academic_year_id', v_academic.academic_year_id,
    'current_semester_id', v_academic.semester_id,
    'open_request_type_codes', v_open,
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
$function$;
