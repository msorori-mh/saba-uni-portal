-- PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65
-- 10 — TEST_ONLY reference data for the isolated (non-production) cluster.
-- HARD RULE: this file must never be executed against production or staging.

DO $guard$
BEGIN
  IF current_database() <> 'isodb' THEN
    RAISE EXCEPTION 'ISO_ENV_GUARD: refusing to seed database %', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM public.student_requests WHERE request_number IN
      ('SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8')) THEN
    RAISE EXCEPTION 'ISO_ENV_GUARD: protected production records detected';
  END IF;
END $guard$;

-- ---------------------------------------------------------------------------
-- 1. Processing units / roles required by the five B1 workflows.
-- ---------------------------------------------------------------------------
INSERT INTO public.request_processing_units(code,name_ar,portal_scope,is_academic_unit,is_active,sort_order) VALUES
  ('student_affairs','شؤون الطلاب','staff',false,true,10),
  ('finance','الشؤون المالية','staff',false,true,20),
  ('registrar','التسجيل','staff',false,true,30),
  ('archive','الأرشيف','staff',false,true,40),
  ('dean','العمادة','staff',false,true,50)
ON CONFLICT DO NOTHING;

INSERT INTO public.request_processing_roles(unit_id,code,name_ar,is_managerial,is_active,sort_order)
SELECT u.id, v.role_code, v.name_ar, v.managerial, true, v.sort_order
FROM (VALUES
  ('student_affairs','student_affairs_specialist','أخصائي شؤون الطلاب',false,10),
  ('student_affairs','student_affairs_manager','مدير شؤون الطلاب',true,20),
  ('finance','revenue_finance_officer','موظف الإيرادات',false,10),
  ('registrar','registrar_general','المسجل العام',true,10),
  ('archive','archive_officer','موظف الأرشيف',false,10),
  ('dean','dean','العميد',true,10)
) AS v(unit_code,role_code,name_ar,managerial,sort_order)
JOIN public.request_processing_units u ON u.code = v.unit_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.request_processing_roles r WHERE r.unit_id=u.id AND r.code=v.role_code);

-- ---------------------------------------------------------------------------
-- 2. Request types: exactly-one resolution for every B1 canonical code.
-- ---------------------------------------------------------------------------
DELETE FROM public.request_types rt
WHERE rt.code = 'transfer'
  AND NOT EXISTS (SELECT 1 FROM public.student_requests s WHERE s.request_type = 'transfer');

INSERT INTO public.request_types(code,name_ar,is_active,student_visible,sort_order)
VALUES ('file_withdrawal','سحب الملف',true,false,90)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. TEST_ONLY departments and programs (isolated; no operational identity).
-- ---------------------------------------------------------------------------
INSERT INTO public.departments(id,name_ar,name_en,is_active,sort_order) VALUES
  ('e5100000-0000-4000-8000-000000000001','قسم اختباري معزول (المصدر) TEST_ONLY','TEST_ONLY Source Dept',true,900),
  ('e5100000-0000-4000-8000-000000000002','قسم اختباري معزول (الهدف) TEST_ONLY','TEST_ONLY Target Dept',true,901),
  ('e5100000-0000-4000-8000-000000000003','قسم اختباري معزول (ثالث) TEST_ONLY','TEST_ONLY Third Dept',true,902)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.programs(id,code,name_ar,department_id,is_active,sort_order) VALUES
  ('e5110000-0000-4000-8000-000000000001','TEST_ONLY_PRG_SRC','برنامج اختباري معزول (المصدر)','e5100000-0000-4000-8000-000000000001',true,900),
  ('e5110000-0000-4000-8000-000000000002','TEST_ONLY_PRG_TGT','برنامج اختباري معزول (الهدف)','e5100000-0000-4000-8000-000000000002',true,901),
  ('e5110000-0000-4000-8000-000000000003','TEST_ONLY_PRG_THIRD','برنامج اختباري معزول (ثالث)','e5100000-0000-4000-8000-000000000003',true,902)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. TEST_ONLY identities (auth users). All emails are @test-only.invalid.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
SELECT v.id::uuid, v.email, now(), jsonb_build_object('test_only',true)
FROM (VALUES
  ('e5520000-0000-4000-8000-000000000001','sa.specialist@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000002','sa.manager@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000003','library.officer@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000004','labs.manager@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000005','finance.officer@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000006','registrar.general@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000007','archive.officer@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000008','dean@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000009','head.source@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000010','head.target@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000011','head.third@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000012','admin@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000013','system.admin@test-only.invalid'),
  ('e5510000-0000-4000-8000-000000000001','student.owner@test-only.invalid')
) AS v(id,email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v.id::uuid);

INSERT INTO public.user_roles(user_id,role)
SELECT v.id::uuid, v.role::public.app_role FROM (VALUES
  ('e5520000-0000-4000-8000-000000000012','admin'),
  ('e5520000-0000-4000-8000-000000000013','system_admin'),
  ('e5520000-0000-4000-8000-000000000006','registrar'),
  ('e5520000-0000-4000-8000-000000000008','dean'),
  ('e5510000-0000-4000-8000-000000000001','student')
) AS v(id,role)
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=v.id::uuid AND r.role=v.role::public.app_role);

-- ---------------------------------------------------------------------------
-- 5. Staff profiles (non-academic principals).
-- ---------------------------------------------------------------------------
INSERT INTO public.staff_profiles(id,user_id,employee_number,full_name_ar,job_title,role_type,status,must_change_password,email)
SELECT v.id::uuid, v.id::uuid, v.emp, v.name_ar, v.job, 'admin_staff','active',false, v.email
FROM (VALUES
  ('e5520000-0000-4000-8000-000000000001','TO-SA-SPEC','أخصائي شؤون طلاب اختباري TEST_ONLY','أخصائي شؤون الطلاب','sa.specialist@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000002','TO-SA-MGR','مدير شؤون طلاب اختباري TEST_ONLY','مدير شؤون الطلاب','sa.manager@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000003','TO-LIB','موظف مكتبة اختباري TEST_ONLY','موظف المكتبة','library.officer@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000004','TO-LABS','مدير معامل اختباري TEST_ONLY','مدير المعامل','labs.manager@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000005','TO-FIN','موظف مالية اختباري TEST_ONLY','موظف الإيرادات','finance.officer@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000006','TO-REG','مسجل عام اختباري TEST_ONLY','المسجل العام','registrar.general@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000007','TO-ARC','موظف أرشيف اختباري TEST_ONLY','موظف الأرشيف','archive.officer@test-only.invalid'),
  ('e5520000-0000-4000-8000-000000000008','TO-DEAN','عميد اختباري TEST_ONLY','العميد','dean@test-only.invalid')
) AS v(id,emp,name_ar,job,email)
WHERE NOT EXISTS (SELECT 1 FROM public.staff_profiles p WHERE p.id = v.id::uuid);

-- ---------------------------------------------------------------------------
-- 6. Faculty identities for department heads (source / target / third).
-- ---------------------------------------------------------------------------
INSERT INTO public.faculty(id,employee_id,full_name_ar,is_active,sort_order,category)
SELECT v.id::uuid, v.emp, v.name_ar, true, 900, 'academic'
FROM (VALUES
  ('e5530000-0000-4000-8000-000000000009','TO-HEAD-SRC','رئيس القسم المصدر TEST_ONLY'),
  ('e5530000-0000-4000-8000-000000000010','TO-HEAD-TGT','رئيس القسم الهدف TEST_ONLY'),
  ('e5530000-0000-4000-8000-000000000011','TO-HEAD-3RD','رئيس القسم الثالث TEST_ONLY')
) AS v(id,emp,name_ar)
WHERE NOT EXISTS (SELECT 1 FROM public.faculty f WHERE f.id = v.id::uuid);

INSERT INTO public.faculty_profiles(id,user_id,faculty_id,employee_number,full_name_ar,department_id,status,must_change_password,position_title)
SELECT v.id::uuid, v.user_id::uuid, v.faculty_id::uuid, v.emp, v.name_ar, v.dept::uuid,'active',false,'رئيس القسم'
FROM (VALUES
  ('e5540000-0000-4000-8000-000000000009','e5520000-0000-4000-8000-000000000009','e5530000-0000-4000-8000-000000000009','TO-HEAD-SRC','رئيس القسم المصدر TEST_ONLY','e5100000-0000-4000-8000-000000000001'),
  ('e5540000-0000-4000-8000-000000000010','e5520000-0000-4000-8000-000000000010','e5530000-0000-4000-8000-000000000010','TO-HEAD-TGT','رئيس القسم الهدف TEST_ONLY','e5100000-0000-4000-8000-000000000002'),
  ('e5540000-0000-4000-8000-000000000011','e5520000-0000-4000-8000-000000000011','e5530000-0000-4000-8000-000000000011','TO-HEAD-3RD','رئيس القسم الثالث TEST_ONLY','e5100000-0000-4000-8000-000000000003')
) AS v(id,user_id,faculty_id,emp,name_ar,dept)
WHERE NOT EXISTS (SELECT 1 FROM public.faculty_profiles p WHERE p.id = v.id::uuid);

-- ---------------------------------------------------------------------------
-- 7. Processing assignments (exactly one active direct assignee per unit/role).
--    Contract: exactly one non-null actor column per assignment, and
--    department-scoped steps accept ONLY position_assignment actors.
-- ---------------------------------------------------------------------------
DELETE FROM public.request_processing_assignments a
WHERE a.user_id::text LIKE 'e5520000-%' OR a.staff_profile_id::text LIKE 'e5520000-%'
   OR a.faculty_profile_id::text LIKE 'e5540000-%'
   OR a.department_id::text LIKE 'e5100000-%';

INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,staff_profile_id,is_active)
SELECT u.id, r.id, 'staff_profile', v.user_id::uuid, true
FROM (VALUES
  ('student_affairs','student_affairs_specialist','e5520000-0000-4000-8000-000000000001'),
  ('student_affairs','student_affairs_manager','e5520000-0000-4000-8000-000000000002'),
  ('library','library_officer','e5520000-0000-4000-8000-000000000003'),
  ('labs','labs_manager','e5520000-0000-4000-8000-000000000004'),
  ('finance','revenue_finance_officer','e5520000-0000-4000-8000-000000000005'),
  ('registrar','registrar_general','e5520000-0000-4000-8000-000000000006'),
  ('archive','archive_officer','e5520000-0000-4000-8000-000000000007'),
  ('dean','dean','e5520000-0000-4000-8000-000000000008')
) AS v(unit_code,role_code,user_id)
JOIN public.request_processing_units u ON u.code=v.unit_code
JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code=v.role_code;

INSERT INTO public.organizational_positions(id,code,name_ar,unit_type,is_active,sort_order)
SELECT v.id::uuid, v.code, v.name_ar, 'department', true, 900
FROM (VALUES
  ('e5560000-0000-4000-8000-000000000009','TEST_ONLY_HEAD_SRC','رئيس القسم المصدر TEST_ONLY'),
  ('e5560000-0000-4000-8000-000000000010','TEST_ONLY_HEAD_TGT','رئيس القسم الهدف TEST_ONLY'),
  ('e5560000-0000-4000-8000-000000000011','TEST_ONLY_HEAD_3RD','رئيس القسم الثالث TEST_ONLY')
) AS v(id,code,name_ar)
WHERE NOT EXISTS (SELECT 1 FROM public.organizational_positions p WHERE p.id=v.id::uuid);

INSERT INTO public.position_assignments(id,position_id,user_id,assigned_from,is_active)
SELECT v.id::uuid, v.position_id::uuid, v.user_id::uuid, CURRENT_DATE - 1, true
FROM (VALUES
  ('e5570000-0000-4000-8000-000000000009','e5560000-0000-4000-8000-000000000009','e5520000-0000-4000-8000-000000000009'),
  ('e5570000-0000-4000-8000-000000000010','e5560000-0000-4000-8000-000000000010','e5520000-0000-4000-8000-000000000010'),
  ('e5570000-0000-4000-8000-000000000011','e5560000-0000-4000-8000-000000000011','e5520000-0000-4000-8000-000000000011')
) AS v(id,position_id,user_id)
WHERE NOT EXISTS (SELECT 1 FROM public.position_assignments p WHERE p.id=v.id::uuid);

INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active)
SELECT u.id, r.id, 'position_assignment', v.position_assignment_id::uuid, v.dept::uuid, true
FROM (VALUES
  ('e5570000-0000-4000-8000-000000000009','e5100000-0000-4000-8000-000000000001'),
  ('e5570000-0000-4000-8000-000000000010','e5100000-0000-4000-8000-000000000002'),
  ('e5570000-0000-4000-8000-000000000011','e5100000-0000-4000-8000-000000000003')
) AS v(position_assignment_id,dept)
JOIN public.request_processing_units u ON u.code='department'
JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code='department_head';


-- ---------------------------------------------------------------------------
-- 8. TEST_ONLY owner student.
-- ---------------------------------------------------------------------------
INSERT INTO public.student_profiles(id,user_id,academic_number,full_name_ar,email,department_id,program_id,status,must_change_password)
SELECT 'e5550000-0000-4000-8000-000000000001'::uuid,'e5510000-0000-4000-8000-000000000001'::uuid,
       'TO-STU-0001','طالب اختباري معزول TEST_ONLY','student.owner@test-only.invalid',
       'e5100000-0000-4000-8000-000000000001'::uuid,'e5110000-0000-4000-8000-000000000001'::uuid,'active',false
WHERE NOT EXISTS (SELECT 1 FROM public.student_profiles p WHERE p.id='e5550000-0000-4000-8000-000000000001'::uuid);

-- ---------------------------------------------------------------------------
-- 9. Academic status for the TEST_ONLY student (service validators require it).
-- ---------------------------------------------------------------------------
INSERT INTO public.student_academic_status(id,student_profile_id,enrollment_status)
SELECT 'e5580000-0000-4000-8000-000000000001'::uuid,'e5550000-0000-4000-8000-000000000001'::uuid,'active'
WHERE NOT EXISTS (SELECT 1 FROM public.student_academic_status s
                  WHERE s.id='e5580000-0000-4000-8000-000000000001'::uuid);
