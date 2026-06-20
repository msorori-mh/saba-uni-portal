CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
  v_faculty_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'demo-fac@faculty.usr.edu.ye';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated',
      'demo-fac@faculty.usr.edu.ye',
      crypt('Demo@2024', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, false
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'demo-fac@faculty.usr.edu.ye', 'email_verified', true),
      'email', v_user_id::text, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt('Demo@2024', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  SELECT id INTO v_faculty_id FROM public.faculty WHERE employee_id = 'DEMO-FAC';
  IF v_faculty_id IS NULL THEN
    v_faculty_id := gen_random_uuid();
    INSERT INTO public.faculty (id, employee_id, full_name_ar, full_name_en, is_active, category)
    VALUES (v_faculty_id, 'DEMO-FAC', 'حساب تجريبي - عضو هيئة تدريس', 'Demo Faculty', true, 'faculty');
  END IF;

  INSERT INTO public.faculty_profiles (user_id, faculty_id, employee_number, full_name_ar, status, must_change_password)
  VALUES (v_user_id, v_faculty_id, 'DEMO-FAC', 'حساب تجريبي - عضو هيئة تدريس', 'active', false)
  ON CONFLICT (faculty_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        employee_number = EXCLUDED.employee_number,
        must_change_password = false,
        status = 'active';
END $$;