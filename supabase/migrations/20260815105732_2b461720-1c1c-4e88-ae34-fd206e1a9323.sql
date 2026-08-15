DO $$
DECLARE
  v_demo_email CONSTANT text := 'demo.depthead@testonly.invalid';
  v_demo_employee CONSTANT text := 'DEMO-F-003';
  v_is_department CONSTANT uuid := '22222222-2222-4222-8222-222222222222';
  v_user_id uuid;
  v_profile_id uuid;
  v_is_council_id uuid;
  v_demo_department_membership_id uuid;
BEGIN
  SELECT u.id, fp.id INTO STRICT v_user_id, v_profile_id
    FROM auth.users u
    JOIN public.faculty_profiles fp ON fp.user_id = u.id
   WHERE u.email = v_demo_email
     AND fp.employee_number = v_demo_employee
     AND fp.full_name_ar = 'د. رمزي حميد'
     AND fp.status = 'active';

  SELECT ac.id INTO STRICT v_is_council_id
    FROM public.academic_councils ac
    JOIN public.departments d ON d.id = ac.department_id
   WHERE ac.department_id = v_is_department
     AND ac.council_type = 'department'
     AND ac.is_active = true
     AND d.is_active = true
     AND d.name_ar ILIKE '%نظم المعلومات%';

  SELECT id INTO STRICT v_demo_department_membership_id
    FROM public.academic_council_members
   WHERE user_id = v_user_id
     AND member_role = 'chair'
     AND is_active = true
     AND council_id IN (SELECT id FROM public.academic_councils WHERE council_type = 'department');

  PERFORM set_config('app.bypass_faculty_lock', '1', true);
  PERFORM set_config('app.bypass_faculty_department_lock', '1', true);
  UPDATE public.faculty_profiles
     SET department_id = v_is_department,
         academic_rank = 'أستاذ مساعد',
         position_title = 'رئيس قسم نظم المعلومات',
         updated_at = now()
   WHERE id = v_profile_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_council_members
     WHERE user_id = v_user_id AND council_id = v_is_council_id
       AND id <> v_demo_department_membership_id
  ) THEN
    UPDATE public.academic_council_members
       SET council_id = v_is_council_id, updated_at = now()
     WHERE id = v_demo_department_membership_id;
  END IF;
END $$;