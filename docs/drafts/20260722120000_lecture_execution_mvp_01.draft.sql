-- LECTURE-EXECUTION-MONITORING-MVP-01
-- DRAFT ONLY — DO NOT APPLY.
-- Source-only forward draft for the lecture-execution monitoring foundation.
-- Anchors on merged schedule contracts only: published class_schedule slots
-- (#152), course_sections as legacy source of record (#158), canonical term
-- scoping (#150), exact section binding (#153). Draft #149 is NOT a basis.
-- Delegate adoption (D-15) is pending → delegate confirmation is a
-- configuration-gated path that fails closed while disabled.
-- Forward-only. No drops, no rewrites, no storage buckets, no client-visible
-- event surfaces. Client access only via locked RPCs. Composite
-- (id, department_id) integrity everywhere scope matters.

begin;

-- Refuse ambiguous retry: the foundation must be absent.
do $$
begin
  if to_regclass('public.lecture_execution_sessions') is not null then
    raise exception 'ambiguous retry: lecture_execution_sessions already exists';
  end if;
end $$;

create type lecture_execution_state as enum (
  'executed',
  'hindered',
  'compensated',
  'cancelled',
  'scheduled',
  'in_progress',
  'postponed',
  'not_started'
);

create type lecture_execution_session_kind as enum ('theory', 'practical');

create type lecture_execution_actor_role as enum (
  'faculty_recorder',
  'section_delegate',
  'department_monitor',
  'college_monitor'
);

-- Configuration is source-owned: RLS-enabled with every privilege revoked,
-- so rows change only via separately authorized migrations. The client has
-- no write path at all (D-15 stays pending until explicitly enabled).
create table lecture_execution_settings (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id) on delete restrict,
  term_weeks smallint not null default 15 check (term_weeks between 1 and 30),
  delegate_confirmation_enabled boolean not null default false,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  unique (department_id)
);

create unique index lecture_execution_settings_global_key
  on lecture_execution_settings ((department_id is null))
  where department_id is null;

create table lecture_execution_sessions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete restrict,
  class_schedule_id uuid not null references class_schedule(id) on delete restrict,
  course_section_id uuid not null references course_sections(id) on delete restrict,
  course_id uuid not null references courses(id) on delete restrict,
  level_id uuid not null references academic_levels(id) on delete restrict,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  semester_id uuid not null references semesters(id) on delete restrict,
  room_id uuid references rooms(id) on delete restrict,
  faculty_profile_id uuid not null references faculty_profiles(id) on delete restrict,
  week_no smallint not null check (week_no between 1 and 30),
  session_kind lecture_execution_session_kind not null,
  state lecture_execution_state not null default 'not_started',
  confirmation_status text not null default 'faculty_final'
    check (confirmation_status in ('faculty_final', 'awaiting_delegate', 'confirmed', 'rejected')),
  reason text,
  recorded_by_assignment_id uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One execution record per published slot per numbered week per kind.
  unique (class_schedule_id, week_no, session_kind),
  unique (id, department_id)
);

create index lecture_execution_sessions_department_idx on lecture_execution_sessions (department_id);
create index lecture_execution_sessions_level_idx on lecture_execution_sessions (level_id);
create index lecture_execution_sessions_course_idx on lecture_execution_sessions (course_id);

create table lecture_execution_actor_assignments (
  id uuid primary key default gen_random_uuid(),
  role lecture_execution_actor_role not null,
  faculty_profile_id uuid references faculty_profiles(id) on delete restrict,
  student_profile_id uuid references student_profiles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references departments(id) on delete restrict,
  course_section_id uuid references course_sections(id) on delete restrict,
  level_id uuid references academic_levels(id) on delete restrict,
  active boolean not null default true,
  processing_unit_id uuid generated always as (department_id) stored,
  processing_role lecture_execution_actor_role generated always as (role) stored,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  unique (id, department_id),
  check (
    (role in ('faculty_recorder', 'department_monitor', 'college_monitor')
      and faculty_profile_id is not null and student_profile_id is null)
    or (role = 'section_delegate'
      and student_profile_id is not null and faculty_profile_id is null)
  ),
  check (role <> 'faculty_recorder' or course_section_id is not null),
  check (role <> 'section_delegate' or level_id is not null),
  check (ended_at is null or ended_at >= assigned_at)
);

create unique index lecture_execution_actor_assignments_active_key
  on lecture_execution_actor_assignments (
    role, user_id, department_id,
    coalesce(course_section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(level_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where active;

create table lecture_execution_confirmations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  department_id uuid not null,
  delegate_assignment_id uuid not null,
  decision text not null check (decision in ('confirmed', 'rejected')),
  note text,
  decided_at timestamptz not null default now(),
  foreign key (session_id, department_id)
    references lecture_execution_sessions (id, department_id) on delete restrict,
  foreign key (delegate_assignment_id, department_id)
    references lecture_execution_actor_assignments (id, department_id) on delete restrict,
  -- Exactly one confirmation decision per session record; corrections flow
  -- through a new faculty recording (version bump), not an edit.
  unique (session_id)
);

create table lecture_execution_events (
  id bigint generated always as identity primary key,
  department_id uuid not null,
  session_id uuid,
  actor_user_id uuid not null,
  actor_assignment_id uuid,
  event_type text not null
    check (event_type in ('execution_recorded', 'execution_confirmed', 'execution_rejected')),
  entity_type text not null check (entity_type = 'lecture_execution_session'),
  entity_id uuid not null,
  reason text,
  correlation_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (session_id, department_id)
    references lecture_execution_sessions (id, department_id) on delete restrict,
  foreign key (actor_assignment_id, department_id)
    references lecture_execution_actor_assignments (id, department_id) on delete restrict,
  unique (department_id, correlation_id, event_type)
);

create index lecture_execution_events_session_idx on lecture_execution_events (session_id);

-- Assignment identity guard: the assigned profile must belong to the same
-- user and department as the assignment row.
create or replace function lecture_execution_guard_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role in ('faculty_recorder', 'department_monitor', 'college_monitor') then
    if not exists (
      select 1 from faculty_profiles fp
      where fp.id = new.faculty_profile_id
        and fp.user_id = new.user_id
        and fp.department_id = new.department_id
    ) then
      raise exception 'staff assignment must reference a faculty profile owned by the same user in the same department';
    end if;
  elsif new.role = 'section_delegate' then
    if not exists (
      select 1 from student_profiles sp
      where sp.id = new.student_profile_id
        and sp.user_id = new.user_id
        and sp.department_id = new.department_id
    ) then
      raise exception 'delegate assignment must reference a student profile owned by the same user in the same department';
    end if;
  end if;
  return new;
end $$;

create trigger lecture_execution_guard_assignment
before insert or update on lecture_execution_actor_assignments
for each row execute function lecture_execution_guard_assignment();

-- Append-only event journal.
create or replace function lecture_execution_events_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'lecture_execution_events is append-only';
end $$;

create trigger lecture_execution_events_no_update
before update on lecture_execution_events
for each row execute function lecture_execution_events_append_only();

create trigger lecture_execution_events_no_delete
before delete on lecture_execution_events
for each row execute function lecture_execution_events_append_only();

-- Mirrors src/lib/lecture-execution/domain.ts exactly.
create or replace function lecture_execution_transition_allowed(
  p_from lecture_execution_state,
  p_to lecture_execution_state
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_from = 'not_started' then p_to in ('scheduled', 'cancelled')
    when p_from = 'scheduled' then p_to in ('in_progress', 'executed', 'hindered', 'postponed', 'cancelled')
    when p_from = 'in_progress' then p_to in ('executed', 'hindered')
    when p_from = 'postponed' then p_to in ('scheduled', 'cancelled')
    when p_from = 'hindered' then p_to in ('compensated', 'cancelled')
    else false
  end
$$;

create or replace function require_lecture_execution_assignment(
  p_department_id uuid,
  p_roles lecture_execution_actor_role[]
) returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from lecture_execution_actor_assignments a
  where a.department_id = p_department_id
    and a.role = any (p_roles)
    and a.user_id = auth.uid()
    and a.active
  limit 1;
  if v_id is null then
    raise exception 'missing active lecture-execution assignment for this department';
  end if;
  return v_id;
end $$;

-- Faculty records (or advances) the execution state of one published slot
-- for one numbered week. Fail-closed: only a published slot on an active
-- section/offering, only the assigned recorder of that exact section.
create or replace function record_lecture_execution(
  p_class_schedule_id uuid,
  p_week_no smallint,
  p_session_kind lecture_execution_session_kind,
  p_state lecture_execution_state,
  p_reason text default null,
  p_correlation_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_entity uuid;
  v_slot record;
  v_department uuid;
  v_faculty uuid;
  v_assignment uuid;
  v_term_weeks smallint := 15;
  v_delegate_enabled boolean := false;
  v_session lecture_execution_sessions%rowtype;
  v_confirmation text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select e.entity_id into v_existing_entity
  from lecture_execution_events e
  where e.event_type = 'execution_recorded'
    and e.correlation_id = p_correlation_id
    and e.actor_user_id = v_uid;
  if v_existing_entity is not null then
    return v_existing_entity;
  end if;

  select cs.id as class_schedule_id, cs.status as schedule_status,
         cs.schedule_type, cs.room_id,
         coalesce(cs.faculty_profile_id, sec.faculty_profile_id) as faculty_profile_id,
         sec.id as course_section_id, sec.status as section_status,
         off.status as offering_status, off.course_id, off.level_id,
         off.academic_year_id, off.semester_id,
         c.department_id
  into v_slot
  from class_schedule cs
  join course_sections sec on sec.id = cs.course_section_id
  join course_offerings off on off.id = sec.course_offering_id
  join courses c on c.id = off.course_id
  where cs.id = p_class_schedule_id;

  if v_slot is null then
    raise exception 'class schedule slot not found';
  end if;
  if v_slot.schedule_status <> 'published' then
    raise exception 'only published schedule slots can be tracked';
  end if;
  if v_slot.section_status <> 'active' or v_slot.offering_status <> 'active' then
    raise exception 'schedule slot is not on an active section/offering';
  end if;
  if v_slot.department_id is null or v_slot.level_id is null then
    raise exception 'schedule slot lacks department or academic level';
  end if;
  if v_slot.faculty_profile_id is null then
    raise exception 'schedule slot has no assigned faculty member';
  end if;
  if not (
    (v_slot.schedule_type = 'lecture' and p_session_kind = 'theory')
    or (v_slot.schedule_type = 'lab' and p_session_kind = 'practical')
  ) then
    raise exception 'session kind does not match the published schedule slot type';
  end if;

  v_department := v_slot.department_id;
  v_faculty := v_slot.faculty_profile_id;

  select a.id into v_assignment
  from lecture_execution_actor_assignments a
  where a.department_id = v_department
    and a.role = 'faculty_recorder'
    and a.user_id = v_uid
    and a.active
    and a.course_section_id = v_slot.course_section_id
  limit 1;
  if v_assignment is null then
    raise exception 'missing active faculty recorder assignment for this exact section';
  end if;

  select s.term_weeks, s.delegate_confirmation_enabled
  into v_term_weeks, v_delegate_enabled
  from lecture_execution_settings s
  where s.department_id = v_department
  limit 1;
  if not found then
    select s.term_weeks, s.delegate_confirmation_enabled
    into v_term_weeks, v_delegate_enabled
    from lecture_execution_settings s
    where s.department_id is null
    limit 1;
  end if;
  v_term_weeks := coalesce(v_term_weeks, 15);
  v_delegate_enabled := coalesce(v_delegate_enabled, false);

  if p_week_no is null or p_week_no < 1 or p_week_no > v_term_weeks then
    raise exception 'week number % is outside the configured term weeks (1..%)', p_week_no, v_term_weeks;
  end if;

  v_confirmation := case when v_delegate_enabled then 'awaiting_delegate' else 'faculty_final' end;

  select * into v_session
  from lecture_execution_sessions
  where class_schedule_id = p_class_schedule_id
    and week_no = p_week_no
    and session_kind = p_session_kind
  for update;

  if not found then
    if not lecture_execution_transition_allowed('not_started', p_state) then
      raise exception 'invalid initial execution transition: not_started -> %', p_state;
    end if;
    insert into lecture_execution_sessions (
      department_id, class_schedule_id, course_section_id, course_id, level_id,
      academic_year_id, semester_id, room_id, faculty_profile_id,
      week_no, session_kind, state, confirmation_status, reason,
      recorded_by_assignment_id
    ) values (
      v_department, p_class_schedule_id, v_slot.course_section_id, v_slot.course_id, v_slot.level_id,
      v_slot.academic_year_id, v_slot.semester_id, v_slot.room_id, v_faculty,
      p_week_no, p_session_kind, p_state, v_confirmation, p_reason,
      v_assignment
    )
    returning * into v_session;
  else
    if v_session.state = p_state then
      return v_session.id; -- natural idempotency: same-state retry is a no-op.
    end if;
    if not lecture_execution_transition_allowed(v_session.state, p_state) then
      raise exception 'invalid execution transition: % -> %', v_session.state, p_state;
    end if;
    update lecture_execution_sessions
    set state = p_state,
        confirmation_status = v_confirmation,
        reason = coalesce(p_reason, reason),
        recorded_by_assignment_id = v_assignment,
        version = version + 1,
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  insert into lecture_execution_events (
    department_id, session_id, actor_user_id, actor_assignment_id,
    event_type, entity_type, entity_id, reason, correlation_id, payload
  ) values (
    v_department, v_session.id, v_uid, v_assignment,
    'execution_recorded', 'lecture_execution_session', v_session.id, p_reason, p_correlation_id,
    jsonb_build_object('state', p_state, 'week_no', p_week_no, 'session_kind', p_session_kind)
  );

  return v_session.id;
end $$;

-- Delegate confirms or rejects a recorded execution. Fails closed while
-- D-15 keeps delegate confirmation disabled in lecture_execution_settings.
create or replace function confirm_lecture_execution(
  p_session_id uuid,
  p_decision text,
  p_note text default null,
  p_correlation_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_entity uuid;
  v_session lecture_execution_sessions%rowtype;
  v_delegate_enabled boolean := false;
  v_assignment uuid;
  v_event text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'decision must be confirmed or rejected';
  end if;
  if p_decision = 'rejected' and (p_note is null or btrim(p_note) = '') then
    raise exception 'a rejection note is required';
  end if;

  v_event := case when p_decision = 'confirmed' then 'execution_confirmed' else 'execution_rejected' end;
  select e.entity_id into v_existing_entity
  from lecture_execution_events e
  where e.event_type = v_event
    and e.correlation_id = p_correlation_id
    and e.actor_user_id = v_uid;
  if v_existing_entity is not null then
    return v_existing_entity;
  end if;

  select * into v_session
  from lecture_execution_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'execution session not found';
  end if;

  select s.delegate_confirmation_enabled into v_delegate_enabled
  from lecture_execution_settings s
  where s.department_id = v_session.department_id
  limit 1;
  if not found then
    select s.delegate_confirmation_enabled into v_delegate_enabled
    from lecture_execution_settings s
    where s.department_id is null
    limit 1;
  end if;
  if not coalesce(v_delegate_enabled, false) then
    raise exception 'delegate confirmation is not enabled (D-15 pending)';
  end if;

  select a.id into v_assignment
  from lecture_execution_actor_assignments a
  where a.department_id = v_session.department_id
    and a.role = 'section_delegate'
    and a.user_id = v_uid
    and a.active
    and a.level_id = v_session.level_id
  limit 1;
  if v_assignment is null then
    raise exception 'missing active delegate assignment for this level';
  end if;
  if v_session.confirmation_status <> 'awaiting_delegate' then
    raise exception 'session is not awaiting delegate confirmation';
  end if;

  insert into lecture_execution_confirmations (
    session_id, department_id, delegate_assignment_id, decision, note
  ) values (
    v_session.id, v_session.department_id, v_assignment, p_decision, p_note
  );

  update lecture_execution_sessions
  set confirmation_status = p_decision,
      version = version + 1,
      updated_at = now()
  where id = v_session.id;

  insert into lecture_execution_events (
    department_id, session_id, actor_user_id, actor_assignment_id,
    event_type, entity_type, entity_id, reason, correlation_id, payload
  ) values (
    v_session.department_id, v_session.id, v_uid, v_assignment,
    v_event, 'lecture_execution_session', v_session.id, p_note, p_correlation_id,
    jsonb_build_object('decision', p_decision)
  );

  return v_session.id;
end $$;

-- Reporting source surface (never client-readable): execution-rate breakdown
-- by department / level / course for head-of-department and dean monitors.
create or replace view lecture_execution_reporting
with (security_invoker = true) as
select
  department_id,
  level_id,
  course_id,
  count(*)::bigint as planned,
  count(*) filter (where state in ('executed', 'compensated'))::bigint as delivered,
  count(*) filter (where state in ('hindered', 'cancelled'))::bigint as missed,
  count(*) filter (where state in ('not_started', 'scheduled', 'in_progress', 'postponed'))::bigint as pending,
  count(*) filter (where confirmation_status = 'awaiting_delegate')::bigint as awaiting_delegate,
  round(count(*) filter (where state in ('executed', 'compensated'))::numeric / nullif(count(*), 0), 3) as execution_rate
from lecture_execution_sessions
group by department_id, level_id, course_id;

alter table lecture_execution_settings enable row level security;
alter table lecture_execution_sessions enable row level security;
alter table lecture_execution_actor_assignments enable row level security;
alter table lecture_execution_confirmations enable row level security;
alter table lecture_execution_events enable row level security;

revoke all on table lecture_execution_settings from anon, authenticated;
revoke all on table lecture_execution_sessions from anon, authenticated;
revoke all on table lecture_execution_actor_assignments from anon, authenticated;
revoke all on table lecture_execution_confirmations from anon, authenticated;
revoke all on table lecture_execution_events from anon, authenticated;
revoke all on lecture_execution_reporting from anon, authenticated;

revoke all on function require_lecture_execution_assignment(uuid, lecture_execution_actor_role[]) from public, anon, authenticated;
revoke all on function lecture_execution_transition_allowed(lecture_execution_state, lecture_execution_state) from public, anon, authenticated;
revoke all on function record_lecture_execution(uuid, smallint, lecture_execution_session_kind, lecture_execution_state, text, uuid) from public, anon;
revoke all on function confirm_lecture_execution(uuid, text, text, uuid) from public, anon;
grant execute on function record_lecture_execution(uuid, smallint, lecture_execution_session_kind, lecture_execution_state, text, uuid) to authenticated;
grant execute on function confirm_lecture_execution(uuid, text, text, uuid) to authenticated;

commit;
