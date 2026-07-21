-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-FIXTURES
-- Local PG 17.10 harness ONLY. Fixture rows covering ALL 8 final
-- classifications of DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01, plus decoys
-- proving the audit is semantic (exact unit/role codes) and NOT naming-based.
--
-- Fixture map (expected final_classification):
--   D1  MATCHED         1 current active assignment, holder = expected, in-unit
--   D2  MISSING         no chair rows; a decoy 'department_member' role row exists
--   D3  DUPLICATE       2 concurrently active chair assignments
--   D4  WRONG_UNIT      1 active assignment; holder profile belongs to D1
--   D5  WRONG_IDENTITY  1 active assignment; holder in-unit but wrong F-number
--   D6  INACTIVE        1 chair row with is_active = false (history preserved)
--   D7  EXPIRED         1 chair row is_active = true but ends_at in the past
--   D8  AMBIGUOUS       1 active assignment with NULL faculty_profile_id
--   D9  (out of scope)  active chair assignment NOT in expected_chairs ->
--                       out_of_scope_active_head_count = 1 on every audit row
-- ============================================================================

SET search_path TO b_chairs, public;

INSERT INTO b_chairs.departments (id, name_ar) VALUES
  ('d0000001-0000-4000-8000-000000000001', 'قسم تجريبي 1'),
  ('d0000002-0000-4000-8000-000000000002', 'قسم تجريبي 2'),
  ('d0000003-0000-4000-8000-000000000003', 'قسم تجريبي 3'),
  ('d0000004-0000-4000-8000-000000000004', 'قسم تجريبي 4'),
  ('d0000005-0000-4000-8000-000000000005', 'قسم تجريبي 5'),
  ('d0000006-0000-4000-8000-000000000006', 'قسم تجريبي 6'),
  ('d0000007-0000-4000-8000-000000000007', 'قسم تجريبي 7'),
  ('d0000008-0000-4000-8000-000000000008', 'قسم تجريبي 8'),
  ('d0000009-0000-4000-8000-000000000009', 'قسم تجريبي 9');

INSERT INTO b_chairs.request_processing_units (id, code, name_ar) VALUES
  ('e0000001-0000-4000-8000-000000000001', 'department', 'القسم'),
  ('e0000002-0000-4000-8000-000000000002', 'registrar',  'التسجيل');

INSERT INTO b_chairs.request_processing_roles (id, unit_id, code, name_ar) VALUES
  ('f0000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001', 'department_head',   'رئيس قسم'),
  ('f0000002-0000-4000-8000-000000000002', 'e0000001-0000-4000-8000-000000000001', 'department_member', 'عضو قسم'),
  ('f0000003-0000-4000-8000-000000000003', 'e0000002-0000-4000-8000-000000000002', 'registrar_general', 'مسجل عام');

INSERT INTO b_chairs.faculty_profiles (id, user_id, employee_number, full_name_ar, department_id) VALUES
  ('a0000001-0000-4000-8000-000000000001', 'c0000001-0000-4000-8000-000000000001', 'F0001', 'عضو تجريبي 1', 'd0000001-0000-4000-8000-000000000001'),
  ('a0000002-0000-4000-8000-000000000002', 'c0000002-0000-4000-8000-000000000002', 'F0002', 'عضو تجريبي 2', 'd0000002-0000-4000-8000-000000000002'),
  ('a0000003-0000-4000-8000-000000000003', 'c0000003-0000-4000-8000-000000000003', 'F0003', 'عضو تجريبي 3', 'd0000003-0000-4000-8000-000000000003'),
  ('a0000004-0000-4000-8000-000000000004', 'c0000004-0000-4000-8000-000000000004', 'F0004', 'عضو تجريبي 4', 'd0000004-0000-4000-8000-000000000004'),
  ('a0000005-0000-4000-8000-000000000005', 'c0000005-0000-4000-8000-000000000005', 'F0005', 'عضو تجريبي 5', 'd0000005-0000-4000-8000-000000000005'),
  ('a0000006-0000-4000-8000-000000000006', 'c0000006-0000-4000-8000-000000000006', 'F0006', 'عضو تجريبي 6', 'd0000006-0000-4000-8000-000000000006'),
  ('a0000007-0000-4000-8000-000000000007', 'c0000007-0000-4000-8000-000000000007', 'F0007', 'عضو تجريبي 7', 'd0000007-0000-4000-8000-000000000007'),
  ('a0000008-0000-4000-8000-000000000008', 'c0000008-0000-4000-8000-000000000008', 'F0008', 'عضو تجريبي 8', 'd0000008-0000-4000-8000-000000000008'),
  ('a0000098-0000-4000-8000-000000000098', 'c0000098-0000-4000-8000-000000000098', 'F0098', 'عضو بديل داخل القسم', 'd0000005-0000-4000-8000-000000000005'),
  ('a0000099-0000-4000-8000-000000000099', 'c0000099-0000-4000-8000-000000000099', 'F0099', 'عضو من قسم آخر',     'd0000001-0000-4000-8000-000000000001'),
  ('a0000009-0000-4000-8000-000000000009', 'c0000009-0000-4000-8000-000000000009', 'F0009', 'عضو تجريبي 9', 'd0000009-0000-4000-8000-000000000009');

-- D1 MATCHED
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000001-0000-4000-8000-000000000001', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000001-0000-4000-8000-000000000001', 'd0000001-0000-4000-8000-000000000001', true, now() - interval '30 days');

-- D2 MISSING: decoy row with a DIFFERENT role code (department_member) — must NOT count
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000002-0000-4000-8000-000000000002', 'e0000001-0000-4000-8000-000000000001', 'f0000002-0000-4000-8000-000000000002', 'faculty_profile', 'a0000002-0000-4000-8000-000000000002', 'd0000002-0000-4000-8000-000000000002', true, now() - interval '30 days');

-- D3 DUPLICATE: two concurrently active chair rows
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000003-0000-4000-8000-000000000003', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000003-0000-4000-8000-000000000003', 'd0000003-0000-4000-8000-000000000003', true, now() - interval '40 days'),
  ('b0000004-0000-4000-8000-000000000004', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000003-0000-4000-8000-000000000003', 'd0000003-0000-4000-8000-000000000003', true, now() - interval '10 days');

-- D4 WRONG_UNIT: holder F0099 belongs to D1, assignment scoped to D4
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000005-0000-4000-8000-000000000005', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000099-0000-4000-8000-000000000099', 'd0000004-0000-4000-8000-000000000004', true, now() - interval '30 days');

-- D5 WRONG_IDENTITY: holder F0098 is in D5 but is not the expected F0005
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000006-0000-4000-8000-000000000006', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000098-0000-4000-8000-000000000098', 'd0000005-0000-4000-8000-000000000005', true, now() - interval '30 days');

-- D6 INACTIVE: history row kept, is_active = false
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at, ends_at)
VALUES
  ('b0000007-0000-4000-8000-000000000007', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000006-0000-4000-8000-000000000006', 'd0000006-0000-4000-8000-000000000006', false, now() - interval '90 days', now() - interval '30 days');

-- D7 EXPIRED: is_active = true but the effective window already closed
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at, ends_at)
VALUES
  ('b0000008-0000-4000-8000-000000000008', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000007-0000-4000-8000-000000000007', 'd0000007-0000-4000-8000-000000000007', true, now() - interval '90 days', now() - interval '1 day');

-- D8 AMBIGUOUS: active row whose identity link is NULL (recon §6.3: allowed by design)
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000009-0000-4000-8000-000000000009', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', NULL, 'd0000008-0000-4000-8000-000000000008', true, now() - interval '5 days');

-- D9 OUT OF SCOPE: active chair assignment for a department NOT in expected_chairs
INSERT INTO b_chairs.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active, starts_at)
VALUES
  ('b0000010-0000-4000-8000-000000000010', 'e0000001-0000-4000-8000-000000000001', 'f0000001-0000-4000-8000-000000000001', 'faculty_profile', 'a0000009-0000-4000-8000-000000000009', 'd0000009-0000-4000-8000-000000000009', true, now() - interval '7 days');
