-- Fixtures: one B1 request (file_withdrawal) with an active step 1 and a
-- pending step 2, plus one department_transfer request for the scope case.
-- All ids are literal so the concurrency cases can address them.

INSERT INTO public.departments (id, name) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'DEPT_A'),
  ('dddddddd-0000-0000-0000-000000000002', 'DEPT_B');

INSERT INTO public.position_assignments (id, user_id, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', true);

-- unit/role scope under test
-- unit U1 / role R1  -> plain staff identity
INSERT INTO public.request_processing_assignments
  (id, unit_id, role_id, assignment_type, staff_profile_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'uuuuuuuu-0000-0000-0000-000000000001',
   'rrrrrrrr-0000-0000-0000-000000000001',
   'staff_profile', '22222222-0000-0000-0000-000000000001', true);

-- unit U2 / role R2 -> department scoped position assignments
INSERT INTO public.request_processing_assignments
  (id, unit_id, role_id, assignment_type, position_assignment_id, department_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'uuuuuuuu-0000-0000-0000-000000000002',
   'rrrrrrrr-0000-0000-0000-000000000002',
   'position_assignment', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', true),
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'uuuuuuuu-0000-0000-0000-000000000002',
   'rrrrrrrr-0000-0000-0000-000000000002',
   'position_assignment', 'aaaaaaaa-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000002', true);

INSERT INTO public.student_requests (id, request_number, request_type, status) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'LOCAL-FW-1', 'file_withdrawal', 'submitted'),
  ('cccccccc-0000-0000-0000-000000000002', 'LOCAL-TR-1', 'transfer', 'submitted'),
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
   'uuuuuuuu-0000-0000-0000-000000000001', 'rrrrrrrr-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000001"}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   2, 'registrar_review', 'pending',
   'uuuuuuuu-0000-0000-0000-000000000001', 'rrrrrrrr-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000001"}'::jsonb);

INSERT INTO public.student_request_workflow_steps
  (id, student_request_id, step_order, step_key, status,
   processing_unit_id, processing_role_id, assigned_position_assignment_id, metadata) VALUES
  ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   2, 'source_department_head_approval', 'pending',
   'uuuuuuuu-0000-0000-0000-000000000002', 'rrrrrrrr-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '{"direct_assignment_id":"bbbbbbbb-0000-0000-0000-000000000002"}'::jsonb);

-- Legacy control row: enrollment_certificate must never be touched by the guard.
INSERT INTO public.student_request_workflow_steps
  (id, student_request_id, step_order, step_key, status,
   processing_unit_id, processing_role_id, metadata) VALUES
  ('eeeeeeee-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000009',
   1, 'document_issuance', 'pending', NULL, NULL, '{}'::jsonb);
