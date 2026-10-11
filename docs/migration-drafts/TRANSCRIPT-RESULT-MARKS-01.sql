-- TRANSCRIPT-RESULT-MARKS-01
--
-- Shows the official result marks (student_enrollments.result_mark, added by
-- ENROLLMENT-RESULT-MARK-01) in the transcript views used by the unofficial
-- transcript page and the official transcript document:
--
--   غ ض / م ح ض  → course_status 'failed', percentage 0, grade_label = the mark
--   غ ب ض / ق ض  → course_status 'excused', no score / percentage / result,
--                  grade_label = the mark; the row is listed but not counted
--
-- Before this change an excused enrollment (no grade row) vanished from the
-- transcript, and a failing mark showed as «ضعيف» instead of the official mark.
--
-- Column list, names and types are unchanged (CREATE OR REPLACE VIEW-safe);
-- rows without a mark are computed exactly as before.
-- Base: live definitions read from production on 2026-10-11
--   md5(student_unofficial_transcript) = ee5078fcbe2b4f65d8f1e1248e9e9329
--   md5(student_transcript_summary)    = ed8db5e49fe0ff921dc08b1453d64f29
-- Apply in the production SQL editor by the owner; re-runnable.

begin;

create or replace view public.student_unofficial_transcript
with (security_invoker = true) as
 WITH enrollment_rows AS (
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
                CASE
                    WHEN se.result_mark IN ('غ ب ض', 'ق ض') THEN NULL::numeric
                    WHEN se.result_mark IN ('غ ض', 'م ح ض') THEN COALESCE(at.total_score, 0::numeric)
                    ELSE at.total_score
                END AS final_score,
                CASE
                    WHEN se.result_mark IN ('غ ب ض', 'ق ض') THEN NULL::numeric
                    WHEN se.result_mark IN ('غ ض', 'م ح ض') THEN COALESCE(at.total_max, 100::numeric)
                    ELSE at.total_max
                END AS max_score,
                CASE
                    WHEN se.result_mark IN ('غ ب ض', 'ق ض') THEN NULL::numeric
                    WHEN se.result_mark IN ('غ ض', 'م ح ض') THEN 0::numeric
                    WHEN at.total_max > 0::numeric THEN round(at.total_score / at.total_max * 100::numeric, 2)
                    ELSE 0::numeric
                END AS percentage,
                CASE
                    WHEN se.result_mark IN ('غ ب ض', 'ق ض') THEN 'excused'::text
                    WHEN se.result_mark IN ('غ ض', 'م ح ض') THEN 'failed'::text
                    WHEN at.total_max > 0::numeric AND round(at.total_score / at.total_max * 100::numeric, 2) >= 48::numeric THEN 'passed'::text
                    ELSE 'failed'::text
                END AS course_status,
                CASE
                    WHEN se.result_mark IN ('غ ب ض', 'ق ض') THEN NULL::numeric
                    WHEN se.result_mark IN ('غ ض', 'م ح ض') THEN 0::numeric
                    WHEN at.total_max <= 0::numeric THEN 0::numeric
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) < 48::numeric THEN round(at.total_score / at.total_max * 100::numeric, 2)
                    WHEN round(at.total_score / at.total_max * 100::numeric, 2) < 50::numeric THEN 50::numeric
                    ELSE round(at.total_score / at.total_max * 100::numeric, 1)
                END AS official_result,
                CASE
                    WHEN se.result_mark IS NOT NULL THEN se.result_mark
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
             LEFT JOIN LATERAL ( SELECT sg.student_enrollment_id,
                    COALESCE(( SELECT gad.approved_final_result
                           FROM grade_appeal_details gad
                          WHERE gad.student_enrollment_id = se.id AND gad.result_change_applied_at IS NOT NULL AND gad.approved_final_result IS NOT NULL
                          ORDER BY gad.result_change_applied_at DESC
                         LIMIT 1), sum(sg.score)) AS total_score,
                    sum(gc.max_score) AS total_max
                   FROM student_grades sg
                     JOIN grade_components gc ON gc.id = sg.grade_component_id
                  WHERE sg.student_enrollment_id = se.id AND sg.status = 'approved'::text
                  GROUP BY sg.student_enrollment_id) at ON true
             JOIN student_profiles sp ON sp.id = se.student_profile_id
             JOIN course_sections cs ON cs.id = se.course_section_id
             JOIN course_offerings co ON co.id = cs.course_offering_id
             JOIN courses c ON c.id = co.course_id
             LEFT JOIN programs prog ON prog.id = co.program_id
             LEFT JOIN departments dept ON dept.id = c.department_id
             JOIN academic_years ay ON ay.id = co.academic_year_id
             JOIN semesters sem ON sem.id = co.semester_id
             JOIN academic_levels lvl ON lvl.id = co.level_id
          -- Same rows as before (an approved grade exists) plus enrollments
          -- that carry an official mark but have no grade row (excused marks).
          WHERE at.student_enrollment_id IS NOT NULL OR se.result_mark IS NOT NULL
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
    enrollment_rows.enrollment_status,
    enrollment_rows.notes,
    enrollment_rows.official_result,
    enrollment_rows.grade_label
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
    equivalency_rows.enrollment_status,
    equivalency_rows.notes,
    equivalency_rows.official_result,
    equivalency_rows.grade_label
   FROM equivalency_rows;

-- Semester summary: excused rows are listed in the transcript but are not
-- courses, hours or average inputs (avg() already skips their NULL percentage).
create or replace view public.student_transcript_summary
with (security_invoker = true) as
 SELECT student_profile_id,
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
    count(*) FILTER (WHERE course_status <> 'excused'::text)::integer AS courses_count,
    count(*) FILTER (WHERE course_status = 'passed'::text)::integer AS passed_count,
    count(*) FILTER (WHERE course_status = 'failed'::text)::integer AS failed_count,
    COALESCE(sum(credit_hours) FILTER (WHERE course_status <> 'excused'::text), 0::bigint)::integer AS registered_hours,
    COALESCE(sum(credit_hours) FILTER (WHERE course_status = 'passed'::text), 0::bigint)::integer AS passed_hours,
    round(avg(percentage), 2) AS avg_percentage
   FROM student_unofficial_transcript
  GROUP BY student_profile_id, academic_number, student_name_ar, academic_year_id, academic_year_name, semester_id, semester_name, semester_code, level_id, level_name, level_number;

notify pgrst, 'reload schema';

commit;

-- Post-check (read-only): rows with no mark must be unchanged; expect for CYB
-- 2025-2026 (section H25): 3346 rows = 3209 graded + 137 excused.
select course_status, count(*) from public.student_unofficial_transcript t
 join public.student_enrollments se on se.id = t.enrollment_id
 join public.course_sections cs on cs.id = se.course_section_id and cs.section_code = 'H25'
 group by 1 order by 1;
