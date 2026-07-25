-- Disposable minimal schema for B1 secure-read contracts PG17 verifier.
-- Stubs only what the read migration needs. Never for production.

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  full_name_ar text not null default 'طالب',
  academic_number text not null default 'S1',
  department_id uuid,
  program_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.student_requests (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id),
  request_type text not null,
  request_number text,
  status text not null default 'draft',
  form_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_types (
  code text primary key,
  name_ar text not null
);

create table public.request_processing_units (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name_ar text
);

create table public.request_processing_roles (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name_ar text
);

create table public.request_type_workflows (
  id uuid primary key default gen_random_uuid()
);

create table public.request_type_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.request_type_workflows(id),
  action_type text not null default 'review',
  can_return_to_student boolean not null default false,
  can_reject boolean not null default false
);

create table public.student_request_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id) on delete cascade,
  workflow_id uuid,
  workflow_step_id uuid references public.request_type_workflow_steps(id),
  step_key text not null,
  step_name_ar text not null,
  step_order integer not null default 1,
  processing_unit_id uuid,
  processing_role_id uuid,
  assigned_user_id uuid,
  status text not null default 'pending',
  entered_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  decision text,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_request_attachment_uploads (
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id) on delete cascade,
  student_profile_id uuid not null references public.student_profiles(id),
  field_key text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_bucket text not null default 'student-request-secure-attachments',
  storage_object_path text not null default 'x',
  upload_status text not null default 'attached',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_current boolean not null default false,
  status text not null default 'active',
  start_date date not null default current_date,
  end_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id),
  name text not null,
  code text not null default '1',
  is_current boolean not null default false,
  status text not null default 'active',
  start_date date not null default current_date,
  end_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  is_active boolean not null default true
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null default 'P',
  name_ar text not null,
  department_id uuid references public.departments(id),
  is_active boolean not null default true,
  status text not null default 'active',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name_ar text not null
);

create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id),
  academic_year_id uuid not null references public.academic_years(id),
  semester_id uuid not null references public.semesters(id),
  program_id uuid not null default gen_random_uuid(),
  level_id uuid not null default gen_random_uuid(),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_offering_id uuid not null references public.course_offerings(id),
  section_code text not null default 'A',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id),
  course_section_id uuid not null references public.course_sections(id),
  enrollment_status text not null default 'enrolled',
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exact-assignment stubs used by secure-read RPCs.
create or replace function public.user_matches_workflow_runtime_step(p_step_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.student_request_workflow_steps s
    where s.id = p_step_id and s.assigned_user_id = auth.uid() and s.status = 'active'
  );
$$;

create or replace function public.can_current_user_act_on_step(p_step_id uuid, p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.user_matches_workflow_runtime_step(p_step_id);
$$;

revoke all on function public.user_matches_workflow_runtime_step(uuid) from public, anon;
revoke all on function public.can_current_user_act_on_step(uuid,text) from public, anon;
grant execute on function public.user_matches_workflow_runtime_step(uuid) to authenticated;
grant execute on function public.can_current_user_act_on_step(uuid,text) to authenticated;
