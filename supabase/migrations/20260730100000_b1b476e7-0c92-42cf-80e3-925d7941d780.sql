-- GRADUATION-PROJECTS-MVP-FOUNDATION-01 packaged as forward-only migration (NOT_APPLIED).
-- Source: docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql (PG17-verified).
-- Academic eligibility/team-size/rubric/storage policies remain configuration inputs.

begin;
do $$ begin
  if to_regclass('public.graduation_projects') is not null then
    raise exception 'graduation projects foundation already exists; refuse ambiguous retry';
  end if;
end $$;

create type public.graduation_project_state as enum (
  'draft','submitted','under_review','revision_required','approved','active',
  'discussion_requested','discussion_scheduled','evaluating','corrections_required',
  'completed','archived','rejected','cancelled'
);
create type public.graduation_project_assignment_role as enum
  ('student','supervisor','coordinator','department_head','dean','panel_member');

create table public.graduation_projects (
  id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id) on delete restrict,
  program_id uuid references public.programs(id) on delete restrict, academic_year_id uuid references public.academic_years(id) on delete restrict,
  semester_id uuid references public.semesters(id) on delete restrict, proposal_title text not null check (length(trim(proposal_title)) between 3 and 300),
  proposal_abstract text, state public.graduation_project_state not null default 'draft', progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  at_risk boolean not null default false, version bigint not null default 1, approved_at timestamptz, completed_at timestamptz,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.graduation_projects add constraint graduation_projects_id_department_key unique(id, department_id);
create table public.graduation_project_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
  role public.graduation_project_assignment_role not null, student_profile_id uuid references public.student_profiles(id) on delete restrict,
  faculty_profile_id uuid references public.faculty_profiles(id) on delete restrict, user_id uuid not null references auth.users(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict, active boolean not null default true,
  processing_unit_id uuid generated always as (department_id) stored,
  processing_role public.graduation_project_assignment_role generated always as (role) stored,
  assigned_at timestamptz not null default now(), ended_at timestamptz, assigned_by uuid not null references auth.users(id) on delete restrict,
  constraint assignment_subject_shape check (
    (role = 'student' and student_profile_id is not null and faculty_profile_id is null) or
    (role in ('supervisor','coordinator','department_head','dean','panel_member') and faculty_profile_id is not null and student_profile_id is null)
  ),
  constraint assignment_interval check ((active and ended_at is null) or (not active and ended_at is not null and ended_at >= assigned_at)),
  constraint assignment_project_department_fk foreign key(project_id, department_id)
    references public.graduation_projects(id, department_id) on delete restrict,
  unique(id, project_id)
);
create unique index graduation_project_active_assignment on public.graduation_project_assignments(project_id, role, user_id) where active;

create table public.graduation_project_approvals (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 stage text not null, decision text not null check (decision in ('approved','rejected','revision_required')),
 assignment_id uuid not null, reason text,
 foreign key(assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 decided_at timestamptz not null default now(), unique(project_id, stage, assignment_id)
);
create table public.graduation_project_milestones (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 title text not null, milestone_kind text not null default 'progress' check(milestone_kind in ('progress','final')),
 sequence_no integer not null check(sequence_no > 0), weight numeric(5,2) not null check(weight > 0 and weight <= 100),
 due_at timestamptz, status text not null default 'pending' check(status in ('pending','in_progress','submitted','accepted','late')),
 completion_percent numeric(5,2) not null default 0 check(completion_percent between 0 and 100), unique(project_id, sequence_no), unique(id, project_id)
);
create table public.graduation_project_submissions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 milestone_id uuid not null,
 version_no integer not null check(version_no > 0), submitted_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 summary text, state text not null default 'submitted' check(state in ('submitted','accepted','revision_required','superseded')),
 submitted_at timestamptz not null default now(), accepted_at timestamptz,
 foreign key(milestone_id, project_id) references public.graduation_project_milestones(id, project_id) on delete restrict,
 foreign key(submitted_by_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 unique(milestone_id, version_no), unique(id, project_id)
);
create table public.graduation_project_supervisor_notes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 submission_id uuid, supervisor_assignment_id uuid not null,
 foreign key(submission_id, project_id) references public.graduation_project_submissions(id, project_id) on delete restrict,
 foreign key(supervisor_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 note text not null, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.graduation_project_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 submission_id uuid, object_key text not null unique,
 original_name text not null, media_type text not null, byte_size bigint not null check(byte_size > 0), sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 scan_state text not null default 'pending' check(scan_state in ('pending','clean','quarantined','rejected')),
 uploaded_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 created_at timestamptz not null default now(),
 foreign key(submission_id, project_id) references public.graduation_project_submissions(id, project_id) on delete restrict,
 foreign key(uploaded_by_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 check(object_key not like 'http%' and object_key not like '%..%'), unique(id, project_id)
);
create table public.graduation_project_discussion_requests (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 requested_by_assignment_id uuid not null,
 state text not null default 'pending' check(state in ('pending','approved','rejected','cancelled')),
 requested_at timestamptz not null default now(), decided_at timestamptz, decision_reason text,
 foreign key(requested_by_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 unique(id, project_id)
);
create table public.graduation_project_discussions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 request_id uuid not null unique,
 starts_at timestamptz not null, venue text not null, coordinator_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 state text not null default 'scheduled' check(state in ('scheduled','held','postponed','cancelled')),
 foreign key(request_id, project_id) references public.graduation_project_discussion_requests(id, project_id) on delete restrict,
 foreign key(coordinator_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 unique(id, project_id)
);
create table public.graduation_project_panel_members (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 discussion_id uuid not null, assignment_id uuid not null,
 chair boolean not null default false, conflict_declared boolean not null default false,
 foreign key(discussion_id, project_id) references public.graduation_project_discussions(id, project_id) on delete restrict,
 foreign key(assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 unique(discussion_id, assignment_id), unique(id, discussion_id, project_id)
);
create table public.graduation_project_evaluations (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 discussion_id uuid not null, panel_member_id uuid not null,
 rubric_version text not null, state text not null default 'draft' check(state in ('draft','submitted','finalized')),
 total_score numeric(7,2), comments text, submitted_at timestamptz, finalized_at timestamptz,
 foreign key(discussion_id, project_id) references public.graduation_project_discussions(id, project_id) on delete restrict,
 foreign key(panel_member_id, discussion_id, project_id) references public.graduation_project_panel_members(id, discussion_id, project_id) on delete restrict,
 unique(discussion_id,panel_member_id)
);
create table public.graduation_project_evaluation_scores (
 id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references public.graduation_project_evaluations(id) on delete restrict,
 criterion_code text not null, criterion_label text not null, maximum_score numeric(7,2) not null check(maximum_score > 0),
 awarded_score numeric(7,2) not null check(awarded_score >= 0 and awarded_score <= maximum_score), comment text, unique(evaluation_id,criterion_code)
);
create table public.graduation_project_corrections (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 requested_by_assignment_id uuid not null,
 description text not null, due_at timestamptz, completed_at timestamptz, accepted_at timestamptz,
 foreign key(requested_by_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict
);
create table public.graduation_project_final_archives (
 id uuid primary key default gen_random_uuid(), project_id uuid not null unique references public.graduation_projects(id) on delete restrict,
 final_file_id uuid not null, approved_by_assignment_id uuid not null,
 archived_at timestamptz not null default now(), correlation_id uuid not null unique,
 foreign key(final_file_id, project_id) references public.graduation_project_files(id, project_id) on delete restrict,
 foreign key(approved_by_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict
);
create table public.graduation_project_events (
 id bigint generated always as identity primary key, project_id uuid not null references public.graduation_projects(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict, actor_assignment_id uuid,
 event_type text not null, entity_type text not null, entity_id uuid, reason text, correlation_id uuid not null,
 payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(),
 foreign key(actor_assignment_id, project_id) references public.graduation_project_assignments(id, project_id) on delete restrict,
 unique(project_id, correlation_id, event_type)
);

create function public.guard_graduation_project_assignment() returns trigger language plpgsql security invoker as $$
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

create function public.graduation_project_is_discussion_ready(p_project_id uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
  select p.state='active'
    and exists(select 1 from public.graduation_project_assignments a where a.project_id=p.id and a.role='student' and a.active)
    and exists(select 1 from public.graduation_project_assignments a where a.project_id=p.id and a.role='supervisor' and a.active)
    and coalesce((select sum(m.weight) from public.graduation_project_milestones m where m.project_id=p.id),0)=100
    and not exists(select 1 from public.graduation_project_milestones m where m.project_id=p.id and m.status<>'accepted')
    and not exists(select 1 from public.graduation_project_corrections c where c.project_id=p.id and c.accepted_at is null)
    and exists(select 1 from public.graduation_project_files f join public.graduation_project_submissions s
      on (s.id,s.project_id)=(f.submission_id,f.project_id) join public.graduation_project_milestones m
      on (m.id,m.project_id)=(s.milestone_id,s.project_id)
      where f.project_id=p.id and f.scan_state='clean' and s.state='accepted' and m.milestone_kind='final')
  from public.graduation_projects p where p.id=p_project_id
$$;

create view public.graduation_project_reporting with (security_invoker=true) as
select p.id project_id,p.department_id,p.state,p.progress_percent,p.at_risk,
  count(distinct a.id) filter(where a.role='supervisor' and a.active) supervisor_count,
  count(distinct m.id) filter(where m.due_at<now() and m.status not in ('accepted')) overdue_milestones,
  public.graduation_project_is_discussion_ready(p.id) discussion_ready
from public.graduation_projects p
left join public.graduation_project_assignments a on a.project_id=p.id
left join public.graduation_project_milestones m on m.project_id=p.id
group by p.id;

create function public.archive_graduation_project(
  p_project_id uuid, p_final_file_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor public.graduation_project_assignments; v_project public.graduation_projects; v_file public.graduation_project_files; v_id uuid;
begin
  select * into v_project from public.graduation_projects where id=p_project_id for update;
  if v_project.id is null then raise exception 'project not found'; end if;
  select * into v_actor from public.graduation_project_assignments where project_id=p_project_id and user_id=auth.uid()
    and active and role in ('department_head','dean') for update;
  if v_actor.id is null then raise exception 'direct archive assignment required'; end if;
  select id into v_id from public.graduation_project_final_archives where correlation_id=p_correlation_id and project_id=p_project_id;
  if v_id is not null then return v_id; end if;
  if v_project.state <> 'completed' or v_project.version <> p_expected_version then raise exception 'project not archive-ready'; end if;
  select * into v_file from public.graduation_project_files where id=p_final_file_id and project_id=p_project_id and scan_state='clean';
  if v_file.id is null or v_file.submission_id is null or not exists (
    select 1 from public.graduation_project_submissions s join public.graduation_project_milestones m
      on (m.id,m.project_id)=(s.milestone_id,s.project_id)
      where s.id=v_file.submission_id and s.project_id=p_project_id and s.state='accepted'
        and s.accepted_at is not null and m.milestone_kind='final'
  ) or exists (select 1 from public.graduation_project_corrections c where c.project_id=p_project_id and c.accepted_at is null) then
    raise exception 'clean accepted final evidence and accepted corrections required';
  end if;
  insert into public.graduation_project_final_archives(project_id,final_file_id,approved_by_assignment_id,correlation_id)
    values(p_project_id,p_final_file_id,v_actor.id,p_correlation_id) returning id into v_id;
  update public.graduation_projects set state='archived',archived_at=now(),version=version+1 where id=p_project_id and version=p_expected_version;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),v_actor.id,'project_archived','graduation_project_final_archives',v_id,p_correlation_id);
  return v_id;
end $$;

create function public.require_graduation_project_assignment(p_project_id uuid,p_roles public.graduation_project_assignment_role[])
returns public.graduation_project_assignments language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments;
begin
 select * into a from public.graduation_project_assignments x where x.project_id=p_project_id and x.user_id=auth.uid()
   and x.active and x.ended_at is null and x.role=any(p_roles)
   and x.processing_unit_id=x.department_id and x.processing_role=x.role;
 if a.id is null then raise exception 'exact direct processing assignment required'; end if;
 return a;
end $$;

create function public.submit_graduation_project_proposal(p_project_id uuid,p_expected_version bigint,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
begin
 select * into p from public.graduation_projects where id=p_project_id for update;
 a:=public.require_graduation_project_assignment(p_project_id,array['student']::public.graduation_project_assignment_role[]);
 if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='proposal_submitted') then return p_project_id; end if;
 if p.state<>'draft' or p.version<>p_expected_version then raise exception 'proposal transition precondition failed'; end if;
 update public.graduation_projects set state='submitted',version=version+1,updated_at=now() where id=p_project_id;
 insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
 values(p_project_id,auth.uid(),a.id,'proposal_submitted','graduation_projects',p_project_id,p_correlation_id);
 return p_project_id;
end $$;

create function public.add_graduation_project_team_member(p_project_id uuid,p_student_profile_id uuid,p_student_user_id uuid,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
 select * into p from public.graduation_projects where id=p_project_id for update;
 a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
 if p.state not in ('draft','revision_required') then raise exception 'team mutation state denied'; end if;
 select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='team_member_added';
 if new_id is not null then return new_id; end if;
 insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
 values(p_project_id,'student',p_student_profile_id,p_student_user_id,p.department_id,auth.uid()) returning id into new_id;
 insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
 values(p_project_id,auth.uid(),a.id,'team_member_added','graduation_project_assignments',new_id,p_correlation_id);
 return new_id;
end $$;

create function public.set_graduation_project_milestone(p_project_id uuid,p_title text,p_kind text,p_sequence integer,p_weight numeric,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
 select * into p from public.graduation_projects where id=p_project_id for update;
 a:=public.require_graduation_project_assignment(p_project_id,array['supervisor','coordinator']::public.graduation_project_assignment_role[]);
 if p.state not in ('approved','active') then raise exception 'milestone mutation state denied'; end if;
 select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='milestone_set';
 if new_id is not null then return new_id; end if;
 insert into public.graduation_project_milestones(project_id,title,milestone_kind,sequence_no,weight)
 values(p_project_id,p_title,p_kind,p_sequence,p_weight) returning id into new_id;
 insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
 values(p_project_id,auth.uid(),a.id,'milestone_set','graduation_project_milestones',new_id,p_correlation_id);
 return new_id;
end $$;

create function public.request_graduation_project_discussion(p_project_id uuid,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
 select * into p from public.graduation_projects where id=p_project_id for update;
 a:=public.require_graduation_project_assignment(p_project_id,array['student','supervisor']::public.graduation_project_assignment_role[]);
 select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='discussion_requested';
 if new_id is not null then return new_id; end if;
 if not public.graduation_project_is_discussion_ready(p_project_id) then raise exception 'discussion readiness failed'; end if;
 insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id) values(p_project_id,a.id) returning id into new_id;
 update public.graduation_projects set state='discussion_requested',version=version+1 where id=p_project_id and state='active';
 insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
 values(p_project_id,auth.uid(),a.id,'discussion_requested','graduation_project_discussion_requests',new_id,p_correlation_id);
 return new_id;
end $$;

create function public.finalize_graduation_project_evaluation(p_evaluation_id uuid,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; e public.graduation_project_evaluations; d public.graduation_project_discussions; p public.graduation_projects;
begin
 select * into e from public.graduation_project_evaluations where id=p_evaluation_id for update;
 if e.id is null then raise exception 'evaluation not found'; end if;
 select * into d from public.graduation_project_discussions where id=e.discussion_id and project_id=e.project_id for update;
 select * into p from public.graduation_projects where id=e.project_id for update;
 a:=public.require_graduation_project_assignment(e.project_id,array['panel_member']::public.graduation_project_assignment_role[]);
 if not exists(select 1 from public.graduation_project_panel_members where id=e.panel_member_id and assignment_id=a.id and project_id=e.project_id) then raise exception 'evaluator panel assignment mismatch'; end if;
 if exists(select 1 from public.graduation_project_events where project_id=e.project_id and correlation_id=p_correlation_id and event_type='evaluation_finalized') then return e.id; end if;
 if d.state<>'held' or p.state<>'evaluating' then raise exception 'evaluation lifecycle precondition failed'; end if;
 if e.state<>'submitted' or e.total_score is null then raise exception 'evaluation finalization precondition failed'; end if;
 update public.graduation_project_evaluations set state='finalized',finalized_at=now() where id=e.id;
 insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
 values(e.project_id,auth.uid(),a.id,'evaluation_finalized','graduation_project_evaluations',e.id,p_correlation_id);
 return e.id;
end $$;

-- Default deny: grants are intentionally absent. Runtime mutations must be SECURITY INVOKER
-- or narrowly reviewed atomic RPCs that verify auth.uid(), active direct assignment,
-- exact project and department, lifecycle/version preconditions, and append an event.
alter table public.graduation_projects enable row level security;
alter table public.graduation_project_assignments enable row level security;
alter table public.graduation_project_approvals enable row level security;
alter table public.graduation_project_milestones enable row level security;
alter table public.graduation_project_submissions enable row level security;
alter table public.graduation_project_supervisor_notes enable row level security;
alter table public.graduation_project_files enable row level security;
alter table public.graduation_project_discussion_requests enable row level security;
alter table public.graduation_project_discussions enable row level security;
alter table public.graduation_project_panel_members enable row level security;
alter table public.graduation_project_evaluations enable row level security;
alter table public.graduation_project_evaluation_scores enable row level security;
alter table public.graduation_project_corrections enable row level security;
alter table public.graduation_project_final_archives enable row level security;
alter table public.graduation_project_events enable row level security;

revoke all on public.graduation_projects, public.graduation_project_assignments,
 public.graduation_project_approvals, public.graduation_project_milestones,
 public.graduation_project_submissions, public.graduation_project_supervisor_notes,
 public.graduation_project_files, public.graduation_project_discussion_requests,
 public.graduation_project_discussions, public.graduation_project_panel_members,
 public.graduation_project_evaluations, public.graduation_project_evaluation_scores,
 public.graduation_project_corrections, public.graduation_project_final_archives,
 public.graduation_project_events from anon, authenticated;
revoke all on function public.archive_graduation_project(uuid,uuid,bigint,uuid) from public, anon;
grant execute on function public.archive_graduation_project(uuid,uuid,bigint,uuid) to authenticated;
revoke all on function public.require_graduation_project_assignment(uuid,public.graduation_project_assignment_role[]) from public, anon, authenticated;
revoke all on function public.submit_graduation_project_proposal(uuid,bigint,uuid) from public, anon;
revoke all on function public.add_graduation_project_team_member(uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.set_graduation_project_milestone(uuid,text,text,integer,numeric,uuid) from public, anon;
revoke all on function public.request_graduation_project_discussion(uuid,uuid) from public, anon;
revoke all on function public.finalize_graduation_project_evaluation(uuid,uuid) from public, anon;
grant execute on function public.submit_graduation_project_proposal(uuid,bigint,uuid),
 public.add_graduation_project_team_member(uuid,uuid,uuid,uuid),
 public.set_graduation_project_milestone(uuid,text,text,integer,numeric,uuid),
 public.request_graduation_project_discussion(uuid,uuid),
 public.finalize_graduation_project_evaluation(uuid,uuid) to authenticated;
revoke all on function public.graduation_project_is_discussion_ready(uuid) from public, anon, authenticated;
revoke all on public.graduation_project_reporting from public, anon, authenticated;
-- Do not create a bucket here. A later separately authorized draft must create a private
-- bucket and storage policies after file-type/size/scanning/retention decisions are approved.
commit;
