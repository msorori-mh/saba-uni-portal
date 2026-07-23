-- B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01
-- FORWARD-ONLY DRAFT. SOURCE ONLY. DO NOT APPLY WITHOUT SEPARATE APPROVAL.
-- Closes F1 (closed actor-action vocabulary) and F2 (stale processing binding).
--
-- R-1 closure (owner decision): can_current_user_act_on_step below mirrors the
-- approved scoped approach of B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02:
-- strict runtime/config correspondence, predecessor guard and action gate run
-- ONLY inside the B1 branch (v_is_b1, covering the legacy aliases
-- absence_excuse/transfer/extra_chance via the shared stored-code predicate),
-- while the non-B1 path preserves the currently applied definition
-- (supabase/migrations/20260723070217_645bb701-b2a3-4da3-bacf-b36dec211b99.sql)
-- byte-equivalent, so enrollment_certificate is never touched.

begin;

do $preflight$
begin
  if to_regprocedure('public.is_valid_actor_request_action(text)') is null
     or to_regprocedure('public.can_current_user_act_on_step(uuid,text)') is null
     or to_regprocedure('public.current_user_has_exact_processing_binding(uuid,uuid)') is null
     or to_regprocedure('public.workflow_runtime_predecessors_satisfied(uuid)') is null
     or to_regprocedure('public.workflow_action_result_matches(text,text)') is null
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
  v_canonical_request_type text;
  v_is_b1 boolean := false;
  v_unit_code text;
  v_role_code text;
  v_transition_count integer;
begin
  if v_uid is null or p_step_id is null then return false; end if;
  if not public.is_valid_actor_request_action(p_action) then return false; end if;

  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found then return false; end if;

  select r.request_type into v_request_type from public.student_requests r
    where r.id=v_step.student_request_id;
  if not found then return false; end if;
  -- B1 scope via the shared stored-code predicate so both the legacy aliases
  -- (absence_excuse, transfer, extra_chance) and the canonical stored codes
  -- (excused_absence, department_transfer, final_chance) are covered. Every
  -- strict check below lives inside the B1 branch only; the non-B1 path keeps
  -- the applied lenient contract for every non-B1 request type, including
  -- enrollment_certificate.
  v_is_b1 := public.is_b1_stored_request_type(v_request_type);
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
  ) then return false; end if;

  if public.is_owner_of_request(v_uid,v_step.student_request_id) then return false; end if;

  if v_step.status not in ('active','pending') then
    if p_action='comment' and v_step.status='completed' then
      return public.user_matches_workflow_runtime_step(p_step_id);
    end if;
    return false;
  end if;

  -- Strict assignee match ALWAYS required (no admin/registrar/dean bypass).
  if not public.user_matches_workflow_runtime_step(p_step_id) then return false; end if;

  -- B1-ONLY: a direct runtime assignee proves identity, not current
  -- authority. F2 stays closed for B1 steps only.
  if v_is_b1 and not public.current_user_has_exact_processing_binding(
    v_step.processing_unit_id,v_step.processing_role_id
  ) then return false; end if;

  if v_canonical_request_type='department_transfer'
     and v_step.step_key in ('source_department_head_approval','target_department_head_approval')
     and not public.current_user_matches_transfer_department_scope(p_step_id,v_step.step_key) then
    return false;
  end if;

  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id;

  if v_is_b1 then
    -- B1-ONLY strict runtime/config correspondence: re-align the config lookup
    -- with workflow_id and step_order for B1 steps only. The non-B1 path below
    -- keeps the applied lookup.
    select * into v_config from public.request_type_workflow_steps
      where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
    if not found
      or v_config.step_key is distinct from v_step.step_key
      or v_config.step_order is distinct from v_step.step_order
      or v_config.processing_unit_id is distinct from v_step.processing_unit_id
      or v_config.processing_role_id is distinct from v_step.processing_role_id then
      return false;
    end if;

    -- B1-ONLY predecessor guard: a successor step may never execute while any
    -- required predecessor runtime is missing, pending, or unreachable.
    if not public.workflow_runtime_predecessors_satisfied(p_step_id) then return false; end if;

    select u.code, pr.code into v_unit_code, v_role_code
    from public.request_processing_units u
    join public.request_processing_roles pr on pr.id=v_step.processing_role_id
    where u.id=v_step.processing_unit_id;
    if not public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type,v_step.step_key,v_unit_code,v_role_code,v_config.action_type
    ) then return false; end if;

    -- B1-ONLY action gate: the executed action must equal the configured
    -- action_type with exactly one outgoing transition whose action_result
    -- matches workflow_action_result_matches, or be 'skip' on a skippable step
    -- with exactly one skip transition.
    if p_action=v_config.action_type then
      select count(*) into v_transition_count from public.request_type_workflow_transitions t
        where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id
          and public.workflow_action_result_matches(v_config.action_type,t.action_result);
      return v_transition_count=1;
    elsif p_action='skip' then
      select count(*) into v_transition_count from public.request_type_workflow_transitions t
        where t.workflow_id=v_step.workflow_id and t.from_step_id=v_step.workflow_step_id
          and t.action_result='skip';
      return coalesce(v_config.can_skip,false) and v_transition_count=1;
    end if;
    return false;
  end if;

  -- Non-B1 path: applied lenient contract preserved EXACTLY (status
  -- active/pending and comment-on-completed above; skip/reject/return flag
  -- checks and the final RETURN true below).
  if p_action='skip' then
    if v_config.id is null or not coalesce(v_config.can_skip,false) then return false; end if;
    return true;
  end if;

  if p_action='reject' and v_config.id is not null and not coalesce(v_config.can_reject,true) then return false; end if;

  if p_action='return' and v_config.id is not null and not coalesce(v_config.can_return_to_student,true) then return false; end if;

  return true;
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
  if position('v_is_b1' in coalesce(v_src,''))=0
     or position('is_b1_stored_request_type(v_request_type)' in coalesce(v_src,''))=0
     or position('workflow_runtime_predecessors_satisfied' in coalesce(v_src,''))=0
     or position('current_user_has_exact_processing_binding' in coalesce(v_src,''))=0
     or position('workflow_action_result_matches' in coalesce(v_src,''))=0
     or position('pending' in coalesce(v_src,''))=0 then
    raise exception 'B1_FIVE_SERVICES_AUTHORIZATION_GUARD_POSTCHECK_FAILED';
  end if;
end;
$postcheck$;

commit;
