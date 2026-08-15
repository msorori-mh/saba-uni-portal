-- ---------------------------------------------------------------------------
-- P1-05 — ACADEMIC PASS THRESHOLD 48/100 (DRAFT, NOT APPLIED)
--
-- Approved university policy: COURSE_PASS_MARK = 48 / 100.
--   percentage >= 48.00 -> PASSED
--   percentage <  48.00 -> FAILED
--
-- Backend objects that duplicated a contradictory pass mark:
--   public.get_admin_dashboard_kpis      (was >= 60)
--   public.get_admin_progress_kpis       (was >= 60 pass; GPA fail-floor 60)
--   public.student_unofficial_transcript (was >= 50)
--
-- APPROVED GRADING POLICY (P1-05 rev. 04): NO GPA / 4.0 SCALE EXISTS.
--   raw < 48                -> FAIL   ("ضعيف"), official result = raw
--   48 <= raw < 50          -> PASS, official result NORMALIZES TO 50 ("مقبول")
--   50 <= official < 65     -> "مقبول"
--   65 <= official < 80     -> "جيد"
--   80 <= official < 90     -> "جيد جدًا"
--   90 <= official <= 100   -> "ممتاز"
-- All grade-point mappings are REMOVED. Aggregates use the credit-weighted
-- OFFICIAL PERCENTAGE (avgOfficialPercentage), which is not a GPA.
-- Forward-only, idempotent (CREATE OR REPLACE only). No data mutation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'successRate', COALESCE((
      SELECT round((100.0 * count(*) FILTER (WHERE percentage >= 48)) / NULLIF(count(*), 0), 1)
      FROM public.student_course_grade_summary
    ), 0),
    'totalFees', COALESCE((SELECT sum(amount) FROM public.student_fees), 0),
    'totalPaid', COALESCE((SELECT sum(amount) FROM public.student_payments), 0),
    'outstanding', GREATEST(
      0,
      COALESCE((SELECT sum(amount) FROM public.student_fees), 0)
      - COALESCE((SELECT sum(amount) FROM public.student_payments), 0)
    ),
    'openRequests', (
      SELECT count(*) FROM public.student_requests
      WHERE status IN ('submitted', 'under_review')
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_progress_kpis(_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'dean', 'student_affairs']
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH
  students AS (
    SELECT sp.id, sp.program_id, sp.status AS profile_status
    FROM public.student_profiles sp
    WHERE sp.status <> 'graduated'
    LIMIT GREATEST(_limit, 1)
  ),
  sas_latest AS (
    SELECT DISTINCT ON (sas.student_profile_id)
      sas.student_profile_id, sas.enrollment_status
    FROM public.student_academic_status sas
    WHERE sas.student_profile_id IN (SELECT id FROM students)
    ORDER BY sas.student_profile_id, sas.updated_at DESC
  ),
  enr AS (
    SELECT se.id AS enrollment_id, se.student_profile_id, se.enrollment_status,
           cs.id AS section_id, co.course_id
    FROM public.student_enrollments se
    JOIN public.course_sections cs ON cs.id = se.course_section_id
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    WHERE se.student_profile_id IN (SELECT id FROM students)
      AND se.enrollment_status <> 'dropped'
  ),
  section_max AS (
    SELECT gc.course_section_id, SUM(gc.max_score)::numeric AS sum_max
    FROM public.grade_components gc
    WHERE gc.course_section_id IN (SELECT section_id FROM enr)
    GROUP BY gc.course_section_id
  ),
  enr_score AS (
    SELECT sg.student_enrollment_id, SUM(sg.score)::numeric AS sum_score
    FROM public.student_grades sg
    WHERE sg.status = 'approved'
      AND sg.student_enrollment_id IN (SELECT enrollment_id FROM enr)
    GROUP BY sg.student_enrollment_id
  ),
  enr_pct AS (
    SELECT e.student_profile_id, e.course_id,
           CASE
             WHEN COALESCE(sm.sum_max, 0) = 0 THEN NULL
             WHEN es.sum_score IS NULL THEN NULL
             ELSE (es.sum_score / sm.sum_max) * 100.0
           END AS pct
    FROM enr e
    LEFT JOIN section_max sm ON sm.course_section_id = e.section_id
    LEFT JOIN enr_score es ON es.student_enrollment_id = e.enrollment_id
  ),
  course_best AS (
    SELECT student_profile_id, course_id,
           MAX(pct) FILTER (WHERE pct IS NOT NULL) AS best_pct,
           bool_or(pct IS NULL) AS any_null,
           bool_or(pct IS NOT NULL AND pct >= 48) AS any_passed
    FROM enr_pct
    GROUP BY student_profile_id, course_id
  ),
  course_status AS (
    SELECT cb.student_profile_id, cb.course_id,
           CASE WHEN cb.any_passed THEN 'completed'
                WHEN cb.any_null   THEN 'in_progress'
                ELSE 'failed' END AS status,
           cb.best_pct,
           c.credit_hours
    FROM course_best cb
    JOIN public.courses c ON c.id = cb.course_id
  ),
  course_official AS (
    SELECT student_profile_id, credit_hours, status,
           CASE
             WHEN status <> 'completed' OR best_pct IS NULL THEN NULL
             WHEN best_pct >= 48 AND best_pct < 50 THEN 50.0
             ELSE ROUND(best_pct::numeric, 1)
           END AS official_result
    FROM course_status
  ),
  per_student_official AS (
    SELECT student_profile_id,
           CASE WHEN COALESCE(SUM(credit_hours) FILTER (WHERE official_result IS NOT NULL), 0) > 0
                THEN ROUND(
                  (SUM(official_result * credit_hours) FILTER (WHERE official_result IS NOT NULL)
                   / NULLIF(SUM(credit_hours) FILTER (WHERE official_result IS NOT NULL), 0))::numeric, 1)
                ELSE 0 END AS official_average,
           COALESCE(SUM(credit_hours) FILTER (WHERE status = 'completed'), 0)::numeric AS completed_hours
    FROM course_official
    GROUP BY student_profile_id
  ),
  plan_pick AS (
    SELECT DISTINCT ON (sp_pl.program_id)
      sp_pl.id, sp_pl.program_id, sp_pl.total_credit_hours
    FROM public.study_plans sp_pl
    WHERE sp_pl.is_active = true
      AND sp_pl.program_id IN (SELECT program_id FROM students WHERE program_id IS NOT NULL)
    ORDER BY sp_pl.program_id, sp_pl.updated_at DESC
  ),
  plan_required AS (
    SELECT pp.program_id, COUNT(*) AS required_total
    FROM plan_pick pp
    JOIN public.study_plan_courses spc
      ON spc.study_plan_id = pp.id AND spc.is_required = true
    GROUP BY pp.program_id
  ),
  plan_required_courses AS (
    SELECT pp.program_id, spc.course_id
    FROM plan_pick pp
    JOIN public.study_plan_courses spc
      ON spc.study_plan_id = pp.id AND spc.is_required = true
  ),
  plan_hours_sum AS (
    SELECT pp.program_id, COALESCE(SUM(c.credit_hours), 0)::numeric AS hours_sum
    FROM plan_pick pp
    JOIN public.study_plan_courses spc ON spc.study_plan_id = pp.id
    JOIN public.courses c ON c.id = spc.course_id
    GROUP BY pp.program_id
  ),
  plan_per_student AS (
    SELECT s.id AS student_profile_id,
           COALESCE(NULLIF(pp.total_credit_hours, 0), phs.hours_sum, 0)::numeric AS total_plan_hours,
           COALESCE(pr.required_total, 0) AS required_total
    FROM students s
    LEFT JOIN plan_pick pp        ON pp.program_id  = s.program_id
    LEFT JOIN plan_hours_sum phs  ON phs.program_id = s.program_id
    LEFT JOIN plan_required pr    ON pr.program_id  = s.program_id
  ),
  required_passed AS (
    SELECT s.id AS student_profile_id, COUNT(*) AS passed_required
    FROM students s
    JOIN plan_required_courses prc ON prc.program_id = s.program_id
    JOIN course_status cs
      ON cs.student_profile_id = s.id
     AND cs.course_id = prc.course_id
     AND cs.status = 'completed'
    GROUP BY s.id
  ),
  agg AS (
    SELECT
      COALESCE(psg.official_average, 0)::numeric AS official_average,
      COALESCE(psg.completed_hours, 0)::numeric AS completed_hours,
      pps.total_plan_hours,
      pps.required_total,
      COALESCE(rp.passed_required, 0) AS passed_required,
      COALESCE(sl.enrollment_status, '') AS enrollment_status,
      s.profile_status
    FROM students s
    LEFT JOIN per_student_official psg ON psg.student_profile_id = s.id
    LEFT JOIN plan_per_student pps ON pps.student_profile_id = s.id
    LEFT JOIN required_passed rp   ON rp.student_profile_id  = s.id
    LEFT JOIN sas_latest sl        ON sl.student_profile_id  = s.id
  ),
  final AS (
    SELECT
      official_average,
      CASE WHEN total_plan_hours > 0
           THEN ROUND((completed_hours / total_plan_hours) * 1000.0) / 10.0
           ELSE 0 END AS completion_percentage,
      CASE WHEN
          profile_status <> 'suspended'
          AND enrollment_status <> 'suspended'
          AND total_plan_hours > 0
          AND completed_hours >= total_plan_hours
          AND passed_required = required_total
          AND official_average >= 48
        THEN 1 ELSE 0 END AS is_eligible
    FROM agg
  )
  SELECT jsonb_build_object(
    'avgOfficialPercentage', COALESCE(ROUND((AVG(official_average) FILTER (WHERE official_average > 0))::numeric, 1), 0),
    'atRisk', COUNT(*) FILTER (WHERE official_average > 0 AND official_average < 65),
    'gradCandidates', COUNT(*) FILTER (WHERE is_eligible = 1),
    'nearCompletion', COUNT(*) FILTER (WHERE completion_percentage >= 80),
    'sampled', COUNT(*)
  )
  INTO v_result
  FROM final;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE VIEW public.student_unofficial_transcript AS  WITH approved_totals AS (
         SELECT sg.student_enrollment_id,
            sum(sg.score) AS total_score,
            sum(gc.max_score) AS total_max
           FROM student_grades sg
             JOIN grade_components gc ON gc.id = sg.grade_component_id
          WHERE sg.status = 'approved'::text
          GROUP BY sg.student_enrollment_id
        ), enrollment_rows AS (
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
                CASE
                    WHEN at.total_max > 0::numeric THEN round(at.total_score / at.total_max * 100::numeric, 2)
                    ELSE 0::numeric
                END AS percentage,
                CASE
                    WHEN at.total_max > 0::numeric AND round(at.total_score / at.total_max * 100::numeric, 2) >= 48::numeric THEN 'passed'::text
                    ELSE 'failed'::text
                END AS course_status,
                CASE
                    WHEN at.total_max <= 0::numeric THEN 0::numeric
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) >= 48::numeric
                     AND round(at.total_score / at.total_max * 100::numeric, 2) < 50::numeric THEN 50::numeric
                    ELSE round(at.total_score / at.total_max * 100::numeric, 1)
                END AS official_result,
                CASE
                    WHEN at.total_max <= 0::numeric THEN 'ضعيف'::text
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) < 48::numeric THEN 'ضعيف'::text
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) >= 90::numeric THEN 'ممتاز'::text
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) >= 80::numeric THEN 'جيد جدًا'::text
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) >= 65::numeric THEN 'جيد'::text
                    ELSE 'مقبول'::text
                END AS grade_label,
            se.enrollment_status,
            NULL::text AS notes
           FROM student_enrollments se
             JOIN approved_totals at ON at.student_enrollment_id = se.id
             JOIN student_profiles sp ON sp.id = se.student_profile_id
             JOIN course_sections cs ON cs.id = se.course_section_id
             JOIN course_offerings co ON co.id = cs.course_offering_id
             JOIN courses c ON c.id = co.course_id
             LEFT JOIN programs prog ON prog.id = co.program_id
             LEFT JOIN departments dept ON dept.id = c.department_id
             JOIN academic_years ay ON ay.id = co.academic_year_id
             JOIN semesters sem ON sem.id = co.semester_id
             JOIN academic_levels lvl ON lvl.id = co.level_id
        ), equivalency_rows AS (
         SELECT sec.id AS enrollment_id,
            sec.student_profile_id,
            sp.academic_number,
            sp.full_name_ar AS student_name_ar,
            sp.full_name_en AS student_name_en,
            prog.id AS program_id,
            prog.name_ar AS program_name,
            dept.id AS department_id,
            dept.name_ar AS department_name,
            NULL::uuid AS academic_year_id,
            'معادلة'::text AS academic_year_name,
            NULL::uuid AS semester_id,
            'معادلة'::text AS semester_name,
            'EQ'::text AS semester_code,
            NULL::uuid AS level_id,
            '—'::text AS level_name,
            NULL::integer AS level_number,
            c.id AS course_id,
            c.code AS course_code,
            c.name_ar AS course_name,
            COALESCE(sec.credit_hours, c.credit_hours) AS credit_hours,
            '—'::text AS section_code,
            100::numeric AS final_score,
            100::numeric AS max_score,
            100::numeric AS percentage,
            'passed'::text AS course_status,
            100::numeric AS official_result,
            'ممتاز'::text AS grade_label,
            'completed'::text AS enrollment_status,
            (('معادلة: '::text || sec.external_course_code) || ' — '::text) || sec.external_course_name AS notes
           FROM student_equivalency_credits sec
             JOIN student_profiles sp ON sp.id = sec.student_profile_id
             JOIN courses c ON c.id = sec.course_id
             LEFT JOIN programs prog ON prog.id = sp.program_id
             LEFT JOIN departments dept ON dept.id = c.department_id
        )
 SELECT enrollment_rows.enrollment_id,
    enrollment_rows.student_profile_id,
    enrollment_rows.academic_number,
    enrollment_rows.student_name_ar,
    enrollment_rows.student_name_en,
    enrollment_rows.program_id,
    enrollment_rows.program_name,
    enrollment_rows.department_id,
    enrollment_rows.department_name,
    enrollment_rows.academic_year_id,
    enrollment_rows.academic_year_name,
    enrollment_rows.semester_id,
    enrollment_rows.semester_name,
    enrollment_rows.semester_code,
    enrollment_rows.level_id,
    enrollment_rows.level_name,
    enrollment_rows.level_number,
    enrollment_rows.course_id,
    enrollment_rows.course_code,
    enrollment_rows.course_name,
    enrollment_rows.credit_hours,
    enrollment_rows.section_code,
    enrollment_rows.final_score,
    enrollment_rows.max_score,
    enrollment_rows.percentage,
    enrollment_rows.course_status,
    enrollment_rows.official_result,
    enrollment_rows.grade_label,
    enrollment_rows.enrollment_status,
    enrollment_rows.notes
   FROM enrollment_rows
UNION ALL
 SELECT equivalency_rows.enrollment_id,
    equivalency_rows.student_profile_id,
    equivalency_rows.academic_number,
    equivalency_rows.student_name_ar,
    equivalency_rows.student_name_en,
    equivalency_rows.program_id,
    equivalency_rows.program_name,
    equivalency_rows.department_id,
    equivalency_rows.department_name,
    equivalency_rows.academic_year_id,
    equivalency_rows.academic_year_name,
    equivalency_rows.semester_id,
    equivalency_rows.semester_name,
    equivalency_rows.semester_code,
    equivalency_rows.level_id,
    equivalency_rows.level_name,
    equivalency_rows.level_number,
    equivalency_rows.course_id,
    equivalency_rows.course_code,
    equivalency_rows.course_name,
    equivalency_rows.credit_hours,
    equivalency_rows.section_code,
    equivalency_rows.final_score,
    equivalency_rows.max_score,
    equivalency_rows.percentage,
    equivalency_rows.course_status,
    equivalency_rows.official_result,
    equivalency_rows.grade_label,
    equivalency_rows.enrollment_status,
    equivalency_rows.notes
   FROM equivalency_rows;

