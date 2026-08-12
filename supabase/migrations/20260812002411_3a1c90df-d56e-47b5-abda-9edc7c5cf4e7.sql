-- =========================================================
-- Lecture Execution: Course Delivery Plan + Session Execution
-- =========================================================

create table if not exists public.course_delivery_plans (
  id uuid primary key default gen_random_uuid(),
  course_section_id uuid not null unique references public.course_sections(id) on delete cascade,
  planned_session_count integer not null check (planned_session_count between 1 and 60),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_delivery_plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.course_delivery_plans(id) on delete cascade,
  session_number integer not null check (session_number > 0),
  planned_title text not null,
  planned_topics text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, session_number)
);

create table if not exists public.course_session_executions (
  id uuid primary key default gen_random_uuid(),
  plan_session_id uuid not null unique references public.course_delivery_plan_sessions(id) on delete cascade,
  status text not null check (status in ('executed','hindered','postponed','cancelled','compensated')),
  execution_date date,
  reason text,
  compensation_date date,
  notes text,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.course_delivery_plans to authenticated;
grant select, insert, update, delete on public.course_delivery_plan_sessions to authenticated;
grant select, insert, update, delete on public.course_session_executions to authenticated;
grant all on public.course_delivery_plans to service_role;
grant all on public.course_delivery_plan_sessions to service_role;
grant all on public.course_session_executions to service_role;

alter table public.course_delivery_plans enable row level security;
alter table public.course_delivery_plan_sessions enable row level security;
alter table public.course_session_executions enable row level security;

-- ---------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------
create or replace function public.cdp_can_manage_section(_user_id uuid, _course_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from public.course_sections cs
      join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
      where cs.id = _course_section_id and fp.user_id = _user_id
    )
    or exists (
      select 1 from public.course_sections cs
      join public.course_offerings co on co.id = cs.course_offering_id
      join public.courses c on c.id = co.course_id
      where cs.id = _course_section_id
        and c.department_id is not null
        and public.is_department_head_of(_user_id, c.department_id)
    )
    or public.has_role(_user_id, 'admin'::public.app_role)
    or public.has_role(_user_id, 'system_admin'::public.app_role)
  , false)
$$;

create or replace function public.cdp_is_section_faculty(_user_id uuid, _course_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_sections cs
    join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
    where cs.id = _course_section_id and fp.user_id = _user_id
  )
$$;

create or replace function public.cdp_can_view_section(_user_id uuid, _course_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.cdp_can_manage_section(_user_id, _course_section_id)
    or public.has_role(_user_id, 'dean'::public.app_role)
    or public.has_role(_user_id, 'registrar'::public.app_role)
    or public.has_role(_user_id, 'student_affairs'::public.app_role)
    or exists (
      select 1 from public.student_enrollments se
      join public.student_profiles sp on sp.id = se.student_profile_id
      where se.course_section_id = _course_section_id
        and sp.user_id = _user_id
        and se.enrollment_status = 'enrolled'
    )
  , false)
$$;

grant execute on function public.cdp_can_manage_section(uuid, uuid) to authenticated;
grant execute on function public.cdp_is_section_faculty(uuid, uuid) to authenticated;
grant execute on function public.cdp_can_view_section(uuid, uuid) to authenticated;

-- ---------------------------------------------------------
-- RLS policies (read via RLS, writes through RPCs)
-- ---------------------------------------------------------
drop policy if exists cdp_plans_select on public.course_delivery_plans;
create policy cdp_plans_select on public.course_delivery_plans
  for select to authenticated
  using (public.cdp_can_view_section(auth.uid(), course_section_id));

drop policy if exists cdp_sessions_select on public.course_delivery_plan_sessions;
create policy cdp_sessions_select on public.course_delivery_plan_sessions
  for select to authenticated
  using (exists (
    select 1 from public.course_delivery_plans p
    where p.id = plan_id and public.cdp_can_view_section(auth.uid(), p.course_section_id)
  ));

drop policy if exists cdp_exec_select on public.course_session_executions;
create policy cdp_exec_select on public.course_session_executions
  for select to authenticated
  using (exists (
    select 1 from public.course_delivery_plan_sessions s
    join public.course_delivery_plans p on p.id = s.plan_id
    where s.id = plan_session_id and public.cdp_can_view_section(auth.uid(), p.course_section_id)
  ));

-- ---------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------
create or replace function public.cdp_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_cdp_plans_updated on public.course_delivery_plans;
create trigger trg_cdp_plans_updated before update on public.course_delivery_plans
  for each row execute function public.cdp_touch_updated_at();
drop trigger if exists trg_cdp_sessions_updated on public.course_delivery_plan_sessions;
create trigger trg_cdp_sessions_updated before update on public.course_delivery_plan_sessions
  for each row execute function public.cdp_touch_updated_at();
drop trigger if exists trg_cdp_exec_updated on public.course_session_executions;
create trigger trg_cdp_exec_updated before update on public.course_session_executions
  for each row execute function public.cdp_touch_updated_at();

create or replace function public.cdp_validate_execution()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  select p.status into v_status
  from public.course_delivery_plan_sessions s
  join public.course_delivery_plans p on p.id = s.plan_id
  where s.id = new.plan_session_id;
  if v_status is distinct from 'published' then
    raise exception 'CDP_PLAN_NOT_PUBLISHED';
  end if;
  if new.status in ('executed','compensated') and new.execution_date is null then
    raise exception 'CDP_EXECUTION_DATE_REQUIRED';
  end if;
  if new.status in ('hindered','postponed','cancelled')
     and (new.reason is null or btrim(new.reason) = '') then
    raise exception 'CDP_REASON_REQUIRED';
  end if;
  if new.status = 'compensated' and new.compensation_date is null then
    raise exception 'CDP_COMPENSATION_DATE_REQUIRED';
  end if;
  return new;
end $$;

drop trigger if exists trg_cdp_exec_validate on public.course_session_executions;
create trigger trg_cdp_exec_validate before insert or update on public.course_session_executions
  for each row execute function public.cdp_validate_execution();

-- ---------------------------------------------------------
-- Write RPCs
-- ---------------------------------------------------------
create or replace function public.cdp_save_plan(
  p_course_section_id uuid,
  p_planned_session_count integer,
  p_sessions jsonb
) returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
  v_status text;
  v_item jsonb;
  v_number integer;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  if not public.cdp_can_manage_section(v_uid, p_course_section_id) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;
  if p_planned_session_count is null or p_planned_session_count < 1 or p_planned_session_count > 60 then
    raise exception 'CDP_INVALID_SESSION_COUNT';
  end if;

  select id, status into v_plan_id, v_status
  from public.course_delivery_plans where course_section_id = p_course_section_id;

  if v_plan_id is null then
    insert into public.course_delivery_plans(course_section_id, planned_session_count, created_by)
    values (p_course_section_id, p_planned_session_count, v_uid)
    returning id into v_plan_id;
  else
    if v_status = 'published' and p_planned_session_count < (
      select coalesce(max(s.session_number), 0)
      from public.course_delivery_plan_sessions s
      join public.course_session_executions e on e.plan_session_id = s.id
      where s.plan_id = v_plan_id
    ) then
      raise exception 'CDP_CANNOT_SHRINK_BELOW_RECORDED_SESSIONS';
    end if;
    update public.course_delivery_plans
      set planned_session_count = p_planned_session_count
      where id = v_plan_id;
  end if;

  -- ensure a row exists for every planned session number
  insert into public.course_delivery_plan_sessions(plan_id, session_number, planned_title)
  select v_plan_id, gs, 'محاضرة ' || gs
  from generate_series(1, p_planned_session_count) gs
  on conflict (plan_id, session_number) do nothing;

  -- remove trailing sessions beyond the new count (only when nothing recorded)
  delete from public.course_delivery_plan_sessions s
  where s.plan_id = v_plan_id
    and s.session_number > p_planned_session_count
    and not exists (select 1 from public.course_session_executions e where e.plan_session_id = s.id);

  if p_sessions is not null and jsonb_typeof(p_sessions) = 'array' then
    for v_item in select * from jsonb_array_elements(p_sessions) loop
      v_number := (v_item->>'session_number')::int;
      if v_number is null or v_number < 1 or v_number > p_planned_session_count then
        raise exception 'CDP_INVALID_SESSION_NUMBER';
      end if;
      if coalesce(btrim(v_item->>'planned_title'), '') = '' then
        raise exception 'CDP_SESSION_TITLE_REQUIRED';
      end if;
      update public.course_delivery_plan_sessions
        set planned_title = btrim(v_item->>'planned_title'),
            planned_topics = nullif(btrim(coalesce(v_item->>'planned_topics','')), '')
      where plan_id = v_plan_id and session_number = v_number;
    end loop;
  end if;

  return v_plan_id;
end $$;

create or replace function public.cdp_publish_plan(p_plan_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_section uuid; v_count integer; v_missing integer;
begin
  select course_section_id, planned_session_count into v_section, v_count
  from public.course_delivery_plans where id = p_plan_id;
  if v_section is null then raise exception 'CDP_PLAN_NOT_FOUND'; end if;
  if not public.cdp_can_manage_section(auth.uid(), v_section) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;
  select count(*) into v_missing
  from public.course_delivery_plan_sessions s
  where s.plan_id = p_plan_id and coalesce(btrim(s.planned_title), '') = '';
  if v_missing > 0 then raise exception 'CDP_INCOMPLETE_PLAN_TITLES'; end if;
  if (select count(*) from public.course_delivery_plan_sessions where plan_id = p_plan_id) <> v_count then
    raise exception 'CDP_SESSION_COUNT_MISMATCH';
  end if;
  update public.course_delivery_plans
    set status = 'published', published_at = coalesce(published_at, now())
    where id = p_plan_id;
end $$;

create or replace function public.cdp_record_session_execution(
  p_plan_session_id uuid,
  p_status text,
  p_execution_date date,
  p_reason text,
  p_compensation_date date,
  p_notes text
) returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_section uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  select p.course_section_id into v_section
  from public.course_delivery_plan_sessions s
  join public.course_delivery_plans p on p.id = s.plan_id
  where s.id = p_plan_session_id;
  if v_section is null then raise exception 'CDP_SESSION_NOT_FOUND'; end if;
  if not public.cdp_can_manage_section(v_uid, v_section) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;

  insert into public.course_session_executions(
    plan_session_id, status, execution_date, reason, compensation_date, notes, recorded_by)
  values (p_plan_session_id, p_status, p_execution_date,
          nullif(btrim(coalesce(p_reason,'')),''), p_compensation_date,
          nullif(btrim(coalesce(p_notes,'')),''), v_uid)
  on conflict (plan_session_id) do update
    set status = excluded.status,
        execution_date = excluded.execution_date,
        reason = excluded.reason,
        compensation_date = excluded.compensation_date,
        notes = excluded.notes,
        recorded_by = excluded.recorded_by,
        recorded_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cdp_clear_session_execution(p_plan_session_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare v_section uuid;
begin
  select p.course_section_id into v_section
  from public.course_delivery_plan_sessions s
  join public.course_delivery_plans p on p.id = s.plan_id
  where s.id = p_plan_session_id;
  if v_section is null then raise exception 'CDP_SESSION_NOT_FOUND'; end if;
  if not public.cdp_can_manage_section(auth.uid(), v_section) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;
  delete from public.course_session_executions where plan_session_id = p_plan_session_id;
end $$;

-- ---------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------
create or replace function public.cdp_get_section_plan(p_course_section_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_plan public.course_delivery_plans%rowtype;
  v_course jsonb;
  v_sessions jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  if not public.cdp_can_view_section(v_uid, p_course_section_id) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;
  v_manage := public.cdp_can_manage_section(v_uid, p_course_section_id);

  select jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'faculty_name', coalesce(f.full_name, '')
  ) into v_course
  from public.course_sections cs
  join public.course_offerings co on co.id = cs.course_offering_id
  join public.courses c on c.id = co.course_id
  left join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
  left join public.faculty f on f.id = fp.faculty_id
  where cs.id = p_course_section_id;

  select * into v_plan from public.course_delivery_plans where course_section_id = p_course_section_id;
  if v_plan.id is null then
    return jsonb_build_object('course', v_course, 'can_manage', v_manage, 'plan', null, 'sessions', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(x order by x_number), '[]'::jsonb) into v_sessions
  from (
    select s.session_number as x_number, jsonb_build_object(
      'plan_session_id', s.id,
      'session_number', s.session_number,
      'planned_title', s.planned_title,
      'planned_topics', s.planned_topics,
      'status', coalesce(e.status, 'not_recorded'),
      'execution_date', e.execution_date,
      'compensation_date', e.compensation_date,
      'reason', case when v_manage then e.reason else null end,
      'notes', case when v_manage then e.notes else null end,
      'recorded_at', e.recorded_at
    ) as x
    from public.course_delivery_plan_sessions s
    left join public.course_session_executions e on e.plan_session_id = s.id
    where s.plan_id = v_plan.id
  ) t;

  return jsonb_build_object(
    'course', v_course,
    'can_manage', v_manage,
    'plan', jsonb_build_object(
      'plan_id', v_plan.id,
      'planned_session_count', v_plan.planned_session_count,
      'status', v_plan.status,
      'published_at', v_plan.published_at
    ),
    'sessions', v_sessions
  );
end $$;

create or replace function public.cdp_list_my_faculty_sections()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'plan_status', coalesce(p.status, 'none'),
    'planned_session_count', coalesce(p.planned_session_count, 0),
    'recorded_count', coalesce(r.recorded, 0),
    'executed_count', coalesce(r.executed, 0)
  ) order by c.code, cs.section_code), '[]'::jsonb) into v_result
  from public.course_sections cs
  join public.course_offerings co on co.id = cs.course_offering_id
  join public.courses c on c.id = co.course_id
  join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
  left join public.course_delivery_plans p on p.course_section_id = cs.id
  left join lateral (
    select count(*) as recorded,
           count(*) filter (where e.status in ('executed','compensated')) as executed
    from public.course_delivery_plan_sessions s
    join public.course_session_executions e on e.plan_session_id = s.id
    where s.plan_id = p.id
  ) r on true
  where fp.user_id = v_uid and cs.status = 'active';
  return v_result;
end $$;

create or replace function public.cdp_list_student_sections()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'plan_status', coalesce(p.status, 'none'),
    'planned_session_count', coalesce(p.planned_session_count, 0),
    'executed_count', coalesce(r.executed, 0)
  ) order by c.code), '[]'::jsonb) into v_result
  from public.student_enrollments se
  join public.student_profiles sp on sp.id = se.student_profile_id
  join public.course_sections cs on cs.id = se.course_section_id
  join public.course_offerings co on co.id = cs.course_offering_id
  join public.courses c on c.id = co.course_id
  left join public.course_delivery_plans p on p.course_section_id = cs.id
  left join lateral (
    select count(*) filter (where e.status in ('executed','compensated')) as executed
    from public.course_delivery_plan_sessions s
    join public.course_session_executions e on e.plan_session_id = s.id
    where s.plan_id = p.id
  ) r on true
  where sp.user_id = v_uid and se.enrollment_status = 'enrolled';
  return v_result;
end $$;

create or replace function public.cdp_admin_delivery_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  if not (public.has_role(v_uid,'admin'::public.app_role)
       or public.has_role(v_uid,'system_admin'::public.app_role)
       or public.has_role(v_uid,'dean'::public.app_role)
       or public.has_role(v_uid,'registrar'::public.app_role)
       or public.has_role(v_uid,'department_head'::public.app_role)) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.course_code, t.section_code), '[]'::jsonb)
  into v_result
  from (
    select
      cs.id as course_section_id,
      c.code as course_code,
      c.name_ar as course_name_ar,
      cs.section_code,
      d.name_ar as department_name_ar,
      coalesce(f.full_name, '') as faculty_name,
      coalesce(p.status, 'none') as plan_status,
      coalesce(p.planned_session_count, 0) as planned_count,
      coalesce(agg.executed, 0) as executed_count,
      coalesce(agg.compensated, 0) as compensated_count,
      coalesce(agg.not_executed, 0) as not_executed_count,
      coalesce(agg.uncompensated, 0) as uncompensated_count,
      greatest(coalesce(p.planned_session_count,0) - coalesce(agg.recorded,0), 0) as pending_count,
      case when coalesce(p.planned_session_count,0) = 0 then 0
        else round((coalesce(agg.executed,0)::numeric / p.planned_session_count) * 100, 1) end as coverage_percent
    from public.course_sections cs
    join public.course_offerings co on co.id = cs.course_offering_id
    join public.courses c on c.id = co.course_id
    left join public.departments d on d.id = c.department_id
    left join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
    left join public.faculty f on f.id = fp.faculty_id
    left join public.course_delivery_plans p on p.course_section_id = cs.id
    left join lateral (
      select
        count(*) as recorded,
        count(*) filter (where e.status in ('executed','compensated')) as executed,
        count(*) filter (where e.status = 'compensated') as compensated,
        count(*) filter (where e.status in ('hindered','postponed','cancelled')) as not_executed,
        count(*) filter (where e.status in ('hindered','postponed')) as uncompensated
      from public.course_delivery_plan_sessions s
      join public.course_session_executions e on e.plan_session_id = s.id
      where s.plan_id = p.id
    ) agg on true
    where cs.status = 'active'
  ) t;
  return v_result;
end $$;

revoke all on function public.cdp_save_plan(uuid, integer, jsonb) from public;
revoke all on function public.cdp_publish_plan(uuid) from public;
revoke all on function public.cdp_record_session_execution(uuid, text, date, text, date, text) from public;
revoke all on function public.cdp_clear_session_execution(uuid) from public;
revoke all on function public.cdp_get_section_plan(uuid) from public;
revoke all on function public.cdp_list_my_faculty_sections() from public;
revoke all on function public.cdp_list_student_sections() from public;
revoke all on function public.cdp_admin_delivery_overview() from public;

grant execute on function public.cdp_save_plan(uuid, integer, jsonb) to authenticated;
grant execute on function public.cdp_publish_plan(uuid) to authenticated;
grant execute on function public.cdp_record_session_execution(uuid, text, date, text, date, text) to authenticated;
grant execute on function public.cdp_clear_session_execution(uuid) to authenticated;
grant execute on function public.cdp_get_section_plan(uuid) to authenticated;
grant execute on function public.cdp_list_my_faculty_sections() to authenticated;
grant execute on function public.cdp_list_student_sections() to authenticated;
grant execute on function public.cdp_admin_delivery_overview() to authenticated;