\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.student_profiles(id) VALUES ('60000000-0000-4000-8000-000000000001');
INSERT INTO public.student_requests(id,student_profile_id,request_type) VALUES
 ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','department_transfer');
INSERT INTO public.transfer_request_details(request_id,current_department_id,requested_department_id) VALUES
 ('70000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8');

DO $$
DECLARE osama_pa uuid;khaled_pa uuid;ramzi_pa uuid;expired_pa uuid;
BEGIN
  SELECT pa.id INTO STRICT osama_pa FROM public.position_assignments pa JOIN public.organizational_positions op ON op.id=pa.position_id WHERE op.code='cs_department_head' AND pa.is_active;
  SELECT pa.id INTO STRICT khaled_pa FROM public.position_assignments pa JOIN public.organizational_positions op ON op.id=pa.position_id WHERE op.code='it_department_head' AND pa.is_active;
  SELECT pa.id INTO STRICT ramzi_pa FROM public.position_assignments pa JOIN public.organizational_positions op ON op.id=pa.position_id WHERE op.code='is_department_head' AND pa.is_active;
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,step_key,processing_unit_id,processing_role_id,status,assigned_position_assignment_id) VALUES
   ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','source_department_head_approval','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active',osama_pa),
   ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','target_department_head_approval','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active',khaled_pa);
  PERFORM set_config('request.jwt.claim.sub','97acbe02-c59c-409c-8d51-7d4ef72e6db7',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M1'; END IF;
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000002','target_department_head_approval') THEN RAISE EXCEPTION 'M2'; END IF;
  PERFORM set_config('request.jwt.claim.sub','d4aaa5c9-72d1-4996-b0e8-d30c6327da6e',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000002','target_department_head_approval') THEN RAISE EXCEPTION 'M3'; END IF;
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M4'; END IF;
  UPDATE public.transfer_request_details SET requested_department_id='22222222-2222-4222-8222-222222222222';
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id=ramzi_pa WHERE id='80000000-0000-4000-8000-000000000002';
  PERFORM set_config('request.jwt.claim.sub','f602b62c-194b-4591-8e9c-956e5cbb347d',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000002','target_department_head_approval') THEN RAISE EXCEPTION 'M5'; END IF;
  INSERT INTO public.position_assignments(position_id,user_id,is_active,assigned_from,assigned_to)
    SELECT id,'10000000-0000-4000-8000-000000000004',false,CURRENT_DATE-5,CURRENT_DATE-1 FROM public.organizational_positions WHERE code='cs_department_head' RETURNING id INTO expired_pa;
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id=expired_pa WHERE id='80000000-0000-4000-8000-000000000001';
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M6'; END IF;
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id=osama_pa WHERE id='80000000-0000-4000-8000-000000000001';
  INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active)
    VALUES('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','position_assignment',osama_pa,'11111111-1111-4111-8111-111111111111',true);
  PERFORM set_config('request.jwt.claim.sub','97acbe02-c59c-409c-8d51-7d4ef72e6db7',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M7'; END IF;
  DELETE FROM public.request_processing_assignments WHERE position_assignment_id=osama_pa
    AND id<>(SELECT (array_agg(id ORDER BY id))[1] FROM public.request_processing_assignments WHERE position_assignment_id=osama_pa);
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id=NULL,assigned_faculty_profile_id='d08a8509-4c04-472e-885f-053a80be12ec' WHERE id='80000000-0000-4000-8000-000000000001';
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M8'; END IF;
  UPDATE public.student_request_workflow_steps SET assigned_faculty_profile_id=NULL WHERE id='80000000-0000-4000-8000-000000000001';
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M9'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M10'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M11'; END IF;
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id=osama_pa WHERE id='80000000-0000-4000-8000-000000000001';
  UPDATE public.faculty_profiles SET department_id='22222222-2222-4222-8222-222222222222' WHERE id='d08a8509-4c04-472e-885f-053a80be12ec';
  PERFORM set_config('request.jwt.claim.sub','97acbe02-c59c-409c-8d51-7d4ef72e6db7',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M12'; END IF;
END $$;
ROLLBACK;
\echo PG17_DEPARTMENT_ADMINISTRATIVE_POSITIONS_MATRIX_PASS
