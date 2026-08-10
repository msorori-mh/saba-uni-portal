-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- Canonical fixture: Fixture-13 assignment prestate
--
-- Fixture-13 expects request_processing_assignments with singular identity kinds
-- matching the Migration-29 runtime-assignee contract. The old canonical schema
-- left non-department assignments as assignment_type='user'. This prestate
-- creates the required auth.users, staff_profiles, faculty_profile, positions,
-- and position_assignments, then rewrites the assignments to the expected kinds.
-- All rows are TEST_ONLY and never mutated by the 267 cases.
-- ============================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Expected Fixture-13 actor users
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('c8a94548-4782-4252-86f9-23559d3b95bd', 'test-sa-spec-13@usr.edu.ye'),
  ('aac0e62d-4e8b-4440-b649-caa388d34837', 'test-sa-mgr-13@usr.edu.ye'),
  ('4c261c1c-97fb-42da-a544-e8a59853ebe3', 'test-registrar-13@usr.edu.ye'),
  ('b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0', 'test-dean-13@usr.edu.ye'),
  ('79783c0f-8d95-4110-8239-0ac504d63a24', 'test-finance-13@usr.edu.ye'),
  ('e7a93314-bb06-4525-b412-5315198c668a', 'test-library-13@usr.edu.ye'),
  ('67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', 'test-labs-13@usr.edu.ye'),
  ('aec1303e-de6a-4580-94cf-7205c17b5535', 'test-archive-13@usr.edu.ye')
ON CONFLICT (id) DO NOTHING;

-- Ensure the three faculty/auth users Fixture-13 expects for department heads exist.
INSERT INTO auth.users (id, email) VALUES
  ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e', 'test-head-it-13@usr.edu.ye'),
  ('97acbe02-c59c-409c-8d51-7d4ef72e6db7', 'test-head-cs-13@usr.edu.ye'),
  ('f602b62c-194b-4591-8e9c-956e5cbb347d', 'test-head-cis-13@usr.edu.ye')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Staff profiles for the eight non-dean, non-department-head roles
-- ---------------------------------------------------------------------------
INSERT INTO public.staff_profiles (
  id, user_id, employee_number, full_name_ar, full_name_en, department_id, job_title, role_type, status
) VALUES
  ('c8a94548-4782-4252-86f9-23559d3b95be', 'c8a94548-4782-4252-86f9-23559d3b95bd', 'ST-SA-SPEC-13', 'أخصائي شؤون الطلاب 13', 'SA Specialist 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'أخصائي شؤون الطلاب', 'student_affairs_specialist', 'active'),
  ('aac0e62d-4e8b-4440-b649-caa388d34838', 'aac0e62d-4e8b-4440-b649-caa388d34837', 'ST-SA-MGR-13', 'مدير شؤون الطلاب 13', 'SA Manager 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'مدير شؤون الطلاب', 'student_affairs_manager', 'active'),
  ('4c261c1c-97fb-42da-a544-e8a59853ebe4', '4c261c1c-97fb-42da-a544-e8a59853ebe3', 'ST-REG-13', 'مسجل عام 13', 'Registrar General 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'مسجل عام', 'registrar_general', 'active'),
  ('79783c0f-8d95-4110-8239-0ac504d63a25', '79783c0f-8d95-4110-8239-0ac504d63a24', 'ST-FIN-13', 'مختص الإيرادات 13', 'Finance Officer 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'مختص الإيرادات المالية', 'revenue_finance_officer', 'active'),
  ('e7a93314-bb06-4525-b412-5315198c668b', 'e7a93314-bb06-4525-b412-5315198c668a', 'ST-LIB-13', 'أمين المكتبة 13', 'Library Officer 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'أمين المكتبة', 'library_officer', 'active'),
  ('67b39ee4-4918-4b00-b4cc-0d5046ac8a5b', '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', 'ST-LAB-13', 'مسؤول المعامل 13', 'Labs Manager 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'مسؤول المعامل', 'labs_manager', 'active'),
  ('aec1303e-de6a-4580-94cf-7205c17b5536', 'aec1303e-de6a-4580-94cf-7205c17b5535', 'ST-ARC-13', 'مسؤول الأرشيف 13', 'Archive Officer 13', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'مسؤول الأرشيف', 'archive_officer', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Dean faculty profile
-- ---------------------------------------------------------------------------
INSERT INTO public.faculty (id, employee_id, full_name_ar, full_name_en) VALUES
  ('b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf1', 'F-DEAN-13', 'عميد تجريبي 13', 'Test Dean 13')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.faculty_profiles (
  id, user_id, faculty_id, employee_number, full_name_ar, full_name_en, department_id, position_title, status
) VALUES
  ('b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf2', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf1', 'F-DEAN-13', 'عميد تجريبي 13', 'Test Dean 13', NULL, 'عميد', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Department head organizational positions and assignments
-- ---------------------------------------------------------------------------
INSERT INTO public.organizational_positions (id, code, name_ar, name_en, unit_type, is_active) VALUES
  ('bb000001-0000-4000-8000-000000000001', 'dept_head_it_13', 'رئيس قسم تكنولوجيا المعلومات', 'Head of IT Department', 'position', true),
  ('bb000002-0000-4000-8000-000000000002', 'dept_head_cs_13', 'رئيس قسم علوم الحاسوب', 'Head of CS Department', 'position', true),
  ('bb000003-0000-4000-8000-000000000003', 'dept_head_cis_13', 'رئيس قسم نظم المعلومات', 'Head of CIS Department', 'position', true)
ON CONFLICT (id) DO NOTHING;

-- Deactivate any pre-existing active position assignments for these positions
-- so the uniq_active_position_holder partial index is satisfied.
UPDATE public.position_assignments SET is_active = false
WHERE position_id IN ('bb000001-0000-4000-8000-000000000001','bb000002-0000-4000-8000-000000000002','bb000003-0000-4000-8000-000000000003')
  AND is_active = true;

INSERT INTO public.position_assignments (id, position_id, user_id, assigned_from, is_active) VALUES
  ('bb000011-0000-4000-8000-000000000001', 'bb000001-0000-4000-8000-000000000001', 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e', CURRENT_DATE, true),
  ('bb000012-0000-4000-8000-000000000002', 'bb000002-0000-4000-8000-000000000002', '97acbe02-c59c-409c-8d51-7d4ef72e6db7', CURRENT_DATE, true),
  ('bb000013-0000-4000-8000-000000000003', 'bb000003-0000-4000-8000-000000000003', 'f602b62c-194b-4591-8e9c-956e5cbb347d', CURRENT_DATE, true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rewrite request_processing_assignments to the expected singular identity kinds.
-- Deactivate any unexpected duplicates first.
-- ---------------------------------------------------------------------------
UPDATE public.request_processing_assignments SET is_active = false
WHERE id IN (
  SELECT a.id FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id
  JOIN public.request_processing_roles r ON r.id = a.role_id
  WHERE u.code IN ('student_affairs','registrar','dean','finance','library','labs','archive','department')
);

WITH u AS (SELECT id, code FROM public.request_processing_units),
     r AS (SELECT id, code FROM public.request_processing_roles)
INSERT INTO public.request_processing_assignments (
  id, unit_id, role_id, assignment_type, user_id, staff_profile_id, faculty_profile_id,
  position_assignment_id, department_id, is_active
) VALUES
  ('cc000001-0000-4000-8000-000000000001',
   (SELECT id FROM u WHERE code='student_affairs'),
   (SELECT id FROM r WHERE code='student_affairs_specialist'),
   'staff_profile', NULL, 'c8a94548-4782-4252-86f9-23559d3b95be', NULL, NULL, NULL, true),
  ('cc000002-0000-4000-8000-000000000002',
   (SELECT id FROM u WHERE code='student_affairs'),
   (SELECT id FROM r WHERE code='student_affairs_manager'),
   'staff_profile', NULL, 'aac0e62d-4e8b-4440-b649-caa388d34838', NULL, NULL, NULL, true),
  ('cc000003-0000-4000-8000-000000000003',
   (SELECT id FROM u WHERE code='registrar'),
   (SELECT id FROM r WHERE code='registrar_general'),
   'staff_profile', NULL, '4c261c1c-97fb-42da-a544-e8a59853ebe4', NULL, NULL, NULL, true),
  ('cc000004-0000-4000-8000-000000000004',
   (SELECT id FROM u WHERE code='dean'),
   (SELECT id FROM r WHERE code='dean'),
   'faculty_profile', NULL, NULL, 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf2', NULL, NULL, true),
  ('cc000005-0000-4000-8000-000000000005',
   (SELECT id FROM u WHERE code='finance'),
   (SELECT id FROM r WHERE code='revenue_finance_officer'),
   'staff_profile', NULL, '79783c0f-8d95-4110-8239-0ac504d63a25', NULL, NULL, NULL, true),
  ('cc000006-0000-4000-8000-000000000006',
   (SELECT id FROM u WHERE code='library'),
   (SELECT id FROM r WHERE code='library_officer'),
   'staff_profile', NULL, 'e7a93314-bb06-4525-b412-5315198c668b', NULL, NULL, NULL, true),
  ('cc000007-0000-4000-8000-000000000007',
   (SELECT id FROM u WHERE code='labs'),
   (SELECT id FROM r WHERE code='labs_manager'),
   'staff_profile', NULL, '67b39ee4-4918-4b00-b4cc-0d5046ac8a5b', NULL, NULL, NULL, true),
  ('cc000008-0000-4000-8000-000000000008',
   (SELECT id FROM u WHERE code='archive'),
   (SELECT id FROM r WHERE code='archive_officer'),
   'staff_profile', NULL, 'aec1303e-de6a-4580-94cf-7205c17b5536', NULL, NULL, NULL, true),
  ('cc000009-0000-4000-8000-000000000009',
   (SELECT id FROM u WHERE code='department'),
   (SELECT id FROM r WHERE code='department_head'),
   'position_assignment', NULL, NULL, NULL, 'bb000011-0000-4000-8000-000000000001', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', true),
  ('cc000010-0000-4000-8000-000000000010',
   (SELECT id FROM u WHERE code='department'),
   (SELECT id FROM r WHERE code='department_head'),
   'position_assignment', NULL, NULL, NULL, 'bb000012-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', true),
  ('cc000011-0000-4000-8000-000000000011',
   (SELECT id FROM u WHERE code='department'),
   (SELECT id FROM r WHERE code='department_head'),
   'position_assignment', NULL, NULL, NULL, 'bb000013-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', true)
ON CONFLICT (id) DO UPDATE SET
  unit_id = EXCLUDED.unit_id,
  role_id = EXCLUDED.role_id,
  assignment_type = EXCLUDED.assignment_type,
  user_id = EXCLUDED.user_id,
  staff_profile_id = EXCLUDED.staff_profile_id,
  faculty_profile_id = EXCLUDED.faculty_profile_id,
  position_assignment_id = EXCLUDED.position_assignment_id,
  department_id = EXCLUDED.department_id,
  is_active = true;
