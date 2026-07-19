-- B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01
-- FORWARD-ONLY / SOURCE-ONLY DRAFT. NEVER APPLIED BY THIS PR.

begin;

create or replace function public.workflow_runtime_predecessors_satisfied(p_step_id uuid)
returns boolean
language plpgsql stable security definer set search_path=public
as $function$
declare
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_incoming integer;
  v_pred record;
begin
  if p_step_id is null then return false; end if;
  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found or v_step.status<>'active' or v_step.workflow_id is null or v_step.workflow_step_id is null then return false; end if;

  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
  if not found or v_config.step_key is distinct from v_step.step_key
    or v_config.step_order is distinct from v_step.step_order then return false; end if;

  -- Runtime/config correspondence is exactly one for this request and version.
  if (select count(*) from public.student_request_workflow_steps r
      where r.student_request_id=v_step.student_request_id and r.workflow_id=v_step.workflow_id
        and r.workflow_step_id=v_step.workflow_step_id)<>1 then return false; end if;

  select count(*) into v_incoming from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id;
  if v_config.step_order=1 then
    if v_incoming<>1 or not exists(select 1 from public.request_type_workflow_transitions t
      where t.workflow_id=v_step.workflow_id and t.from_step_id is null
        and t.to_step_id=v_step.workflow_step_id and t.action_result='submit') then return false; end if;
  elsif v_incoming=0 then return false;
  end if;

  -- Every incoming edge is unique and its exact predecessor runtime is terminal-valid.
  for v_pred in
    select t.from_step_id,pc.can_skip from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps pc on pc.id=t.from_step_id and pc.workflow_id=t.workflow_id
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is not null
  loop
    if v_pred.can_skip is null then return false; end if;
    if (select count(*) from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id)<>1 then return false; end if;
    if not exists(select 1 from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id
          and (pr.status='completed' or (pr.status='skipped' and v_pred.can_skip))) then return false; end if;
  end loop;

  -- No required earlier config step may be omitted from the transition graph/runtime.
  if exists (
    select 1 from public.request_type_workflow_steps pc
    where pc.workflow_id=v_step.workflow_id and pc.step_order<v_config.step_order and pc.is_required
      and (select count(*) from public.student_request_workflow_steps pr
           where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
             and pr.workflow_step_id=pc.id)<>1
  ) then return false; end if;

  return true;
end;
$function$;

revoke all on function public.workflow_runtime_predecessors_satisfied(uuid) from public,anon;
grant execute on function public.workflow_runtime_predecessors_satisfied(uuid) to authenticated,service_role;

create or replace function public.can_current_user_act_on_step(p_step_id uuid,p_action text)
returns boolean language plpgsql stable security definer set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_transition_count integer;
begin
  if v_uid is null or p_step_id is null or not public.is_valid_actor_request_action(p_action) then return false; end if;
  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found or v_step.status<>'active' or public.is_owner_of_request(v_uid,v_step.student_request_id) then return false; end if;
  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
  if not found or v_config.step_key is distinct from v_step.step_key then return false; end if;
  if v_config.processing_unit_id is distinct from v_step.processing_unit_id
    or v_config.processing_role_id is distinct from v_step.processing_role_id then return false; end if;
  if not public.workflow_runtime_predecessors_satisfied(p_step_id) then return false; end if;
  if not public.user_matches_workflow_runtime_step(p_step_id) then return false; end if;

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
        and t.action_result in ('approve','complete');
    return v_transition_count=1;
  elsif p_action='skip' then
    select count(*) into v_transition_count from public.request_type_workflow_transitions t
      where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id and t.action_result='skip';
    return v_config.can_skip and v_transition_count=1;
  end if;
  return false;
end;
$function$;

revoke all on function public.can_current_user_act_on_step(uuid,text) from public,anon;
grant execute on function public.can_current_user_act_on_step(uuid,text) to authenticated;

commit;
