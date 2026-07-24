-- READ ONLY. Execute only under separately authorized database access.
BEGIN TRANSACTION READ ONLY;

CREATE TEMP TABLE separation_preflight_checks(
  check_name text PRIMARY KEY,ok boolean NOT NULL,detail text NOT NULL
) ON COMMIT DROP;

INSERT INTO separation_preflight_checks VALUES
('three_departments',(
  SELECT count(*)=3 FROM public.departments WHERE id IN (
    '11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8',
    '22222222-2222-4222-8222-222222222222')),'CS/IT/IS must resolve exactly'),
('three_exact_identities',(
  SELECT count(*)=3 FROM public.faculty_profiles WHERE
    (id='d08a8509-4c04-472e-885f-053a80be12ec' AND employee_number='F2025006'
      AND user_id='97acbe02-c59c-409c-8d51-7d4ef72e6db7' AND status='active'
      AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8')
    OR (id='6f9f004d-c5f6-4dfe-b212-7f79ce8658e3' AND employee_number='F2025005'
      AND user_id='d4aaa5c9-72d1-4996-b0e8-d30c6327da6e' AND status='active')
    OR (id='c1fe6084-e594-482e-a178-ac8eaffed376' AND employee_number='F2025004'
      AND user_id='f602b62c-194b-4591-8e9c-956e5cbb347d' AND status='active')),
  'profile/employee/user/status and Osama IT affiliation'),
('unit_role_exact',(
  SELECT count(*)=1 FROM public.request_processing_units u
  JOIN public.request_processing_roles r ON r.unit_id=u.id
  WHERE u.code='department' AND u.is_active AND r.code='department_head' AND r.is_active),
  'department/department_head must resolve once'),
('no_active_transfer_chair_runtime',NOT EXISTS(
  SELECT 1 FROM public.student_request_workflow_steps s
  JOIN public.student_requests q ON q.id=s.student_request_id
  WHERE q.request_type IN ('department_transfer','transfer') AND s.status='active'
    AND s.step_key IN ('source_department_head_approval','target_department_head_approval')),
  'active runtime requires separate remediation'),
('no_chair_outside_scope',NOT EXISTS(
  SELECT 1 FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id=a.unit_id AND u.code='department'
  JOIN public.request_processing_roles r ON r.id=a.role_id AND r.code='department_head'
  WHERE a.is_active AND a.department_id NOT IN (
    '11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8',
    '22222222-2222-4222-8222-222222222222')),
  'no active chair outside CS/IT/IS'),
('position_definitions_nonconflicting',NOT EXISTS(
  SELECT 1 FROM public.organizational_positions WHERE
    (code='cs_department_head' AND (name_ar<>'رئيس قسم علوم الحاسوب' OR parent_code<>'academic_departments' OR unit_type<>'position' OR NOT is_active))
    OR (code='it_department_head' AND (name_ar<>'رئيس قسم تكنولوجيا المعلومات' OR parent_code<>'academic_departments' OR unit_type<>'position' OR NOT is_active))
    OR (code='is_department_head' AND (name_ar<>'رئيس قسم نظم المعلومات الحاسوبية' OR parent_code<>'academic_departments' OR unit_type<>'position' OR NOT is_active))),
  'existing position codes must match exact definitions'),
('no_partial_apply',NOT (
  (SELECT count(*) FROM public.organizational_positions WHERE code IN (
    'cs_department_head','it_department_head','is_department_head')) BETWEEN 1 AND 2),
  'all three positions or none'),
('protected_request_records_present',(
  SELECT count(*)=3 FROM public.student_requests WHERE request_number IN (
    'SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8')),
  'protected requests remain present'),
('protected_request_types_unchanged',NOT EXISTS(
  SELECT 1 FROM public.request_types
  WHERE code='enrollment_certificate' AND (student_visible IS DISTINCT FROM true OR is_active IS DISTINCT FROM true)),
  'enrollment_certificate visibility/activation unchanged');

SELECT * FROM separation_preflight_checks ORDER BY check_name;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM separation_preflight_checks WHERE NOT ok) THEN
    RAISE EXCEPTION 'DEPARTMENT_POSITION_SEPARATION_PREFLIGHT_STOP';
  END IF;
END $$;
ROLLBACK;
