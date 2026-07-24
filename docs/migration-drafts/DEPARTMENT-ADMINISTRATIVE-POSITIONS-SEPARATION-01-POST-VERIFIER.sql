-- READ ONLY verifier. Execute only after an independently authorized apply.
BEGIN TRANSACTION READ ONLY;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.faculty_profiles WHERE id='d08a8509-4c04-472e-885f-053a80be12ec'
    AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8') THEN RAISE EXCEPTION 'ACADEMIC_AFFILIATION_CHANGED'; END IF;
  IF (SELECT count(*) FROM public.request_processing_assignments a
    JOIN public.request_processing_units u ON u.id=a.unit_id AND u.code='department'
    JOIN public.request_processing_roles r ON r.id=a.role_id AND r.code='department_head'
    WHERE a.is_active AND a.assignment_type='position_assignment'
      AND a.department_id IN ('11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8',
      '22222222-2222-4222-8222-222222222222'))<>3 THEN RAISE EXCEPTION 'EXACT_THREE_POSITION_SCOPES_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id=a.role_id AND r.code='department_head'
    WHERE a.is_active AND a.assignment_type='faculty_profile') THEN RAISE EXCEPTION 'ACTIVE_FACULTY_CHAIR_BINDING_FORBIDDEN'; END IF;
END $$;
ROLLBACK;
