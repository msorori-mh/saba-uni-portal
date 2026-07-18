\set ON_ERROR_STOP on

CREATE TEMP TABLE harness_results (
  service text NOT NULL,
  step_key text NOT NULL,
  scenario text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.record_result(
  p_service text, p_step text, p_scenario text, p_expected text,
  p_actual text, p_detail text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO harness_results VALUES (
    p_service, p_step, p_scenario, p_expected, p_actual,
    p_expected = p_actual, p_detail
  );
END $$;

CREATE TEMP TABLE matrix (
  service text, step_key text, unit_code text, role_code text, action_type text,
  request_id uuid DEFAULT gen_random_uuid(), workflow_id uuid DEFAULT gen_random_uuid(),
  config_id uuid DEFAULT gen_random_uuid(), runtime_id uuid DEFAULT gen_random_uuid(),
  unit_id uuid, role_id uuid
);

INSERT INTO matrix(service,step_key,unit_code,role_code,action_type) VALUES
 ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
 ('enrollment_suspension','manager_approval','student_affairs','student_affairs_manager','approve'),
 ('enrollment_suspension','registrar_apply','registrar','registrar_general','apply_decision'),
 ('excused_absence','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('excused_absence','manager_review','student_affairs','student_affairs_manager','approve'),
 ('excused_absence','record_apply','student_affairs','student_affairs_specialist','apply_decision'),
 ('file_withdrawal','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('file_withdrawal','library_clearance','library','library_officer','clear'),
 ('file_withdrawal','labs_clearance','labs','labs_manager','clear'),
 ('file_withdrawal','activities_clearance','student_affairs','student_affairs_manager','clear'),
 ('file_withdrawal','finance_clearance','finance','revenue_finance_officer','clear'),
 ('file_withdrawal','registrar_apply','registrar','registrar_general','apply_decision'),
 ('file_withdrawal','archive','archive','archive_officer','archive'),
 ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('department_transfer','source_department_head_approval','department','department_head','approve'),
 ('department_transfer','target_department_head_approval','department','department_head','approve'),
 ('department_transfer','dean_approval','dean','dean','approve'),
 ('department_transfer','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
 ('department_transfer','registrar_apply','registrar','registrar_general','apply_decision'),
 ('final_chance','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
 ('final_chance','manager_review','student_affairs','student_affairs_manager','approve'),
 ('final_chance','dean_decision','dean','dean','approve'),
 ('final_chance','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
 ('final_chance','registrar_apply','registrar','registrar_general','apply_decision');

INSERT INTO public.request_processing_units(code,name_ar,is_active)
VALUES ('department','Synthetic department',true) ON CONFLICT (code) DO NOTHING;
INSERT INTO public.request_processing_roles(unit_id,code,name_ar,is_active)
SELECT id,'department_head','Synthetic head',true FROM public.request_processing_units
WHERE code='department' ON CONFLICT (unit_id,code) DO NOTHING;

UPDATE matrix m SET unit_id=u.id,role_id=r.id
FROM public.request_processing_units u JOIN public.request_processing_roles r ON r.unit_id=u.id
WHERE u.code=m.unit_code AND r.code=m.role_code;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM matrix WHERE unit_id IS NULL OR role_id IS NULL) THEN
    RAISE EXCEPTION 'MATRIX_PROCESSING_BINDING_MISSING';
  END IF;
END $$;

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002'),
 ('30000000-0000-0000-0000-000000000003'),
 ('40000000-0000-0000-0000-000000000004'),
 ('50000000-0000-0000-0000-000000000005') ON CONFLICT DO NOTHING;
INSERT INTO public.faculty_profiles(id,user_id,status,department_id)
VALUES
 ('10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000001'::uuid,'active',NULL),
 ('20000000-0000-0000-0000-000000000002'::uuid,'20000000-0000-0000-0000-000000000002'::uuid,'active',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.request_types(code,name_ar,is_active)
SELECT DISTINCT service,service,true FROM matrix ON CONFLICT (code) DO NOTHING;
INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,user_id,is_active)
SELECT DISTINCT unit_id,role_id,'user','10000000-0000-0000-0000-000000000001'::uuid,true FROM matrix;
-- Same-role actor has every exact unit/role binding but is never directly assigned.
INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,user_id,is_active)
SELECT DISTINCT unit_id,role_id,'user','20000000-0000-0000-0000-000000000002'::uuid,true FROM matrix;

INSERT INTO public.request_type_workflows(id,request_type_id,code,name_ar,version,status,is_active)
SELECT m.workflow_id,rt.id,m.service||'_'||m.step_key,m.step_key,1,'draft',false
FROM matrix m JOIN public.request_types rt ON rt.code=m.service;
INSERT INTO public.request_type_workflow_steps(
 id,workflow_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,
 assignment_strategy,action_type,status_on_enter,status_on_complete,is_required,can_skip
)
SELECT config_id,workflow_id,step_key,step_key,1,unit_id,role_id,'specific_user',
 action_type,'in_progress','completed',true,false FROM matrix;
INSERT INTO public.student_requests(id,request_type,status,request_number)
SELECT request_id,service,'under_review','SYN-'||row_number() over () FROM matrix;
INSERT INTO public.student_request_workflow_steps(
 id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,
 processing_unit_id,processing_role_id,status,assigned_user_id,assigned_faculty_profile_id
)
SELECT runtime_id,request_id,workflow_id,config_id,step_key,step_key,1,unit_id,role_id,'active',
 CASE WHEN role_code='department_head' THEN NULL ELSE '10000000-0000-0000-0000-000000000001'::uuid END,
 CASE WHEN role_code='department_head' THEN '10000000-0000-0000-0000-000000000001'::uuid ELSE NULL END
FROM matrix;

-- Synthetic transfer scope is deliberately exact for both rows.
INSERT INTO public.departments(id,name_ar) VALUES
 ('60000000-0000-0000-0000-000000000006','Source'),
 ('70000000-0000-0000-0000-000000000007','Target') ON CONFLICT DO NOTHING;
UPDATE public.faculty_profiles SET department_id='60000000-0000-0000-0000-000000000006'
WHERE id='10000000-0000-0000-0000-000000000001';
INSERT INTO public.transfer_request_details(request_id,current_department_id,requested_department_id,transfer_reason)
SELECT request_id,'60000000-0000-0000-0000-000000000006'::uuid,
 CASE WHEN step_key='target_department_head_approval' THEN '60000000-0000-0000-0000-000000000006'::uuid ELSE '70000000-0000-0000-0000-000000000007'::uuid END,
 'synthetic' FROM matrix WHERE service='department_transfer'
ON CONFLICT (request_id) DO NOTHING;

DO $$
DECLARE m matrix%ROWTYPE; ok boolean; before_row jsonb; after_row jsonb;
BEGIN
  FOR m IN SELECT * FROM matrix LOOP
    PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'exact_direct_assignee','ALLOW',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);

    SELECT to_jsonb(s) INTO before_row FROM public.student_request_workflow_steps s WHERE id=m.runtime_id;
    PERFORM set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    SELECT to_jsonb(s) INTO after_row FROM public.student_request_workflow_steps s WHERE id=m.runtime_id;
    PERFORM pg_temp.record_result(m.service,m.step_key,'same_role_not_assigned','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END,
      CASE WHEN before_row=after_row THEN 'zero_mutation' ELSE 'MUTATED' END);

    PERFORM set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'admin_bypass','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    PERFORM set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'registrar_bypass','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    PERFORM set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'dean_bypass','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    PERFORM set_config('request.jwt.claim.sub','',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'anonymous','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);

    PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
    ok := public.can_current_user_act_on_step(m.runtime_id,'comment');
    PERFORM pg_temp.record_result(m.service,m.step_key,'wrong_action','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);

    UPDATE public.student_request_workflow_steps SET status='inactive' WHERE id=m.runtime_id;
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'inactive_step','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    UPDATE public.student_request_workflow_steps SET status='completed' WHERE id=m.runtime_id;
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'stale_or_completed_replay','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    UPDATE public.student_request_workflow_steps SET status='active' WHERE id=m.runtime_id;

    UPDATE public.student_request_workflow_steps SET processing_unit_id=(
      SELECT id FROM public.request_processing_units WHERE code<>m.unit_code ORDER BY code LIMIT 1
    ) WHERE id=m.runtime_id;
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'wrong_processing_unit','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    UPDATE public.student_request_workflow_steps SET processing_unit_id=m.unit_id,
      processing_role_id=(SELECT id FROM public.request_processing_roles WHERE id<>m.role_id ORDER BY code LIMIT 1) WHERE id=m.runtime_id;
    ok := public.can_current_user_act_on_step(m.runtime_id,m.action_type);
    PERFORM pg_temp.record_result(m.service,m.step_key,'wrong_processing_role','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
    UPDATE public.student_request_workflow_steps SET processing_role_id=m.role_id WHERE id=m.runtime_id;
  END LOOP;
END $$;

-- Department source/target isolation: changing the assigned head's department must deny.
DO $$ DECLARE m matrix%ROWTYPE; ok boolean; BEGIN
 FOR m IN SELECT * FROM matrix WHERE role_code='department_head' LOOP
  UPDATE public.faculty_profiles SET department_id='70000000-0000-0000-0000-000000000007' WHERE id='10000000-0000-0000-0000-000000000001';
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  ok:=public.can_current_user_act_on_step(m.runtime_id,m.action_type);
  PERFORM pg_temp.record_result(m.service,m.step_key,'department_scope_isolation','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
 END LOOP;
 UPDATE public.faculty_profiles SET department_id='60000000-0000-0000-0000-000000000006' WHERE id='10000000-0000-0000-0000-000000000001';
END $$;

-- A target marked active while a synthetic predecessor remains pending must fail closed.
-- This is intentionally a behavioral gate, not merely a source-string assertion.
DO $$ DECLARE m matrix%ROWTYPE; predecessor_id uuid; ok boolean; BEGIN
 FOR m IN SELECT DISTINCT ON (service) * FROM matrix ORDER BY service,step_key LOOP
  predecessor_id:=gen_random_uuid();
  INSERT INTO public.student_request_workflow_steps(id,student_request_id,workflow_id,step_key,step_name_ar,step_order,status)
  VALUES(predecessor_id,m.request_id,m.workflow_id,'synthetic_predecessor','predecessor',0,'pending');
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  ok:=public.can_current_user_act_on_step(m.runtime_id,m.action_type);
  PERFORM pg_temp.record_result(m.service,m.step_key,'incomplete_predecessor','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
 END LOOP;
END $$;

-- Acting on another request: exact binding exists, but its runtime assignee differs.
DO $$ DECLARE m matrix%ROWTYPE; ok boolean; BEGIN
 FOR m IN SELECT DISTINCT ON (service) * FROM matrix ORDER BY service,step_key LOOP
  UPDATE public.student_request_workflow_steps SET assigned_user_id='20000000-0000-0000-0000-000000000002',assigned_faculty_profile_id=NULL WHERE id=m.runtime_id;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  ok:=public.can_current_user_act_on_step(m.runtime_id,m.action_type);
  PERFORM pg_temp.record_result(m.service,m.step_key,'another_request','DENY',CASE WHEN ok THEN 'ALLOW' ELSE 'DENY' END);
 END LOOP;
END $$;
