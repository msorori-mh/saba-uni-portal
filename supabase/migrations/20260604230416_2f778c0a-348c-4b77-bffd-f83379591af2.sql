CREATE INDEX IF NOT EXISTS idx_student_grades_status ON public.student_grades (status);
CREATE INDEX IF NOT EXISTS idx_student_grades_enrollment ON public.student_grades (student_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_date ON public.student_payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_student_requests_submitted ON public.student_requests (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_created ON public.payment_receipts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grade_components_section ON public.grade_components (course_section_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_status ON public.student_enrollments (enrollment_status);