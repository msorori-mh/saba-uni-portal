DO $$
DECLARE
  v_is_department CONSTANT uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  UPDATE public.departments
     SET name_ar = 'قسم نظم المعلومات', updated_at = now()
   WHERE id = v_is_department
     AND name_ar IN ('قسم نظم المعلومات الحاسوبية', 'قسم نظم المعلومات');
  IF NOT FOUND THEN RAISE EXCEPTION 'IS_DEPARTMENT_NAME_ANCHOR_DRIFT'; END IF;

  UPDATE public.academic_councils
     SET name = 'مجلس قسم نظم المعلومات', updated_at = now()
   WHERE department_id = v_is_department
     AND council_type = 'department'
     AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'IS_COUNCIL_NAME_ANCHOR_DRIFT'; END IF;
END $$;