-- CAPACITY_04: retain the existing gc_select authorization predicate while
-- evaluating the row-independent student identity once. This lets PostgreSQL
-- use student_profiles.user_id inside the RLS-protected enrollment lookup.
-- No grants, roles, writes, staff branches, helper functions or indexes change.
ALTER POLICY gc_select ON public.grade_components
USING (
  has_any_role(auth.uid(), ARRAY['admin'::text, 'system_admin'::text, 'registrar'::text, 'dean'::text, 'student_affairs'::text])
  OR is_dept_head_of_section(auth.uid(), course_section_id)
  OR is_faculty_of_section(auth.uid(), course_section_id)
  OR EXISTS (
    SELECT 1
    FROM public.student_enrollments e
    JOIN public.student_profiles sp ON sp.id = e.student_profile_id
    WHERE e.course_section_id = grade_components.course_section_id
      AND sp.user_id = (SELECT auth.uid())
  )
);
