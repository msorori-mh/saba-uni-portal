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
  id uuid not null unique default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
  request_type_id uuid references public.request_types(id),
  status text not null default 'active',
  is_active boolean not null default true
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

create table public.student_request_events (
  id uuid primary key default gen_random_uuid()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid()
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

-- Draft-mutation extensions
alter table public.request_types add column if not exists is_active boolean not null default true;
alter table public.request_types add column if not exists student_visible boolean not null default false;
alter table public.student_requests add column if not exists title text;
alter table public.student_requests add column if not exists description text;
alter table public.student_requests add column if not exists student_notes text;

create table if not exists public.enrollment_suspension_details (
  request_id uuid primary key references public.student_requests(id) on delete cascade,
  requested_from_academic_year_id uuid not null,
  requested_from_semester_id uuid not null,
  suspension_reason text not null,
  suspension_duration_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.absence_excuse_details (
  request_id uuid primary key references public.student_requests(id) on delete cascade,
  course_section_id uuid not null,
  absence_date date not null,
  reason_type text not null default 'other',
  absence_reason_detail text not null default '',
  record_applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transfer_request_details (
  request_id uuid primary key references public.student_requests(id) on delete cascade,
  current_program_id uuid not null,
  requested_program_id uuid not null,
  current_department_id uuid,
  requested_department_id uuid,
  transfer_reason text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.extra_chance_details (
  request_id uuid primary key references public.student_requests(id) on delete cascade,
  academic_year_id uuid not null,
  semester_id uuid not null,
  reason text not null,
  chance_type text not null default 'final_chance',
  chance_applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.file_withdrawal_details (
  request_id uuid primary key references public.student_requests(id) on delete cascade,
  withdrawal_reason text not null,
  impact_ack boolean not null default false,
  library_cleared_at timestamptz,
  labs_cleared_at timestamptz,
  activities_cleared_at timestamptz,
  finance_cleared_at timestamptz,
  records_transferred_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.assert_b1_academic_period_reference(p_academic_year_id uuid, p_semester_id uuid)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if p_academic_year_id is null or p_semester_id is null or not exists (
    select 1 from public.semesters s join public.academic_years y on y.id=s.academic_year_id
    where s.id=p_semester_id and y.id=p_academic_year_id and s.status='active' and y.status='active'
  ) then raise exception 'B1_TRUSTED_ACADEMIC_PERIOD_REQUIRED' using errcode='23503'; end if;
end $$;

create or replace function public.assert_b1_active_course_enrollment(p_student_profile_id uuid, p_course_section_id uuid)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if p_student_profile_id is null or p_course_section_id is null or not exists (
    select 1 from public.student_enrollments e
    join public.course_sections s on s.id=e.course_section_id
    join public.course_offerings o on o.id=s.course_offering_id
    where e.student_profile_id=p_student_profile_id and e.course_section_id=p_course_section_id
      and e.enrollment_status='enrolled' and s.status='active' and o.status='active'
  ) then raise exception 'B1_ACTIVE_COURSE_ENROLLMENT_REQUIRED' using errcode='23503'; end if;
end $$;

create or replace function public.assert_b1_target_program_department(p_program_id uuid, p_department_id uuid)
returns void language plpgsql stable security definer set search_path=public as $$
begin
  if p_program_id is null or p_department_id is null or not exists (
    select 1 from public.programs p join public.departments d on d.id=p.department_id
    where p.id=p_program_id and d.id=p_department_id and p.is_active=true and d.is_active=true
  ) then raise exception 'B1_TARGET_PROGRAM_DEPARTMENT_REQUIRED' using errcode='23503'; end if;
end $$;

revoke all on function public.assert_b1_academic_period_reference(uuid,uuid) from public, anon, authenticated;
revoke all on function public.assert_b1_active_course_enrollment(uuid,uuid) from public, anon, authenticated;
revoke all on function public.assert_b1_target_program_department(uuid,uuid) from public, anon, authenticated;


do $$ begin
  create role service_role nologin;
exception when duplicate_object then null;
end $$;

