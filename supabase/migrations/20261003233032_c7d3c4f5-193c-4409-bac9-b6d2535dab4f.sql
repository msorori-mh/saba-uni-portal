-- Narrow read paths (name fields only) instead of opening SELECT on profile tables.

CREATE OR REPLACE FUNCTION public.get_section_student_names(p_section_id uuid)
RETURNS TABLE (student_enrollment_id uuid, academic_number text, full_name_ar text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.course_sections cs
    LEFT JOIN public.course_offerings co ON co.id = cs.course_offering_id
    LEFT JOIN public.courses c ON c.id = co.course_id
    WHERE cs.id = p_section_id
      AND (
        EXISTS (SELECT 1 FROM public.faculty_profiles fp
                WHERE fp.id = cs.faculty_profile_id AND fp.user_id = v_uid)
        OR EXISTS (SELECT 1 FROM public.class_schedule sch
                   JOIN public.faculty_profiles fp ON fp.id = sch.faculty_profile_id
                   WHERE sch.course_section_id = cs.id AND fp.user_id = v_uid)
        OR (c.department_id IS NOT NULL AND public.is_department_head_of(v_uid, c.department_id))
      )
  ) THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT se.id, sp.academic_number::text, sp.full_name_ar::text
  FROM public.student_enrollments se
  JOIN public.student_profiles sp ON sp.id = se.student_profile_id
  WHERE se.course_section_id = p_section_id
    AND se.enrollment_status = 'enrolled';
END;
$function$;

REVOKE ALL ON FUNCTION public.get_section_student_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_section_student_names(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_section_faculty_names()
RETURNS TABLE (faculty_profile_id uuid, full_name_ar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_sections AS (
    SELECT se.course_section_id
    FROM public.student_enrollments se
    JOIN public.student_profiles sp ON sp.id = se.student_profile_id
    WHERE sp.user_id = auth.uid()
  ), ids AS (
    SELECT cs.faculty_profile_id AS fid FROM public.course_sections cs
    WHERE cs.id IN (SELECT course_section_id FROM my_sections)
    UNION
    SELECT sch.faculty_profile_id FROM public.class_schedule sch
    WHERE sch.course_section_id IN (SELECT course_section_id FROM my_sections)
  )
  SELECT fp.id, fp.full_name_ar::text
  FROM public.faculty_profiles fp
  WHERE fp.id IN (SELECT fid FROM ids WHERE fid IS NOT NULL);
$function$;

REVOKE ALL ON FUNCTION public.get_my_section_faculty_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_section_faculty_names() TO authenticated, service_role;