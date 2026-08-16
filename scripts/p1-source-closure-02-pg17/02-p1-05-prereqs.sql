-- Production-shaped prerequisites for rehearsing P1-05 on PG17.
-- Creates the PRE-P1-05 (legacy) objects so the migration is proven to REPLACE
-- them: legacy 60% KPIs, legacy GPA output, and the legacy 28-column transcript
-- view (>= 50 pass mark, no official_result / grade_label).

ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS full_name_en text;
ALTER TABLE public.semesters       ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT 'S1';
ALTER TABLE public.study_plans     ADD COLUMN IF NOT EXISTS total_credit_hours integer NOT NULL DEFAULT 0;
ALTER TABLE public.study_plans     ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.student_equivalency_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  course_id uuid NOT NULL,
  credit_hours integer,
  external_course_code text NOT NULL DEFAULT 'EXT-1',
  external_course_name text NOT NULL DEFAULT 'مقرر خارجي');

CREATE TABLE IF NOT EXISTS public.student_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL DEFAULT 0);

CREATE OR REPLACE VIEW public.student_course_grade_summary AS
SELECT se.id AS student_enrollment_id,
       se.student_profile_id,
       CASE WHEN sum(gc.max_score) > 0
            THEN round(sum(sg.score) / sum(gc.max_score) * 100::numeric, 2)
            ELSE 0::numeric END AS percentage
FROM public.student_enrollments se
JOIN public.student_grades sg ON sg.student_enrollment_id = se.id AND sg.status = 'approved'
JOIN public.grade_components gc ON gc.id = sg.grade_component_id
GROUP BY se.id, se.student_profile_id;

-- Role gate the migration's SECURITY DEFINER functions call.
CREATE OR REPLACE FUNCTION public.has_any_role(p_user uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('harness.roles_ok', true), '') = '1' $$;

-- ===== LEGACY PRE-STATE (must be replaced by P1-05) =====
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $legacy$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN jsonb_build_object(
    'successRate', COALESCE((
      SELECT round((100.0 * count(*) FILTER (WHERE percentage >= 60)) / NULLIF(count(*), 0), 1)
      FROM public.student_course_grade_summary), 0),
    'legacyPassMark', 60);
END $legacy$;

CREATE OR REPLACE FUNCTION public.get_admin_progress_kpis(_limit integer DEFAULT 500)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $legacy$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN jsonb_build_object('avgGpa', 0, 'atRisk', 0, 'gradCandidates', 0,
                            'nearCompletion', 0, 'sampled', 0);
END $legacy$;

CREATE OR REPLACE VIEW public.student_unofficial_transcript AS
WITH approved_totals AS (
  SELECT sg.student_enrollment_id, sum(sg.score) AS total_score, sum(gc.max_score) AS total_max
  FROM public.student_grades sg
  JOIN public.grade_components gc ON gc.id = sg.grade_component_id
  WHERE sg.status = 'approved'::text
  GROUP BY sg.student_enrollment_id
)
SELECT se.id AS enrollment_id,
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
       CASE WHEN at.total_max > 0::numeric
            THEN round(at.total_score / at.total_max * 100::numeric, 2)
            ELSE 0::numeric END AS percentage,
       CASE WHEN at.total_max > 0::numeric
             AND round(at.total_score / at.total_max * 100::numeric, 2) >= 50::numeric
            THEN 'passed'::text ELSE 'failed'::text END AS course_status,
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
