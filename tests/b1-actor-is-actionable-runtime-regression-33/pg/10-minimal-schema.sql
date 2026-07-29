-- ============================================================================
-- PORTAL-B1-ACTOR-IS-ACTIONABLE-VERIFIER-AND-RUNTIME-REGRESSION-REMEDIATION-33
-- G4 executable regression — MINIMAL LOCAL SCHEMA (LOCAL / DISPOSABLE ONLY)
--
-- NEVER run against production. This file is applied to a throw-away local
-- PostgreSQL cluster created by run-harness.sh. It reproduces only the objects
-- that Package 30 (B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql) touches or
-- reads, so that the *real, unmodified draft file* can be applied verbatim on
-- top of it and then exercised.
--
-- The authorization gate functions below (can_current_user_act_on_step,
-- user_matches_workflow_runtime_step, current_user_has_exact_processing_binding,
-- workflow_runtime_predecessors_satisfied, is_valid_b1_runtime_step_contract,
-- workflow_action_result_matches, is_valid_actor_request_action,
-- is_b1_stored_request_type, is_owner_of_request) are copied from the applied
-- production catalog so the regression proves behaviour, not a rewrite.
-- ============================================================================

create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

-- Harness-local session identity: the current principal is chosen with
--   select set_config('harness.uid', '<uuid>', true);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('harness.uid', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Tables (only the columns Package 30 reads)
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name_ar text
);

create table public.request_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_ar text,
  is_active boolean not null default true,
  student_visible boolean not null default false
);

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  full_name_ar text,
  academic_number text,
  department_id uuid references public.departments(id),
  status text default 'active'
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  full_name_ar text
);

create table public.faculty_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid
);

create table public.position_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  is_active boolean not null default true,
  assigned_to date
);

create table public.request_processing_units (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_ar text
);

create table public.request_processing_roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_ar text
);

create table public.request_processing_assignments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.request_processing_units(id),
  role_id uuid not null references public.request_processing_roles(id),
  assignment_type text not null,
  user_id uuid,
  staff_profile_id uuid references public.staff_profiles(id),
  faculty_profile_id uuid references public.faculty_profiles(id),
  position_assignment_id uuid references public.position_assignments(id),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz
);

create table public.request_type_workflows (
  id uuid primary key default gen_random_uuid(),
  request_type_code text,
  is_active boolean not null default true
);

create table public.request_type_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.request_type_workflows(id),
  step_key text not null,
  step_order integer not null,
  processing_unit_id uuid references public.request_processing_units(id),
  processing_role_id uuid references public.request_processing_roles(id),
  action_type text,
  can_skip boolean not null default false,
  can_reject boolean not null default true,
  can_return_to_student boolean not null default true,
  is_required boolean not null default true
);

create table public.request_type_workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.request_type_workflows(id),
  from_step_id uuid references public.request_type_workflow_steps(id),
  to_step_id uuid references public.request_type_workflow_steps(id),
  action_result text not null
);

create table public.student_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text,
  request_type text not null,
  title text,
  status text not null default 'submitted',
  form_data jsonb default '{}'::jsonb,
  student_notes text,
  student_profile_id uuid references public.student_profiles(id),
  submitted_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_step_index integer default 1,
  current_role_key text
);

create table public.student_request_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id),
  workflow_id uuid references public.request_type_workflows(id),
  workflow_step_id uuid references public.request_type_workflow_steps(id),
  step_key text not null,
  step_name_ar text,
  step_order integer not null,
  status text not null default 'pending',
  decision text,
  comment text,
  processing_unit_id uuid references public.request_processing_units(id),
  processing_role_id uuid references public.request_processing_roles(id),
  assigned_user_id uuid,
  assigned_staff_profile_id uuid references public.staff_profiles(id),
  assigned_faculty_profile_id uuid references public.faculty_profiles(id),
  assigned_position_assignment_id uuid references public.position_assignments(id),
  entered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.student_request_workflow_events (
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id),
  event_type text,
  message_ar text,
  payload jsonb,
  visible_to_student boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.student_request_fee_assessments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.student_requests(id),
  amount numeric,
  currency text,
  payment_status text not null default 'pending',
  payment_reference text,
  assessed_at timestamptz,
  payment_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Support predicates (verbatim from the applied production catalog)
-- ---------------------------------------------------------------------------
create or replace function public.is_b1_stored_request_type(p_request_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  SELECT p_request_type IN ('enrollment_suspension','excused_absence','absence_excuse',
    'department_transfer','transfer','final_chance','extra_chance','file_withdrawal')
$function$;

create or replace function public.is_valid_actor_request_action(p_action text)
returns boolean language sql immutable set search_path to 'public', 'pg_temp' as $function$
  select p_action in (
    'approve','reject','return','comment','request_attachment',
    'request_payment','sign','archive','issue_document','complete','skip',
    'review','clear','apply_decision','confirm_payment'
  );
$function$;

create or replace function public.workflow_action_result_matches(p_action_type text, p_result text)
returns boolean language sql immutable set search_path to 'public' as $function$
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

create or replace function public.is_valid_b1_runtime_step_contract(p_request_type text, p_step_key text, p_unit_code text, p_role_code text, p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  SELECT (p_request_type, p_step_key, p_unit_code, p_role_code, p_action_type) IN (
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
    ('final_chance','registrar_apply','registrar','registrar_general','apply_decision')
  );
$function$;

create or replace function public.is_owner_of_request(_user_id uuid, _request_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = _request_id AND sp.user_id = _user_id
  )
$function$;

create or replace function public.current_user_has_exact_processing_binding(p_unit_id uuid, p_role_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = p_unit_id AND rpa.role_id = p_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id = auth.uid())
        OR (rpa.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = rpa.staff_profile_id AND sp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'faculty_profile' AND EXISTS (
          SELECT 1 FROM public.faculty_profiles fp
          WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa
          WHERE pa.id = rpa.position_assignment_id AND pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
$function$;

create or replace function public.user_matches_workflow_runtime_step(p_step_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_has_direct_assignee boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN RETURN false; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id = p_step_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_step.assigned_user_id IS NOT NULL THEN
    RETURN v_step.assigned_user_id = v_uid;
  END IF;

  IF v_step.assigned_staff_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (SELECT 1 FROM public.staff_profiles sp
               WHERE sp.id = v_step.assigned_staff_profile_id AND sp.user_id = v_uid) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_faculty_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (SELECT 1 FROM public.faculty_profiles fp
               WHERE fp.id = v_step.assigned_faculty_profile_id AND fp.user_id = v_uid) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (SELECT 1 FROM public.position_assignments pa
               WHERE pa.id = v_step.assigned_position_assignment_id AND pa.user_id = v_uid
                 AND pa.is_active = true
                 AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_has_direct_assignee THEN RETURN false; END IF;

  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at   IS NULL OR rpa.ends_at   >  now())
      AND rpa.unit_id = v_step.processing_unit_id
      AND rpa.role_id = v_step.processing_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id IS NOT NULL AND rpa.user_id = v_uid)
        OR (rpa.assignment_type = 'staff_profile' AND rpa.staff_profile_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.staff_profiles sp WHERE sp.id = rpa.staff_profile_id AND sp.user_id = v_uid))
        OR (rpa.assignment_type = 'faculty_profile' AND rpa.faculty_profile_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.faculty_profiles fp WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = v_uid))
        OR (rpa.assignment_type = 'position_assignment' AND rpa.position_assignment_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.position_assignments pa
              WHERE pa.id = rpa.position_assignment_id AND pa.user_id = v_uid
                AND pa.is_active = true
                AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
END;
$function$;

create or replace function public.workflow_runtime_predecessors_satisfied(p_step_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
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

-- department_transfer-only scope predicate; the excused_absence fixture never
-- reaches it. Declared so can_current_user_act_on_step compiles.
create or replace function public.current_user_matches_transfer_department_scope(p_step_id uuid, p_step_key text)
returns boolean language sql stable set search_path to 'public' as $function$ select false $function$;

create or replace function public.can_current_user_act_on_step(p_step_id uuid, p_action text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
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

  v_is_b1 := public.is_b1_stored_request_type(v_request_type);
  v_canonical_request_type := case v_request_type
    when 'absence_excuse' then 'excused_absence'
    when 'transfer' then 'department_transfer'
    when 'extra_chance' then 'final_chance'
    else v_request_type
  end;

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

  if not public.user_matches_workflow_runtime_step(p_step_id) then return false; end if;

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
    select * into v_config from public.request_type_workflow_steps
      where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
    if not found
      or v_config.step_key is distinct from v_step.step_key
      or v_config.step_order is distinct from v_step.step_order
      or v_config.processing_unit_id is distinct from v_step.processing_unit_id
      or v_config.processing_role_id is distinct from v_step.processing_role_id then
      return false;
    end if;

    if not public.workflow_runtime_predecessors_satisfied(p_step_id) then return false; end if;

    select u.code, pr.code into v_unit_code, v_role_code
    from public.request_processing_units u
    join public.request_processing_roles pr on pr.id=v_step.processing_role_id
    where u.id=v_step.processing_unit_id;
    if not public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type,v_step.step_key,v_unit_code,v_role_code,v_config.action_type
    ) then return false; end if;

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

  if p_action='skip' then
    if v_config.id is null or not coalesce(v_config.can_skip,false) then return false; end if;
    return true;
  end if;
  if p_action='reject' and v_config.id is not null and not coalesce(v_config.can_reject,true) then return false; end if;
  if p_action='return' and v_config.id is not null and not coalesce(v_config.can_return_to_student,true) then return false; end if;
  return true;
end;
$function$;

-- Harness-scoped read gate: every authenticated principal may READ the fixture
-- request, so CASE C (wrong actor) can still call the actor-facing detail RPC
-- and observe is_actionable = false instead of an access exception.
create or replace function public.can_current_user_access_request(p_request_id uuid)
returns boolean language sql stable set search_path to 'public' as $function$
  select auth.uid() is not null
$function$;

-- No admin actor exists in the harness; the fee-context display clause is
-- preserved by Package 30 and must never be the reason a case passes.
create or replace function public.is_current_user_admin_actor()
returns boolean language sql stable set search_path to 'public' as $function$ select false $function$;
