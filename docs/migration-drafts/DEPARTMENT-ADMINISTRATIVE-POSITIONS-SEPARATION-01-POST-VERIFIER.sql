-- READ ONLY verifier. Execute only after an independently authorized apply.
BEGIN TRANSACTION READ ONLY;
DO $$
DECLARE v_body text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('cs_department_head','F2025006','97acbe02-c59c-409c-8d51-7d4ef72e6db7'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
      ('it_department_head','F2025005','d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'::uuid,'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid),
      ('is_department_head','F2025004','f602b62c-194b-4591-8e9c-956e5cbb347d'::uuid,'22222222-2222-4222-8222-222222222222'::uuid)
    ) e(position_code,employee_number,user_id,department_id)
    WHERE (SELECT count(*)
      FROM public.organizational_positions op
      JOIN public.position_assignments pa ON pa.position_id=op.id
        AND pa.user_id=e.user_id AND pa.is_active AND pa.assigned_from<=CURRENT_DATE
        AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE)
      JOIN public.request_processing_assignments a ON a.position_assignment_id=pa.id
        AND a.assignment_type='position_assignment' AND a.department_id=e.department_id
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL
        AND a.is_active AND (a.starts_at IS NULL OR a.starts_at<=now())
        AND (a.ends_at IS NULL OR a.ends_at>now())
      JOIN public.faculty_profiles fp ON fp.user_id=e.user_id AND fp.employee_number=e.employee_number
      WHERE op.code=e.position_code AND op.parent_code='academic_departments'
        AND op.unit_type='position' AND op.is_active)<>1
  ) THEN RAISE EXCEPTION 'PER_DEPARTMENT_POSITION_MAPPING_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id=a.role_id AND r.code='department_head'
    WHERE a.is_active AND a.assignment_type='faculty_profile')
  THEN RAISE EXCEPTION 'ACTIVE_FACULTY_CHAIR_BINDING_FORBIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id=a.role_id AND r.code='department_head'
    WHERE a.is_active AND a.department_id NOT IN (
      '11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8',
      '22222222-2222-4222-8222-222222222222'))
  THEN RAISE EXCEPTION 'ACTIVE_CHAIR_OUTSIDE_APPROVED_SCOPE'; END IF;
  IF (SELECT count(*) FROM public.request_processing_assignments
    WHERE id IN ('7ab0b14f-9007-40d6-9aaf-f1cba454ac8f','912bdb96-3fb9-494c-8caa-7778c7d0d402',
      '4d0f434e-57ab-40b2-8a6f-5f27f330db97') AND NOT is_active)<>3
  THEN RAISE EXCEPTION 'LEGACY_HISTORY_NOT_PRESERVED_INACTIVE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.faculty_profiles
    WHERE id='d08a8509-4c04-472e-885f-053a80be12ec' AND employee_number='F2025006'
      AND user_id='97acbe02-c59c-409c-8d51-7d4ef72e6db7' AND status='active'
      AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8')
    OR NOT EXISTS(SELECT 1 FROM public.faculty_profiles WHERE id='6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'
      AND employee_number='F2025005' AND user_id='d4aaa5c9-72d1-4996-b0e8-d30c6327da6e')
    OR NOT EXISTS(SELECT 1 FROM public.faculty_profiles WHERE id='c1fe6084-e594-482e-a178-ac8eaffed376'
      AND employee_number='F2025004' AND user_id='f602b62c-194b-4591-8e9c-956e5cbb347d')
  THEN RAISE EXCEPTION 'FACULTY_IDENTITY_OR_AFFILIATION_CHANGED'; END IF;
  SELECT pg_get_functiondef('public.current_user_matches_transfer_department_scope(uuid,text)'::regprocedure) INTO v_body;
  IF position('assigned_position_assignment_id' in v_body)=0 OR position('faculty_profiles' in v_body)>0
    OR has_function_privilege('anon','public.current_user_matches_transfer_department_scope(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'FUNCTION_BODY_OR_ACL_MISMATCH'; END IF;
END $$;
ROLLBACK;
