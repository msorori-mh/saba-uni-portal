-- SECURITY-RBAC-01A: Gate admin KPI RPCs to executive/academic privileged roles.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      SELECT round((100.0 * count(*) FILTER (WHERE percentage >= 60)) / NULLIF(count(*), 0), 1)
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
$$;

CREATE OR REPLACE FUNCTION public.get_admin_progress_kpis(_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           bool_or(pct IS NOT NULL AND pct >= 60) AS any_passed
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
  course_gpa AS (
    SELECT student_profile_id, credit_hours, status,
           CASE
             WHEN status <> 'completed' OR best_pct IS NULL THEN NULL
             WHEN best_pct >= 95 THEN 4.00
             WHEN best_pct >= 90 THEN 3.75
             WHEN best_pct >= 85 THEN 3.50
             WHEN best_pct >= 80 THEN 3.25
             WHEN best_pct >= 75 THEN 3.00
             WHEN best_pct >= 70 THEN 2.50
             WHEN best_pct >= 65 THEN 2.00
             WHEN best_pct >= 60 THEN 1.50
             ELSE 0
           END AS gpa_points
    FROM course_status
  ),
  per_student_gpa AS (
    SELECT student_profile_id,
           CASE WHEN COALESCE(SUM(credit_hours) FILTER (WHERE gpa_points IS NOT NULL), 0) > 0
                THEN ROUND(
                  (SUM(gpa_points * credit_hours) FILTER (WHERE gpa_points IS NOT NULL)
                   / NULLIF(SUM(credit_hours) FILTER (WHERE gpa_points IS NOT NULL), 0))::numeric, 2)
                ELSE 0 END AS cumulative_gpa,
           COALESCE(SUM(credit_hours) FILTER (WHERE status = 'completed'), 0)::numeric AS completed_hours
    FROM course_gpa
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
      COALESCE(psg.cumulative_gpa, 0)::numeric AS cumulative_gpa,
      COALESCE(psg.completed_hours, 0)::numeric AS completed_hours,
      pps.total_plan_hours,
      pps.required_total,
      COALESCE(rp.passed_required, 0) AS passed_required,
      COALESCE(sl.enrollment_status, '') AS enrollment_status,
      s.profile_status
    FROM students s
    LEFT JOIN per_student_gpa psg ON psg.student_profile_id = s.id
    LEFT JOIN plan_per_student pps ON pps.student_profile_id = s.id
    LEFT JOIN required_passed rp   ON rp.student_profile_id  = s.id
    LEFT JOIN sas_latest sl        ON sl.student_profile_id  = s.id
  ),
  final AS (
    SELECT
      cumulative_gpa,
      CASE WHEN total_plan_hours > 0
           THEN ROUND((completed_hours / total_plan_hours) * 1000.0) / 10.0
           ELSE 0 END AS completion_percentage,
      CASE WHEN
          profile_status <> 'suspended'
          AND enrollment_status <> 'suspended'
          AND total_plan_hours > 0
          AND completed_hours >= total_plan_hours
          AND passed_required = required_total
          AND cumulative_gpa >= 2.0
        THEN 1 ELSE 0 END AS is_eligible
    FROM agg
  )
  SELECT jsonb_build_object(
    'avgGpa', COALESCE(ROUND((AVG(cumulative_gpa) FILTER (WHERE cumulative_gpa > 0))::numeric, 2), 0),
    'atRisk', COUNT(*) FILTER (WHERE cumulative_gpa > 0 AND cumulative_gpa < 2.5),
    'gradCandidates', COUNT(*) FILTER (WHERE is_eligible = 1),
    'nearCompletion', COUNT(*) FILTER (WHERE completion_percentage >= 80),
    'sampled', COUNT(*)
  )
  INTO v_result
  FROM final;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_progress_kpis(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_progress_kpis(int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_progress_kpis(int) TO authenticated;