SELECT set_config('app.bypass_student_lock','1',false);

CREATE TABLE IF NOT EXISTS public.b1_e2e_assignment_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL,
  assignment_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  role_id uuid,
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid,
  faculty_profile_id uuid,
  position_assignment_id uuid,
  department_id uuid,
  is_active boolean NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.b1_e2e_assignment_snapshot TO service_role;
ALTER TABLE public.b1_e2e_assignment_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO public.b1_e2e_assignment_snapshot(
  tag, assignment_id, unit_id, role_id, assignment_type, user_id, staff_profile_id,
  faculty_profile_id, position_assignment_id, department_id, is_active, starts_at, ends_at)
SELECT 'TEST_ONLY_FIRST_DELIVERY_5_SERVICES', a.id, a.unit_id, a.role_id, a.assignment_type,
       a.user_id, a.staff_profile_id, a.faculty_profile_id, a.position_assignment_id,
       a.department_id, a.is_active, a.starts_at, a.ends_at
FROM public.request_processing_assignments a
WHERE NOT EXISTS (
  SELECT 1 FROM public.b1_e2e_assignment_snapshot s
  WHERE s.tag='TEST_ONLY_FIRST_DELIVERY_5_SERVICES' AND s.assignment_id=a.id);

UPDATE public.student_profiles
SET department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8',
    program_id='97638001-87cd-4df0-abe9-63c829504072',
    updated_at=now()
WHERE academic_number='TEST_ONLY_B1_0001';

INSERT INTO public.student_enrollments(student_profile_id, course_section_id, enrollment_status)
SELECT sp.id, '92a920b4-5e7d-401c-aae3-aa2f22c8b1b9', 'enrolled'
FROM public.student_profiles sp
WHERE sp.academic_number='TEST_ONLY_B1_0001'
  AND NOT EXISTS (SELECT 1 FROM public.student_enrollments e
    WHERE e.student_profile_id=sp.id AND e.course_section_id='92a920b4-5e7d-401c-aae3-aa2f22c8b1b9');

INSERT INTO public.organizational_positions(id, code, name_ar, unit_type, is_active, sort_order, notes)
VALUES
 ('aa000001-0000-4000-8000-000000000001','test_only_b1_dept_head_src','رئيس قسم اختباري TEST_ONLY (المصدر)','position',true,999,'TEST_ONLY_FIRST_DELIVERY_5_SERVICES'),
 ('aa000002-0000-4000-8000-000000000002','test_only_b1_dept_head_tgt','رئيس قسم اختباري TEST_ONLY (الهدف)','position',true,999,'TEST_ONLY_FIRST_DELIVERY_5_SERVICES')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.position_assignments(id, position_id, user_id, assigned_from, is_active, notes)
VALUES
 ('bb000001-0000-4000-8000-000000000001','aa000001-0000-4000-8000-000000000001','49f152f8-db2b-4bd0-af08-2f8b3425d053',CURRENT_DATE,true,'TEST_ONLY_FIRST_DELIVERY_5_SERVICES'),
 ('bb000002-0000-4000-8000-000000000002','aa000002-0000-4000-8000-000000000002','4b45ddf7-140a-44b1-a452-e51c182aab5d',CURRENT_DATE,true,'TEST_ONLY_FIRST_DELIVERY_5_SERVICES')
ON CONFLICT (id) DO NOTHING;

UPDATE public.request_processing_assignments
SET is_active=false, updated_at=now()
WHERE id IN (
 'c50ea582-4d53-4dcb-a255-91fd10cb09dc',
 '43f5cf3d-5cc7-4739-9ce3-c75f9a5302a1',
 'dda958a9-88d0-4689-8b89-3f0a5e08a44e',
 'c0153d51-6ded-435b-a8d7-287f33349e4c',
 'e4507044-8d07-4385-a776-43eb617c0f04',
 '87492b35-72c7-41df-a60c-ddf57d28f653',
 '3f93b060-bf2f-43db-b0de-ca9b365649f7',
 '6357f788-d944-494d-9d9f-72bc7a719e66',
 'abc127f0-636c-48cf-ac1d-188b06d57fa1',
 '290e6c87-54d3-402b-9478-cf669025127c'
);

INSERT INTO public.request_processing_assignments
 (id, unit_id, role_id, assignment_type, user_id, position_assignment_id, department_id, is_active)
VALUES
 ('cc000001-0000-4000-8000-000000000001','44d05dea-1a26-4451-a384-d3f01dd88ed9','32ee5cec-9b61-494d-afc9-7a7dbee19db5','user','24406961-d8b2-4db7-8896-0ef82039d75f',NULL,NULL,true),
 ('cc000002-0000-4000-8000-000000000002','44d05dea-1a26-4451-a384-d3f01dd88ed9','92a20288-a166-4ea3-893e-d8a4300c2828','user','0b2a2543-a77a-4b86-ad7f-8b35f9db6502',NULL,NULL,true),
 ('cc000003-0000-4000-8000-000000000003','a8ebca48-9334-4428-95fe-0830cb45c484','0e6784cb-0636-4ecb-9e46-f422be41e1ad','user','15b0f3cd-29d8-4eb1-ad15-bb9026986dbc',NULL,NULL,true),
 ('cc000004-0000-4000-8000-000000000004','48e25baf-3ed0-4cde-b128-22d801ce6dd1','544028ec-0590-4119-bf83-7bc6c178fc1a','user','749a6e5d-eb27-4417-99a4-7abaffe406a3',NULL,NULL,true),
 ('cc000005-0000-4000-8000-000000000005','e54caf55-d0b1-424b-8513-a30466fec693','7ad4e3cf-1211-4d21-a4fe-4360cfa16a78','user','b8b50c98-f26c-413b-a585-fafd0abfaa21',NULL,NULL,true),
 ('cc000006-0000-4000-8000-000000000006','ff580c59-076b-40ff-9d64-0502d1c1125d','af495507-2cf9-4578-9b39-5a25ca1a6f0a','user','f0d8a6b1-7845-46bd-8a12-d78ed6af2bfd',NULL,NULL,true),
 ('cc000007-0000-4000-8000-000000000007','b9bc6b28-c948-4ef9-b6b0-e74752ea3db4','0e2c5110-9014-43d1-bf80-e3a74a4a17bc','user','676ecf19-4c7a-45eb-86db-2c141e5a7691',NULL,NULL,true),
 ('cc000008-0000-4000-8000-000000000008','bd3616b0-2322-4087-b9b8-b1f0ec244914','c7347947-789b-405a-b6e5-d58c97104438','user','fb59542d-d410-4fa4-88d3-1e3e2fabe014',NULL,NULL,true),
 ('cc000009-0000-4000-8000-000000000009','fc58655d-326a-462f-9f66-cab6d32cc8fa','06b461ab-8f47-4d4c-8ffa-fc8c23f80620','position_assignment',NULL,'bb000001-0000-4000-8000-000000000001','ce485c67-5f7c-498d-b120-4b1130a86ae8',true),
 ('cc000010-0000-4000-8000-000000000010','fc58655d-326a-462f-9f66-cab6d32cc8fa','06b461ab-8f47-4d4c-8ffa-fc8c23f80620','position_assignment',NULL,'bb000002-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',true)
ON CONFLICT (id) DO NOTHING;
