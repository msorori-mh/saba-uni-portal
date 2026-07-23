-- Scoped PG17 cases for B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.
-- Synthetic harness only: no production objects, data, or connection strings.
--
-- Harness-only adaptations (documented; nothing existing was modified):
--   1. is_owner_of_request is redefined with real semantics because the
--      minimal schema stubs it to `SELECT false`. Required for owner-deny cases.
--   2. The two synthetic CHECK constraints on action_type / action_result are
--      dropped because the minimal schema's vocabulary lists predate the LIVE
--      enrollment_certificate legacy vocabulary ('assess_fee', 'approve',
--      'payment_required', 'fee_not_required') which production already runs.
\set ON_ERROR_STOP on

alter table public.request_type_workflow_steps drop constraint request_type_workflow_steps_action_type_chk;
alter table public.request_type_workflow_transitions drop constraint request_type_workflow_transitions_action_result_chk;

create or replace function public.is_owner_of_request(p_uid uuid, p_request_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.student_requests r
    join public.student_profiles sp on sp.id = r.student_profile_id
    where r.id = p_request_id and sp.user_id = p_uid
  );
$$;

select id as unit_registrar from public.request_processing_units where code='registrar' \gset
select id as unit_sa from public.request_processing_units where code='student_affairs' \gset
select id as role_rg from public.request_processing_roles where code='registrar_general' \gset
select id as role_sam from public.request_processing_roles where code='student_affairs_manager' \gset
select id as role_sas from public.request_processing_roles where code='student_affairs_specialist' \gset
select id as rt_b1 from public.request_types where code='enrollment_suspension' \gset

insert into auth.users(id) values
 ('aaaa0000-0000-0000-0000-000000000001'), -- U1  EC initial_review officer
 ('aaaa0000-0000-0000-0000-000000000002'), -- U2  EC sign officer (zero-fee path)
 ('aaaa0000-0000-0000-0000-000000000003'), -- U3  wrong actor WITH registrar binding
 ('aaaa0000-0000-0000-0000-000000000004'), -- UM  B1 student_affairs manager
 ('aaaa0000-0000-0000-0000-000000000005'), -- UR  B1 registrar officer
 ('aaaa0000-0000-0000-0000-000000000006'), -- UA  binding on another role only ("admin-without-assignment")
 ('aaaa0000-0000-0000-0000-000000000007'), -- UO  request owner
 ('aaaa0000-0000-0000-0000-000000000008'); -- U_NB no binding anywhere

insert into public.student_profiles(id,user_id,status) values
 ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000007','active');

insert into public.request_processing_assignments(unit_id,role_id,assignment_type,user_id,is_active) values
 (:'unit_registrar',:'role_rg','user','aaaa0000-0000-0000-0000-000000000003',true),
 (:'unit_sa',:'role_sam','user','aaaa0000-0000-0000-0000-000000000004',true),
 (:'unit_registrar',:'role_rg','user','aaaa0000-0000-0000-0000-000000000005',true),
 (:'unit_sa',:'role_sas','user','aaaa0000-0000-0000-0000-000000000006',true);

-- ---------------------------------------------------------------------------
-- enrollment_certificate-SHAPED config: 7 steps / 9 transitions, legacy
-- vocabulary (entry submit; initial_review(review)->fee_assessment(assess_fee)
-- result 'approve'; fee_assessment->payment_confirmation(confirm_payment)
-- result 'payment_required'; fee_assessment->registrar_signature(sign) result
-- 'fee_not_required'; payment_confirmed; signed; signed; issued; archived).
-- ---------------------------------------------------------------------------
insert into public.request_types(id,code,name_ar,is_active) values
 ('cccc0000-0000-0000-0000-000000000001','enrollment_certificate','ec',true);
insert into public.request_type_workflows(id,request_type_id,code,name_ar,version,status,is_active) values
 ('dddd0000-0000-0000-0000-000000000001','cccc0000-0000-0000-0000-000000000001','ec_v1','ec',1,'published',true);
insert into public.request_type_workflow_steps(id,workflow_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,action_type,is_required,can_skip) values
 ('eeee0000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000001','initial_review','ir',1,:'unit_registrar',:'role_rg','review',true,false),
 ('eeee0000-0000-0000-0000-000000000002','dddd0000-0000-0000-0000-000000000001','fee_assessment','fa',2,:'unit_registrar',:'role_rg','assess_fee',true,false),
 ('eeee0000-0000-0000-0000-000000000003','dddd0000-0000-0000-0000-000000000001','payment_confirmation','pc',3,:'unit_registrar',:'role_rg','confirm_payment',true,false),
 ('eeee0000-0000-0000-0000-000000000004','dddd0000-0000-0000-0000-000000000001','registrar_signature','rs',4,:'unit_registrar',:'role_rg','sign',true,false),
 ('eeee0000-0000-0000-0000-000000000005','dddd0000-0000-0000-0000-000000000001','dean_signature','ds',5,:'unit_registrar',:'role_rg','sign',true,false),
 ('eeee0000-0000-0000-0000-000000000006','dddd0000-0000-0000-0000-000000000001','document_issuance','di',6,:'unit_registrar',:'role_rg','issue_document',true,false),
 ('eeee0000-0000-0000-0000-000000000007','dddd0000-0000-0000-0000-000000000001','archive','ar',7,:'unit_registrar',:'role_rg','archive',true,false);
insert into public.request_type_workflow_transitions(id,workflow_id,from_step_id,to_step_id,action_result,is_default) values
 ('ffff0000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000001',null,'eeee0000-0000-0000-0000-000000000001','submit',true),
 ('ffff0000-0000-0000-0000-000000000002','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000002','approve',true),
 ('ffff0000-0000-0000-0000-000000000003','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000003','payment_required',true),
 ('ffff0000-0000-0000-0000-000000000004','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000004','fee_not_required',true),
 ('ffff0000-0000-0000-0000-000000000005','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000003','eeee0000-0000-0000-0000-000000000004','payment_confirmed',true),
 ('ffff0000-0000-0000-0000-000000000006','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000004','eeee0000-0000-0000-0000-000000000005','signed',true),
 ('ffff0000-0000-0000-0000-000000000007','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000005','eeee0000-0000-0000-0000-000000000006','signed',true),
 ('ffff0000-0000-0000-0000-000000000008','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000006','eeee0000-0000-0000-0000-000000000007','issued',true),
 ('ffff0000-0000-0000-0000-000000000009','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000007',null,'archived',true);

-- enrollment_certificate runtime requests.
insert into public.student_requests(id,request_type,status,request_number) values
 ('11110000-0000-0000-0000-000000000001','enrollment_certificate','under_review','EC-1'),
 ('11110000-0000-0000-0000-000000000003','enrollment_certificate','under_review','EC-3'),
 ('11110000-0000-0000-0000-000000000005','enrollment_certificate','under_review','EC-5');
insert into public.student_requests(id,student_profile_id,request_type,status,request_number) values
 ('11110000-0000-0000-0000-000000000004','bbbb0000-0000-0000-0000-000000000001','enrollment_certificate','under_review','EC-4');
-- R1: active initial_review directly assigned to U1.
insert into public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,status,assigned_user_id) values
 ('22220000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001','initial_review','ir',1,:'unit_registrar',:'role_rg','active','aaaa0000-0000-0000-0000-000000000001');
-- R3: zero-fee path; active registrar_signature directly assigned to U2.
insert into public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,status,assigned_user_id) values
 ('22220000-0000-0000-0000-000000000031','11110000-0000-0000-0000-000000000003','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001','initial_review','ir',1,:'unit_registrar',:'role_rg','completed','aaaa0000-0000-0000-0000-000000000001'),
 ('22220000-0000-0000-0000-000000000032','11110000-0000-0000-0000-000000000003','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000002','fee_assessment','fa',2,:'unit_registrar',:'role_rg','completed','aaaa0000-0000-0000-0000-000000000001'),
 ('22220000-0000-0000-0000-000000000033','11110000-0000-0000-0000-000000000003','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000004','registrar_signature','rs',4,:'unit_registrar',:'role_rg','active','aaaa0000-0000-0000-0000-000000000002');
-- R4: owned by UO; active initial_review directly assigned to the owner.
insert into public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,status,assigned_user_id) values
 ('22220000-0000-0000-0000-000000000041','11110000-0000-0000-0000-000000000004','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001','initial_review','ir',1,:'unit_registrar',:'role_rg','active','aaaa0000-0000-0000-0000-000000000007');
-- R5: active dean_signature with NO direct assignee (fallback-only step).
insert into public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,status) values
 ('22220000-0000-0000-0000-000000000051','11110000-0000-0000-0000-000000000005','dddd0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000005','dean_signature','ds',5,:'unit_registrar',:'role_rg','active');

-- ---------------------------------------------------------------------------
-- B1-SHAPED config: enrollment_suspension (initial_review review ->
-- manager_approval approve -> registrar_apply apply_decision).
-- ---------------------------------------------------------------------------
insert into public.request_type_workflows(id,request_type_id,code,name_ar,version,status,is_active) values
 ('dddd0000-0000-0000-0000-000000000002',:'rt_b1','es_v1','es',1,'published',true);
insert into public.request_type_workflow_steps(id,workflow_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,action_type,is_required,can_skip) values
 ('eeee0000-0000-0000-0000-000000000011','dddd0000-0000-0000-0000-000000000002','initial_review','ir',1,:'unit_sa',:'role_sas','review',true,false),
 ('eeee0000-0000-0000-0000-000000000012','dddd0000-0000-0000-0000-000000000002','manager_approval','ma',2,:'unit_sa',:'role_sam','approve',true,false),
 ('eeee0000-0000-0000-0000-000000000013','dddd0000-0000-0000-0000-000000000002','registrar_apply','ra',3,:'unit_registrar',:'role_rg','apply_decision',true,false);
insert into public.request_type_workflow_transitions(id,workflow_id,from_step_id,to_step_id,action_result,is_default) values
 ('ffff0000-0000-0000-0000-000000000011','dddd0000-0000-0000-0000-000000000002',null,'eeee0000-0000-0000-0000-000000000011','submit',true),
 ('ffff0000-0000-0000-0000-000000000012','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000011','eeee0000-0000-0000-0000-000000000012','reviewed',true),
 ('ffff0000-0000-0000-0000-000000000013','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000012','eeee0000-0000-0000-0000-000000000013','approved',true),
 ('ffff0000-0000-0000-0000-000000000014','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000013',null,'applied',true);

-- RB1: initial_review completed, manager_approval active (UM), registrar_apply pending (UR).
insert into public.student_requests(id,request_type,status,request_number) values
 ('11110000-0000-0000-0000-000000000011','enrollment_suspension','under_review','ES-1');
insert into public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,status,assigned_user_id) values
 ('22220000-0000-0000-0000-000000000011','11110000-0000-0000-0000-000000000011','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000011','initial_review','ir',1,:'unit_sa',:'role_sas','completed','aaaa0000-0000-0000-0000-000000000006'),
 ('22220000-0000-0000-0000-000000000012','11110000-0000-0000-0000-000000000011','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000012','manager_approval','ma',2,:'unit_sa',:'role_sam','active','aaaa0000-0000-0000-0000-000000000004'),
 ('22220000-0000-0000-0000-000000000013','11110000-0000-0000-0000-000000000011','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000013','registrar_apply','ra',3,:'unit_registrar',:'role_rg','pending','aaaa0000-0000-0000-0000-000000000005');
-- RB2: owned by UO; registrar_apply active and directly assigned to the owner.
insert into public.student_requests(id,student_profile_id,request_type,status,request_number) values
 ('11110000-0000-0000-0000-000000000012','bbbb0000-0000-0000-0000-000000000001','enrollment_suspension','under_review','ES-2');
insert into public.student_request_workflow_steps(id,student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,processing_unit_id,processing_role_id,status,assigned_user_id) values
 ('22220000-0000-0000-0000-000000000021','11110000-0000-0000-0000-000000000012','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000011','initial_review','ir',1,:'unit_sa',:'role_sas','completed','aaaa0000-0000-0000-0000-000000000006'),
 ('22220000-0000-0000-0000-000000000022','11110000-0000-0000-0000-000000000012','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000012','manager_approval','ma',2,:'unit_sa',:'role_sam','completed','aaaa0000-0000-0000-0000-000000000004'),
 ('22220000-0000-0000-0000-000000000023','11110000-0000-0000-0000-000000000012','dddd0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000013','registrar_apply','ra',3,:'unit_registrar',:'role_rg','active','aaaa0000-0000-0000-0000-000000000007');

-- ---------------------------------------------------------------------------
-- Cases.
-- ---------------------------------------------------------------------------
create temp table scoped_results(case_name text, expected boolean, actual boolean, ok boolean);
create function pg_temp.scoped_check(p_name text, p_actor uuid, p_step uuid, p_action text, p_expected boolean)
returns void language plpgsql as $$
declare v_actual boolean;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_actor::text, ''), false);
  v_actual := public.can_current_user_act_on_step(p_step, p_action);
  insert into scoped_results values (p_name, p_expected, v_actual, v_actual is not distinct from p_expected);
end $$;

-- (a) REGRESSION GUARD: live enrollment_certificate contract preserved.
select pg_temp.scoped_check('ec_initial_review_approve_allow','aaaa0000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001','approve',true);
select pg_temp.scoped_check('ec_zero_fee_sign_allow','aaaa0000-0000-0000-0000-000000000002','22220000-0000-0000-0000-000000000033','sign',true);
-- (b) Wrong actor (with role-pool binding) / no binding / anonymous on EC.
select pg_temp.scoped_check('ec_wrong_actor_with_binding_deny','aaaa0000-0000-0000-0000-000000000003','22220000-0000-0000-0000-000000000001','approve',false);
select pg_temp.scoped_check('ec_no_binding_fallback_deny','aaaa0000-0000-0000-0000-000000000008','22220000-0000-0000-0000-000000000051','sign',false);
select pg_temp.scoped_check('ec_anonymous_deny',null,'22220000-0000-0000-0000-000000000001','approve',false);
-- (d) Owner of EC request denied even when directly assigned.
select pg_temp.scoped_check('ec_owner_deny','aaaa0000-0000-0000-0000-000000000007','22220000-0000-0000-0000-000000000041','approve',false);

-- (c) B1: correct assignee mid-chain with completed predecessors.
select pg_temp.scoped_check('b1_manager_approve_allow','aaaa0000-0000-0000-0000-000000000004','22220000-0000-0000-0000-000000000012','approve',true);
-- (c) B1: pending successor step denied.
select pg_temp.scoped_check('b1_pending_successor_deny','aaaa0000-0000-0000-0000-000000000005','22220000-0000-0000-0000-000000000013','apply_decision',false);
-- (c) B1: premature successor (required predecessor pending) denied.
update public.student_request_workflow_steps set status='pending' where id='22220000-0000-0000-0000-000000000012';
update public.student_request_workflow_steps set status='active' where id='22220000-0000-0000-0000-000000000013';
select pg_temp.scoped_check('b1_premature_successor_deny','aaaa0000-0000-0000-0000-000000000005','22220000-0000-0000-0000-000000000013','apply_decision',false);
-- (c) B1: correct assignee, completed predecessors, exact action -> ALLOW.
update public.student_request_workflow_steps set status='completed' where id='22220000-0000-0000-0000-000000000012';
select pg_temp.scoped_check('b1_registrar_apply_allow','aaaa0000-0000-0000-0000-000000000005','22220000-0000-0000-0000-000000000013','apply_decision',true);
-- (c) B1: admin-without-assignment (binding on another role only) denied.
select pg_temp.scoped_check('b1_admin_without_assignment_deny','aaaa0000-0000-0000-0000-000000000006','22220000-0000-0000-0000-000000000013','apply_decision',false);
-- (c) B1: correct assignee with wrong action denied.
select pg_temp.scoped_check('b1_wrong_action_deny','aaaa0000-0000-0000-0000-000000000005','22220000-0000-0000-0000-000000000013','approve',false);
-- (d) B1: owner denied even when directly assigned.
select pg_temp.scoped_check('b1_owner_deny','aaaa0000-0000-0000-0000-000000000007','22220000-0000-0000-0000-000000000023','apply_decision',false);

do $$begin
  if exists(select 1 from scoped_results where not ok) then
    raise exception 'SCOPED_GUARD_FAILURE %',(select jsonb_agg(scoped_results) from scoped_results where not ok);
  end if;
end$$;

select 'scoped_summary: ' || jsonb_build_object(
  'total', count(*),
  'failed', count(*) filter (where not ok),
  'passed', count(*) filter (where ok))::text as scoped_summary
from scoped_results;
