
-- Phase 3B: Student Unofficial Transcript
-- View aggregates approved grades per enrollment; relies on RLS of base tables via security_invoker.

CREATE OR REPLACE VIEW public.student_unofficial_transcript
WITH (security_invoker = true) AS
WITH approved_totals AS (
  SELECT
    sg.student_enrollment_id,
    SUM(sg.score)::numeric AS total_score,
    SUM(gc.max_score)::numeric AS total_max
  FROM public.student_grades sg
  JOIN public.grade_components gc ON gc.id = sg.grade_component_id
  WHERE sg.status = 'approved'
  GROUP BY sg.student_enrollment_id
)
SELECT
  se.id AS enrollment_id,
  sp.id AS student_profile_id,
  sp.academic_number,
  sp.full_name_ar AS student_name_ar,
  sp.full_name_en AS student_name_en,
  prog.id AS program_id,
  prog.name_ar AS program_name,
  dept.id AS department_id,
  dept.name_ar AS department_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  sem.id AS semester_id,
  sem.name AS semester_name,
  sem.code AS semester_code,
  lvl.id AS level_id,
  lvl.name AS level_name,
  lvl.level_number,
  c.id AS course_id,
  c.code AS course_code,
  c.name_ar AS course_name,
  c.credit_hours,
  cs.section_code,
  at.total_score AS final_score,
  at.total_max AS max_score,
  CASE WHEN at.total_max > 0
       THEN ROUND((at.total_score / at.total_max) * 100, 2)
       ELSE 0 END AS percentage,
  CASE
    WHEN at.total_max > 0 AND ROUND((at.total_score / at.total_max) * 100, 2) >= 50 THEN 'passed'
    ELSE 'failed'
  END AS course_status,
  se.enrollment_status,
  NULL::text AS notes
FROM public.student_enrollments se
JOIN approved_totals at ON at.student_enrollment_id = se.id
JOIN public.student_profiles sp ON sp.id = se.student_profile_id
JOIN public.course_sections cs ON cs.id = se.course_section_id
JOIN public.course_offerings co ON co.id = cs.course_offering_id
JOIN public.courses c ON c.id = co.course_id
LEFT JOIN public.programs prog ON prog.id = co.program_id
LEFT JOIN public.departments dept ON dept.id = c.department_id
JOIN public.academic_years ay ON ay.id = co.academic_year_id
JOIN public.semesters sem ON sem.id = co.semester_id
JOIN public.academic_levels lvl ON lvl.id = co.level_id;

GRANT SELECT ON public.student_unofficial_transcript TO authenticated;

-- Summary view: per (student, year, semester) aggregates
CREATE OR REPLACE VIEW public.student_transcript_summary
WITH (security_invoker = true) AS
SELECT
  student_profile_id,
  academic_number,
  student_name_ar,
  academic_year_id,
  academic_year_name,
  semester_id,
  semester_name,
  semester_code,
  level_id,
  level_name,
  level_number,
  COUNT(*)::int AS courses_count,
  COUNT(*) FILTER (WHERE course_status = 'passed')::int AS passed_count,
  COUNT(*) FILTER (WHERE course_status = 'failed')::int AS failed_count,
  COALESCE(SUM(credit_hours), 0)::int AS registered_hours,
  COALESCE(SUM(credit_hours) FILTER (WHERE course_status = 'passed'), 0)::int AS passed_hours,
  ROUND(AVG(percentage)::numeric, 2) AS avg_percentage
FROM public.student_unofficial_transcript
GROUP BY student_profile_id, academic_number, student_name_ar,
         academic_year_id, academic_year_name, semester_id, semester_name, semester_code,
         level_id, level_name, level_number;

GRANT SELECT ON public.student_transcript_summary TO authenticated;
