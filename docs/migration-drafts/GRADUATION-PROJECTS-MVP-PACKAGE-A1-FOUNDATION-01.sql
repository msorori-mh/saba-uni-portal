-- DRAFT ONLY -- DO NOT APPLY. GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01
-- Contract: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md @ 7b67539a
-- Package A / A1 foundation: schema, helpers, RLS deny. No lifecycle write RPCs.
-- Bucket prefix graduation-projects/ (private bucket provisioning deferred).
-- Legacy enum values (under_review, discussion_*, corrections_required, completed, cancelled) are unreachable in MVP.

begin;
do $$ begin
  if to_regclass('public.graduation_projects') is not null then
    raise exception 'graduation projects foundation already exists; refuse ambiguous retry';
  end if;
end $$;

create type public.graduation_project_state as enum (
  'draft','submitted','revision_required','rejected','approved','active',
  'defense_scheduled','evaluating','archived',
  'under_review','discussion_requested','discussion_scheduled','corrections_required','completed','cancelled'
);
create type public.graduation_project_assignment_role as enum
  ('student','supervisor','coordinator','panel_member');
create type public.graduation_project_final_decision as enum ('passed','revisions_required','failed');
create type public.graduation_project_file_category as enum ('proposal','progress','final');
create type public.graduation_project_supervision_status as enum ('pending','accepted','declined');
create type public.graduation_project_file_upload_status as enum ('pending','uploaded','active','superseded','rejected');
create type public.graduation_project_scan_state as enum ('pending','clean','quarantined','rejected');

create table public.graduation_project_department_coordinators (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  faculty_profile_id uuid not null references public.faculty_profiles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  constraint gp_dept_coordinator_interval check (
    (active and ended_at is null) or (not active and ended_at is not null and ended_at >= assigned_at)
  )
);
create unique index graduation_project_dept_coordinator_active
  on public.graduation_project_department_coordinators(department_id, user_id) where active;

create table public.graduation_projects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict,
  academic_year_id uuid references public.academic_years(id) on delete restrict,
  semester_id uuid references public.semesters(id) on delete restrict,
  title text,
  problem_statement text,
  objectives text,
  summary text,
  lifecycle_state public.graduation_project_state not null default 'draft',
  final_decision public.graduation_project_final_decision,
  average_score numeric(5,2) check (average_score is null or (average_score >= 0 and average_score <= 100)),
  version bigint not null default 1,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_projects_title_length check (
    title is null or btrim(title) = '' or length(btrim(title)) between 3 and 300
  )
);
alter table public.graduation_projects add constraint graduation_projects_id_department_key unique (id, department_id);

create table public.graduation_project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  role public.graduation_project_assignment_role not null,
  student_profile_id uuid references public.student_profiles(id) on delete restrict,
  faculty_profile_id uuid references public.faculty_profiles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  is_leader boolean not null default false,
  supervision_status public.graduation_project_supervision_status,
  active boolean not null default true,
  processing_unit_id uuid generated always as (department_id) stored,
  processing_role public.graduation_project_assignment_role generated always as (role) stored,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  constraint assignment_subject_shape check (
    (role = 'student' and student_profile_id is not null and faculty_profile_id is null) or
    (role in ('supervisor','coordinator','panel_member') and faculty_profile_id is not null and student_profile_id is null)
  ),
  constraint assignment_leader_shape check (not is_leader or role = 'student'),
  constraint assignment_supervision_shape check (
    (role = 'supervisor') = (supervision_status is not null)
  ),
  constraint assignment_supervision_active check (
    role <> 'supervisor' or not active or supervision_status in ('pending','accepted','declined')
  ),
  constraint assignment_interval check (
    (active and ended_at is null) or (not active and ended_at is not null and ended_at >= assigned_at)
  ),
  constraint assignment_project_department_fk foreign key (project_id, department_id)
    references public.graduation_projects(id, department_id) on delete restrict,
  unique (id, project_id)
);
create unique index graduation_project_active_assignment
  on public.graduation_project_assignments(project_id, role, user_id) where active;
create unique index graduation_project_one_leader
  on public.graduation_project_assignments(project_id) where active and is_leader;
create unique index graduation_project_one_active_student_team
  on public.graduation_project_assignments(user_id) where role = 'student' and active;
create unique index graduation_project_one_pending_supervisor
  on public.graduation_project_assignments(project_id)
  where role = 'supervisor' and active and supervision_status in ('pending','accepted');

create table public.graduation_project_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  stage text not null,
  decision text not null check (decision in ('approved','revision_required','rejected')),
  assignment_id uuid not null,
  reason text,
  decided_at timestamptz not null default now(),
  foreign key (assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
  unique (project_id, stage, assignment_id)
);

create table public.graduation_project_progress_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  summary text not null,
  state text not null check (state in ('submitted','approved','returned','superseded')),
  file_id uuid,
  submitted_by_assignment_id uuid not null,
  reviewed_by_assignment_id uuid,
  review_comments text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (submitted_by_assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict,
  foreign key (reviewed_by_assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict,
  unique (project_id, version_no),
  unique (id, project_id)
);

create table public.graduation_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  category public.graduation_project_file_category not null,
  object_key text not null unique,
  original_name text not null,
  media_type text not null check (media_type = 'application/pdf'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  upload_status public.graduation_project_file_upload_status not null default 'pending',
  scan_state public.graduation_project_scan_state not null default 'pending',
  is_current boolean not null default false,
  uploaded_by_assignment_id uuid not null,
  progress_entry_id uuid,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  superseded_at timestamptz,
  foreign key (uploaded_by_assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict,
  foreign key (progress_entry_id, project_id)
    references public.graduation_project_progress_entries(id, project_id) on delete restrict,
  check (object_key not like 'http%' and object_key not like '%..%'),
  check (object_key like 'graduation-projects/%'),
  unique (id, project_id)
);
create unique index graduation_project_current_proposal_file
  on public.graduation_project_files(project_id) where category = 'proposal' and is_current;
create unique index graduation_project_current_final_file
  on public.graduation_project_files(project_id) where category = 'final' and is_current;

create table public.graduation_project_discussions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.graduation_projects(id) on delete restrict,
  starts_at timestamptz not null,
  venue text not null,
  coordinator_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
  state text not null default 'scheduled' check (state in ('scheduled','held','postponed','cancelled')),
  held_at timestamptz,
  foreign key (coordinator_assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict,
  unique (id, project_id)
);

create table public.graduation_project_panel_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  discussion_id uuid not null,
  assignment_id uuid not null,
  foreign key (discussion_id, project_id)
    references public.graduation_project_discussions(id, project_id) on delete restrict,
  foreign key (assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict,
  unique (discussion_id, assignment_id),
  unique (id, discussion_id, project_id)
);

create table public.graduation_project_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  discussion_id uuid not null,
  panel_member_id uuid not null,
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  notes text,
  state text not null default 'draft' check (state in ('draft','submitted')),
  submitted_at timestamptz,
  foreign key (discussion_id, project_id)
    references public.graduation_project_discussions(id, project_id) on delete restrict,
  foreign key (panel_member_id, discussion_id, project_id)
    references public.graduation_project_panel_members(id, discussion_id, project_id) on delete restrict,
  unique (discussion_id, panel_member_id)
);

create table public.graduation_project_final_archives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.graduation_projects(id) on delete restrict,
  final_file_id uuid not null,
  archived_by_assignment_id uuid not null,
  snapshot jsonb not null,
  average_score numeric(5,2),
  final_decision public.graduation_project_final_decision not null,
  correlation_id uuid not null unique,
  archived_at timestamptz not null default now(),
  foreign key (final_file_id, project_id)
    references public.graduation_project_files(id, project_id) on delete restrict,
  foreign key (archived_by_assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict
);

create table public.graduation_project_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_assignment_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  correlation_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (actor_assignment_id, project_id)
    references public.graduation_project_assignments(id, project_id) on delete restrict,
  unique (project_id, correlation_id, event_type)
);

create function public.guard_graduation_project_assignment() returns trigger
language plpgsql security invoker as $$
declare v_user uuid; v_department uuid;
begin
  if new.student_profile_id is not null then
    select user_id, department_id into v_user, v_department from public.student_profiles where id = new.student_profile_id;
  elsif new.faculty_profile_id is not null then
    select user_id, department_id into v_user, v_department from public.faculty_profiles where id = new.faculty_profile_id;
  else
    v_user := new.user_id; v_department := new.department_id;
  end if;
  if v_user is null or v_user <> new.user_id or v_department is null or v_department <> new.department_id then
    raise exception 'assignment identity/department mismatch';
  end if;
  return new;
end $$;
create trigger guard_graduation_project_assignment before insert or update on public.graduation_project_assignments
for each row execute function public.guard_graduation_project_assignment();

create function public.reject_graduation_project_event_mutation() returns trigger language plpgsql as $$
begin raise exception 'graduation project events are append-only'; end $$;
create trigger graduation_project_events_append_only before update or delete on public.graduation_project_events
for each row execute function public.reject_graduation_project_event_mutation();

create function public.require_graduation_project_assignment(
  p_project_id uuid, p_roles public.graduation_project_assignment_role[]
) returns public.graduation_project_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments;
begin
  select * into a from public.graduation_project_assignments x
  where x.project_id = p_project_id and x.user_id = auth.uid()
    and x.active and x.ended_at is null and x.role = any (p_roles)
    and x.processing_unit_id = x.department_id and x.processing_role = x.role;
  if a.id is null then raise exception 'exact direct processing assignment required'; end if;
  return a;
end $$;

create function public.require_graduation_project_leader(p_project_id uuid)
returns public.graduation_project_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments;
begin
  select * into a from public.graduation_project_assignments x
  where x.project_id = p_project_id and x.user_id = auth.uid()
    and x.active and x.ended_at is null and x.role = 'student' and x.is_leader;
  if a.id is null then raise exception 'exact team leader assignment required'; end if;
  return a;
end $$;

create function public.require_graduation_project_accepted_supervisor(p_project_id uuid)
returns public.graduation_project_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments;
begin
  select * into a from public.graduation_project_assignments x
  where x.project_id = p_project_id and x.user_id = auth.uid()
    and x.active and x.ended_at is null and x.role = 'supervisor'
    and x.supervision_status = 'accepted';
  if a.id is null then raise exception 'accepted supervisor assignment required'; end if;
  return a;
end $$;

create function public.require_graduation_project_department_coordinator(p_department_id uuid)
returns public.graduation_project_department_coordinators
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.graduation_project_department_coordinators;
begin
  select * into c from public.graduation_project_department_coordinators x
  where x.department_id = p_department_id and x.user_id = auth.uid() and x.active and x.ended_at is null;
  if c.id is null then raise exception 'department graduation-project coordinator capability required'; end if;
  return c;
end $$;

create function public.gp_replay_entity(p_project_id uuid, p_correlation_id uuid, p_event_type text)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select entity_id from public.graduation_project_events
  where project_id = p_project_id and correlation_id = p_correlation_id and event_type = p_event_type
  limit 1
$$;

-- Identical-correlation replay: return entity_id when request fingerprint matches;
-- deny changed-payload replay; return null when no prior event.
create function public.gp_take_replay(
  p_project_id uuid, p_correlation_id uuid, p_event_type text, p_request jsonb
) returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_payload jsonb;
begin
  select entity_id, payload into v_id, v_payload
  from public.graduation_project_events
  where project_id = p_project_id and correlation_id = p_correlation_id and event_type = p_event_type
  limit 1;
  if v_id is null then return null; end if;
  if v_payload ? 'request' and v_payload->'request' is distinct from p_request then
    raise exception 'idempotent replay payload mismatch';
  end if;
  return v_id;
end $$;

create function public.is_safe_graduation_project_object_key(p_project_id uuid, p_key text)
returns boolean language sql immutable as $$
  select p_key is not null
    and p_key not like 'http%' and p_key not like '%..%'
    and p_key like 'graduation-projects/' || p_project_id::text || '/%'
$$;

alter table public.graduation_project_department_coordinators enable row level security;
alter table public.graduation_projects enable row level security;
alter table public.graduation_project_assignments enable row level security;
alter table public.graduation_project_approvals enable row level security;
alter table public.graduation_project_progress_entries enable row level security;
alter table public.graduation_project_files enable row level security;
alter table public.graduation_project_discussions enable row level security;
alter table public.graduation_project_panel_members enable row level security;
alter table public.graduation_project_evaluations enable row level security;
alter table public.graduation_project_final_archives enable row level security;
alter table public.graduation_project_events enable row level security;

revoke all on public.graduation_project_department_coordinators,
  public.graduation_projects, public.graduation_project_assignments,
  public.graduation_project_approvals, public.graduation_project_progress_entries,
  public.graduation_project_files, public.graduation_project_discussions,
  public.graduation_project_panel_members, public.graduation_project_evaluations,
  public.graduation_project_final_archives, public.graduation_project_events
  from anon, authenticated, public;

revoke all on function public.require_graduation_project_assignment(uuid, public.graduation_project_assignment_role[]) from public, anon, authenticated;
revoke all on function public.require_graduation_project_leader(uuid) from public, anon, authenticated;
revoke all on function public.require_graduation_project_accepted_supervisor(uuid) from public, anon, authenticated;
revoke all on function public.require_graduation_project_department_coordinator(uuid) from public, anon, authenticated;
revoke all on function public.gp_replay_entity(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.gp_take_replay(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.is_safe_graduation_project_object_key(uuid, text) from public, anon, authenticated;
-- Do not create a bucket here. Lifecycle write RPCs belong to later packages.
commit;
