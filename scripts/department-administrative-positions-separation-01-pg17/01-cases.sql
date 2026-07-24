\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'), -- Osama
 ('10000000-0000-4000-8000-000000000002'), -- Khaled
 ('10000000-0000-4000-8000-000000000003'), -- Ramzi
 ('10000000-0000-4000-8000-000000000004'); -- broad-role stranger
INSERT INTO public.departments(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('ce485c67-5f7c-498d-b120-4b1130a86ae8'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.faculty_profiles(id,user_id,department_id) VALUES
 ('d08a8509-4c04-472e-885f-053a80be12ec','10000000-0000-4000-8000-000000000001','ce485c67-5f7c-498d-b120-4b1130a86ae8'),
 ('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3','10000000-0000-4000-8000-000000000002','ce485c67-5f7c-498d-b120-4b1130a86ae8'),
 ('c1fe6084-e594-482e-a178-ac8eaffed376','10000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222')
ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,department_id=excluded.department_id,status='active';
INSERT INTO public.request_processing_units(id,code,is_active) VALUES
 ('20000000-0000-4000-8000-000000000001','department',true);
INSERT INTO public.request_processing_roles(id,unit_id,code,is_active) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','department_head',true);
INSERT INTO public.position_assignments(id,user_id,is_active,assigned_from,assigned_to) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true,CURRENT_DATE-1,NULL),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true,CURRENT_DATE-1,NULL),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',true,CURRENT_DATE-1,NULL),
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',false,CURRENT_DATE-5,CURRENT_DATE-1);
INSERT INTO public.request_processing_assignments(
 id,unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active
) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','position_assignment','40000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',true),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','position_assignment','40000000-0000-4000-8000-000000000002','ce485c67-5f7c-498d-b120-4b1130a86ae8',true),
 ('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','position_assignment','40000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222',true),
 ('50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','position_assignment','40000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.student_profiles(id) VALUES ('60000000-0000-4000-8000-000000000001');
INSERT INTO public.student_requests(id,student_profile_id,request_type) VALUES
 ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','department_transfer');
INSERT INTO public.transfer_request_details(request_id,current_department_id,requested_department_id) VALUES
 ('70000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ce485c67-5f7c-498d-b120-4b1130a86ae8');
INSERT INTO public.student_request_workflow_steps(
 id,student_request_id,step_key,processing_unit_id,processing_role_id,status,assigned_position_assignment_id
) VALUES
 ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','source_department_head_approval','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','40000000-0000-4000-8000-000000000001'),
 ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','target_department_head_approval','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','40000000-0000-4000-8000-000000000002');

DO $$
DECLARE b boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M1_OSAMA_CS_ALLOW'; END IF;
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000002','target_department_head_approval') THEN RAISE EXCEPTION 'M2_OSAMA_IT_DENY'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000002','target_department_head_approval') THEN RAISE EXCEPTION 'M3_KHALED_IT_ALLOW'; END IF;
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M4_KHALED_CS_DENY'; END IF;
  UPDATE public.transfer_request_details SET requested_department_id='22222222-2222-4222-8222-222222222222';
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id='40000000-0000-4000-8000-000000000003' WHERE id='80000000-0000-4000-8000-000000000002';
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000002','target_department_head_approval') THEN RAISE EXCEPTION 'M5_RAMZI_IS_ALLOW'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id='40000000-0000-4000-8000-000000000004' WHERE id='80000000-0000-4000-8000-000000000001';
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M6_EXPIRED_DENY'; END IF;
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id='40000000-0000-4000-8000-000000000001' WHERE id='80000000-0000-4000-8000-000000000001';
  INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active)
    VALUES('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','position_assignment','40000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',true);
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M7_DUPLICATE_FAIL_CLOSED'; END IF;
  DELETE FROM public.request_processing_assignments WHERE id NOT IN ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000004');
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id=NULL,assigned_faculty_profile_id='d08a8509-4c04-472e-885f-053a80be12ec' WHERE id='80000000-0000-4000-8000-000000000001';
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M8_FACULTY_RUNTIME_DENY'; END IF;
  UPDATE public.student_request_workflow_steps SET assigned_faculty_profile_id=NULL WHERE id='80000000-0000-4000-8000-000000000001';
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M9_MISSING_DIRECT_DENY'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M10_BROAD_ROLE_DENY'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  IF public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M11_ANON_DENY'; END IF;
  UPDATE public.student_request_workflow_steps SET assigned_position_assignment_id='40000000-0000-4000-8000-000000000001' WHERE id='80000000-0000-4000-8000-000000000001';
  UPDATE public.faculty_profiles SET department_id='22222222-2222-4222-8222-222222222222' WHERE id='d08a8509-4c04-472e-885f-053a80be12ec';
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  IF NOT public.current_user_matches_transfer_department_scope('80000000-0000-4000-8000-000000000001','source_department_head_approval') THEN RAISE EXCEPTION 'M12_AFFILIATION_INDEPENDENT'; END IF;
END $$;
ROLLBACK;
\echo PG17_DEPARTMENT_ADMINISTRATIVE_POSITIONS_MATRIX_PASS
