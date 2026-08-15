DO $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_is_department CONSTANT uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.faculty_profiles'::regclass
       AND tgname = 'trg_protect_faculty_department_id'
       AND NOT tgisinternal
       AND tgenabled <> 'D'
  ) THEN
    ALTER TABLE public.faculty_profiles ENABLE TRIGGER trg_protect_faculty_department_id;
  END IF;

  SELECT u.id, fp.id INTO STRICT v_user_id, v_profile_id
    FROM auth.users u
    JOIN public.faculty_profiles fp ON fp.user_id = u.id
   WHERE u.email = 'demo.depthead@testonly.invalid'
     AND fp.employee_number = 'DEMO-F-003'
     AND fp.department_id = v_is_department
     AND fp.academic_rank = 'أستاذ مساعد'
     AND fp.position_title = 'رئيس قسم نظم المعلومات';

  IF NOT EXISTS (
    SELECT 1
      FROM public.academic_council_members acm
      JOIN public.academic_councils ac ON ac.id = acm.council_id
     WHERE acm.user_id = v_user_id
       AND acm.member_role = 'chair'
       AND acm.is_active = true
       AND ac.council_type = 'department'
       AND ac.department_id = v_is_department
  ) THEN
    RAISE EXCEPTION 'DEMO_RAMZI_IS_COUNCIL_RECONCILIATION_MISSING';
  END IF;
END $$;