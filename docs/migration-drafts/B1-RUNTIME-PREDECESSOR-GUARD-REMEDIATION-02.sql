-- B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02
-- FORWARD-ONLY / SOURCE-ONLY DRAFT. NEVER APPLIED BY THIS PR.
--
-- Supersedes B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01 for chain slot M3.
-- -01 is a PRODUCTION BLOCKER: it replaced can_current_user_act_on_step with a
-- uniform strict definition for ALL request types, which breaks the LIVE
-- enrollment_certificate service:
--   * the UI executes review steps with p_action='approve' while the config
--     action_type is 'review'; -01 requires p_action = config.action_type,
--     which is an instant denial for the live flow;
--   * -01's workflow_runtime_predecessors_satisfied guard rejects the
--     enrollment_certificate transition vocabulary ('approve',
--     'payment_required', 'fee_not_required') because
--     workflow_action_result_matches has no 'assess_fee' case.
--
-- Owner intent (documented in the body comment of
-- B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01):
--   "Preserve the pre-existing contract for every non-B1 request type,
--    including enrollment_certificate."
--
-- Therefore this draft scopes ALL strict requirements (runtime/config
-- correspondence, predecessor guard, transition-based action gate) to the
-- B1 branch ONLY, and preserves the currently applied lenient path for
-- every non-B1 request type exactly as applied in
-- supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql.
--
-- is_valid_actor_request_action is intentionally UNTOUCHED here: vocabulary
-- expansion remains the job of the later hardening draft. Until then, B1
-- services are inactive and strict denial for un-whitelisted B1 actions is
-- correct fail-closed behavior.

begin;

-- New function. Copied VERBATIM from -01; no production conflict.
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

-- New function. Copied VERBATIM from -01; no production conflict.
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

-- Starts from the CURRENTLY APPLIED definition (see header). ONLY the B1
-- branch (v_is_b1 = true) is modified; the non-B1 lenient path below is the
-- applied contract preserved exactly (status active/pending,
-- comment-on-completed, reject/return flag checks, final RETURN true).
create or replace function public.can_current_user_act_on_step(p_step_id uuid, p_action text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_request_type text;
  v_canonical_request_type text;
  v_is_b1 boolean := false;
  v_unit_code text;
  v_role_code text;
  v_transition_count integer;
begin
  if v_uid is null or p_step_id is null then
    return false;
  end if;

  if not public.is_valid_actor_request_action(p_action) then
    return false;
  end if;

  select s.* into v_step
  from public.student_request_workflow_steps s
  where s.id = p_step_id;

  if not found then
    return false;
  end if;

  select r.request_type into v_request_type
  from public.student_requests r
  where r.id = v_step.student_request_id;
  v_is_b1 := v_request_type in (
    'enrollment_suspension',
    'excused_absence', 'absence_excuse',
    'department_transfer', 'transfer',
    'final_chance', 'extra_chance',
    'file_withdrawal'
  );
  v_canonical_request_type := case v_request_type
    when 'absence_excuse' then 'excused_absence'
    when 'transfer' then 'department_transfer'
    when 'extra_chance' then 'final_chance'
    else v_request_type
  end;

  -- Every B1 staff step is active-only and directly assigned. A role-pool
  -- assignment, including admin/registrar/dean, can never substitute for the
  -- exact runtime assignee on these services.
  if v_is_b1 and (
    v_step.status is distinct from 'active'
    or num_nonnulls(
      v_step.assigned_user_id,
      v_step.assigned_staff_profile_id,
      v_step.assigned_faculty_profile_id,
      v_step.assigned_position_assignment_id
    ) is distinct from 1
  ) then
    return false;
  end if;

  if public.is_owner_of_request(v_uid, v_step.student_request_id) then
    return false;
  end if;

  if v_step.status not in ('active', 'pending') then
    if p_action = 'comment' and v_step.status = 'completed' then
      return public.user_matches_workflow_runtime_step(p_step_id);
    end if;
    return false;
  end if;

  -- Strict assignee match ALWAYS required (no admin/registrar/dean bypass).
  if not public.user_matches_workflow_runtime_step(p_step_id) then
    return false;
  end if;

  if v_is_b1 and not public.current_user_has_exact_processing_binding(
    v_step.processing_unit_id, v_step.processing_role_id
  ) then
    return false;
  end if;

  if v_canonical_request_type = 'department_transfer'
     and v_step.step_key in ('source_department_head_approval','target_department_head_approval')
     and not public.current_user_matches_transfer_department_scope(p_step_id, v_step.step_key) then
    return false;
  end if;

  select c.* into v_config
  from public.request_type_workflow_steps c
  where c.id = v_step.workflow_step_id;

  if v_is_b1 then
    -- B1-ONLY strict runtime/config correspondence: the applied config lookup
    -- above lacks workflow_id and never checks step_order; re-align it here
    -- for B1 steps only. The non-B1 path below keeps the applied lookup.
    select c.* into v_config
    from public.request_type_workflow_steps c
    where c.id = v_step.workflow_step_id
      and c.workflow_id = v_step.workflow_id;
    if not found
      or v_config.step_key is distinct from v_step.step_key
      or v_config.step_order is distinct from v_step.step_order
      or v_config.processing_unit_id is distinct from v_step.processing_unit_id
      or v_config.processing_role_id is distinct from v_step.processing_role_id then
      return false;
    end if;

    -- B1-ONLY predecessor guard: a successor step may never execute while any
    -- required predecessor runtime is missing, pending, or unreachable.
    if not public.workflow_runtime_predecessors_satisfied(p_step_id) then
      return false;
    end if;

    select u.code, pr.code into v_unit_code, v_role_code
    from public.request_processing_units u
    join public.request_processing_roles pr on pr.id = v_step.processing_role_id
    where u.id = v_step.processing_unit_id;
    if not public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type, v_step.step_key, v_unit_code,
      v_role_code, v_config.action_type
    ) then
      return false;
    end if;

    -- B1-ONLY action gate (replaces the applied B1 action check, which it
    -- subsumes and strengthens): the executed action must equal the configured
    -- action_type with exactly one outgoing transition whose action_result
    -- matches workflow_action_result_matches, or be 'skip' on a skippable
    -- step with exactly one skip transition.
    if p_action = v_config.action_type then
      select count(*) into v_transition_count
      from public.request_type_workflow_transitions t
      where t.workflow_id = v_step.workflow_id
        and t.from_step_id = v_step.workflow_step_id
        and public.workflow_action_result_matches(v_config.action_type, t.action_result);
      return v_transition_count = 1;
    elsif p_action = 'skip' then
      select count(*) into v_transition_count
      from public.request_type_workflow_transitions t
      where t.workflow_id = v_step.workflow_id
        and t.from_step_id = v_step.workflow_step_id
        and t.action_result = 'skip';
      return coalesce(v_config.can_skip, false) and v_transition_count = 1;
    end if;
    return false;
  end if;

  -- Non-B1 path: applied lenient contract preserved EXACTLY.
  if p_action = 'skip' then
    if v_config.id is null or not coalesce(v_config.can_skip, false) then
      return false;
    end if;
    return true;
  end if;

  if p_action = 'reject' and v_config.id is not null and not coalesce(v_config.can_reject, true) then
    return false;
  end if;

  if p_action = 'return' and v_config.id is not null and not coalesce(v_config.can_return_to_student, true) then
    return false;
  end if;

  return true;
end;
$function$;

revoke all on function public.can_current_user_act_on_step(uuid,text) from public,anon;
grant execute on function public.can_current_user_act_on_step(uuid,text) to authenticated;
revoke all on function public.workflow_action_result_matches(text,text) from public,anon;
grant execute on function public.workflow_action_result_matches(text,text) to authenticated,service_role;

do $postcheck$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p
  where p.oid='public.can_current_user_act_on_step(uuid,text)'::regprocedure;
  if position('workflow_runtime_predecessors_satisfied' in coalesce(v_src,''))=0
     or position('v_is_b1' in coalesce(v_src,''))=0
     or position('pending' in coalesce(v_src,''))=0 then
    raise exception 'B1_RUNTIME_PREDECESSOR_GUARD_REMEDIATION_02_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;

commit;
