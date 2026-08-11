
-- GA-OPS-02: scoped operational authoring
alter table public.graduate_surveys
  add column if not exists audience_scope jsonb not null default '{}'::jsonb;

create or replace function public.ga_scope_department_ids(p_scope jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare v_ids uuid[] := '{}'; v_txt text;
begin
  if p_scope is null or jsonb_typeof(p_scope) is distinct from 'object' then
    return v_ids;
  end if;
  if jsonb_typeof(p_scope->'department_ids') = 'array' then
    for v_txt in select jsonb_array_elements_text(p_scope->'department_ids') loop
      begin
        v_ids := v_ids || v_txt::uuid;
      exception when others then
        raise exception 'GRADUATE_AFFAIRS_SCOPE_INVALID';
      end;
    end loop;
  end if;
  if jsonb_typeof(p_scope->'program_ids') = 'array' then
    for v_txt in select jsonb_array_elements_text(p_scope->'program_ids') loop
      begin
        v_ids := v_ids || (
          select pr.department_id from public.programs pr where pr.id = v_txt::uuid
        );
      exception when others then
        raise exception 'GRADUATE_AFFAIRS_SCOPE_INVALID';
      end;
    end loop;
  end if;
  return (select coalesce(array_agg(distinct x), '{}'::uuid[]) from unnest(v_ids) x where x is not null);
end $$;

create or replace function public.ga_is_specialist_only()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if public.graduate_affairs_is_manager() then return false; end if;
  if public.has_role(v_uid, 'system_admin'::public.app_role) then return false; end if;
  if public.has_role(v_uid, 'admin'::public.app_role) then return false; end if;
  return public.graduate_affairs_is_specialist();
end $$;

create or replace function public.ga_scope_visible_to_caller(p_scope jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare v_scope uuid[]; v_mine uuid[];
begin
  if not public.ga_is_specialist_only() then return true; end if;
  begin
    v_scope := public.ga_scope_department_ids(p_scope);
  exception when others then
    return false;
  end;
  select coalesce(array_agg(d), '{}'::uuid[]) into v_mine
  from public.graduate_affairs_specialist_department_ids() d;
  return v_scope && v_mine;
end $$;

-- Scope-aware actor lock: manager/admin may act college-wide or department-scoped,
-- specialist must supply a scope fully inside the assigned departments.
create or replace function public.ga_lock_scope_actor_mode(p_scope jsonb)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid(); v_p uuid; v_scope uuid[]; v_mine uuid[];
begin
  if v_uid is null then raise exception 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'; end if;
  v_p := public.graduate_affairs_lock_caller_authorized_staff_profile('graduate_affairs_manager');
  if v_p is not null then return 'MANAGER'; end if;
  if public.has_role(v_uid, 'system_admin'::public.app_role) then return 'SYSTEM_ADMIN_OPERATIONAL_FALLBACK'; end if;
  if public.has_role(v_uid, 'admin'::public.app_role) then return 'ADMIN_OPERATIONAL_FALLBACK'; end if;

  v_p := public.graduate_affairs_lock_caller_authorized_staff_profile('graduate_affairs_specialist');
  if v_p is null then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;

  if p_scope is null or jsonb_typeof(p_scope) is distinct from 'object' then
    raise exception 'GRADUATE_AFFAIRS_SCOPE_REQUIRED';
  end if;
  if coalesce((p_scope->>'all_graduates')::boolean, false) then
    raise exception 'GRADUATE_AFFAIRS_SCOPE_DENIED';
  end if;
  v_scope := public.ga_scope_department_ids(p_scope);
  if array_length(v_scope, 1) is null then
    raise exception 'GRADUATE_AFFAIRS_SCOPE_REQUIRED';
  end if;
  select coalesce(array_agg(spd.department_id), '{}'::uuid[]) into v_mine
  from public.staff_profile_departments spd where spd.staff_profile_id = v_p;
  if not (v_scope <@ v_mine) then
    raise exception 'GRADUATE_AFFAIRS_SCOPE_DENIED';
  end if;
  return 'SPECIALIST';
end $$;

/* ------------------------- opportunities ------------------------- */

create or replace function public.ga_op_save_opportunity(
  p_id uuid, p_opportunity_type text, p_title text, p_description text,
  p_audience_scope jsonb default '{}'::jsonb,
  p_closes_at timestamptz default null, p_employer_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_id uuid; v_state public.graduate_opportunity_state; v_old jsonb;
begin
  v_mode := public.ga_lock_scope_actor_mode(p_audience_scope);
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_description),'') = '' then
    raise exception 'GRADUATE_OPPORTUNITY_INVALID_INPUT';
  end if;
  if p_opportunity_type not in ('job','internship','training') then
    raise exception 'GRADUATE_OPPORTUNITY_INVALID_TYPE';
  end if;
  if p_id is null then
    insert into public.graduate_opportunities (employer_id, opportunity_type, title, description, audience_scope, closes_at)
    values (p_employer_id, p_opportunity_type, btrim(p_title), btrim(p_description),
            coalesce(p_audience_scope,'{}'::jsonb), p_closes_at)
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_opportunity_created','graduate_opportunity', v_id,
      'opportunity_authoring', jsonb_build_object('actor_mode', v_mode, 'audience_scope', coalesce(p_audience_scope,'{}'::jsonb)));
  else
    select o.state, o.audience_scope into v_state, v_old
    from public.graduate_opportunities o where o.id = p_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    perform public.ga_lock_scope_actor_mode(v_old);
    if v_state not in ('draft','in_review') then raise exception 'GRADUATE_OPPORTUNITY_NOT_EDITABLE'; end if;
    update public.graduate_opportunities o
    set employer_id = p_employer_id, opportunity_type = p_opportunity_type,
        title = btrim(p_title), description = btrim(p_description),
        audience_scope = coalesce(p_audience_scope,'{}'::jsonb), closes_at = p_closes_at
    where o.id = p_id;
    v_id := p_id;
    perform public.graduate_affairs_audit('graduate_opportunity_updated','graduate_opportunity', v_id,
      'opportunity_authoring', jsonb_build_object('actor_mode', v_mode, 'state', v_state,
        'audience_scope', coalesce(p_audience_scope,'{}'::jsonb)));
  end if;
  return v_id;
end $$;

create or replace function public.graduate_affairs_moderate_opportunity(p_opportunity_id uuid, p_target_state text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_current_state text; v_allowed boolean; v_mode text; v_scope jsonb;
begin
  select o.state::text, o.audience_scope into v_current_state, v_scope
  from public.graduate_opportunities o where o.id = p_opportunity_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_mode := public.ga_lock_scope_actor_mode(v_scope);
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
    'graduate_opportunity_moderated','graduate_opportunity', p_opportunity_id,'opportunity_moderation',
    jsonb_build_object('from_state', v_current_state, 'to_state', p_target_state, 'actor_mode', v_mode));
end $$;

create or replace function public.ga_op_list_opportunities()
returns table(id uuid, employer_id uuid, opportunity_type text, title text, description text,
  audience_scope jsonb, state text, published_at timestamptz, closes_at timestamptz, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select o.id, o.employer_id, o.opportunity_type, o.title, o.description, o.audience_scope,
         o.state::text, o.published_at, o.closes_at, o.created_at
  from public.graduate_opportunities o
  where public.ga_scope_visible_to_caller(o.audience_scope)
  order by o.created_at desc
  limit 200;
end $$;

/* ---------------------------- events ---------------------------- */

create or replace function public.ga_op_save_event(
  p_id uuid, p_title text, p_event_type text, p_purpose_code text, p_notice_version text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_audience_scope jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_id uuid; v_state text; v_old jsonb;
begin
  v_mode := public.ga_lock_scope_actor_mode(p_audience_scope);
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
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode, 'audience_scope', coalesce(p_audience_scope,'{}'::jsonb)));
  else
    select e.state, e.audience_scope into v_state, v_old from public.graduate_events e where e.id = p_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    perform public.ga_lock_scope_actor_mode(v_old);
    if v_state <> 'draft' then raise exception 'GRADUATE_EVENT_NOT_EDITABLE'; end if;
    update public.graduate_events e
    set title = btrim(p_title), event_type = p_event_type, purpose_code = btrim(p_purpose_code),
        notice_version = btrim(p_notice_version), starts_at = p_starts_at, ends_at = p_ends_at,
        audience_scope = coalesce(p_audience_scope,'{}'::jsonb)
    where e.id = p_id;
    v_id := p_id;
    perform public.graduate_affairs_audit('graduate_event_updated','graduate_event', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode, 'audience_scope', coalesce(p_audience_scope,'{}'::jsonb)));
  end if;
  return v_id;
end $$;

create or replace function public.ga_op_transition_event(p_event_id uuid, p_target_state text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_state text; v_purpose text; v_allowed boolean; v_scope jsonb;
begin
  select e.state, e.purpose_code, e.audience_scope into v_state, v_purpose, v_scope
  from public.graduate_events e where e.id = p_event_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_mode := public.ga_lock_scope_actor_mode(v_scope);
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
  starts_at timestamptz, ends_at timestamptz, audience_scope jsonb, state text, registrations_count integer)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select e.id, e.title, e.event_type, e.purpose_code, e.notice_version, e.starts_at, e.ends_at,
         e.audience_scope, e.state,
         (select count(*)::integer from public.graduate_event_registrations reg
           where reg.event_id = e.id and reg.cancelled_at is null)
  from public.graduate_events e
  where public.ga_scope_visible_to_caller(e.audience_scope)
  order by e.starts_at desc
  limit 200;
end $$;

/* ---------------------------- surveys ---------------------------- */

drop function if exists public.ga_op_save_survey(uuid, text, text, integer);

create or replace function public.ga_op_save_survey(
  p_id uuid, p_title text, p_purpose_code text,
  p_minimum_report_cell_size integer default 5,
  p_audience_scope jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_id uuid; v_state text; v_old jsonb;
begin
  v_mode := public.ga_lock_scope_actor_mode(p_audience_scope);
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_purpose_code),'') = '' then
    raise exception 'GRADUATE_SURVEY_INVALID_INPUT';
  end if;
  if coalesce(p_minimum_report_cell_size, 5) < 3 then
    raise exception 'GRADUATE_SURVEY_INVALID_CELL_SIZE';
  end if;
  if p_id is null then
    insert into public.graduate_surveys (title, purpose_code, minimum_report_cell_size, state, audience_scope)
    values (btrim(p_title), btrim(p_purpose_code), coalesce(p_minimum_report_cell_size,5), 'draft',
            coalesce(p_audience_scope,'{}'::jsonb))
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_survey_created','graduate_survey', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode, 'audience_scope', coalesce(p_audience_scope,'{}'::jsonb)));
  else
    select s.state, s.audience_scope into v_state, v_old from public.graduate_surveys s where s.id = p_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    perform public.ga_lock_scope_actor_mode(v_old);
    if v_state not in ('draft','active') then raise exception 'GRADUATE_SURVEY_NOT_EDITABLE'; end if;
    update public.graduate_surveys s
    set title = btrim(p_title), purpose_code = btrim(p_purpose_code),
        minimum_report_cell_size = coalesce(p_minimum_report_cell_size, s.minimum_report_cell_size),
        audience_scope = coalesce(p_audience_scope, s.audience_scope)
    where s.id = p_id;
    v_id := p_id;
    perform public.graduate_affairs_audit('graduate_survey_updated','graduate_survey', v_id,
      btrim(p_purpose_code), jsonb_build_object('actor_mode', v_mode, 'state', v_state));
  end if;
  return v_id;
end $$;

create or replace function public.ga_op_save_survey_version_draft(
  p_survey_id uuid, p_version_id uuid, p_notice_version text, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_id uuid; v_published timestamptz; v_next int; v_scope jsonb; v_survey uuid;
begin
  if p_version_id is null then
    select s.audience_scope into v_scope from public.graduate_surveys s where s.id = p_survey_id;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  else
    select sv.survey_id, sv.published_at into v_survey, v_published
    from public.graduate_survey_versions sv where sv.id = p_version_id for update;
    if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
    select s.audience_scope into v_scope from public.graduate_surveys s where s.id = v_survey;
  end if;
  v_mode := public.ga_lock_scope_actor_mode(v_scope);
  if jsonb_typeof(coalesce(p_questions,'null'::jsonb)) <> 'array' then
    raise exception 'GRADUATE_SURVEY_VERSION_INVALID_QUESTIONS';
  end if;
  if coalesce(btrim(p_notice_version),'') = '' then
    raise exception 'GRADUATE_SURVEY_VERSION_INVALID_NOTICE';
  end if;
  if p_version_id is null then
    select coalesce(max(sv.version), 0) + 1 into v_next
    from public.graduate_survey_versions sv where sv.survey_id = p_survey_id;
    insert into public.graduate_survey_versions (survey_id, version, notice_version, questions)
    values (p_survey_id, v_next, btrim(p_notice_version), p_questions)
    returning id into v_id;
    perform public.graduate_affairs_audit('graduate_survey_version_drafted','graduate_survey_version', v_id,
      'survey_authoring', jsonb_build_object('actor_mode', v_mode, 'survey_id', p_survey_id, 'version', v_next));
  else
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
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_row public.graduate_survey_versions%rowtype; v_scope jsonb;
begin
  select * into v_row from public.graduate_survey_versions sv where sv.id = p_version_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  select s.audience_scope into v_scope from public.graduate_surveys s where s.id = v_row.survey_id;
  v_mode := public.ga_lock_scope_actor_mode(v_scope);
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
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_mode text; v_state text; v_scope jsonb;
begin
  select s.state, s.audience_scope into v_state, v_scope
  from public.graduate_surveys s where s.id = p_survey_id for update;
  if not found then raise exception 'GRADUATE_AFFAIRS_TARGET_NOT_FOUND'; end if;
  v_mode := public.ga_lock_scope_actor_mode(v_scope);
  if v_state not in ('draft','active') then raise exception 'GRADUATE_SURVEY_INVALID_TRANSITION'; end if;
  update public.graduate_surveys s set state = 'closed' where s.id = p_survey_id;
  perform public.graduate_affairs_audit('graduate_survey_closed','graduate_survey', p_survey_id,
    'survey_authoring', jsonb_build_object('from_state', v_state, 'actor_mode', v_mode));
end $$;

drop function if exists public.ga_op_list_surveys();

create or replace function public.ga_op_list_surveys()
returns table(survey_id uuid, title text, purpose_code text, state text, minimum_report_cell_size integer,
  audience_scope jsonb, version_id uuid, version integer, notice_version text, questions jsonb,
  published_at timestamptz, response_count integer)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.ga_can_read_operational_catalog() then raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED'; end if;
  return query
  select s.id, s.title, s.purpose_code, s.state, s.minimum_report_cell_size, s.audience_scope,
         sv.id, sv.version, sv.notice_version, sv.questions, sv.published_at,
         (select count(*)::integer from public.graduate_survey_responses r
           where r.survey_version_id = sv.id and r.withdrawn_at is null)
  from public.graduate_surveys s
  left join public.graduate_survey_versions sv on sv.survey_id = s.id
  where public.ga_scope_visible_to_caller(s.audience_scope)
  order by s.created_at desc, sv.version desc
  limit 200;
end $$;

/* ------------------------- open followups KPI ------------------------- */

create or replace function public.ga_admin_open_followups_count()
returns integer
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid(); v_count integer;
begin
  if v_uid is null
     or not (public.has_role(v_uid,'admin'::public.app_role)
             or public.has_role(v_uid,'system_admin'::public.app_role)) then
    raise exception 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  end if;
  select count(*)::integer into v_count
  from public.graduate_followups f
  where not (
    jsonb_typeof(coalesce(f.workflow_snapshot->'terminal_states','[]'::jsonb)) = 'array'
    and coalesce(f.workflow_snapshot->'terminal_states','[]'::jsonb) ? f.state
  );
  return v_count;
end $$;

grant execute on function public.ga_scope_department_ids(jsonb) to authenticated;
grant execute on function public.ga_is_specialist_only() to authenticated;
grant execute on function public.ga_scope_visible_to_caller(jsonb) to authenticated;
grant execute on function public.ga_lock_scope_actor_mode(jsonb) to authenticated;
grant execute on function public.ga_op_save_survey(uuid, text, text, integer, jsonb) to authenticated;
grant execute on function public.ga_op_list_surveys() to authenticated;
grant execute on function public.ga_admin_open_followups_count() to authenticated;
