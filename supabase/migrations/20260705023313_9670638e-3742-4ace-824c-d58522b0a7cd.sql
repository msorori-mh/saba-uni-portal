DO $mig$
DECLARE
  v_created_by uuid;
  v_inserted   integer;
BEGIN
  SELECT ur.user_id
    INTO v_created_by
    FROM public.user_roles ur
   WHERE ur.role IN ('system_admin'::public.app_role, 'admin'::public.app_role)
   ORDER BY CASE ur.role WHEN 'system_admin'::public.app_role THEN 0 ELSE 1 END, ur.user_id
   LIMIT 1;

  IF v_created_by IS NULL THEN
    RAISE NOTICE 'skipped — no system_admin or admin user for created_by';
    RETURN;
  END IF;

  INSERT INTO public.academic_councils (name, name_en, council_type, department_id, description, is_active, created_by)
  SELECT
    'مجلس ' || d.name_ar,
    'Department Council — ' || COALESCE(NULLIF(trim(d.name_en), ''), d.name_ar),
    'department'::public.academic_council_type,
    d.id,
    'مجلس أكاديمي لـ ' || d.name_ar || ' — سجل تأسيسي (department council seed)',
    true,
    v_created_by
  FROM public.departments d
  WHERE d.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.academic_councils ac
      WHERE ac.council_type = 'department'::public.academic_council_type
        AND ac.department_id = d.id
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'inserted % department council row(s)', v_inserted;
END $mig$;