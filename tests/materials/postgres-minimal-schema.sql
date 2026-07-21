-- LEARNING-MATERIALS-SECURE-ACTIVATION-01 — disposable verification harness.
-- Minimal schema substrate for executing
--   docs/drafts/20260721000000_materials_secure_activation.draft.sql
-- on a throwaway PostgreSQL 17 cluster. NOT a production migration.
--
-- It recreates exactly the base objects the draft touches:
--   * prerequisite portal tables (term/section/enrollment/settings/notifications)
--   * the base materials tables verbatim from
--     docs/migrations-design/20260714000000_course_materials_mvp.sql (design-only)
--   * supabase-style roles (anon/authenticated/service_role) + auth.uid() shim
--     driven by the `test.uid` GUC.
--
-- Execution order (see tests/materials/run-postgres-verifier.mjs):
--   1) this file  2) the draft  3) postgres-secure-activation-verifier.sql

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

-- supabase-style roles (no login; disposable cluster).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prerequisite portal tables (minimal columns referenced by the draft).
-- ---------------------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  academic_year_id uuid not null references public.academic_years(id),
  semester_id uuid not null references public.semesters(id),
  program_id uuid,
  level_id uuid
);

create table public.faculty_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'active'
);

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  section_code text,
  status text not null,
  faculty_profile_id uuid not null references public.faculty_profiles(id),
  course_offering_id uuid not null references public.course_offerings(id)
);

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  program_id uuid,
  study_system text
);

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id),
  course_section_id uuid not null references public.course_sections(id),
  enrollment_status text not null
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  message text,
  notification_type text,
  reference_type text,
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.site_settings (
  setting_key text primary key,
  setting_value text,
  setting_group text
);

-- ---------------------------------------------------------------------------
-- Base materials tables — verbatim from
-- docs/migrations-design/20260714000000_course_materials_mvp.sql (design-only).
-- ---------------------------------------------------------------------------
create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_section_id uuid not null references public.course_sections(id) on delete cascade,
  faculty_profile_id uuid not null references public.faculty_profiles(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 2000),
  lecture_number integer check (lecture_number is null or (lecture_number between 1 and 200)),
  study_system text not null check (study_system in ('regular','parallel','both')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_course_materials_section_status on public.course_materials(course_section_id, status);
create index idx_course_materials_faculty on public.course_materials(faculty_profile_id);

create table public.course_material_files (
  id uuid primary key default gen_random_uuid(),
  course_material_id uuid not null references public.course_materials(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 25 * 1024 * 1024),
  file_hash text,
  version_number integer not null default 1 check (version_number >= 1),
  uploaded_at timestamptz not null default now(),
  unique (course_material_id, storage_path)
);
create index idx_material_files_material on public.course_material_files(course_material_id);

create table public.course_material_events (
  id uuid primary key default gen_random_uuid(),
  course_material_id uuid not null references public.course_materials(id) on delete cascade,
  actor_user_id uuid,
  event text not null check (event in ('created','file_uploaded','published','updated','archived','downloaded')),
  meta jsonb,
  created_at timestamptz not null default now()
);
create index idx_material_events_material on public.course_material_events(course_material_id, event);

-- Table grants so role-switched (set role) negative tests exercise function
-- ACLs rather than table ACLs (security-definer bodies run as the owner).
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;

commit;
