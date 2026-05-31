-- Test faculty + staff accounts
-- Login mapping:
--   Faculty: <employee_number>@faculty.usr.edu.ye  (e.g. F0001@faculty.usr.edu.ye)
--   Staff:   <employee_number>@staff.usr.edu.ye    (e.g. S0001@staff.usr.edu.ye)

DO $$
DECLARE
  v_faculty_user_id uuid := gen_random_uuid();
  v_staff_user_id   uuid := gen_random_uuid();
  v_faculty_row_id  uuid;
  v_cs_dept_id      uuid;
BEGIN
  -- Pick faculty row (د. رمزي حميد الجابري) and CS department
  SELECT id INTO v_faculty_row_id FROM public.faculty WHERE full_name_ar LIKE 'د. رمزي حميد%' LIMIT 1;
  SELECT id INTO v_cs_dept_id FROM public.departments WHERE name_ar = 'قسم علوم الحاسوب' LIMIT 1;

  -- Skip if test accounts already exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'F0001@faculty.usr.edu.ye') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_faculty_user_id, 'authenticated', 'authenticated',
      'F0001@faculty.usr.edu.ye', crypt('F0001', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_faculty_user_id,
      jsonb_build_object('sub', v_faculty_user_id::text, 'email', 'F0001@faculty.usr.edu.ye'),
      'email', v_faculty_user_id::text, now(), now(), now()
    );

    INSERT INTO public.faculty_profiles (
      user_id, faculty_id, employee_number, full_name_ar, full_name_en,
      department_id, academic_rank, position_title, status, must_change_password
    ) VALUES (
      v_faculty_user_id, v_faculty_row_id, 'F0001',
      'د. رمزي حميد الجابري', 'Dr. Ramzi Hamid Al-Jabri',
      v_cs_dept_id, 'أستاذ مساعد', 'عضو هيئة تدريس',
      'active', true
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_faculty_user_id, 'faculty_member'::app_role);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'S0001@staff.usr.edu.ye') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_staff_user_id, 'authenticated', 'authenticated',
      'S0001@staff.usr.edu.ye', crypt('S0001', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_staff_user_id,
      jsonb_build_object('sub', v_staff_user_id::text, 'email', 'S0001@staff.usr.edu.ye'),
      'email', v_staff_user_id::text, now(), now(), now()
    );

    INSERT INTO public.staff_profiles (
      user_id, employee_number, full_name_ar, full_name_en,
      job_title, role_type, status, must_change_password
    ) VALUES (
      v_staff_user_id, 'S0001',
      'محمد عبدالله المسؤول', 'Mohammed Abdullah Almasoul',
      'مسؤول قبول وتسجيل', 'registrar', 'active', true
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_staff_user_id, 'registrar'::app_role);
  END IF;
END $$;