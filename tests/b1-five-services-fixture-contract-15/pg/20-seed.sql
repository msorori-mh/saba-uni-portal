-- Deterministic local seed reproducing the production principal + workflow
-- model that Fixture-13 depends on (IT source, CS target, CIS unrelated).
BEGIN;

INSERT INTO public.departments (id, code, name_ar) VALUES
 ('ce485c67-5f7c-498d-b120-4b1130a86ae8','IT','تقنية المعلومات'),
 ('11111111-1111-4111-8111-111111111111','CS','علوم الحاسوب'),
 ('22222222-2222-4222-8222-222222222222','CIS','نظم المعلومات');

INSERT INTO public.programs (id, department_id, name_ar) VALUES
 ('97638001-87cd-4df0-abe9-63c829504072','ce485c67-5f7c-498d-b120-4b1130a86ae8','بكالوريوس تقنية المعلومات'),
 ('8df96335-4197-4e33-85ca-a970608f6a63','11111111-1111-4111-8111-111111111111','بكالوريوس علوم الحاسوب');

INSERT INTO auth.users (id) VALUES
 ('c8a94548-4782-4252-86f9-23559d3b95bd'),
 ('aac0e62d-4e8b-4440-b649-caa388d34837'),
 ('4c261c1c-97fb-42da-a544-e8a59853ebe3'),
 ('b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0'),
 ('79783c0f-8d95-4110-8239-0ac504d63a24'),
 ('e7a93314-bb06-4525-b412-5315198c668a'),
 ('67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'),
 ('aec1303e-de6a-4580-94cf-7205c17b5535'),
 ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'),
 ('97acbe02-c59c-409c-8d51-7d4ef72e6db7'),
 ('f602b62c-194b-4591-8e9c-956e5cbb347d'),
 ('b1e20002-1111-4000-8000-000000000002');

-- staff principals
INSERT INTO public.staff_profiles (id, user_id) VALUES
 ('a0000000-0000-4000-8000-000000000001','c8a94548-4782-4252-86f9-23559d3b95bd'),
 ('a0000000-0000-4000-8000-000000000002','aac0e62d-4e8b-4440-b649-caa388d34837'),
 ('a0000000-0000-4000-8000-000000000003','4c261c1c-97fb-42da-a544-e8a59853ebe3'),
 ('a0000000-0000-4000-8000-000000000004','79783c0f-8d95-4110-8239-0ac504d63a24'),
 ('a0000000-0000-4000-8000-000000000005','e7a93314-bb06-4525-b412-5315198c668a'),
 ('a0000000-0000-4000-8000-000000000006','67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'),
 ('a0000000-0000-4000-8000-000000000007','aec1303e-de6a-4580-94cf-7205c17b5535');

-- dean is a faculty principal
INSERT INTO public.faculty_profiles (id, user_id, department_id) VALUES
 ('b0000000-0000-4000-8000-000000000001','b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0', NULL);

-- department heads are position assignments
INSERT INTO public.position_assignments (id, user_id, department_id) VALUES
 ('c0000000-0000-4000-8000-00000000000a','d4aaa5c9-72d1-4996-b0e8-d30c6327da6e','ce485c67-5f7c-498d-b120-4b1130a86ae8'),
 ('c0000000-0000-4000-8000-00000000000b','97acbe02-c59c-409c-8d51-7d4ef72e6db7','11111111-1111-4111-8111-111111111111'),
 ('c0000000-0000-4000-8000-00000000000c','f602b62c-194b-4591-8e9c-956e5cbb347d','22222222-2222-4222-8222-222222222222');

INSERT INTO public.student_profiles (id, user_id, academic_number, status, department_id, program_id) VALUES
 ('b1e20002-0000-4000-8000-000000000002','b1e20002-1111-4000-8000-000000000002',
  'TEST_ONLY_B1_0002','active','ce485c67-5f7c-498d-b120-4b1130a86ae8','97638001-87cd-4df0-abe9-63c829504072');

INSERT INTO public.request_processing_units (code) VALUES
 ('student_affairs'),('registrar'),('dean'),('finance'),('library'),('labs'),('archive'),('department');
INSERT INTO public.request_processing_roles (code) VALUES
 ('student_affairs_specialist'),('student_affairs_manager'),('registrar_general'),('dean'),
 ('revenue_finance_officer'),('library_officer'),('labs_manager'),('archive_officer'),('department_head');

INSERT INTO public.request_processing_assignments (unit_id, role_id, assignment_type, staff_profile_id, faculty_profile_id, position_assignment_id, department_id)
SELECT u.id, r.id, x.kind, x.staff, x.faculty, x.position, x.dept
FROM (VALUES
 ('student_affairs','student_affairs_specialist','staff_profile','a0000000-0000-4000-8000-000000000001'::uuid,NULL::uuid,NULL::uuid,NULL::uuid),
 ('student_affairs','student_affairs_manager','staff_profile','a0000000-0000-4000-8000-000000000002',NULL,NULL,NULL),
 ('registrar','registrar_general','staff_profile','a0000000-0000-4000-8000-000000000003',NULL,NULL,NULL),
 ('finance','revenue_finance_officer','staff_profile','a0000000-0000-4000-8000-000000000004',NULL,NULL,NULL),
 ('library','library_officer','staff_profile','a0000000-0000-4000-8000-000000000005',NULL,NULL,NULL),
 ('labs','labs_manager','staff_profile','a0000000-0000-4000-8000-000000000006',NULL,NULL,NULL),
 ('archive','archive_officer','staff_profile','a0000000-0000-4000-8000-000000000007',NULL,NULL,NULL),
 ('dean','dean','faculty_profile',NULL,'b0000000-0000-4000-8000-000000000001',NULL,NULL),
 ('department','department_head','position_assignment',NULL,NULL,'c0000000-0000-4000-8000-00000000000a','ce485c67-5f7c-498d-b120-4b1130a86ae8'),
 ('department','department_head','position_assignment',NULL,NULL,'c0000000-0000-4000-8000-00000000000b','11111111-1111-4111-8111-111111111111'),
 ('department','department_head','position_assignment',NULL,NULL,'c0000000-0000-4000-8000-00000000000c','22222222-2222-4222-8222-222222222222')
) AS x(unit, role, kind, staff, faculty, position, dept)
JOIN public.request_processing_units u ON u.code = x.unit
JOIN public.request_processing_roles r ON r.code = x.role;

INSERT INTO public.request_types (code, is_active, student_visible) VALUES
 ('enrollment_suspension', true, false),
 ('excused_absence',       true, false),
 ('department_transfer',   true, false),
 ('final_chance',          true, false),
 ('file_withdrawal',       true, false),
 ('enrollment_certificate',true, true);

INSERT INTO public.request_type_workflows (id, request_type_id)
SELECT ('d0000000-0000-4000-8000-00000000000' || row_number() over (order by rt.code))::uuid, rt.id
FROM public.request_types rt
WHERE rt.code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');

INSERT INTO public.request_type_workflow_steps (workflow_id, step_key, step_name_ar, step_order, processing_unit_id, processing_role_id, action_type)
SELECT w.id, x.step_key, x.step_key, x.step_order, u.id, r.id, x.action
FROM (VALUES
 ('department_transfer','student_affairs_intake',1,'student_affairs','student_affairs_specialist','review'),
 ('department_transfer','source_department_head_approval',2,'department','department_head','approve'),
 ('department_transfer','target_department_head_approval',3,'department','department_head','approve'),
 ('department_transfer','dean_approval',4,'dean','dean','approve'),
 ('department_transfer','payment_confirmation',5,'finance','revenue_finance_officer','confirm_payment'),
 ('department_transfer','registrar_apply',6,'registrar','registrar_general','apply_decision'),
 ('enrollment_suspension','initial_review',1,'student_affairs','student_affairs_specialist','review'),
 ('enrollment_suspension','manager_approval',2,'student_affairs','student_affairs_manager','approve'),
 ('enrollment_suspension','registrar_apply',3,'registrar','registrar_general','apply_decision'),
 ('excused_absence','student_affairs_intake',1,'student_affairs','student_affairs_specialist','review'),
 ('excused_absence','manager_review',2,'student_affairs','student_affairs_manager','approve'),
 ('excused_absence','record_apply',3,'student_affairs','student_affairs_specialist','apply_decision'),
 ('file_withdrawal','student_affairs_intake',1,'student_affairs','student_affairs_specialist','review'),
 ('file_withdrawal','library_clearance',2,'library','library_officer','clear'),
 ('file_withdrawal','labs_clearance',3,'labs','labs_manager','clear'),
 ('file_withdrawal','activities_clearance',4,'student_affairs','student_affairs_manager','clear'),
 ('file_withdrawal','finance_clearance',5,'finance','revenue_finance_officer','clear'),
 ('file_withdrawal','registrar_apply',6,'registrar','registrar_general','apply_decision'),
 ('file_withdrawal','archive',7,'archive','archive_officer','archive'),
 ('final_chance','student_affairs_intake',1,'student_affairs','student_affairs_specialist','review'),
 ('final_chance','manager_review',2,'student_affairs','student_affairs_manager','approve'),
 ('final_chance','dean_decision',3,'dean','dean','approve'),
 ('final_chance','payment_confirmation',4,'finance','revenue_finance_officer','confirm_payment'),
 ('final_chance','registrar_apply',5,'registrar','registrar_general','apply_decision')
) AS x(service, step_key, step_order, unit, role, action)
JOIN public.request_types rt ON rt.code = x.service
JOIN public.request_type_workflows w ON w.request_type_id = rt.id
JOIN public.request_processing_units u ON u.code = x.unit
JOIN public.request_processing_roles r ON r.code = x.role;

-- protected baseline the fixture preconditions read
INSERT INTO public.student_requests (student_profile_id, request_type, status, request_number)
SELECT 'b1e20002-0000-4000-8000-000000000002','enrollment_certificate','completed','SR-BASELINE-' || g
FROM generate_series(1,4) g;
INSERT INTO public.enrollment_certificate_document_details DEFAULT VALUES;
INSERT INTO public.enrollment_certificate_document_details DEFAULT VALUES;
INSERT INTO public.official_documents DEFAULT VALUES;
INSERT INTO public.official_documents DEFAULT VALUES;

COMMIT;
