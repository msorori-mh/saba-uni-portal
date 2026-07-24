-- DRAFT ONLY — NEVER APPLY WITHOUT SEPARATE EXPLICIT AUTHORIZATION.
-- Source-only forward correction. faculty_profiles is immutable in this phase.
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended(
  'DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01', 0
));
LOCK TABLE public.organizational_positions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.position_assignments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.request_processing_assignments IN SHARE ROW EXCLUSIVE MODE;

DO $phase$
DECLARE
  v_unit uuid;
  v_role uuid;
  v_state text;
  v_item record;
  v_position uuid;
  v_pa uuid;
  v_count integer;
  v_updated integer;
BEGIN
  -- Fail closed on identity drift before the first write.
  IF NOT EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE id='d08a8509-4c04-472e-885f-053a80be12ec'
      AND employee_number='F2025006'
      AND user_id='97acbe02-c59c-409c-8d51-7d4ef72e6db7'
      AND status='active'
      AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8'
  ) THEN RAISE EXCEPTION 'OSAMA_IDENTITY_OR_ACADEMIC_AFFILIATION_MISMATCH'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE id='6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'
      AND employee_number='F2025005'
      AND user_id='d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'
      AND status='active'
  ) THEN RAISE EXCEPTION 'KHALED_IDENTITY_MISMATCH'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.faculty_profiles
    WHERE id='c1fe6084-e594-482e-a178-ac8eaffed376'
      AND employee_number='F2025004'
      AND user_id='f602b62c-194b-4591-8e9c-956e5cbb347d'
      AND status='active'
  ) THEN RAISE EXCEPTION 'RAMZI_IDENTITY_MISMATCH'; END IF;

  SELECT count(*),(array_agg(u.id ORDER BY u.id))[1] INTO v_count,v_unit
  FROM public.request_processing_units u WHERE u.code='department' AND u.is_active;
  IF v_count<>1 THEN RAISE EXCEPTION 'DEPARTMENT_UNIT_MUST_RESOLVE_ONCE:%',v_count; END IF;
  SELECT count(*),(array_agg(r.id ORDER BY r.id))[1] INTO v_count,v_role
  FROM public.request_processing_roles r
  WHERE r.unit_id=v_unit AND r.code='department_head' AND r.is_active;
  IF v_count<>1 THEN RAISE EXCEPTION 'DEPARTMENT_HEAD_ROLE_MUST_RESOLVE_ONCE:%',v_count; END IF;

  -- Classify before mutation. Only the exact legacy or exact final state is accepted.
  IF (
    SELECT count(*)=3 AND bool_and(assignment_type='faculty_profile'
      AND user_id IS NULL AND staff_profile_id IS NULL AND position_assignment_id IS NULL AND (
      (id='7ab0b14f-9007-40d6-9aaf-f1cba454ac8f'
        AND faculty_profile_id='d08a8509-4c04-472e-885f-053a80be12ec'
        AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8')
      OR (id='912bdb96-3fb9-494c-8caa-7778c7d0d402'
        AND faculty_profile_id='6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'
        AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8')
      OR (id='4d0f434e-57ab-40b2-8a6f-5f27f330db97'
        AND faculty_profile_id='c1fe6084-e594-482e-a178-ac8eaffed376'
        AND department_id='22222222-2222-4222-8222-222222222222'))
    )
    FROM public.request_processing_assignments
    WHERE unit_id=v_unit AND role_id=v_role AND is_active
  ) THEN
    v_state:='KNOWN_LEGACY_PRESTATE';
  ELSIF (
    SELECT count(*)=3 AND count(DISTINCT department_id)=3 AND bool_and(
      assignment_type='position_assignment'
      AND position_assignment_id IS NOT NULL
      AND user_id IS NULL AND staff_profile_id IS NULL AND faculty_profile_id IS NULL
      AND department_id IN (
        '11111111-1111-4111-8111-111111111111',
        'ce485c67-5f7c-498d-b120-4b1130a86ae8',
        '22222222-2222-4222-8222-222222222222')
    )
    FROM public.request_processing_assignments
    WHERE unit_id=v_unit AND role_id=v_role AND is_active
  ) THEN
    v_state:='EXACT_FINAL_STATE';
  ELSE
    v_state:='UNEXPECTED_STATE';
  END IF;
  IF v_state='UNEXPECTED_STATE' THEN
    RAISE EXCEPTION 'UNEXPECTED_DEPARTMENT_HEAD_STATE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_processing_assignments
    WHERE unit_id=v_unit AND role_id=v_role AND is_active
      AND department_id NOT IN (
        '11111111-1111-4111-8111-111111111111',
        'ce485c67-5f7c-498d-b120-4b1130a86ae8',
        '22222222-2222-4222-8222-222222222222')
  ) THEN RAISE EXCEPTION 'ACTIVE_CHAIR_OUTSIDE_APPROVED_DEPARTMENTS'; END IF;

  FOR v_item IN SELECT * FROM (VALUES
    ('cs_department_head','رئيس قسم علوم الحاسوب','97acbe02-c59c-409c-8d51-7d4ef72e6db7'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
    ('it_department_head','رئيس قسم تكنولوجيا المعلومات','d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'::uuid,'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid),
    ('is_department_head','رئيس قسم نظم المعلومات الحاسوبية','f602b62c-194b-4591-8e9c-956e5cbb347d'::uuid,'22222222-2222-4222-8222-222222222222'::uuid)
  ) x(position_code,name_ar,user_id,department_id)
  LOOP
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_item.user_id) THEN
      RAISE EXCEPTION 'EXPECTED_AUTH_USER_MISSING:%',v_item.user_id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.organizational_positions
      WHERE code=v_item.position_code AND (
        name_ar IS DISTINCT FROM v_item.name_ar
        OR parent_code IS DISTINCT FROM 'academic_departments'
        OR unit_type IS DISTINCT FROM 'position'
        OR is_active IS DISTINCT FROM true)
    ) THEN RAISE EXCEPTION 'CONFLICTING_POSITION_DEFINITION:%',v_item.position_code; END IF;
    INSERT INTO public.organizational_positions(code,name_ar,parent_code,unit_type,is_active)
    SELECT v_item.position_code,v_item.name_ar,'academic_departments','position',true
    WHERE NOT EXISTS(SELECT 1 FROM public.organizational_positions WHERE code=v_item.position_code);
    SELECT id INTO STRICT v_position FROM public.organizational_positions
    WHERE code=v_item.position_code;

    IF EXISTS(SELECT 1 FROM public.position_assignments
      WHERE position_id=v_position AND is_active
        AND (assigned_to IS NOT NULL AND assigned_to<CURRENT_DATE)) THEN
      RAISE EXCEPTION 'EXPIRED_BUT_ACTIVE_POSITION_ASSIGNMENT:%',v_item.position_code;
    END IF;
    SELECT count(*),(array_agg(id ORDER BY id))[1] INTO v_count,v_pa
    FROM public.position_assignments
    WHERE position_id=v_position AND is_active
      AND assigned_from<=CURRENT_DATE AND (assigned_to IS NULL OR assigned_to>=CURRENT_DATE);
    IF v_count>1 THEN RAISE EXCEPTION 'MULTIPLE_CURRENT_POSITION_ASSIGNMENTS:%',v_item.position_code; END IF;
    IF v_count=1 AND NOT EXISTS(SELECT 1 FROM public.position_assignments
      WHERE id=v_pa AND user_id=v_item.user_id) THEN
      RAISE EXCEPTION 'UNEXPECTED_ACTIVE_POSITION_HOLDER:%',v_item.position_code;
    END IF;
    IF v_count=0 THEN
      INSERT INTO public.position_assignments(position_id,user_id,assigned_from,is_active,notes)
      VALUES(v_position,v_item.user_id,CURRENT_DATE,true,
        'DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01')
      RETURNING id INTO v_pa;
    END IF;

    IF EXISTS(SELECT 1 FROM public.request_processing_assignments
      WHERE unit_id=v_unit AND role_id=v_role AND department_id=v_item.department_id
        AND is_active AND assignment_type='position_assignment'
        AND (position_assignment_id IS DISTINCT FROM v_pa
          OR user_id IS NOT NULL OR staff_profile_id IS NOT NULL OR faculty_profile_id IS NOT NULL))
    THEN RAISE EXCEPTION 'CONFLICTING_POSITION_PROCESSING_ASSIGNMENT:%',v_item.department_id; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.request_processing_assignments
      WHERE unit_id=v_unit AND role_id=v_role AND department_id=v_item.department_id
        AND assignment_type='position_assignment' AND position_assignment_id=v_pa
        AND user_id IS NULL AND staff_profile_id IS NULL AND faculty_profile_id IS NULL
        AND is_active AND (starts_at IS NULL OR starts_at<=now())
        AND (ends_at IS NULL OR ends_at>now())) THEN
      INSERT INTO public.request_processing_assignments(
        unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active,starts_at)
      VALUES(v_unit,v_role,'position_assignment',v_pa,v_item.department_id,true,now());
    END IF;
  END LOOP;

  IF v_state='KNOWN_LEGACY_PRESTATE' THEN
    UPDATE public.request_processing_assignments
    SET is_active=false,ends_at=COALESCE(ends_at,now()),updated_at=now()
    WHERE id IN (
      '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f',
      '912bdb96-3fb9-494c-8caa-7778c7d0d402',
      '4d0f434e-57ab-40b2-8a6f-5f27f330db97')
      AND unit_id=v_unit AND role_id=v_role
      AND assignment_type='faculty_profile' AND is_active;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated<>3 THEN RAISE EXCEPTION 'KNOWN_LEGACY_ROWS_DISABLED_COUNT:%',v_updated; END IF;
  END IF;
END
$phase$;

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid,p_step_key text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    SELECT count(*)=1
    FROM public.student_request_workflow_steps s
    JOIN public.transfer_request_details d ON d.request_id=s.student_request_id
    JOIN public.position_assignments pa ON pa.id=s.assigned_position_assignment_id
      AND pa.user_id=auth.uid() AND pa.is_active AND pa.assigned_from<=CURRENT_DATE
      AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE)
    JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id=pa.id
      AND rpa.assignment_type='position_assignment' AND rpa.is_active
      AND (rpa.starts_at IS NULL OR rpa.starts_at<=now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at>now())
      AND rpa.unit_id=s.processing_unit_id AND rpa.role_id=s.processing_role_id
    WHERE s.id=p_step_id AND s.step_key=p_step_key
      AND s.assigned_user_id IS NULL AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND ((p_step_key='source_department_head_approval'
        AND rpa.department_id=d.current_department_id)
        OR (p_step_key='target_department_head_approval'
        AND rpa.department_id=d.requested_department_id))
  )
$$;
REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text)
  TO authenticated,service_role;

DO $post$
DECLARE v_body text;
BEGIN
  SELECT pg_get_functiondef('public.current_user_matches_transfer_department_scope(uuid,text)'::regprocedure)
    INTO v_body;
  IF position('assigned_position_assignment_id' in v_body)=0
    OR position('faculty_profiles' in v_body)>0 THEN
    RAISE EXCEPTION 'TRANSFER_SCOPE_FUNCTION_CONTRACT_MISMATCH';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.faculty_profiles
    WHERE id='d08a8509-4c04-472e-885f-053a80be12ec'
      AND department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8')
  THEN RAISE EXCEPTION 'OSAMA_ACADEMIC_AFFILIATION_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.request_processing_assignments
    WHERE id IN ('7ab0b14f-9007-40d6-9aaf-f1cba454ac8f','912bdb96-3fb9-494c-8caa-7778c7d0d402',
      '4d0f434e-57ab-40b2-8a6f-5f27f330db97') AND is_active)
  THEN RAISE EXCEPTION 'LEGACY_ROWS_STILL_ACTIVE'; END IF;
  IF (SELECT count(*) FROM public.request_processing_assignments a
    JOIN public.request_processing_units u ON u.id=a.unit_id AND u.code='department'
    JOIN public.request_processing_roles r ON r.id=a.role_id AND r.code='department_head'
    WHERE a.is_active AND a.assignment_type='position_assignment'
      AND a.department_id IN ('11111111-1111-4111-8111-111111111111',
        'ce485c67-5f7c-498d-b120-4b1130a86ae8','22222222-2222-4222-8222-222222222222'))<>3
  THEN RAISE EXCEPTION 'FINAL_ACTIVE_PROCESSING_ASSIGNMENT_COUNT_MISMATCH'; END IF;
END
$post$;

COMMIT;
