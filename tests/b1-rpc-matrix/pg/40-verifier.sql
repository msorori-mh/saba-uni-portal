-- =====================================================================
-- 40-verifier.sql - B1 RPC authorization matrix execution (LOCAL ONLY)
-- Every case asserts behavior of the 19-draft manifest plus the forward-only
-- F1/F2 authorization remediation. Results accumulate in e_rpcmatrix.results.
--
-- Case id convention: M01..M40 (core+extended matrix), X-*, H-01 harness gate.
-- status: PASS = actual matched matrix expectation; FAIL = mismatch.
-- =====================================================================

-- ---------- fixtures: requests -------------------------------------------
INSERT INTO public.student_requests(id, request_number, student_profile_id, request_type, status) VALUES
  ('ce000000-0000-4000-8000-000000000001','T-SUSP-01','33333333-3333-4333-8333-333333333301','enrollment_suspension','draft'),
  ('ce000000-0000-4000-8000-000000000002','T-ABS-01','33333333-3333-4333-8333-333333333301','absence_excuse','draft'),
  ('ce000000-0000-4000-8000-000000000003','T-TRANS-01','33333333-3333-4333-8333-333333333301','transfer','draft'),
  ('ce000000-0000-4000-8000-000000000004','T-FC-01','33333333-3333-4333-8333-333333333301','extra_chance','draft'),
  ('ce000000-0000-4000-8000-000000000005','T-FW-01','33333333-3333-4333-8333-333333333301','file_withdrawal','draft'),
  ('ce000000-0000-4000-8000-000000000006','T-SUSP-02','33333333-3333-4333-8333-333333333301','enrollment_suspension','draft'),
  ('ce000000-0000-4000-8000-000000000007','T-ABS-02','33333333-3333-4333-8333-333333333301','absence_excuse','draft'),
  ('ce000000-0000-4000-8000-000000000008','T-NONB1-01','33333333-3333-4333-8333-333333333301','enrollment_certificate','draft'),
  ('ce000000-0000-4000-8000-000000000009','T-FC-02','33333333-3333-4333-8333-333333333301','extra_chance','draft'),
  ('ce000000-0000-4000-8000-00000000000a','T-SUSP-03','33333333-3333-4333-8333-333333333301','enrollment_suspension','draft'),
  ('ce000000-0000-4000-8000-00000000000b','T-TRANS-02','33333333-3333-4333-8333-333333333301','transfer','draft'),
  ('ce000000-0000-4000-8000-00000000000c','T-SUSP-04','33333333-3333-4333-8333-333333333301','enrollment_suspension','draft'),
  ('ce000000-0000-4000-8000-00000000000d','T-SUSP-05','33333333-3333-4333-8333-333333333301','enrollment_suspension','draft'),
  ('ce000000-0000-4000-8000-00000000000f','T-SUSP-SCOPE','33333333-3333-4333-8333-333333333301','enrollment_suspension','draft')
ON CONFLICT (id) DO NOTHING;

-- non-B1 runtime step for M35 (no B1 boundary applies to this request type)
INSERT INTO public.student_request_workflow_steps(
  id, student_request_id, step_key, step_name_ar, step_order, status)
VALUES ('be000000-0000-4000-8000-00000000000e','ce000000-0000-4000-8000-000000000008',
        'legacy_review','Legacy review',1,'active')
ON CONFLICT (id) DO NOTHING;

-- Binding-scope regression fixtures. Both steps have the same direct assignee,
-- exact config/runtime unit+role, legal submit predecessor, and one legal
-- outgoing action. The actor intentionally has no processing binding.
-- The scope workflows stay 'draft'/inactive: the atomic submit RPC enforces
-- exactly one active workflow per request type
-- (B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE), and can_current_user_act_on_step
-- never consults workflow status, so the SCOPE-01/02 contract is unchanged.
INSERT INTO public.request_type_workflows(
  id,request_type_id,code,name_ar,version,status,is_active)
VALUES
  ('ec100000-0000-4000-8000-000000000001','99999999-0000-4000-8000-000000000009','scope-enrollment-certificate','Scope certificate',1,'draft',false),
  ('ec100000-0000-4000-8000-000000000002','99999999-0000-4000-8000-000000000001','scope-enrollment-suspension','Scope suspension',1,'draft',false);

INSERT INTO public.request_type_workflow_steps(
  id,workflow_id,step_key,step_name_ar,step_order,processing_unit_id,
  processing_role_id,assignment_strategy,action_type,status_on_enter,status_on_complete)
VALUES
  ('ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','scope_archive','Scope archive',1,
   'aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','specific_user','archive','active','completed'),
  ('ec200000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000002','scope_archive','Scope archive',1,
   'aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','specific_user','archive','active','completed');

INSERT INTO public.request_type_workflow_transitions(
  id,workflow_id,from_step_id,to_step_id,action_result,is_default)
VALUES
  ('ec400000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001',NULL,'ec200000-0000-4000-8000-000000000001','submit',true),
  ('ec400000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001',NULL,'archived',true),
  ('ec400000-0000-4000-8000-000000000003','ec100000-0000-4000-8000-000000000002',NULL,'ec200000-0000-4000-8000-000000000002','submit',true),
  ('ec400000-0000-4000-8000-000000000004','ec100000-0000-4000-8000-000000000002','ec200000-0000-4000-8000-000000000002',NULL,'archived',true);

-- Harness state construction (NOT an RPC bypass claim), same sanctioned
-- boundary path as e_rpcmatrix.advance_to: direct DML on a B1 runtime step
-- (enrollment_suspension request ce000000-...-000f) trips the seq05
-- trg_guard_b1_runtime_mutation_boundary trigger unless the b1.atomic_init
-- GUC is set. The DO block keeps the tx-local set_config scoped to this one
-- statement so the GUC cannot leak into later statements in the file.
DO $scope_fixtures$
BEGIN
  PERFORM set_config('b1.atomic_init','1',true);
  INSERT INTO public.student_request_workflow_steps(
    id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,
    step_order,processing_unit_id,processing_role_id,assigned_user_id,status,entered_at)
  VALUES
    ('ec300000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000008','ec100000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001',
     'scope_archive','Scope archive',1,'aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','22222222-2222-4222-8222-22222222220f','active',now()),
    ('ec300000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-00000000000f','ec100000-0000-4000-8000-000000000002','ec200000-0000-4000-8000-000000000002',
     'scope_archive','Scope archive',1,'aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','22222222-2222-4222-8222-22222222220f','active',now());
END
$scope_fixtures$;

SELECT e_rpcmatrix.exec_case('SCOPE-01','b1-direct-assignee-without-binding-denied','OK',
 '22222222-2222-4222-8222-22222222220f',
 format($$SELECT 1 / ((NOT public.can_current_user_act_on_step(%L::uuid,'archive'))::integer)$$,
   'ec300000-0000-4000-8000-000000000002'));

SELECT e_rpcmatrix.exec_case('SCOPE-02','enrollment-certificate-preserves-pre-b1-binding-contract','OK',
 '22222222-2222-4222-8222-22222222220f',
 format($$SELECT 1 / ((public.can_current_user_act_on_step(%L::uuid,'archive'))::integer)$$,
   'ec300000-0000-4000-8000-000000000001'));

-- SCOPE-03: B1 request stored under a CANONICAL code (excused_absence). The
-- minimal schema seed pins request_types to legacy aliases, so the verifier
-- registers the canonical stored code here (fixture only; no enforcement
-- change). Same draft/inactive scope-workflow pattern as SCOPE-01/02.
INSERT INTO public.request_types(id,code,name_ar,request_audience,is_active) VALUES
  ('99999999-0000-4000-8000-000000000010','excused_absence','Excused Absence (canonical)','student',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_requests(id, request_number, student_profile_id, request_type, status) VALUES
  ('ce000000-0000-4000-8000-000000000010','T-EA-CANON','33333333-3333-4333-8333-333333333301','excused_absence','draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.request_type_workflows(
  id,request_type_id,code,name_ar,version,status,is_active)
VALUES
  ('ec100000-0000-4000-8000-000000000003','99999999-0000-4000-8000-000000000010','scope-excused-absence','Scope excused absence',1,'draft',false);

INSERT INTO public.request_type_workflow_steps(
  id,workflow_id,step_key,step_name_ar,step_order,processing_unit_id,
  processing_role_id,assignment_strategy,action_type,status_on_enter,status_on_complete)
VALUES
  ('ec200000-0000-4000-8000-000000000003','ec100000-0000-4000-8000-000000000003','scope_archive','Scope archive',1,
   'aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','specific_user','archive','active','completed');

INSERT INTO public.request_type_workflow_transitions(
  id,workflow_id,from_step_id,to_step_id,action_result,is_default)
VALUES
  ('ec400000-0000-4000-8000-000000000005','ec100000-0000-4000-8000-000000000003',NULL,'ec200000-0000-4000-8000-000000000003','submit',true),
  ('ec400000-0000-4000-8000-000000000006','ec100000-0000-4000-8000-000000000003','ec200000-0000-4000-8000-000000000003',NULL,'archived',true);

DO $scope3_fixtures$
BEGIN
  PERFORM set_config('b1.atomic_init','1',true);
  INSERT INTO public.student_request_workflow_steps(
    id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,
    step_order,processing_unit_id,processing_role_id,assigned_user_id,status,entered_at)
  VALUES
    ('ec300000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000010','ec100000-0000-4000-8000-000000000003','ec200000-0000-4000-8000-000000000003',
     'scope_archive','Scope archive',1,'aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','22222222-2222-4222-8222-22222222220f','active',now());
END
$scope3_fixtures$;

SELECT e_rpcmatrix.exec_case('SCOPE-03','canonical-stored-code-direct-assignee-without-binding-denied','OK',
 '22222222-2222-4222-8222-22222222220f',
 format($$SELECT 1 / ((NOT public.can_current_user_act_on_step(%L::uuid,'archive'))::integer)$$,
   'ec300000-0000-4000-8000-000000000003'));

-- secure-attachment fixtures (attached state, owner = student1 user)
INSERT INTO public.student_request_attachment_uploads(
  id, student_request_id, student_profile_id, field_key, original_file_name,
  mime_type, size_bytes, storage_bucket, storage_object_path, upload_status, created_by)
VALUES
  ('af000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000002',
   '33333333-3333-4333-8333-333333333301','excuse_documents','medical-note.pdf',
   'application/pdf',2048,'student-request-secure-attachments',
   'student-requests/33333333-3333-4333-8333-333333333301/ce000000-0000-4000-8000-000000000002/af000000-0000-4000-8000-000000000001/content.pdf',
   'attached','11111111-1111-4111-8111-111111111101'),
  ('af000000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000003',
   '33333333-3333-4333-8333-333333333301','secondary_certificate','certificate.pdf',
   'application/pdf',4096,'student-request-secure-attachments',
   'student-requests/33333333-3333-4333-8333-333333333301/ce000000-0000-4000-8000-000000000003/af000000-0000-4000-8000-000000000002/content.pdf',
   'attached','11111111-1111-4111-8111-111111111101'),
  ('af000000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000007',
   '33333333-3333-4333-8333-333333333301','excuse_documents','clinic-report.pdf',
   'application/pdf',1024,'student-request-secure-attachments',
   'student-requests/33333333-3333-4333-8333-333333333301/ce000000-0000-4000-8000-000000000007/af000000-0000-4000-8000-000000000003/content.pdf',
   'attached','11111111-1111-4111-8111-111111111101'),
  ('af000000-0000-4000-8000-000000000004','ce000000-0000-4000-8000-00000000000b',
   '33333333-3333-4333-8333-333333333301','secondary_certificate','certificate-2.pdf',
   'application/pdf',4096,'student-request-secure-attachments',
   'student-requests/33333333-3333-4333-8333-333333333301/ce000000-0000-4000-8000-00000000000b/af000000-0000-4000-8000-000000000004/content.pdf',
   'attached','11111111-1111-4111-8111-111111111101')
ON CONFLICT (id) DO NOTHING;

-- ---------- M18..M22: happy-path submits (student, own draft, per service) --
SELECT e_rpcmatrix.exec_case('M18','submit-enrollment_suspension','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'enrollment_suspension',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","suspension_reason":"medical leave","suspension_duration_type":"one_semester","terms_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000001',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000001')));

SELECT e_rpcmatrix.exec_case('M19','submit-excused_absence','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'excused_absence',
   '{"course_section_id":"88888888-8888-4888-8888-888888888802","absence_date":"2026-07-20","reason_type":"medical","absence_reason_detail":"hospital visit note","excuse_documents":["af000000-0000-4000-8000-000000000001"]}'::jsonb,
   %L::timestamptz,'{af000000-0000-4000-8000-000000000001}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000002',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000002')));

SELECT e_rpcmatrix.exec_case('M20','submit-department_transfer','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'department_transfer',
   '{"target_department_id":"55555555-5555-4555-8555-555555555502","target_program_id":"66666666-6666-4666-8666-666666666602","transfer_reason":"career change to IT","secondary_certificate_file":"af000000-0000-4000-8000-000000000002"}'::jsonb,
   %L::timestamptz,'{af000000-0000-4000-8000-000000000002}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000003',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000003')));

SELECT e_rpcmatrix.exec_case('M21','submit-final_chance','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'final_chance',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","reason":"illness during finals","chance_type":"final_chance"}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000004',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000004')));

SELECT e_rpcmatrix.exec_case('M22','submit-file_withdrawal','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'file_withdrawal',
   '{"withdrawal_reason":"moving abroad permanently","impact_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000005',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000005')));

-- X-09/M27/M28 support + X-07/X-08/M23/M26/M29/M37 support + X-13 support
-- (second-wave submits; evidence rows logged as setup sub-results)
SELECT e_rpcmatrix.exec_case('X-07','setup-submit-abs2','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'excused_absence',
   '{"course_section_id":"88888888-8888-4888-8888-888888888802","absence_date":"2026-07-21","reason_type":"official","absence_reason_detail":"university assignment trip","excuse_documents":["af000000-0000-4000-8000-000000000003"]}'::jsonb,
   %L::timestamptz,'{af000000-0000-4000-8000-000000000003}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000007',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000007')));

SELECT e_rpcmatrix.exec_case('X-09','setup-submit-fc2','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'final_chance',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","reason":"documented emergency","chance_type":"final_chance"}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000009',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000009')));

SELECT e_rpcmatrix.exec_case('X-13','setup-submit-trans2','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'department_transfer',
   '{"target_department_id":"55555555-5555-4555-8555-555555555502","target_program_id":"66666666-6666-4666-8666-666666666602","transfer_reason":"second transfer test","secondary_certificate_file":"af000000-0000-4000-8000-000000000004"}'::jsonb,
   %L::timestamptz,'{af000000-0000-4000-8000-000000000004}'::uuid[])$$,
   'ce000000-0000-4000-8000-00000000000b',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-00000000000b')));

SELECT e_rpcmatrix.exec_case('M07','setup-submit-susp4','OK',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'enrollment_suspension',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","suspension_reason":"family reasons","suspension_duration_type":"full_year","terms_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-00000000000c',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-00000000000c')));

-- =====================================================================
-- Core act cases - enrollment_suspension (R_SUSP ce...0001)
-- =====================================================================
-- M01: exact authorized assignee, review on initial_review -> PASS.
SELECT e_rpcmatrix.exec_case('M01','exact-assignee-review','OK',
 '22222222-2222-4222-8222-222222222201',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'review')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='initial_review')));

-- harness state construction to reach step 2 (finding 1 makes step 1 unactable)
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000001','manager_approval');

-- M02: exact authorized assignee, approve on manager_approval -> PASS
SELECT e_rpcmatrix.exec_case('M02','exact-assignee-approve','OK',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='manager_approval')));

-- M30: wrong action on active registrar_apply -> DENY.
SELECT e_rpcmatrix.exec_case('M30','wrong-action-review-on-apply-step','42501',
 '22222222-2222-4222-8222-222222222203',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'review')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='registrar_apply')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M32: mutation on completed step (replay on manager_approval, completed by M02)
SELECT e_rpcmatrix.exec_case('M32','act-on-completed-step','P0001',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='manager_approval')),
 'B1_ACTIVE_STEP_REQUIRED');

-- M24: payment RPC on a non-payment service (enrollment_suspension)
SELECT e_rpcmatrix.exec_case('M24','payment-rpc-on-free-service','22023',
 '22222222-2222-4222-8222-222222222204',
 format($$SELECT public.record_external_university_payment_confirmation(%L::uuid,'payment_confirmed')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='registrar_apply')),
 'REQUEST_TYPE_NOT_EXTERNAL_PAYMENT_SERVICE');

-- =====================================================================
-- excused_absence (R_ABS ce...0002): owner gate, wrong role, replay, idempotency
-- =====================================================================
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000002','manager_review');

-- M04: student (request owner) on staff act RPC -> DENY (ownership gate)
SELECT e_rpcmatrix.exec_case('M04','student-owner-on-staff-act','42501',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002' AND s.step_key='manager_review')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M05: correct unit (student_affairs) wrong role (specialist on manager step)
SELECT e_rpcmatrix.exec_case('M05','correct-unit-wrong-role','42501',
 '22222222-2222-4222-8222-222222222201',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002' AND s.step_key='manager_review')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- X-07 setup: manager approves manager_review (positive control) -> completes step 2
SELECT e_rpcmatrix.exec_case('X-07','setup-approve-manager-review','OK',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002' AND s.step_key='manager_review')));

-- X-07: replay protection - same actor, same step, same action -> DENY
SELECT e_rpcmatrix.exec_case('X-07','replay-same-step','P0001',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002' AND s.step_key='manager_review')),
 'B1_ACTIVE_STEP_REQUIRED');

-- X-08: idempotency - repeated act attempt leaves exactly one approved event
SELECT e_rpcmatrix.exec_case('X-08','idempotent-replay-denied','P0001',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002' AND s.step_key='manager_review')),
 'B1_ACTIVE_STEP_REQUIRED');
SELECT e_rpcmatrix.log_result('X-08','exactly-one-approved-event',
  CASE WHEN (SELECT count(*) FROM public.student_request_workflow_events e
             JOIN public.student_request_workflow_steps s ON s.id=e.workflow_step_runtime_id
             WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002'
               AND s.step_key='manager_review' AND e.event_type='approved') = 1
       THEN 'PASS' ELSE 'FAIL' END,
  '1 approved event',
  (SELECT count(*)::text FROM public.student_request_workflow_events e
    JOIN public.student_request_workflow_steps s ON s.id=e.workflow_step_runtime_id
    WHERE s.student_request_id='ce000000-0000-4000-8000-000000000002'
      AND s.step_key='manager_review' AND e.event_type='approved'),
  'idempotency: replay did not duplicate the completion event');

-- =====================================================================
-- excused_absence second request (R_ABS2 ce...0007): wrong service, wrong
-- action, wrong step actor, legacy bypass
-- =====================================================================
-- M23: specialist (assignee of every intake) acting approve on the transfer
-- source-chair step -> DENY (exact-assignee mismatch; service-crossed actor)
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000003','source_department_head_approval');
SELECT e_rpcmatrix.exec_case('M23','cross-service-actor-on-chair-step','42501',
 '22222222-2222-4222-8222-222222222201',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000003' AND s.step_key='source_department_head_approval')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M26: wrong action on step - approve on review-typed intake step (R_ABS2)
SELECT e_rpcmatrix.exec_case('M26','approve-on-review-step','42501',
 '22222222-2222-4222-8222-222222222201',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000007' AND s.step_key='student_affairs_intake')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M29: apply_decision on review-typed intake step (deny; currently vocabulary
-- gate, post-remediation action/transition contract)
SELECT e_rpcmatrix.exec_case('M29','apply-on-review-step','42501',
 '22222222-2222-4222-8222-222222222201',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'apply_decision')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000007' AND s.step_key='student_affairs_intake')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M37: legacy act RPC on an active B1 step -> DENY (gate; trigger is a second barrier)
SELECT e_rpcmatrix.exec_case('M37','legacy-act-on-b1-step','42501',
 '22222222-2222-4222-8222-222222222201',
 format($$SELECT public.act_on_student_request_step(%L::uuid,'review')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000007' AND s.step_key='student_affairs_intake')));

-- M09: student owner acts on own request staff step (deny; currently the
-- vocabulary gate fires first for review, ownership gate denies post-remediation)
SELECT e_rpcmatrix.exec_case('M09','student-owner-review-own-step','42501',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'review')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000007' AND s.step_key='student_affairs_intake')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M12: unauthenticated act -> 28000
SELECT e_rpcmatrix.exec_case('M12','unauthenticated-act','28000', NULL,
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'review')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000007' AND s.step_key='student_affairs_intake')),
 'AUTHENTICATION_REQUIRED');

-- =====================================================================
-- file_withdrawal (R_FW ce...0005): clearance + archive steps
-- =====================================================================
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000005','library_clearance');
-- M10: library officer clear -> PASS
SELECT e_rpcmatrix.exec_case('M10','library-officer-clear','OK',
 '22222222-2222-4222-8222-222222222207',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'clear')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000005' AND s.step_key='library_clearance')));

SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000005','labs_clearance');
-- M11: labs manager clear -> PASS
SELECT e_rpcmatrix.exec_case('M11','labs-manager-clear','OK',
 '22222222-2222-4222-8222-222222222208',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'clear')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000005' AND s.step_key='labs_clearance')));

SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000005','archive');
-- M13: archive officer archive - PASSES. The TRUE final applied vocabulary
-- (20260714234442, last redefinition at debf9d04) INCLUDES 'archive', so the
-- exact assignee with a valid transition succeeds (fix round 2 correction:
-- the round-1 staging used a wrong 5-action vocabulary and wrongly expected
-- a vocabulary-gate denial here). Finding 1 survives for
-- review/clear/apply_decision/confirm_payment only.
SELECT e_rpcmatrix.exec_case('M13','archive-officer-archive','OK',
 '22222222-2222-4222-8222-222222222206',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'archive')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000005' AND s.step_key='archive')));

-- =====================================================================
-- department_transfer (R_TRANS ce...0003)
-- =====================================================================
-- M14: exact department-scoped chair, target department -> PASS
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000003','target_department_head_approval');
SELECT e_rpcmatrix.exec_case('M14','target-chair-approve','OK',
 '22222222-2222-4222-8222-22222222220c',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000003' AND s.step_key='target_department_head_approval')));

-- M06: registrar on dean step -> DENY
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000003','dean_approval');
SELECT e_rpcmatrix.exec_case('M06','registrar-on-dean-step','42501',
 '22222222-2222-4222-8222-222222222203',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000003' AND s.step_key='dean_approval')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M16: exact dean assignee -> PASS (activates payment_confirmation)
SELECT e_rpcmatrix.exec_case('M16','dean-approve-transfer','OK',
 '22222222-2222-4222-8222-222222222205',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000003' AND s.step_key='dean_approval')));

-- X-14: finance officer with user_id-typed binding confirms payment -> PASS
SELECT e_rpcmatrix.exec_case('X-14','user-typed-binding-payment-confirm','OK',
 '22222222-2222-4222-8222-222222222204',
 format($$SELECT public.record_external_university_payment_confirmation(%L::uuid,'payment_confirmed')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000003' AND s.step_key='payment_confirmation')));

-- =====================================================================
-- final_chance (R_FC ce...0004)
-- =====================================================================
-- M25: registrar on dean step -> DENY
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000004','dean_decision');
SELECT e_rpcmatrix.exec_case('M25','registrar-on-dean-decision','42501',
 '22222222-2222-4222-8222-222222222203',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000004' AND s.step_key='dean_decision')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M17: exact dean assignee -> PASS (activates payment_confirmation)
SELECT e_rpcmatrix.exec_case('M17','dean-approve-final-chance','OK',
 '22222222-2222-4222-8222-222222222205',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000004' AND s.step_key='dean_decision')));

-- M15: exact finance assignee confirms external payment -> PASS
-- (payment RPC performs its own checks; unaffected by finding 1)
SELECT e_rpcmatrix.exec_case('M15','finance-confirm-payment','OK',
 '22222222-2222-4222-8222-222222222204',
 format($$SELECT public.record_external_university_payment_confirmation(%L::uuid,'payment_confirmed')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000004' AND s.step_key='payment_confirmation')));

-- X-04: payment step exhausted - second confirmation -> DENY 22023
SELECT e_rpcmatrix.exec_case('X-04','payment-step-exhausted','22023',
 '22222222-2222-4222-8222-222222222204',
 format($$SELECT public.record_external_university_payment_confirmation(%L::uuid,'payment_confirmed')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000004' AND s.step_key='payment_confirmation')),
 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP');

-- =====================================================================
-- final_chance second request (R_FC2 ce...0009): inactive-binding divergence,
-- negative payment confirmation, payment-step wrong actions
-- =====================================================================
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000009','manager_review');

-- M08: inactive assignment on approve-typed step -> DENY.
UPDATE public.request_processing_assignments
   SET is_active = false
 WHERE unit_id='aaaaaaaa-0000-4000-8000-000000000001'
   AND role_id='bbbbbbbb-0000-4000-8000-000000000002';
SELECT e_rpcmatrix.exec_case('M08','inactive-binding-denied','42501',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009' AND s.step_key='manager_review')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M40: dean on the same active registrar step -> DENY exact assignee.
SELECT e_rpcmatrix.exec_case('M40','dean-on-registrar-step','42501',
 '22222222-2222-4222-8222-222222222205',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'apply_decision')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='registrar_apply')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M03: exact authorized assignee, apply_decision on registrar_apply -> PASS.
SELECT e_rpcmatrix.exec_case('M03','exact-assignee-apply-decision','OK',
 '22222222-2222-4222-8222-222222222203',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'apply_decision')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='registrar_apply')));
UPDATE public.request_processing_assignments
   SET is_active = true
 WHERE unit_id='aaaaaaaa-0000-4000-8000-000000000001'
   AND role_id='bbbbbbbb-0000-4000-8000-000000000002';

SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000009','dean_decision');
SELECT e_rpcmatrix.exec_case('X-09','setup-dean-approve-fc2','OK',
 '22222222-2222-4222-8222-222222222205',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009' AND s.step_key='dean_decision')));

-- X-09: negative payment confirmation - audited, never completes/advances
SELECT e_rpcmatrix.exec_case('X-09','payment-not-confirmed','OK',
 '22222222-2222-4222-8222-222222222204',
 format($$SELECT public.record_external_university_payment_confirmation(%L::uuid,'payment_not_confirmed','receipt not found at university')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009' AND s.step_key='payment_confirmation')));
SELECT e_rpcmatrix.log_result('X-09','step-remains-active',
  CASE WHEN (SELECT s.status FROM public.student_request_workflow_steps s
             WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009'
               AND s.step_key='payment_confirmation') = 'active'
       THEN 'PASS' ELSE 'FAIL' END,
  'active',
  (SELECT s.status FROM public.student_request_workflow_steps s
    WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009' AND s.step_key='payment_confirmation'),
  'negative verification never completes or advances the step');

-- M27: approve on confirm_payment-typed step -> DENY (action contract)
SELECT e_rpcmatrix.exec_case('M27','approve-on-payment-step','42501',
 '22222222-2222-4222-8222-222222222204',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009' AND s.step_key='payment_confirmation')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- M28: payment RPC on a non-payment step -> DENY 22023
SELECT e_rpcmatrix.exec_case('M28','payment-rpc-on-nonpayment-step','22023',
 '22222222-2222-4222-8222-222222222205',
 format($$SELECT public.record_external_university_payment_confirmation(%L::uuid,'payment_confirmed')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000009' AND s.step_key='dean_decision')),
 'INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP');

-- =====================================================================
-- department_transfer second request (R_TRANS2 ce...000b): role-without-binding
-- =====================================================================
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-00000000000b','dean_approval');
-- X-13: holds user_roles 'dean' but has no dean unit/role assignment -> DENY
SELECT e_rpcmatrix.exec_case('X-13','dean-role-without-binding','42501',
 '22222222-2222-4222-8222-22222222220f',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-00000000000b' AND s.step_key='dean_approval')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- =====================================================================
-- Processing-binding validity family
-- =====================================================================
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-00000000000c','manager_approval');

-- X-12c: legacy act RPC on an active B1 step - gate passes under v3, then the
-- seq5 runtime-boundary trigger blocks the direct mutation (defense in depth).
SELECT e_rpcmatrix.exec_case('X-12','legacy-act-trigger-boundary','42501',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_student_request_step(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-00000000000c' AND s.step_key='manager_approval')),
 'B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED');

-- M07: expired assignment (ends_at in past) -> DENY.
UPDATE public.request_processing_assignments
   SET ends_at = now() - interval '1 day'
 WHERE unit_id='aaaaaaaa-0000-4000-8000-000000000001'
   AND role_id='bbbbbbbb-0000-4000-8000-000000000002';
SELECT e_rpcmatrix.exec_case('M07','expired-binding-denied','42501',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-00000000000c' AND s.step_key='manager_approval')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');
UPDATE public.request_processing_assignments
   SET ends_at = NULL
 WHERE unit_id='aaaaaaaa-0000-4000-8000-000000000001'
   AND role_id='bbbbbbbb-0000-4000-8000-000000000002';

-- X-03: future-dated assignment (starts_at in future) -> DENY.
SELECT e_rpcmatrix.advance_to('ce000000-0000-4000-8000-000000000007','manager_review');
UPDATE public.request_processing_assignments
   SET starts_at = now() + interval '1 day'
 WHERE unit_id='aaaaaaaa-0000-4000-8000-000000000001'
   AND role_id='bbbbbbbb-0000-4000-8000-000000000002';
SELECT e_rpcmatrix.exec_case('X-03','future-binding-denied','42501',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000007' AND s.step_key='manager_review')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');
UPDATE public.request_processing_assignments
   SET starts_at = NULL
 WHERE unit_id='aaaaaaaa-0000-4000-8000-000000000001'
   AND role_id='bbbbbbbb-0000-4000-8000-000000000002';

-- =====================================================================
-- Terminal-state / ownership / non-B1 / direct-bypass family
-- =====================================================================
-- M31: submit on a completed request -> DENY
UPDATE public.student_requests SET status='completed', updated_at=now()
 WHERE id='ce000000-0000-4000-8000-000000000006';
SELECT e_rpcmatrix.exec_case('M31','submit-on-completed-request','42501',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'enrollment_suspension',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","suspension_reason":"second attempt","suspension_duration_type":"one_semester","terms_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-000000000006',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-000000000006')),
 'B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED');

-- M33: student submits another student's request id -> DENY
SELECT e_rpcmatrix.exec_case('M33','submit-other-students-request','42501',
 '11111111-1111-4111-8111-111111111102',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'enrollment_suspension',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","suspension_reason":"hijack attempt","suspension_duration_type":"one_semester","terms_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-00000000000a',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-00000000000a')),
 'B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED');

-- M34: staff actor (no student profile) calls student submit RPC -> DENY
SELECT e_rpcmatrix.exec_case('M34','staff-on-student-submit-rpc','42501',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'enrollment_suspension',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","suspension_reason":"staff attempt","suspension_duration_type":"one_semester","terms_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-00000000000a',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-00000000000a')),
 'ACTIVE_STUDENT_PROFILE_REQUIRED');

-- M35: act RPC on a non-B1 runtime step -> DENY (B1 RPC refuses non-B1 rows)
SELECT e_rpcmatrix.exec_case('M35','act-on-non-b1-step','P0001',
 '22222222-2222-4222-8222-222222222202',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   'be000000-0000-4000-8000-00000000000e'),
 'B1_REQUEST_REQUIRED');

-- X-11b: direct table mutation of a B1 runtime step (bypassing all RPCs) ->
-- seq5 runtime-boundary trigger denies.
SELECT e_rpcmatrix.exec_case('X-11','direct-runtime-step-mutation','42501',
 '22222222-2222-4222-8222-222222222202',
 format($$UPDATE public.student_request_workflow_steps SET comment='direct-bypass'
    WHERE id=%L::uuid$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-000000000001' AND s.step_key='registrar_apply')),
 'B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED');

-- X-12b: legacy submit RPC on a B1 draft (as owning student, superuser-exec) ->
-- seq5 submit-boundary trigger denies.
SELECT e_rpcmatrix.exec_case('X-12','legacy-submit-trigger-boundary','42501',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_student_request(%L::uuid)$$,
   'ce000000-0000-4000-8000-00000000000a'),
 'B1_ATOMIC_SUBMIT_BOUNDARY_REQUIRED');

-- =====================================================================
-- LOW-1 closure cases (fix round 2): cancelled-request mutation, admin
-- broad-bypass act, dean-on-registrar step - all executed DENY
-- =====================================================================
-- M38: mutation (submit) on a CANCELLED owned request -> DENY
UPDATE public.student_requests SET status='cancelled', updated_at=now()
 WHERE id='ce000000-0000-4000-8000-00000000000d';
SELECT e_rpcmatrix.exec_case('M38','submit-on-cancelled-request','42501',
 '11111111-1111-4111-8111-111111111101',
 format($$SELECT public.submit_b1_student_request_atomic(%L::uuid,'enrollment_suspension',
   '{"target_academic_year":"77777777-7777-4777-8777-777777777701","target_semester":"77777777-7777-4777-8777-777777777702","suspension_reason":"cancelled attempt","suspension_duration_type":"one_semester","terms_acknowledgment":true}'::jsonb,
   %L::timestamptz,'{}'::uuid[])$$,
   'ce000000-0000-4000-8000-00000000000d',
   (SELECT updated_at FROM public.student_requests WHERE id='ce000000-0000-4000-8000-00000000000d')),
 'B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED');

-- M39: admin (user_roles 'admin', NO direct assignment) tries to act on an
-- active B1 step -> DENY. 'approve' is in-vocabulary, so this executes the
-- exact-assignee gate itself: there is no admin broad bypass (seq2 strict
-- user_matches_workflow_runtime_step has no admin/dean fast path).
SELECT e_rpcmatrix.exec_case('M39','admin-broad-bypass-act','42501',
 '22222222-2222-4222-8222-22222222220e',
 format($$SELECT public.act_on_b1_student_request_step_atomic(%L::uuid,'approve')$$,
   (SELECT s.id FROM public.student_request_workflow_steps s
     WHERE s.student_request_id='ce000000-0000-4000-8000-00000000000b' AND s.step_key='dean_approval')),
 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED');

-- =====================================================================
-- Static-only matrix cases (documented, not executable in this harness)
-- =====================================================================
SELECT e_rpcmatrix.log_result('X-01','registrar-universal-read','STATIC',
 'documented in matrix + report','not executed',
 'recon note: registrar/admin universal READ is not hardened; read-path policy is a Track A/I follow-up');
SELECT e_rpcmatrix.log_result('X-02','admin-broad-read','STATIC',
 'documented in matrix + report','not executed',
 'same class as X-01; admin oversight RPC is an explicitly deferred follow-up in draft seq2');
SELECT e_rpcmatrix.log_result('X-05','direct-detail-dml-pre-cutover','STATIC',
 'documented in matrix + report','not executed',
 'pre-cutover ACL state no longer exists after the full 19-draft apply; post-cutover denial is executed as X-11');
SELECT e_rpcmatrix.log_result('X-06','direct-detail-dml-post-cutover','STATIC',
 'covered by X-11 execution','see X-11',
 'post-cutover direct detail DML denial is executed in 45-acl-cases.sql under X-11');
SELECT e_rpcmatrix.log_result('X-10','admin-read-broad','STATIC',
 'documented in matrix + report','not executed',
 'same class as X-01/X-02');
SELECT e_rpcmatrix.log_result('X-16','attachment-sqlstate-variance','STATIC',
 'documented in matrix + report','not executed',
 'attachment RPCs raise mixed sqlstates (some without explicit ERRCODE); documented as hardening note');
SELECT e_rpcmatrix.log_result('X-17','reject-return-unreachable','STATIC',
 'documented in matrix + report','not executed',
 'shipped B1 workflows define no reject/return edges; B1_SPECIALIZED_ACTION_RPC_REQUIRED is dead under gate order; both documented as design notes');
SELECT e_rpcmatrix.log_result('E-01','suspension-effect-coupling','STATIC',
 'documented in matrix + report','not executed',
 'final effect persistence is owned by separately ordered effect drafts; authorization of the apply step is covered by M03');
SELECT e_rpcmatrix.log_result('E-02','absence-effect-coupling','STATIC',
 'documented in matrix + report','not executed',
 'see E-01; B1_ABSENCE_EFFECT_ALREADY_APPLIED guard exists in the dispatcher');
SELECT e_rpcmatrix.log_result('E-03','withdrawal-effect-coupling','STATIC',
 'documented in matrix + report','not executed','see E-01');
SELECT e_rpcmatrix.log_result('E-04','transfer-effect-coupling','STATIC',
 'documented in matrix + report','not executed','see E-01');
SELECT e_rpcmatrix.log_result('E-05','final-chance-effect-coupling','STATIC',
 'documented in matrix + report','not executed',
 'see E-01; B1_FINAL_CHANCE_EFFECT_ALREADY_APPLIED guard exists in the dispatcher');
