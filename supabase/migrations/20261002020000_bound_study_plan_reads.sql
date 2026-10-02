-- Select the assigned curriculum; unassigned students use the only active plan, if unique.
BEGIN;

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
   AND stp.id = COALESCE(sp.study_plan_id, (
     SELECT CASE WHEN count(*) = 1 THEN min(p.id) END FROM public.study_plans p
     WHERE p.program_id = sp.program_id AND p.is_active AND p.status = 'active'
   ))
  JOIN public.study_plan_courses spc ON spc.study_plan_id = stp.id
  JOIN public.courses c ON c.id = spc.course_id
  WHERE sp.id = p_student
    AND spc.is_required
    AND NOT (spc.course_id = ANY (public.p1_passed_course_ids(p_student)))
  ORDER BY spc.course_id, spc.sort_order
$$;


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
    SELECT sp.id, sp.program_id, sp.study_plan_id, sp.status AS profile_status
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
    SELECT s.id AS student_profile_id, p.id AS plan_id, p.total_credit_hours
    FROM students s
    JOIN public.study_plans p ON p.id = COALESCE(s.study_plan_id, (
      SELECT CASE WHEN COUNT(*) = 1 THEN MIN(candidate.id) END
      FROM public.study_plans candidate
      WHERE candidate.program_id = s.program_id AND candidate.is_active AND candidate.status = 'active'
    ))
    WHERE p.program_id = s.program_id AND p.is_active AND p.status = 'active'
  ),
  plan_required AS (
    SELECT pp.student_profile_id, COUNT(*) AS required_total
    FROM plan_pick pp
    JOIN public.study_plan_courses spc ON spc.study_plan_id = pp.plan_id AND spc.is_required
    GROUP BY pp.student_profile_id
  ),
  plan_required_courses AS (
    SELECT pp.student_profile_id, spc.course_id
    FROM plan_pick pp
    JOIN public.study_plan_courses spc ON spc.study_plan_id = pp.plan_id AND spc.is_required
  ),
  plan_hours_sum AS (
    SELECT pp.student_profile_id, COALESCE(SUM(c.credit_hours), 0)::numeric AS hours_sum
    FROM plan_pick pp
    JOIN public.study_plan_courses spc ON spc.study_plan_id = pp.plan_id
    JOIN public.courses c ON c.id = spc.course_id
    GROUP BY pp.student_profile_id
  ),
  plan_per_student AS (
    SELECT s.id AS student_profile_id,
           COALESCE(NULLIF(pp.total_credit_hours, 0), phs.hours_sum, 0)::numeric AS total_plan_hours,
           COALESCE(pr.required_total, 0) AS required_total
    FROM students s
    LEFT JOIN plan_pick pp ON pp.student_profile_id = s.id
    LEFT JOIN plan_hours_sum phs ON phs.student_profile_id = s.id
    LEFT JOIN plan_required pr ON pr.student_profile_id = s.id
  ),
  required_passed AS (
    SELECT s.id AS student_profile_id, COUNT(*) AS passed_required
    FROM students s
    JOIN plan_required_courses prc ON prc.student_profile_id = s.id
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


COMMIT;
