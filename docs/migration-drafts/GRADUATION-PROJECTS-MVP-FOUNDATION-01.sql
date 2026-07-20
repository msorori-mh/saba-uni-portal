-- DRAFT ONLY — DO NOT APPLY. GRADUATION-PROJECTS-MVP-FOUNDATION-01
-- Academic eligibility/team-size/rubric/storage policies remain configuration inputs.
-- No production migration, bucket, policy, workflow, or feature activation is authorized.

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
create table public.graduation_project_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
  role public.graduation_project_assignment_role not null, student_profile_id uuid references public.student_profiles(id) on delete restrict,
  faculty_profile_id uuid references public.faculty_profiles(id) on delete restrict, user_id uuid not null references auth.users(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict, active boolean not null default true,
  assigned_at timestamptz not null default now(), ended_at timestamptz, assigned_by uuid not null references auth.users(id) on delete restrict,
  constraint one_subject check ((student_profile_id is not null)::int + (faculty_profile_id is not null)::int <= 1)
);
create unique index graduation_project_active_assignment on public.graduation_project_assignments(project_id, role, user_id) where active;

create table public.graduation_project_approvals (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 stage text not null, decision text not null check (decision in ('approved','rejected','revision_required')),
 assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict, reason text,
 decided_at timestamptz not null default now(), unique(project_id, stage, assignment_id)
);
create table public.graduation_project_milestones (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 title text not null, sequence_no integer not null check(sequence_no > 0), weight numeric(5,2) not null check(weight > 0 and weight <= 100),
 due_at timestamptz, status text not null default 'pending' check(status in ('pending','in_progress','submitted','accepted','late')),
 completion_percent numeric(5,2) not null default 0 check(completion_percent between 0 and 100), unique(project_id, sequence_no)
);
create table public.graduation_project_submissions (
 id uuid primary key default gen_random_uuid(), milestone_id uuid not null references public.graduation_project_milestones(id) on delete restrict,
 version_no integer not null check(version_no > 0), submitted_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 summary text, state text not null default 'submitted' check(state in ('submitted','accepted','revision_required','superseded')),
 submitted_at timestamptz not null default now(), unique(milestone_id, version_no)
);
create table public.graduation_project_supervisor_notes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 submission_id uuid references public.graduation_project_submissions(id) on delete restrict,
 supervisor_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 note text not null, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.graduation_project_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 submission_id uuid references public.graduation_project_submissions(id) on delete restrict, object_key text not null unique,
 original_name text not null, media_type text not null, byte_size bigint not null check(byte_size > 0), sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 scan_state text not null default 'pending' check(scan_state in ('pending','clean','quarantined','rejected')),
 uploaded_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 created_at timestamptz not null default now(), check(object_key not like 'http%' and object_key not like '%..%')
);
create table public.graduation_project_discussion_requests (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 requested_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 state text not null default 'pending' check(state in ('pending','approved','rejected','cancelled')),
 requested_at timestamptz not null default now(), decided_at timestamptz, decision_reason text
);
create table public.graduation_project_discussions (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.graduation_project_discussion_requests(id) on delete restrict,
 starts_at timestamptz not null, venue text not null, coordinator_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 state text not null default 'scheduled' check(state in ('scheduled','held','postponed','cancelled'))
);
create table public.graduation_project_panel_members (
 id uuid primary key default gen_random_uuid(), discussion_id uuid not null references public.graduation_project_discussions(id) on delete restrict,
 assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 chair boolean not null default false, conflict_declared boolean not null default false, unique(discussion_id, assignment_id)
);
create table public.graduation_project_evaluations (
 id uuid primary key default gen_random_uuid(), discussion_id uuid not null references public.graduation_project_discussions(id) on delete restrict,
 panel_member_id uuid not null references public.graduation_project_panel_members(id) on delete restrict,
 rubric_version text not null, state text not null default 'draft' check(state in ('draft','submitted','finalized')),
 total_score numeric(7,2), comments text, submitted_at timestamptz, finalized_at timestamptz, unique(discussion_id,panel_member_id)
);
create table public.graduation_project_evaluation_scores (
 id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references public.graduation_project_evaluations(id) on delete restrict,
 criterion_code text not null, criterion_label text not null, maximum_score numeric(7,2) not null check(maximum_score > 0),
 awarded_score numeric(7,2) not null check(awarded_score >= 0 and awarded_score <= maximum_score), comment text, unique(evaluation_id,criterion_code)
);
create table public.graduation_project_corrections (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.graduation_projects(id) on delete restrict,
 requested_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 description text not null, due_at timestamptz, completed_at timestamptz, accepted_at timestamptz
);
create table public.graduation_project_final_archives (
 id uuid primary key default gen_random_uuid(), project_id uuid not null unique references public.graduation_projects(id) on delete restrict,
 final_file_id uuid not null references public.graduation_project_files(id) on delete restrict,
 approved_by_assignment_id uuid not null references public.graduation_project_assignments(id) on delete restrict,
 archived_at timestamptz not null default now()
);
create table public.graduation_project_events (
 id bigint generated always as identity primary key, project_id uuid not null references public.graduation_projects(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict, actor_assignment_id uuid references public.graduation_project_assignments(id) on delete restrict,
 event_type text not null, entity_type text not null, entity_id uuid, reason text, correlation_id uuid not null,
 payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);

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
-- Do not create a bucket here. A later separately authorized draft must create a private
-- bucket and storage policies after file-type/size/scanning/retention decisions are approved.
