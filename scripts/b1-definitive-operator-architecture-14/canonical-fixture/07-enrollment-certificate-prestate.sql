-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- Canonical fixture: Fixture-13 prestate
--
-- Fixture-13 preconditions require:
--   * migration head exactly 20260731203030
--   * 5 B1 services active and hidden
--   * enrollment_certificate active and visible
--   * fixture student profile TEST_ONLY_B1_0002 in IT program/department
--   * 4 enrollment_certificate requests, 2 certificate document details,
--     2 official documents as protected sentinels
--
-- These rows are TEST_ONLY markers and are never mutated.
-- ============================================================================
\set ON_ERROR_STOP on

UPDATE public.request_types
   SET student_visible = false, updated_at = now()
 WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
   AND student_visible IS DISTINCT FROM false;

INSERT INTO public.student_profiles (
  id, user_id, academic_number, full_name_ar, full_name_en, department_id, program_id, status
) VALUES
  ('b1e20002-0000-4000-8000-000000000002', 'b1e20002-0000-4000-8000-000000000002', 'TEST_ONLY_B1_0002', 'طالب تجريبي 2', 'Test Student 2', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', '97638001-87cd-4df0-abe9-63c829504072', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_requests (
  id, request_number, request_type, title, status, student_profile_id,
  form_data, created_at, updated_at
) VALUES
  ('ec130001-0000-4000-8000-000000000001', 'SR-20260801-EC000001', 'enrollment_certificate', 'شهادة قيد', 'completed', 'b1e20002-0000-4000-8000-000000000002', '{"marker":"TEST_ONLY_B1_PRESTATE"}'::jsonb, now(), now()),
  ('ec130002-0000-4000-8000-000000000002', 'SR-20260801-EC000002', 'enrollment_certificate', 'شهادة قيد', 'completed', 'b1e20002-0000-4000-8000-000000000002', '{"marker":"TEST_ONLY_B1_PRESTATE"}'::jsonb, now(), now()),
  ('ec130003-0000-4000-8000-000000000003', 'SR-20260801-EC000003', 'enrollment_certificate', 'شهادة قيد', 'completed', 'b1e20002-0000-4000-8000-000000000002', '{"marker":"TEST_ONLY_B1_PRESTATE"}'::jsonb, now(), now()),
  ('ec130004-0000-4000-8000-000000000004', 'SR-20260801-EC000004', 'enrollment_certificate', 'شهادة قيد', 'completed', 'b1e20002-0000-4000-8000-000000000002', '{"marker":"TEST_ONLY_B1_PRESTATE"}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.official_documents (
  id, student_profile_id, document_type, document_number, verification_code, status, issued_at, created_at, updated_at
) VALUES
  ('0d130001-0000-4000-8000-000000000001', 'b1e20002-0000-4000-8000-000000000002', 'enrollment_certificate', 'EC-DOC-0001', 'EC-VER-0001', 'issued', now(), now(), now()),
  ('0d130002-0000-4000-8000-000000000002', 'b1e20002-0000-4000-8000-000000000002', 'enrollment_certificate', 'EC-DOC-0002', 'EC-VER-0002', 'issued', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.enrollment_certificate_document_details (
  id, official_document_id, student_request_id, student_profile_id, academic_number, student_name_ar,
  department_id, department_name_ar, program_id, program_name_ar, academic_year_id, academic_year_name,
  semester_id, semester_name, level_id, level_name, enrollment_status, issued_snapshot_at, created_at, updated_at
) VALUES
  ('ecdd1301-0000-4000-8000-000000000001', '0d130001-0000-4000-8000-000000000001', 'ec130001-0000-4000-8000-000000000001', 'b1e20002-0000-4000-8000-000000000002', 'TEST_ONLY_B1_0002', 'طالب تجريبي 2',
   'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'تكنولوجيا المعلومات', '97638001-87cd-4df0-abe9-63c829504072', 'تكنولوجيا المعلومات',
   '6b297abe-b4d5-47f0-a24e-ea25c7c691f6', '2025-2026', 'd4dc2d92-00ce-4ea0-a7ed-da06d546512f', 'الفصل الأول',
   'f2361240-2d15-412e-9795-da706bdb568d', 'المستوى الأول', 'active', now(), now(), now()),
  ('ecdd1302-0000-4000-8000-000000000002', '0d130002-0000-4000-8000-000000000002', 'ec130002-0000-4000-8000-000000000002', 'b1e20002-0000-4000-8000-000000000002', 'TEST_ONLY_B1_0002', 'طالب تجريبي 2',
   'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'تكنولوجيا المعلومات', '97638001-87cd-4df0-abe9-63c829504072', 'تكنولوجيا المعلومات',
   '6b297abe-b4d5-47f0-a24e-ea25c7c691f6', '2025-2026', 'd4dc2d92-00ce-4ea0-a7ed-da06d546512f', 'الفصل الأول',
   'f2361240-2d15-412e-9795-da706bdb568d', 'المستوى الأول', 'active', now(), now(), now())
ON CONFLICT (id) DO NOTHING;
