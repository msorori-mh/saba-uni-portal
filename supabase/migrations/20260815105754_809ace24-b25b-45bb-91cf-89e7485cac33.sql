DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM auth.users u
      JOIN public.faculty_profiles fp ON fp.user_id = u.id
      JOIN public.departments d ON d.id = fp.department_id
      JOIN public.academic_council_members acm ON acm.user_id = u.id AND acm.is_active = true AND acm.member_role = 'chair'
      JOIN public.academic_councils ac ON ac.id = acm.council_id AND ac.council_type = 'department'
     WHERE u.email = 'demo.depthead@testonly.invalid'
       AND fp.employee_number = 'DEMO-F-003'
       AND fp.academic_rank = 'أستاذ مساعد'
       AND fp.position_title = 'رئيس قسم نظم المعلومات'
       AND fp.department_id = '22222222-2222-4222-8222-222222222222'::uuid
       AND ac.department_id = fp.department_id
       AND d.name_ar ILIKE '%نظم المعلومات%'
  ) THEN
    RAISE EXCEPTION 'DEMO_RAMZI_INFORMATION_SYSTEMS_RECONCILIATION_FAILED';
  END IF;
END $$;