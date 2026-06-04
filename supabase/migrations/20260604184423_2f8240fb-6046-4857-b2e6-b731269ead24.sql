-- PERFORMANCE-FIX-01: missing FK indexes (Quick Wins)
-- Safe: IF NOT EXISTS, no schema or data modifications, no RLS changes.

CREATE INDEX IF NOT EXISTS idx_programs_department_id ON public.programs(department_id);
CREATE INDEX IF NOT EXISTS idx_faculty_program_id ON public.faculty(program_id);
CREATE INDEX IF NOT EXISTS idx_research_papers_program_id ON public.research_papers(program_id);
CREATE INDEX IF NOT EXISTS idx_faculty_profiles_program_id ON public.faculty_profiles(program_id);
CREATE INDEX IF NOT EXISTS idx_student_academic_status_academic_year_id ON public.student_academic_status(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_student_academic_status_semester_id ON public.student_academic_status(semester_id);
CREATE INDEX IF NOT EXISTS idx_student_academic_status_level_id ON public.student_academic_status(level_id);
CREATE INDEX IF NOT EXISTS idx_courses_department_id ON public.courses(department_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_courses_course_id ON public.study_plan_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_courses_level_id ON public.study_plan_courses(level_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_courses_prerequisite_course_id ON public.study_plan_courses(prerequisite_course_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_suspension_details_requested_from_academic_year_id ON public.enrollment_suspension_details(requested_from_academic_year_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_suspension_details_requested_from_semester_id ON public.enrollment_suspension_details(requested_from_semester_id);
CREATE INDEX IF NOT EXISTS idx_extra_chance_details_academic_year_id ON public.extra_chance_details(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_extra_chance_details_semester_id ON public.extra_chance_details(semester_id);
CREATE INDEX IF NOT EXISTS idx_transfer_request_details_current_program_id ON public.transfer_request_details(current_program_id);
CREATE INDEX IF NOT EXISTS idx_transfer_request_details_requested_program_id ON public.transfer_request_details(requested_program_id);
CREATE INDEX IF NOT EXISTS idx_transfer_request_details_current_department_id ON public.transfer_request_details(current_department_id);
CREATE INDEX IF NOT EXISTS idx_transfer_request_details_requested_department_id ON public.transfer_request_details(requested_department_id);
CREATE INDEX IF NOT EXISTS idx_equivalency_courses_target_course_id ON public.equivalency_courses(target_course_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_fee_type_id ON public.student_fees(fee_type_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_academic_year_id ON public.student_fees(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_semester_id ON public.student_fees(semester_id);
CREATE INDEX IF NOT EXISTS idx_student_discounts_discount_type_id ON public.student_discounts(discount_type_id);
CREATE INDEX IF NOT EXISTS idx_student_discounts_semester_id ON public.student_discounts(semester_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_student_payment_id ON public.payment_receipts(student_payment_id);
CREATE INDEX IF NOT EXISTS idx_class_schedule_time_slot_id ON public.class_schedule(time_slot_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_grade_appeal_details_academic_year_id ON public.grade_appeal_details(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_grade_appeal_details_student_enrollment_id ON public.grade_appeal_details(student_enrollment_id);

-- Try to enable pg_stat_statements (best-effort; ignore if platform disallows)
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_stat_statements not enabled: %', SQLERRM;
  END;
END $$;