-- B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01
-- FORWARD-ONLY DRAFT. SOURCE ONLY. DO NOT APPLY WITHOUT SEPARATE APPROVAL.
-- Closes F1 (closed actor-action vocabulary) and F2 (stale processing binding).

begin;

do $preflight$
begin
  if to_regprocedure('public.is_valid_actor_request_action(text)') is null
     or to_regprocedure('public.can_current_user_act_on_step(uuid,text)') is null
     or to_regprocedure('public.current_user_has_exact_processing_binding(uuid,uuid)') is null
     or to_regprocedure('public.workflow_runtime_predecessors_satisfied(uuid)') is null
     or to_regprocedure('public.is_b1_stored_request_type(text)') is null then
    raise exception 'B1_FIVE_SERVICES_AUTHORIZATION_PREREQUISITE_MISSING';
  end if;
end;
$preflight$;

create or replace function public.is_valid_actor_request_action(p_action text)
returns boolean language sql immutable set search_path=public,pg_temp
as $function$
  select p_action in (
    'approve','reject','return','comment','request_attachment',
    'request_payment','sign','archive','issue_document','complete','skip',
    'review','clear','apply_decision','confirm_payment'
  );
$function$;

create or replace function public.can_current_user_act_on_step(p_step_id uuid,p_action text)
returns boolean language plpgsql stable security definer set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_request_type text;
  v_transition_count integer;
begin
  if v_uid is null or p_step_id is null or not public.is_valid_actor_request_action(p_action) then return false; end if;
  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found or v_step.status<>'active' or public.is_owner_of_request(v_uid,v_step.student_request_id) then return false; end if;
  select r.request_type into v_request_type from public.student_requests r
    where r.id=v_step.student_request_id;
  if not found then return false; end if;
  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
  if not found or v_config.step_key is distinct from v_step.step_key then return false; end if;
  if v_config.processing_unit_id is distinct from v_step.processing_unit_id
    or v_config.processing_role_id is distinct from v_step.processing_role_id then return false; end if;
  if not public.workflow_runtime_predecessors_satisfied(p_step_id) then return false; end if;
  if not public.user_matches_workflow_runtime_step(p_step_id) then return false; end if;

  -- For the five B1 services, a direct runtime assignee proves identity, not
  -- current authority. Scope via the shared stored-code predicate so both the
  -- legacy aliases (absence_excuse, transfer, extra_chance) and the canonical
  -- stored codes (excused_absence, department_transfer, final_chance) are
  -- covered. Preserve the pre-existing contract for every non-B1 request
  -- type, including enrollment_certificate.
  if public.is_b1_stored_request_type(v_request_type)
    and not public.current_user_has_exact_processing_binding(
      v_step.processing_unit_id,v_step.processing_role_id
    ) then return false; end if;

  if v_step.step_key in ('source_department_head_approval','target_department_head_approval') and not exists (
    select 1 from public.faculty_profiles fp join public.transfer_request_details d
      on d.request_id=v_step.student_request_id
    where fp.user_id=v_uid and fp.status='active' and fp.id=v_step.assigned_faculty_profile_id
      and fp.department_id=case when v_step.step_key='source_department_head_approval'
        then d.current_department_id else d.requested_department_id end
  ) then return false; end if;

  if p_action=v_config.action_type then
    select count(*) into v_transition_count from public.request_type_workflow_transitions t
      where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id
        and public.workflow_action_result_matches(v_config.action_type,t.action_result);
    return v_transition_count=1;
  elsif p_action='skip' then
    select count(*) into v_transition_count from public.request_type_workflow_transitions t
      where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id and t.action_result='skip';
    return v_config.can_skip and v_transition_count=1;
  end if;
  return false;
end;
$function$;

revoke all on function public.is_valid_actor_request_action(text) from public,anon;
grant execute on function public.is_valid_actor_request_action(text) to authenticated,service_role;
revoke all on function public.can_current_user_act_on_step(uuid,text) from public,anon;
grant execute on function public.can_current_user_act_on_step(uuid,text) to authenticated;

do $postcheck$
declare
  v_src text;
begin
  if not public.is_valid_actor_request_action('review')
     or not public.is_valid_actor_request_action('clear')
     or not public.is_valid_actor_request_action('apply_decision')
     or not public.is_valid_actor_request_action('confirm_payment')
     or not public.is_valid_actor_request_action('archive') then
    raise exception 'B1_FIVE_SERVICES_ACTION_VOCABULARY_POSTCHECK_FAILED';
  end if;
  select p.prosrc into v_src from pg_proc p
  where p.oid='public.can_current_user_act_on_step(uuid,text)'::regprocedure;
  if position('current_user_has_exact_processing_binding' in coalesce(v_src,''))=0
     or position('is_b1_stored_request_type(v_request_type)' in coalesce(v_src,''))=0
     or position('workflow_runtime_predecessors_satisfied' in coalesce(v_src,''))=0 then
    raise exception 'B1_FIVE_SERVICES_AUTHORIZATION_GUARD_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;

commit;
