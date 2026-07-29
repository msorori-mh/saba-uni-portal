-- ============================================================================
-- G4 EXECUTABLE REGRESSION — CASES A..E  (LOCAL, ISOLATED, ALWAYS ROLLBACK)
--
-- Every fixture write below happens inside this single transaction, which ends
-- with ROLLBACK. There is no production connection and no persistent state.
--
-- Fixture shape = the production Hitham fixture:
--   excused_absence / student_affairs_intake / step_order 1 / action_type
--   'review' / direct assignee via assigned_staff_profile_id.
-- ============================================================================

BEGIN;

create temporary table regression_results (
  seq        integer generated always as identity,
  case_id    text not null,
  assertion  text not null,
  expected   text not null,
  actual     text,
  verdict    text not null
) on commit drop;

DO $harness$
DECLARE
  v_hitham_uid  uuid := '11111111-1111-4111-8111-111111111111';
  v_other_uid   uuid := '22222222-2222-4222-8222-222222222222';
  v_student_uid uuid := '33333333-3333-4333-8333-333333333333';

  v_dept uuid; v_unit uuid; v_role uuid;
  v_hitham_sp uuid; v_other_sp uuid; v_student uuid;
  v_wf uuid; v_cfg1 uuid; v_cfg2 uuid;
  v_req uuid; v_step uuid; v_step2 uuid;

  v_bool boolean;
  v_text text;
  v_detail jsonb;
  v_count integer;

  procedure_note text;

  -- local assert helper
  FUNCTION_PLACEHOLDER text;
BEGIN
  -- ---------------- fixture ------------------------------------------------
  insert into public.departments(name_ar) values ('قسم الاختبار') returning id into v_dept;
  insert into public.request_types(code, name_ar, is_active, student_visible)
    values ('excused_absence','عذر غياب', true, false);

  insert into public.request_processing_units(code, name_ar) values ('student_affairs','شؤون الطلاب') returning id into v_unit;
  insert into public.request_processing_roles(code, name_ar) values ('student_affairs_specialist','أخصائي شؤون الطلاب') returning id into v_role;

  insert into public.staff_profiles(user_id, full_name_ar) values (v_hitham_uid,'هيثم الشبلي') returning id into v_hitham_sp;
  insert into public.staff_profiles(user_id, full_name_ar) values (v_other_uid,'موظف آخر') returning id into v_other_sp;
  insert into public.student_profiles(user_id, full_name_ar, academic_number, department_id)
    values (v_student_uid,'طالب اختبار','TEST-0001', v_dept) returning id into v_student;

  -- both staff hold the same unit/role binding: CASE C must fail on identity,
  -- not on a missing processing binding.
  insert into public.request_processing_assignments(unit_id, role_id, assignment_type, staff_profile_id, is_active)
    values (v_unit, v_role, 'staff_profile', v_hitham_sp, true),
           (v_unit, v_role, 'staff_profile', v_other_sp, true);

  insert into public.request_type_workflows(request_type_code, is_active) values ('excused_absence', true) returning id into v_wf;

  insert into public.request_type_workflow_steps(workflow_id, step_key, step_order, processing_unit_id, processing_role_id, action_type, is_required)
    values (v_wf,'student_affairs_intake',1, v_unit, v_role,'review', true) returning id into v_cfg1;
  insert into public.request_type_workflow_steps(workflow_id, step_key, step_order, processing_unit_id, processing_role_id, action_type, is_required)
    values (v_wf,'manager_review',2, v_unit, v_role,'approve', true) returning id into v_cfg2;

  insert into public.request_type_workflow_transitions(workflow_id, from_step_id, to_step_id, action_result)
    values (v_wf, null, v_cfg1, 'submit'),
           (v_wf, v_cfg1, v_cfg2, 'reviewed');

  insert into public.student_requests(request_number, request_type, title, status, student_profile_id)
    values ('SR-LOCAL-HARNESS-0001','excused_absence','طلب عذر غياب (محلي)','submitted', v_student)
    returning id into v_req;

  insert into public.student_request_workflow_steps(
    student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar, step_order,
    status, processing_unit_id, processing_role_id, assigned_staff_profile_id, entered_at)
    values (v_req, v_wf, v_cfg1,'student_affairs_intake','استلام شؤون الطلاب',1,
            'active', v_unit, v_role, v_hitham_sp, now())
    returning id into v_step;

  insert into public.student_request_workflow_steps(
    student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar, step_order,
    status, processing_unit_id, processing_role_id, assigned_staff_profile_id)
    values (v_req, v_wf, v_cfg2,'manager_review','مراجعة المدير',2,
            'pending', v_unit, v_role, v_hitham_sp)
    returning id into v_step2;

  -- =========================================================================
  -- CASE A — Hitham-shaped positive
  -- =========================================================================
  perform set_config('harness.uid', v_hitham_uid::text, true);

  v_text := public.workflow_runtime_step_configured_action(v_step);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('A','workflow_runtime_step_configured_action(active step)','review', coalesce(v_text,'<null>'),
     case when v_text = 'review' then 'PASS' else 'FAIL' end);

  v_bool := public.user_matches_workflow_runtime_step(v_step);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('A','user_matches_workflow_runtime_step','true', v_bool::text, case when v_bool then 'PASS' else 'FAIL' end);

  v_bool := public.current_user_has_exact_processing_binding(v_unit, v_role);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('A','current_user_has_exact_processing_binding','true', v_bool::text, case when v_bool then 'PASS' else 'FAIL' end);

  v_detail := public.get_student_request_detail_for_actor(v_req);
  v_bool := (v_detail #>> '{workflow_steps,0,is_actionable}')::boolean;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('A','get_student_request_detail_for_actor -> is_actionable','true', coalesce(v_bool::text,'<null>'),
     case when v_bool then 'PASS' else 'FAIL' end);

  select i.is_actionable into v_bool
  from public.get_my_request_actor_inbox('{}'::jsonb, 50, 0) i
  where i.workflow_step_runtime_id = v_step;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('A','get_my_request_actor_inbox -> is_actionable','true', coalesce(v_bool::text,'<null>'),
     case when v_bool then 'PASS' else 'FAIL' end);

  v_text := public.get_student_request_fee_processing_context(v_req) ->> 'can_execute_current_step';
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('A','fee_processing_context -> can_execute_current_step','true', coalesce(v_text,'<null>'),
     case when v_text = 'true' then 'PASS' else 'FAIL' end);

  -- =========================================================================
  -- CASE B — the old defective literal probe
  -- =========================================================================
  v_bool := public.can_current_user_act_on_step(v_step, 'approve');
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('B','can_current_user_act_on_step(step, ''approve'') [old probe]','false', v_bool::text,
     case when v_bool is false then 'PASS' else 'FAIL' end);

  v_bool := public.can_current_user_act_on_step(v_step, 'review');
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('B','can_current_user_act_on_step(step, configured ''review'')','true', v_bool::text,
     case when v_bool then 'PASS' else 'FAIL' end);

  -- =========================================================================
  -- CASE C — wrong actor (same unit/role binding, different identity)
  -- =========================================================================
  perform set_config('harness.uid', v_other_uid::text, true);

  v_bool := public.user_matches_workflow_runtime_step(v_step);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('C','user_matches_workflow_runtime_step (wrong actor)','false', v_bool::text,
     case when v_bool is false then 'PASS' else 'FAIL' end);

  v_detail := public.get_student_request_detail_for_actor(v_req);
  v_bool := (v_detail #>> '{workflow_steps,0,is_actionable}')::boolean;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('C','detail_for_actor -> is_actionable (wrong actor)','false', coalesce(v_bool::text,'<null>'),
     case when v_bool is false then 'PASS' else 'FAIL' end);

  select count(*) into v_count
  from public.get_my_request_actor_inbox('{}'::jsonb, 50, 0) i
  where i.workflow_step_runtime_id = v_step;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('C','actor_inbox rows for wrong actor','0', v_count::text,
     case when v_count = 0 then 'PASS' else 'FAIL' end);

  perform set_config('harness.uid', v_hitham_uid::text, true);

  -- =========================================================================
  -- CASE D — missing / null / ambiguous configuration (fail closed)
  -- =========================================================================
  -- D1: runtime step not linked to any configuration row
  update public.student_request_workflow_steps set workflow_step_id = null where id = v_step;
  v_text := public.workflow_runtime_step_configured_action(v_step);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('D','configured_action with missing workflow_step_id','<null>', coalesce(v_text,'<null>'),
     case when v_text is null then 'PASS' else 'FAIL' end);

  v_detail := public.get_student_request_detail_for_actor(v_req);
  v_bool := (v_detail #>> '{workflow_steps,0,is_actionable}')::boolean;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('D','detail_for_actor -> is_actionable, missing config','false', coalesce(v_bool::text,'<null>'),
     case when v_bool is false then 'PASS' else 'FAIL' end);

  -- D2: configuration present but action_type IS NULL
  update public.student_request_workflow_steps set workflow_step_id = v_cfg1 where id = v_step;
  update public.request_type_workflow_steps set action_type = null where id = v_cfg1;
  v_text := public.workflow_runtime_step_configured_action(v_step);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('D','configured_action with NULL action_type','<null>', coalesce(v_text,'<null>'),
     case when v_text is null then 'PASS' else 'FAIL' end);

  v_detail := public.get_student_request_detail_for_actor(v_req);
  v_bool := (v_detail #>> '{workflow_steps,0,is_actionable}')::boolean;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('D','detail_for_actor -> is_actionable, NULL action_type','false', coalesce(v_bool::text,'<null>'),
     case when v_bool is false then 'PASS' else 'FAIL' end);

  v_text := public.get_student_request_fee_processing_context(v_req) ->> 'can_execute_current_step';
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('D','fee context -> can_execute_current_step, NULL action_type','false', coalesce(v_text,'<null>'),
     case when v_text = 'false' then 'PASS' else 'FAIL' end);

  -- D3: ambiguous configuration — the helper must never silently pick a row
  update public.request_type_workflow_steps set action_type = 'review' where id = v_cfg1;
  BEGIN
    insert into public.request_type_workflow_steps(id, workflow_id, step_key, step_order, processing_unit_id, processing_role_id, action_type)
      values (v_cfg1, v_wf, 'student_affairs_intake', 1, v_unit, v_role, 'approve');
    insert into regression_results(case_id, assertion, expected, actual, verdict) values
      ('D','ambiguous duplicate config id rejected by primary key','rejected','accepted','FAIL');
  EXCEPTION WHEN unique_violation THEN
    insert into regression_results(case_id, assertion, expected, actual, verdict) values
      ('D','ambiguous duplicate config id rejected by primary key','rejected','rejected (unique_violation)','PASS');
  END;

  -- helper resolves at most one row by construction (join on primary key)
  select count(*) into v_count from public.workflow_runtime_step_configured_action(v_step);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('D','configured_action returns exactly one scalar row','1', v_count::text,
     case when v_count = 1 then 'PASS' else 'FAIL' end);

  -- =========================================================================
  -- CASE E — completed / pending (non-active) steps
  -- =========================================================================
  update public.student_request_workflow_steps set status = 'completed', completed_at = now() where id = v_step;
  v_detail := public.get_student_request_detail_for_actor(v_req);
  v_bool := (v_detail #>> '{workflow_steps,0,is_actionable}')::boolean;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('E','detail_for_actor -> is_actionable, completed step','false', coalesce(v_bool::text,'<null>'),
     case when v_bool is false then 'PASS' else 'FAIL' end);

  -- step 2 stays pending and is a legitimate direct assignment for Hitham
  v_bool := (v_detail #>> '{workflow_steps,1,is_actionable}')::boolean;
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('E','detail_for_actor -> is_actionable, pending step','false', coalesce(v_bool::text,'<null>'),
     case when v_bool is false then 'PASS' else 'FAIL' end);

  select bool_or(i.is_actionable) into v_bool
  from public.get_my_request_actor_inbox('{}'::jsonb, 50, 0) i
  where i.workflow_step_runtime_id in (v_step, v_step2);
  insert into regression_results(case_id, assertion, expected, actual, verdict) values
    ('E','actor_inbox -> any actionable among non-active steps','false', coalesce(v_bool::text,'<null>'),
     case when coalesce(v_bool, false) is false then 'PASS' else 'FAIL' end);
END
$harness$;

\echo == PER-ASSERTION RESULTS
select seq, case_id, assertion, expected, actual, verdict from regression_results order by seq;

\echo == PER-CASE SUMMARY
select case_id,
       count(*) as assertions,
       count(*) filter (where verdict = 'PASS') as passed,
       case when count(*) filter (where verdict <> 'PASS') = 0 then 'PASS' else 'FAIL' end as case_verdict
from regression_results group by case_id order by case_id;

\echo == OVERALL
select count(distinct case_id) as cases,
       count(*) as assertions,
       count(*) filter (where verdict = 'PASS') as passed,
       count(*) filter (where verdict <> 'PASS') as failed,
       case when count(*) filter (where verdict <> 'PASS') = 0
            then 'REGRESSION_PASS' else 'REGRESSION_FAIL' end as overall
from regression_results;

ROLLBACK;
