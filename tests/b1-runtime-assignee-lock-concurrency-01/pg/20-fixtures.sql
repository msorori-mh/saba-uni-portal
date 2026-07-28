-- Fixtures: one B1 request (file_withdrawal) with an active step 1 and a
-- pending step 2, one department_transfer request for the scope case, one
-- faculty-backed B1 step for the profile-identity cases, and one legacy
-- enrollment_certificate control row.
-- All ids are literal so the concurrency cases can address them.

INSERT INTO public.departments (id, name) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'DEPT_A'),
  ('dddddddd-0000-0000-0000-000000000002', 'DEPT_B');

INSERT INTO public.position_assignments (id, user_id, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', true);

-- Mutable principals behind the assignments.
INSERT INTO public.staff_profiles (id, user_id, status) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000a', 'active'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-00000000000b', 'active');

INSERT INTO public.faculty_profiles (id, user_id, status, department_id) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000c', 'active',
   'dddddddd-0000-0000-0000-000000000001');

-- unit/role scope under test
-- unit U1 / role R1  -> plain staff identity
INSERT INTO public.request_processing_assignments
  (id, unit_id, role_id, assignment_type, staff_profile_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000001',
   'staff_profile', '22222222-0000-0000-0000-000000000001', true);

-- unit U2 / role R2 -> department scoped position assignments
INSERT INTO public.request_processing_assignments
  (id, unit_id, role_id, assignment_type, position_assignment_id, department_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'f1000000-0000-0000-0000-000000000002',
   'f2000000-0000-0000-0000-000000000002',
   'position_assignment', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', true),
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'f1000000-0000-0000-0000-000000000002',
   'f2000000-0000-0000-0000-000000000002',
   'position_assignment', 'aaaaaaaa-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000002', true);

-- unit U3 / role R3 -> faculty identity (faculty profile mutation cases)
INSERT INTO public.request_processing_assignments
  (id, unit_id, role_id, assignment_type, faculty_profile_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000004',
   'f1000000-0000-0000-0000-000000000003',
   'f2000000-0000-0000-0000-000000000003',
   'faculty_profile', '33333333-0000-0000-0000-000000000001', true);

INSERT INTO public.student_requests (id, request_number, request_type, status) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'LOCAL-FW-1', 'file_withdrawal', 'submitted'),
  ('cccccccc-0000-0000-0000-000000000002', 'LOCAL-TR-1', 'transfer', 'submitted'),
  ('cccccccc-0000-0000-0000-000000000003', 'LOCAL-ES-1', 'enrollment_suspension', 'submitted'),
  ('cccccccc-0000-0000-0000-000000000009', 'LOCAL-EC-1', 'enrollment_certificate', 'submitted');

INSERT INTO public.transfer_request_details
  (request_id, current_department_id, requested_department_id) VALUES
  ('cccccccc-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002');

INSERT INTO public.student_request_workflow_steps
  (id, student_request_id, step_order, step_key, status,
   processing_unit_id, processing_role_id, assigned_staff_profile_id, metadata) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   1, 'student_affairs_review', 'active',
   'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000001"}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   2, 'registrar_review', 'pending',
   'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000001"}'::jsonb);

INSERT INTO public.student_request_workflow_steps
  (id, student_request_id, step_order, step_key, status,
   processing_unit_id, processing_role_id, assigned_position_assignment_id, metadata) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   2, 'source_department_head_approval', 'pending',
   'f1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000002"}'::jsonb);

-- Faculty-backed B1 step for the faculty_profiles identity cases.
INSERT INTO public.student_request_workflow_steps
  (id, student_request_id, step_order, step_key, status,
   processing_unit_id, processing_role_id, assigned_faculty_profile_id, metadata) VALUES
  ('eeeeeeee-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003',
   1, 'academic_advisor_review', 'pending',
   'f1000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000003',
   '33333333-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000004"}'::jsonb);

-- Legacy control row: enrollment_certificate must never be touched by the guard.
INSERT INTO public.student_request_workflow_steps
  (id, student_request_id, step_order, step_key, status,
   processing_unit_id, processing_role_id, metadata) VALUES
  ('eeeeeeee-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000009',
   1, 'document_issuance', 'pending', NULL, NULL, '{}'::jsonb);
