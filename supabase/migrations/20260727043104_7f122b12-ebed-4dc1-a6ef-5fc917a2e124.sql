CREATE OR REPLACE FUNCTION public.assert_b1_academic_period_reference(
  p_academic_year_id uuid,
  p_semester_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_academic_year_id IS NULL OR p_semester_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.semesters s JOIN public.academic_years y ON y.id=s.academic_year_id
    WHERE s.id=p_semester_id AND y.id=p_academic_year_id
      AND s.status='active' AND y.status='active'
  ) THEN RAISE EXCEPTION 'B1_TRUSTED_ACADEMIC_PERIOD_REQUIRED' USING ERRCODE='23503'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assert_b1_active_course_enrollment(
  p_student_profile_id uuid,
  p_course_section_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_student_profile_id IS NULL OR p_course_section_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.student_enrollments e
    JOIN public.course_sections s ON s.id=e.course_section_id
    JOIN public.course_offerings o ON o.id=s.course_offering_id
    WHERE e.student_profile_id=p_student_profile_id
      AND e.course_section_id=p_course_section_id
      AND e.enrollment_status='enrolled' AND s.status='active' AND o.status='active'
  ) THEN RAISE EXCEPTION 'B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED' USING ERRCODE='23503'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assert_b1_target_program_department(
  p_program_id uuid,
  p_department_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_program_id IS NULL OR p_department_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.programs p JOIN public.departments d ON d.id=p.department_id
    WHERE p.id=p_program_id AND d.id=p_department_id
      AND p.is_active=true AND d.is_active=true
  ) THEN RAISE EXCEPTION 'B1_TARGET_PROGRAM_DEPARTMENT_REQUIRED' USING ERRCODE='23503'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_b1_academic_period_reference(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.assert_b1_active_course_enrollment(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.assert_b1_target_program_department(uuid,uuid) FROM PUBLIC,anon,authenticated;