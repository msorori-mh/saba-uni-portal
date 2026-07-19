-- B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01
-- FORWARD-ONLY / SOURCE-ONLY DRAFT. NEVER APPLIED BY THIS PR.

begin;

create or replace function public.workflow_action_result_matches(p_action_type text,p_result text)
returns boolean language sql immutable set search_path=public as $function$
  select case p_action_type
    when 'review' then p_result='reviewed'
    when 'approve' then p_result='approved'
    when 'apply_decision' then p_result='applied'
    when 'clear' then p_result='cleared'
    when 'archive' then p_result='archived'
    when 'confirm_payment' then p_result='payment_confirmed'
    when 'sign' then p_result='signed'
    when 'issue_document' then p_result='issued'
    else false end
$function$;

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
  if v_config.step_order<>1 and exists(select 1 from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is null) then return false; end if;
  if exists(select 1 from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
    group by t.from_step_id,t.to_step_id having count(*)<>1) then return false; end if;
  if exists(
    select 1 from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps source_config on source_config.id=t.from_step_id
    left join public.request_type_workflow_steps target_config on target_config.id=t.to_step_id
    where t.workflow_id=v_step.workflow_id and
      ((t.from_step_id is not null and source_config.workflow_id is distinct from t.workflow_id) or
       (t.to_step_id is not null and target_config.workflow_id is distinct from t.workflow_id))
  ) then return false; end if;

  -- Every incoming edge is unique and its exact predecessor runtime is terminal-valid.
  for v_pred in
    select t.from_step_id,t.action_result,pc.can_skip,pc.action_type from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps pc on pc.id=t.from_step_id and pc.workflow_id=t.workflow_id
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is not null
  loop
    if v_pred.can_skip is null then return false; end if;
    if not public.workflow_action_result_matches(v_pred.action_type,v_pred.action_result)
      and not (v_pred.action_result='skip' and v_pred.can_skip) then return false; end if;
    if (select count(*) from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id)<>1 then return false; end if;
    if not exists(select 1 from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id
          and (pr.status='completed' or (pr.status='skipped' and v_pred.can_skip))) then return false; end if;
  end loop;

  -- Every earlier required config must have one terminal-valid runtime and a
  -- legal directed path to this step. A mere runtime row is never sufficient.
  if exists (
    select 1 from public.request_type_workflow_steps pc
    where pc.workflow_id=v_step.workflow_id and pc.step_order<v_config.step_order and pc.is_required
      and ((select count(*) from public.student_request_workflow_steps pr
            where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
              and pr.workflow_step_id=pc.id)<>1
        or not exists(select 1 from public.student_request_workflow_steps pr
            where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
              and pr.workflow_step_id=pc.id
              and (pr.status='completed' or (pr.status='skipped' and pc.can_skip)))
        or not exists(
          with recursive reachable(step_id) as (
            select pc.id
            union
            select t.to_step_id from reachable r
            join public.request_type_workflow_transitions t
              on t.workflow_id=v_step.workflow_id and t.from_step_id=r.step_id
            join public.request_type_workflow_steps source_config
              on source_config.id=t.from_step_id and source_config.workflow_id=t.workflow_id
                and source_config.workflow_id=v_step.workflow_id
            join public.request_type_workflow_steps target_config
              on target_config.id=t.to_step_id and target_config.workflow_id=t.workflow_id
                and target_config.workflow_id=v_step.workflow_id
            where t.to_step_id is not null and
              (public.workflow_action_result_matches(source_config.action_type,t.action_result) or
               (t.action_result='skip' and source_config.can_skip))
          ) select 1 from reachable where step_id=v_step.workflow_step_id
        ))
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

revoke all on function public.can_current_user_act_on_step(uuid,text) from public,anon;
grant execute on function public.can_current_user_act_on_step(uuid,text) to authenticated;
revoke all on function public.workflow_action_result_matches(text,text) from public,anon;
grant execute on function public.workflow_action_result_matches(text,text) to authenticated,service_role;

commit;
