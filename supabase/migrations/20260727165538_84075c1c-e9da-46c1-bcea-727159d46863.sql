
INSERT INTO public.student_profiles
  (id, user_id, academic_number, full_name_ar, full_name_en, email,
   department_id, program_id, status, must_change_password,
   study_system, student_study_status)
VALUES
  ('b1e20002-0000-4000-8000-000000000002',
   '57e805dc-f975-4834-b1cb-f99c09756980',
   'TEST_ONLY_B1_0002',
   'طالب اختباري TEST_ONLY 02',
   'TEST_ONLY Student B1 02',
   'test-only.b1.e2e02@testonly.quboolye.com',
   'ce485c67-5f7c-498d-b120-4b1130a86ae8',
   '97638001-87cd-4df0-abe9-63c829504072',
   'active', false, 'regular', 'new');

INSERT INTO public.student_academic_status
  (student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
VALUES
  ('b1e20002-0000-4000-8000-000000000002',
   '6b297abe-b4d5-47f0-a24e-ea25c7c691f6',
   'd4dc2d92-00ce-4ea0-a7ed-da06d546512f',
   'f2361240-2d15-412e-9795-da706bdb568d',
   'active');

INSERT INTO public.student_enrollments
  (student_profile_id, course_section_id, enrollment_status)
VALUES
  ('b1e20002-0000-4000-8000-000000000002',
   '92a920b4-5e7d-401c-aae3-aa2f22c8b1b9',
   'enrolled');
