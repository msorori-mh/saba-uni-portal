-- DRAFT ONLY — NEVER APPLY WITHOUT SEPARATE EXPLICIT AUTHORIZATION.
-- Source-only forward correction. Does not update faculty_profiles.department_id.
BEGIN;

DO $$
DECLARE
  v_unit uuid;
  v_role uuid;
  v_item record;
  v_position uuid;
  v_user uuid;
  v_pa uuid;
  v_count integer;
BEGIN
  SELECT count(*), (array_agg(u.id ORDER BY u.id))[1] INTO v_count, v_unit
  FROM public.request_processing_units u
  WHERE u.code='department' AND u.is_active;
  IF v_count <> 1 THEN RAISE EXCEPTION 'DEPARTMENT_UNIT_MUST_RESOLVE_ONCE:%',v_count; END IF;

  SELECT count(*), (array_agg(r.id ORDER BY r.id))[1] INTO v_count, v_role
  FROM public.request_processing_roles r
  WHERE r.unit_id=v_unit AND r.code='department_head' AND r.is_active;
  IF v_count <> 1 THEN RAISE EXCEPTION 'DEPARTMENT_HEAD_ROLE_MUST_RESOLVE_ONCE:%',v_count; END IF;

  FOR v_item IN SELECT * FROM (VALUES
    ('cs_department_head','رئيس قسم علوم الحاسوب','d08a8509-4c04-472e-885f-053a80be12ec'::uuid,'11111111-1111-4111-8111-111111111111'::uuid),
    ('it_department_head','رئيس قسم تكنولوجيا المعلومات','6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'::uuid,'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid),
    ('is_department_head','رئيس قسم نظم المعلومات الحاسوبية','c1fe6084-e594-482e-a178-ac8eaffed376'::uuid,'22222222-2222-4222-8222-222222222222'::uuid)
  ) x(position_code,name_ar,faculty_profile_id,department_id)
  LOOP
    SELECT count(*), (array_agg(fp.user_id ORDER BY fp.user_id))[1] INTO v_count,v_user
    FROM public.faculty_profiles fp WHERE fp.id=v_item.faculty_profile_id;
    IF v_count <> 1 OR v_user IS NULL THEN
      RAISE EXCEPTION 'FACULTY_PROFILE_USER_MUST_RESOLVE_ONCE:%',v_item.faculty_profile_id;
    END IF;

    INSERT INTO public.organizational_positions(code,name_ar,parent_code,unit_type,is_active)
    VALUES(v_item.position_code,v_item.name_ar,'academic_departments','position',true)
    ON CONFLICT(code) DO NOTHING;
    SELECT count(*),(array_agg(op.id ORDER BY op.id))[1] INTO v_count,v_position
    FROM public.organizational_positions op
    WHERE op.code=v_item.position_code AND op.parent_code='academic_departments' AND op.is_active;
    IF v_count <> 1 THEN RAISE EXCEPTION 'POSITION_MUST_RESOLVE_ONCE:%',v_item.position_code; END IF;

    IF EXISTS(SELECT 1 FROM public.position_assignments pa
      WHERE pa.position_id=v_position AND pa.is_active AND pa.user_id<>v_user) THEN
      RAISE EXCEPTION 'UNEXPECTED_ACTIVE_POSITION_HOLDER:%',v_item.position_code;
    END IF;
    SELECT (array_agg(pa.id ORDER BY pa.id))[1] INTO v_pa FROM public.position_assignments pa
    WHERE pa.position_id=v_position AND pa.user_id=v_user AND pa.is_active
      AND pa.assigned_from<=CURRENT_DATE AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE);
    IF v_pa IS NULL THEN
      INSERT INTO public.position_assignments(position_id,user_id,assigned_from,is_active,notes)
      VALUES(v_position,v_user,CURRENT_DATE,true,'DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01')
      RETURNING id INTO v_pa;
    END IF;

    UPDATE public.request_processing_assignments
    SET is_active=false,ends_at=COALESCE(ends_at,now()),updated_at=now()
    WHERE unit_id=v_unit AND role_id=v_role AND department_id=v_item.department_id
      AND is_active AND assignment_type='faculty_profile';

    IF EXISTS(SELECT 1 FROM public.request_processing_assignments a
      WHERE a.unit_id=v_unit AND a.role_id=v_role AND a.department_id=v_item.department_id
        AND a.is_active AND (a.assignment_type<>'position_assignment'
          OR a.position_assignment_id<>v_pa)) THEN
      RAISE EXCEPTION 'UNEXPECTED_ACTIVE_PROCESSING_ASSIGNMENT:%',v_item.department_id;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.request_processing_assignments a
      WHERE a.unit_id=v_unit AND a.role_id=v_role AND a.department_id=v_item.department_id
        AND a.assignment_type='position_assignment' AND a.position_assignment_id=v_pa
        AND a.is_active) THEN
      INSERT INTO public.request_processing_assignments(
        unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active,starts_at)
      VALUES(v_unit,v_role,'position_assignment',v_pa,v_item.department_id,true,now());
    END IF;
  END LOOP;
END $$;

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
    JOIN public.request_processing_assignments a ON a.position_assignment_id=pa.id
      AND a.assignment_type='position_assignment' AND a.is_active
      AND (a.starts_at IS NULL OR a.starts_at<=now()) AND (a.ends_at IS NULL OR a.ends_at>now())
      AND a.unit_id=s.processing_unit_id AND a.role_id=s.processing_role_id
    WHERE s.id=p_step_id AND s.step_key=p_step_key
      AND s.assigned_user_id IS NULL AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND ((p_step_key='source_department_head_approval' AND a.department_id=d.current_department_id)
        OR (p_step_key='target_department_head_approval' AND a.department_id=d.requested_department_id))
  )
$$;

COMMIT;
