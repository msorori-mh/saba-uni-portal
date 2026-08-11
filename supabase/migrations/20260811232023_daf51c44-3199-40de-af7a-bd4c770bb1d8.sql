-- GA operational authoring + explicit admin operational fallback (GA-OPS-01)

create or replace function public.ga_operational_actor_mode(p_department_id uuid default null)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  if public.graduate_affairs_is_manager() then return 'MANAGER'; end if;
  if public.has_role(v_uid, 'system_admin'::public.app_role) then return 'SYSTEM_ADMIN_OPERATIONAL_FALLBACK'; end if;
  if public.has_role(v_uid, 'admin'::public.app_role) then return 'ADMIN_OPERATIONAL_FALLBACK'; end if;
  if public.graduate_affairs_is_specialist()
     and p_department_id is not null
     and p_department_id in (select public.graduate_affairs_specialist_department_ids()) then
    return 'SPECIALIST';
  end if;
  return null;
end $$;

create or replace function public.ga_is_admin_fallback()
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select auth.uid() is not null
     and (public.has_role(auth.uid(), 'admin'::public.app_role)
       or public.has_role(auth.uid(), 'system_admin'::public.app_role));
$$;

create or replace function public.ga_lock_operational_actor_mode(p_department_id uuid default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_p uuid;
begin
  if v_uid is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;
  v_p := public.graduate_affairs_lock_caller_authorized_staff_profile('graduate_affairs_manager');
  if v_p is not null then return 'MANAGER'; end if;
  if public.has_role(v_uid, 'system_admin'::public.app_role) then return 'SYSTEM_ADMIN_OPERATIONAL_FALLBACK'; end if;
  if public.has_role(v_uid, 'admin'::public.app_role) then return 'ADMIN_OPERATIONAL_FALLBACK'; end if;
  v_p := public.graduate_affairs_lock_caller_authorized_staff_profile('graduate_affairs_specialist');
  if v_p is not null and p_department_id is not null
     and p_department_id in (
       select spd.department_id from public.staff_profile_departments spd
       where spd.staff_profile_id = v_p) then
    return 'SPECIALIST';
  end if;
  raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
end $$;

create or replace function public.ga_can_read_operational_catalog()
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select auth.uid() is not null
     and (public.graduate_affairs_is_manager()
       or public.graduate_affairs_is_specialist()
       or public.ga_is_admin_fallback());
$$;

-- ---------- patched authorization surfaces (admin fallback) ----------

create or replace function public.graduate_affairs_can_access_record(p_graduate_record_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_department_id uuid;
begin
  if auth.uid() is null then return false; end if;
  select r.department_id into v_department_id from public.graduate_records r where r.id = p_graduate_record_id;
  if not found then return false; end if;
  if public.graduate_is_current_self(p_graduate_record_id) then return true; end if;
  if public.graduate_affairs_is_manager() then return true; end if;
  if public.ga_is_admin_fallback() then return true; end if;
  if public.graduate_affairs_is_specialist()
     and v_department_id in (select public.graduate_affairs_specialist_department_ids()) then
    return true;
  end if;
  return exists (
    select 1 from public.graduate_followups f
    where f.graduate_record_id = p_graduate_record_id
      and f.assignee_user_id = auth.uid()
      and not jsonb_exists(coalesce(f.workflow_snapshot->'terminal_states','[]'::jsonb), f.state)
  ) and (public.graduate_affairs_is_manager() or public.graduate_affairs_is_specialist());
end $$;

create or replace function public.graduate_affairs_resolve_staff_record_access(p_graduate_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_department_id uuid; v_via text := null;
begin
  if auth.uid() is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;
  if p_graduate_record_id is null then raise exception 'GRADUATE_AFFAIRS_INVALID_INPUT'; end if;
  select r.department_id into v_department_id from public.graduate_records r where r.id = p_graduate_record_id;
  if not found then
    return jsonb_build_object('allowed', false, 'via', null, 'reason', 'graduate_record_access_denied');
  end if;
  if public.graduate_affairs_is_manager() then
    v_via := 'manager';
  elsif public.ga_is_admin_fallback() then
    v_via := 'admin_operational_fallback';
  elsif public.graduate_affairs_is_specialist()
        and v_department_id in (select public.graduate_affairs_specialist_department_ids()) then
    v_via := 'specialist';
  elsif exists (
    select 1 from public.graduate_followups f
    where f.graduate_record_id = p_graduate_record_id
      and f.assignee_user_id = auth.uid()
      and not jsonb_exists(coalesce(f.workflow_snapshot->'terminal_states','[]'::jsonb), f.state)
  ) and (public.graduate_affairs_is_manager() or public.graduate_affairs_is_specialist()) then
    v_via := 'direct_assignee';
  end if;
  if v_via is null then
    return jsonb_build_object('allowed', false, 'via', null, 'reason', 'graduate_record_access_denied');
  end if;
  return jsonb_build_object('allowed', true, 'via', v_via, 'reason', null);
end $$;

create or replace function public.graduate_affairs_search_records(
  p_department_id uuid default null, p_program_id uuid default null,
  p_graduation_year integer default null, p_limit integer default 50)
returns table(id uuid, program_id uuid, department_id uuid, graduation_year integer, record_state graduate_decision_state)
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_full boolean; v_is_specialist boolean; v_limit integer; v_mode text;
begin
  if auth.uid() is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;
  v_full := public.graduate_affairs_is_manager() or public.ga_is_admin_fallback();
  v_is_specialist := public.graduate_affairs_is_specialist();
  if not (v_full or v_is_specialist) then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  v_mode := coalesce(public.ga_operational_actor_mode(p_department_id), 'SPECIALIST');
  if (not v_full) and p_department_id is not null
     and p_department_id not in (select public.graduate_affairs_specialist_department_ids()) then
    raise exception 'GRADUATE_AFFAIRS_OUT_OF_SCOPE';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  perform public.graduate_affairs_audit(
    'graduate_records_search', 'graduate_record_search',
    coalesce(p_program_id, p_department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'staff_record_search', jsonb_build_object(
      'department_id', p_department_id, 'program_id', p_program_id,
      'graduation_year', p_graduation_year, 'limit', v_limit, 'actor_mode', v_mode));
  return query
  select r.id, r.program_id, r.department_id,
         extract(year from r.effective_graduation_date)::integer, r.record_state
  from public.graduate_records r
  where (p_program_id is null or r.program_id = p_program_id)
    and (p_graduation_year is null or extract(year from r.effective_graduation_date) = p_graduation_year)
    and (p_department_id is null or r.department_id = p_department_id)
    and (v_full or r.department_id in (select public.graduate_affairs_specialist_department_ids()))
  order by r.created_at desc
  limit v_limit;
end $$;

create or replace function public.graduate_affairs_list_assignable_staff()
returns table(user_id uuid, full_name text, role_code text)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if auth.uid() is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select distinct sp.user_id,
         coalesce(nullif(btrim(sp.full_name), ''), 'موظف شؤون الخريجين') as full_name,
         r.code as role_code
  from public.request_processing_assignments a
  join public.request_processing_units u on u.id = a.unit_id and u.code = 'graduate_affairs' and u.is_active
  join public.request_processing_roles r on r.id = a.role_id and r.is_active
   and r.code in ('graduate_affairs_manager', 'graduate_affairs_specialist')
  join public.staff_profiles sp on sp.status = 'active'
   and ((a.assignment_type = 'staff_profile' and sp.id = a.staff_profile_id)
     or (a.assignment_type = 'user' and sp.user_id = a.user_id))
  where a.is_active
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now())
    and sp.user_id is not null
  order by 2;
end $$;

create or replace function public.graduate_affairs_create_followup(
  p_graduate_record_id uuid, p_assignee_user_id uuid, p_followup_type_id uuid,
  p_next_action_at timestamp with time zone default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_department_id uuid; v_followup_id uuid; v_mode text;
  v_assignee_manager uuid; v_assignee_specialist uuid;
  v_type public.graduate_followup_types%rowtype;
  v_snapshot jsonb; v_workflow_id uuid; v_initial_state text;
  v_max_active int; v_active_count int; v_terminal jsonb;
begin
  if auth.uid() is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;

  select * into v_type from public.graduate_followup_types where id = p_followup_type_id and is_active;
  if not found then raise exception 'GRADUATE_FOLLOWUP_TYPE_NOT_FOUND'; end if;

  v_snapshot := public.ga_resolve_current_workflow_snapshot(p_followup_type_id);
  if v_snapshot is null then raise exception 'GRADUATE_FOLLOWUP_NO_PUBLISHED_WORKFLOW'; end if;
  v_workflow_id := (v_snapshot->>'workflow_id')::uuid;
  v_initial_state := v_snapshot->>'initial_state';
  v_terminal := coalesce(v_snapshot->'terminal_states', '[]'::jsonb);
  if v_initial_state is null
     or not exists (select 1 from jsonb_array_elements_text(v_snapshot->'states') s where s = v_initial_state) then
    raise exception 'GRADUATE_FOLLOWUP_INVALID_WORKFLOW_SNAPSHOT';
  end if;
  v_max_active := coalesce((v_snapshot->>'max_active_per_graduate')::int, 1);

  select count(*) into v_active_count
  from public.graduate_followups f
  where f.graduate_record_id = p_graduate_record_id
    and f.followup_type_id = p_followup_type_id
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(f.workflow_snapshot->'terminal_states', v_terminal)) s
      where s = f.state);
  if v_active_count >= v_max_active then raise exception 'GRADUATE_FOLLOWUP_MAX_ACTIVE_EXCEEDED'; end if;

  select r.department_id into v_department_id from public.graduate_records r where r.id = p_graduate_record_id;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;

  v_mode := public.ga_lock_operational_actor_mode(v_department_id);

  v_assignee_manager := public.graduate_affairs_lock_authorized_staff_profile_id(p_assignee_user_id, 'graduate_affairs_manager');
  v_assignee_specialist := public.graduate_affairs_lock_authorized_staff_profile_id(p_assignee_user_id, 'graduate_affairs_specialist');
  if v_assignee_manager is null and v_assignee_specialist is null then
    raise exception 'GRADUATE_FOLLOWUP_ASSIGNEE_NOT_STAFF';
  end if;

  if v_mode = 'SPECIALIST' then
    if v_assignee_manager is null
       and (v_assignee_specialist is null
            or v_department_id not in (
              select spd.department_id from public.staff_profile_departments spd
              where spd.staff_profile_id = v_assignee_specialist)) then
      raise exception 'GRADUATE_FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE';
    end if;
  end if;

  insert into public.graduate_followups (
    graduate_record_id, assignee_user_id, purpose_code, followup_type_id,
    workflow_id, workflow_snapshot, state, next_action_at, workflow_pinned_at, workflow_pin_source)
  values (
    p_graduate_record_id, p_assignee_user_id, v_type.code, p_followup_type_id,
    v_workflow_id, v_snapshot, v_initial_state, p_next_action_at, now(), 'PUBLISHED_WORKFLOW_AT_CREATE')
  returning id into v_followup_id;

  perform public.graduate_affairs_audit(
    'graduate_followup_created', 'graduate_followup', v_followup_id, v_type.code,
    jsonb_build_object('graduate_record_id', p_graduate_record_id,
      'assignee_user_id', p_assignee_user_id, 'followup_type_id', p_followup_type_id,
      'workflow_id', v_workflow_id, 'initial_state', v_initial_state,
      'workflow_pin_source', 'PUBLISHED_WORKFLOW_AT_CREATE', 'actor_mode', v_mode));
  return v_followup_id;
end $$;

create or replace function public.graduate_affairs_transition_followup(
  p_followup_id uuid, p_target_state text, p_outcome text default null,
  p_next_action_at timestamp with time zone default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_followup public.graduate_followups%rowtype;
  v_manager_profile uuid; v_specialist_profile uuid; v_snapshot jsonb; v_mode text;
begin
  if auth.uid() is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;
  select * into v_followup from public.graduate_followups f where f.id = p_followup_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;

  v_manager_profile := public.graduate_affairs_lock_caller_authorized_staff_profile('graduate_affairs_manager');
  if v_manager_profile is not null then
    v_mode := 'MANAGER';
  elsif public.has_role(auth.uid(), 'system_admin'::public.app_role) then
    v_mode := 'SYSTEM_ADMIN_OPERATIONAL_FALLBACK';
  elsif public.has_role(auth.uid(), 'admin'::public.app_role) then
    v_mode := 'ADMIN_OPERATIONAL_FALLBACK';
  elsif v_followup.assignee_user_id = auth.uid() then
    v_specialist_profile := public.graduate_affairs_lock_caller_authorized_staff_profile('graduate_affairs_specialist');
    if v_specialist_profile is null then raise exception 'GRADUATE_FOLLOWUP_NOT_ASSIGNEE'; end if;
    v_mode := 'SPECIALIST';
  else
    raise exception 'GRADUATE_FOLLOWUP_NOT_ASSIGNEE';
  end if;

  v_snapshot := coalesce(v_followup.workflow_snapshot, '{}'::jsonb);
  if v_snapshot = '{}'::jsonb
     or jsonb_typeof(v_snapshot->'states') <> 'array'
     or jsonb_typeof(v_snapshot->'transitions') <> 'array' then
    raise exception 'GRADUATE_FOLLOWUP_UNPINNED_WORKFLOW';
  end if;
  if not exists (select 1 from jsonb_array_elements_text(v_snapshot->'states') s where s = p_target_state) then
    raise exception 'GRADUATE_FOLLOWUP_UNKNOWN_TARGET_STATE';
  end if;

  update public.graduate_followups f
  set state = p_target_state,
      outcome = coalesce(p_outcome, f.outcome),
      next_action_at = p_next_action_at
  where f.id = p_followup_id;

  perform public.graduate_affairs_audit(
    'graduate_followup_transitioned', 'graduate_followup', p_followup_id, v_followup.purpose_code,
    jsonb_build_object('graduate_record_id', v_followup.graduate_record_id,
      'from_state', v_followup.state, 'to_state', p_target_state,
      'workflow_id', v_followup.workflow_id, 'actor_mode', v_mode));
end $$;

create or replace function public.graduate_affairs_set_employer_verification(p_employer_id uuid, p_target_state text)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_current_state text; v_allowed boolean; v_mode text;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  select e.verification_state into v_current_state from public.graduate_employers e where e.id = p_employer_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_allowed := (v_current_state = 'unverified' and p_target_state = 'in_review')
    or (v_current_state = 'in_review' and p_target_state in ('verified','rejected'));
  if not v_allowed then raise exception 'GRADUATE_EMPLOYER_INVALID_TRANSITION'; end if;
  update public.graduate_employers e
  set verification_state = p_target_state,
      verified_by = case when p_target_state = 'verified' then auth.uid() else e.verified_by end,
      verified_at = case when p_target_state = 'verified' then now() else e.verified_at end
  where e.id = p_employer_id;
  perform public.graduate_affairs_audit(
    'graduate_employer_verification_changed', 'graduate_employer', p_employer_id, 'employer_verification',
    jsonb_build_object('from_state', v_current_state, 'to_state', p_target_state, 'actor_mode', v_mode));
end $$;

create or replace function public.graduate_affairs_moderate_opportunity(
  p_opportunity_id uuid, p_target_state graduate_opportunity_state)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_current_state public.graduate_opportunity_state; v_allowed boolean; v_mode text;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  select o.state into v_current_state from public.graduate_opportunities o where o.id = p_opportunity_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_allowed := (v_current_state = 'draft' and p_target_state in ('in_review','archived'))
    or (v_current_state = 'in_review' and p_target_state in ('draft','published','archived'))
    or (v_current_state = 'published' and p_target_state = 'closed')
    or (v_current_state = 'closed' and p_target_state = 'archived');
  if not v_allowed then raise exception 'GRADUATE_OPPORTUNITY_INVALID_TRANSITION'; end if;
  update public.graduate_opportunities o
  set state = p_target_state,
      published_at = case when p_target_state = 'published' then now() else o.published_at end,
      moderated_by = case when p_target_state = 'published' then auth.uid() else o.moderated_by end
  where o.id = p_opportunity_id;
  perform public.graduate_affairs_audit(
    'graduate_opportunity_moderated', 'graduate_opportunity', p_opportunity_id, 'opportunity_moderation',
    jsonb_build_object('from_state', v_current_state, 'to_state', p_target_state, 'actor_mode', v_mode));
end $$;

-- ---------- opportunities authoring ----------

create or replace function public.ga_op_save_opportunity(
  p_id uuid, p_opportunity_type text, p_title text, p_description text,
  p_audience_scope jsonb default '{}'::jsonb, p_closes_at timestamp with time zone default null,
  p_employer_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_id uuid; v_state public.graduate_opportunity_state;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_description),'') = '' then
    raise exception 'GRADUATE_OPPORTUNITY_INVALID_INPUT';
  end if;
  if p_opportunity_type not in ('job','internship','training') then
    raise exception 'GRADUATE_OPPORTUNITY_INVALID_TYPE';
  end if;
  if p_id is null then
    insert into public.graduate_opportunities (employer_id, opportunity_type, title, description, audience_scope, closes_at)
    values (p_employer_id, p_opportunity_type, btrim(p_title), btrim(p_description),
            coalesce(p_audience_scope, '{}'::jsonb), p_closes_at)
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_opportunity_created','graduate_opportunity', v_id,
      'opportunity_authoring', jsonb_build_object('actor_mode', v_mode));
  else
    select o.state into v_state from public.graduate_opportunities o where o.id = p_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    if v_state not in ('draft','in_review') then raise exception 'GRADUATE_OPPORTUNITY_NOT_EDITABLE'; end if;
    update public.graduate_opportunities o
    set employer_id = p_employer_id, opportunity_type = p_opportunity_type,
        title = btrim(p_title), description = btrim(p_description),
        audience_scope = coalesce(p_audience_scope, '{}'::jsonb), closes_at = p_closes_at
    where o.id = p_id;
    v_id := p_id;
    perform public.graduate_affairs_audit('graduate_opportunity_updated','graduate_opportunity', v_id,
      'opportunity_authoring', jsonb_build_object('actor_mode', v_mode, 'state', v_state));
  end if;
  return v_id;
end $$;

create or replace function public.ga_op_list_opportunities()
returns table(id uuid, employer_id uuid, opportunity_type text, title text, description text,
              audience_scope jsonb, state text, published_at timestamp with time zone,
              closes_at timestamp with time zone, created_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select o.id, o.employer_id, o.opportunity_type, o.title, o.description, o.audience_scope,
         o.state::text, o.published_at, o.closes_at, o.created_at
  from public.graduate_opportunities o
  order by o.created_at desc
  limit 200;
end $$;

-- ---------- events authoring ----------

create or replace function public.ga_op_save_event(
  p_id uuid, p_title text, p_event_type text, p_purpose_code text, p_notice_version text,
  p_starts_at timestamp with time zone, p_ends_at timestamp with time zone,
  p_audience_scope jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_id uuid; v_state text;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_purpose_code),'') = ''
     or coalesce(btrim(p_notice_version),'') = '' then
    raise exception 'GRADUATE_EVENT_INVALID_INPUT';
  end if;
  if p_event_type not in ('career','training','networking','survey','quality') then
    raise exception 'GRADUATE_EVENT_INVALID_TYPE';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'GRADUATE_EVENT_INVALID_WINDOW';
  end if;
  if p_id is null then
    insert into public.graduate_events (title, event_type, purpose_code, notice_version, starts_at, ends_at, audience_scope, state)
    values (btrim(p_title), p_event_type, btrim(p_purpose_code), btrim(p_notice_version),
            p_starts_at, p_ends_at, coalesce(p_audience_scope,'{}'::jsonb), 'draft')
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_event_created','graduate_event', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode));
  else
    select e.state into v_state from public.graduate_events e where e.id = p_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    if v_state <> 'draft' then raise exception 'GRADUATE_EVENT_NOT_EDITABLE'; end if;
    update public.graduate_events e
    set title = btrim(p_title), event_type = p_event_type, purpose_code = btrim(p_purpose_code),
        notice_version = btrim(p_notice_version), starts_at = p_starts_at, ends_at = p_ends_at,
        audience_scope = coalesce(p_audience_scope,'{}'::jsonb)
    where e.id = p_id;
    v_id := p_id;
    perform public.graduate_affairs_audit('graduate_event_updated','graduate_event', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode));
  end if;
  return v_id;
end $$;

create or replace function public.ga_op_transition_event(p_event_id uuid, p_target_state text)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_state text; v_purpose text; v_allowed boolean;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  select e.state, e.purpose_code into v_state, v_purpose
  from public.graduate_events e where e.id = p_event_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_allowed := (v_state = 'draft' and p_target_state in ('published','cancelled'))
    or (v_state = 'published' and p_target_state in ('completed','cancelled'))
    or (v_state in ('completed','cancelled') and p_target_state = 'archived');
  if not v_allowed then raise exception 'GRADUATE_EVENT_INVALID_TRANSITION'; end if;
  update public.graduate_events e set state = p_target_state where e.id = p_event_id;
  perform public.graduate_affairs_audit('graduate_event_transitioned','graduate_event', p_event_id, v_purpose,
    jsonb_build_object('from_state', v_state, 'to_state', p_target_state, 'actor_mode', v_mode));
end $$;

create or replace function public.ga_op_list_events()
returns table(id uuid, title text, event_type text, purpose_code text, notice_version text,
              starts_at timestamp with time zone, ends_at timestamp with time zone,
              audience_scope jsonb, state text, registrations_count integer)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select e.id, e.title, e.event_type, e.purpose_code, e.notice_version, e.starts_at, e.ends_at,
         e.audience_scope, e.state,
         (select count(*)::integer from public.graduate_event_registrations reg
           where reg.event_id = e.id and reg.cancelled_at is null)
  from public.graduate_events e
  order by e.starts_at desc
  limit 200;
end $$;

-- ---------- surveys authoring ----------

create or replace function public.ga_op_save_survey(
  p_id uuid, p_title text, p_purpose_code text, p_minimum_report_cell_size integer default 5)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_id uuid; v_state text;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_purpose_code),'') = '' then
    raise exception 'GRADUATE_SURVEY_INVALID_INPUT';
  end if;
  if coalesce(p_minimum_report_cell_size, 5) < 3 then
    raise exception 'GRADUATE_SURVEY_INVALID_CELL_SIZE';
  end if;
  if p_id is null then
    insert into public.graduate_surveys (title, purpose_code, minimum_report_cell_size, state)
    values (btrim(p_title), btrim(p_purpose_code), coalesce(p_minimum_report_cell_size,5), 'draft')
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_survey_created','graduate_survey', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode));
  else
    select s.state into v_state from public.graduate_surveys s where s.id = p_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    if v_state not in ('draft','active') then raise exception 'GRADUATE_SURVEY_NOT_EDITABLE'; end if;
    update public.graduate_surveys s
    set title = btrim(p_title), purpose_code = btrim(p_purpose_code),
        minimum_report_cell_size = coalesce(p_minimum_report_cell_size, s.minimum_report_cell_size)
    where s.id = p_id;
    v_id := p_id;
    perform public.graduate_affairs_audit('graduate_survey_updated','graduate_survey', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode, 'state', v_state));
  end if;
  return v_id;
end $$;

create or replace function public.ga_op_save_survey_version_draft(
  p_survey_id uuid, p_version_id uuid, p_notice_version text, p_questions jsonb)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_id uuid; v_published timestamptz; v_next int;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  if jsonb_typeof(coalesce(p_questions,'null'::jsonb)) <> 'array' then
    raise exception 'GRADUATE_SURVEY_VERSION_INVALID_QUESTIONS';
  end if;
  if coalesce(btrim(p_notice_version),'') = '' then
    raise exception 'GRADUATE_SURVEY_VERSION_INVALID_NOTICE';
  end if;
  if p_version_id is null then
    if not exists (select 1 from public.graduate_surveys s where s.id = p_survey_id) then
      raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND';
    end if;
    select coalesce(max(sv.version), 0) + 1 into v_next
    from public.graduate_survey_versions sv where sv.survey_id = p_survey_id;
    insert into public.graduate_survey_versions (survey_id, version, notice_version, questions)
    values (p_survey_id, v_next, btrim(p_notice_version), p_questions)
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_survey_version_drafted','graduate_survey_version', v_id,
      'survey_authoring', jsonb_build_object('actor_mode', v_mode, 'survey_id', p_survey_id, 'version', v_next));
  else
    select sv.published_at into v_published
    from public.graduate_survey_versions sv where sv.id = p_version_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    if v_published is not null then raise exception 'GRADUATE_SURVEY_VERSION_IMMUTABLE'; end if;
    update public.graduate_survey_versions sv
    set notice_version = btrim(p_notice_version), questions = p_questions
    where sv.id = p_version_id;
    v_id := p_version_id;
    perform public.graduate_affairs_audit('graduate_survey_version_updated','graduate_survey_version', v_id,
      'survey_authoring', jsonb_build_object('actor_mode', v_mode));
  end if;
  return v_id;
end $$;

create or replace function public.ga_op_publish_survey_version(p_version_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_row public.graduate_survey_versions%rowtype;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  select * into v_row from public.graduate_survey_versions sv where sv.id = p_version_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  if v_row.published_at is not null then raise exception 'GRADUATE_SURVEY_VERSION_ALREADY_PUBLISHED'; end if;
  if jsonb_array_length(coalesce(v_row.questions,'[]'::jsonb)) = 0 then
    raise exception 'GRADUATE_SURVEY_VERSION_INCOMPLETE';
  end if;
  update public.graduate_survey_versions sv set published_at = now() where sv.id = p_version_id;
  update public.graduate_surveys s set state = 'active' where s.id = v_row.survey_id and s.state = 'draft';
  perform public.graduate_affairs_audit('graduate_survey_version_published','graduate_survey_version', p_version_id,
    'survey_authoring', jsonb_build_object('actor_mode', v_mode, 'survey_id', v_row.survey_id, 'version', v_row.version));
end $$;

create or replace function public.ga_op_close_survey(p_survey_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_state text;
begin
  v_mode := public.ga_lock_operational_actor_mode(null);
  select s.state into v_state from public.graduate_surveys s where s.id = p_survey_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  if v_state not in ('draft','active') then raise exception 'GRADUATE_SURVEY_INVALID_TRANSITION'; end if;
  update public.graduate_surveys s set state = 'closed' where s.id = p_survey_id;
  perform public.graduate_affairs_audit('graduate_survey_closed','graduate_survey', p_survey_id,
    'survey_authoring', jsonb_build_object('from_state', v_state, 'actor_mode', v_mode));
end $$;

create or replace function public.ga_op_list_surveys()
returns table(survey_id uuid, title text, purpose_code text, state text, minimum_report_cell_size integer,
              version_id uuid, version integer, notice_version text, questions jsonb,
              published_at timestamp with time zone, response_count integer)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select s.id, s.title, s.purpose_code, s.state, s.minimum_report_cell_size,
         sv.id, sv.version, sv.notice_version, sv.questions, sv.published_at,
         (select count(*)::integer from public.graduate_survey_responses r
           where r.survey_version_id = sv.id and r.withdrawn_at is null)
  from public.graduate_surveys s
  left join public.graduate_survey_versions sv on sv.survey_id = s.id
  order by s.created_at desc, sv.version desc
  limit 200;
end $$;

-- ---------- communications ----------

create or replace function public.ga_op_log_communication(
  p_graduate_record_id uuid, p_contact_point_id uuid, p_purpose_code text,
  p_channel text, p_template_code text, p_payload_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_mode text; v_department_id uuid; v_consent public.graduate_consents%rowtype; v_id uuid; v_cp record;
begin
  select r.department_id into v_department_id from public.graduate_records r
  where r.id = p_graduate_record_id and r.record_state = 'approved';
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_mode := public.ga_lock_operational_actor_mode(v_department_id);

  if p_channel not in ('email','phone') then raise exception 'GRADUATE_COMMUNICATION_INVALID_CHANNEL'; end if;
  if coalesce(btrim(p_template_code),'') = '' or coalesce(btrim(p_purpose_code),'') = '' then
    raise exception 'GRADUATE_COMMUNICATION_INVALID_INPUT';
  end if;

  select cp.id, cp.channel_type, cp.purpose_code, cp.revoked_at into v_cp
  from public.graduate_contact_points cp
  where cp.id = p_contact_point_id and cp.graduate_record_id = p_graduate_record_id;
  if not found then raise exception 'GRADUATE_COMMUNICATION_CONTACT_NOT_FOUND'; end if;
  if v_cp.revoked_at is not null then raise exception 'GRADUATE_COMMUNICATION_CONTACT_REVOKED'; end if;
  if v_cp.channel_type <> p_channel then raise exception 'GRADUATE_COMMUNICATION_CHANNEL_MISMATCH'; end if;

  select * into v_consent from public.graduate_consents c
  where c.graduate_record_id = p_graduate_record_id
    and c.purpose_code = btrim(p_purpose_code)
    and c.consent_state = 'granted'
    and c.withdrawn_at is null
  order by c.affirmative_action_at desc limit 1;
  if not found then raise exception 'GRADUATE_COMMUNICATION_CONSENT_MISSING'; end if;

  insert into public.graduate_communication_events (
    graduate_record_id, contact_point_id, consent_id, purpose_code, notice_version,
    channel, template_code, sent_by, payload_meta)
  values (p_graduate_record_id, p_contact_point_id, v_consent.id, btrim(p_purpose_code),
          v_consent.notice_version, p_channel, btrim(p_template_code), auth.uid(),
          coalesce(p_payload_meta,'{}'::jsonb) || jsonb_build_object('actor_mode', v_mode))
  returning id into v_id;

  perform public.graduate_affairs_audit('graduate_communication_logged','graduate_communication', v_id,
    btrim(p_purpose_code), jsonb_build_object('graduate_record_id', p_graduate_record_id,
      'channel', p_channel, 'template_code', btrim(p_template_code), 'actor_mode', v_mode));
  return v_id;
end $$;

create or replace function public.ga_op_list_communications(p_graduate_record_id uuid)
returns table(id uuid, channel text, template_code text, purpose_code text,
              notice_version text, sent_at timestamp with time zone, sent_by uuid)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.graduate_affairs_can_access_record(p_graduate_record_id) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;
  return query
  select e.id, e.channel, e.template_code, e.purpose_code, e.notice_version, e.sent_at, e.sent_by
  from public.graduate_communication_events e
  where e.graduate_record_id = p_graduate_record_id
  order by e.sent_at desc
  limit 200;
end $$;

-- ---------- employers / employment read surface ----------

create or replace function public.ga_op_list_employers()
returns table(id uuid, legal_name text, sector_code text, verification_state text,
              verified_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select e.id, e.legal_name, e.sector_code, e.verification_state, e.verified_at
  from public.graduate_employers e
  where e.archived_at is null
  order by e.legal_name
  limit 200;
end $$;

-- ---------- grants ----------

grant execute on function public.ga_operational_actor_mode(uuid) to authenticated;
grant execute on function public.ga_is_admin_fallback() to authenticated;
grant execute on function public.ga_can_read_operational_catalog() to authenticated;
grant execute on function public.ga_op_save_opportunity(uuid, text, text, text, jsonb, timestamptz, uuid) to authenticated;
grant execute on function public.ga_op_list_opportunities() to authenticated;
grant execute on function public.ga_op_save_event(uuid, text, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.ga_op_transition_event(uuid, text) to authenticated;
grant execute on function public.ga_op_list_events() to authenticated;
grant execute on function public.ga_op_save_survey(uuid, text, text, integer) to authenticated;
grant execute on function public.ga_op_save_survey_version_draft(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.ga_op_publish_survey_version(uuid) to authenticated;
grant execute on function public.ga_op_close_survey(uuid) to authenticated;
grant execute on function public.ga_op_list_surveys() to authenticated;
grant execute on function public.ga_op_log_communication(uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.ga_op_list_communications(uuid) to authenticated;
grant execute on function public.ga_op_list_employers() to authenticated;

revoke execute on function public.ga_lock_operational_actor_mode(uuid) from public;