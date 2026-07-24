-- READ ONLY. Execute only under separately authorized database access.
BEGIN TRANSACTION READ ONLY;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.departments WHERE id IN (
    '11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8',
    '22222222-2222-4222-8222-222222222222'))<>3 THEN RAISE EXCEPTION 'THREE_DEPARTMENTS_REQUIRED'; END IF;
  IF (SELECT count(*) FROM public.faculty_profiles WHERE id IN (
    'd08a8509-4c04-472e-885f-053a80be12ec','6f9f004d-c5f6-4dfe-b212-7f79ce8658e3',
    'c1fe6084-e594-482e-a178-ac8eaffed376') AND user_id IS NOT NULL)<>3
    THEN RAISE EXCEPTION 'THREE_FACULTY_IDENTITIES_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.faculty_profiles
    WHERE id='d08a8509-4c04-472e-885f-053a80be12ec'
      AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8')
    THEN RAISE EXCEPTION 'OSAMA_MUST_REMAIN_ACADEMICALLY_IT'; END IF;
  IF EXISTS(SELECT 1 FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id=s.student_request_id
    WHERE r.request_type IN ('department_transfer','transfer')
      AND s.status='active' AND s.step_key IN ('source_department_head_approval','target_department_head_approval'))
    THEN RAISE EXCEPTION 'ACTIVE_TRANSFER_CHAIR_RUNTIME_REQUIRES_SEPARATE_REMEDIATION'; END IF;
END $$;
ROLLBACK;
