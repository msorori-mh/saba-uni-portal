-- Disposable PG17 stub schema for Graduation Projects Package A verification.
-- Synthetic identities only. No production connection.

create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists public.departments(id uuid primary key);
create table if not exists public.programs(
  id uuid primary key,
  department_id uuid references public.departments(id),
  is_active boolean not null default true
);
create table if not exists public.academic_years(id uuid primary key);
create table if not exists public.semesters(id uuid primary key);
create table if not exists public.student_profiles(
  id uuid primary key,
  user_id uuid references auth.users(id),
  department_id uuid references public.departments(id),
  program_id uuid references public.programs(id),
  status text not null default 'active',
  full_name_ar text,
  full_name_en text,
  academic_number text
);
create table if not exists public.faculty_profiles(
  id uuid primary key,
  user_id uuid references auth.users(id),
  department_id uuid references public.departments(id),
  program_id uuid references public.programs(id),
  faculty_id uuid,
  status text not null default 'active',
  full_name_ar text,
  full_name_en text,
  employee_number text
);
-- Harness forward-compat when an older programs stub already exists
alter table public.programs add column if not exists department_id uuid;
alter table public.programs add column if not exists is_active boolean not null default true;
alter table public.student_profiles add column if not exists status text not null default 'active';
alter table public.student_profiles add column if not exists full_name_ar text;
alter table public.student_profiles add column if not exists full_name_en text;
alter table public.student_profiles add column if not exists academic_number text;
alter table public.student_profiles add column if not exists program_id uuid;
alter table public.faculty_profiles add column if not exists status text not null default 'active';
alter table public.faculty_profiles add column if not exists full_name_ar text;
alter table public.faculty_profiles add column if not exists full_name_en text;
alter table public.faculty_profiles add column if not exists employee_number text;
alter table public.faculty_profiles add column if not exists program_id uuid;
alter table public.faculty_profiles add column if not exists faculty_id uuid;

-- Canonical academic-level identity used by GP student L4 eligibility guard.
create table if not exists public.academic_levels(
  id uuid primary key,
  name text not null,
  level_number integer not null unique
);
create table if not exists public.student_academic_status(
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id),
  academic_year_id uuid references public.academic_years(id),
  semester_id uuid references public.semesters(id),
  level_id uuid references public.academic_levels(id),
  enrollment_status text not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects(
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(bucket_id, name)
);

-- Private-bucket prerequisite fixture (simulates Lovable Stage S1 storage_create_bucket).
-- A2 asserts this row exists and public=false; it must not create the bucket itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'graduation-projects',
  'graduation-projects',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;

-- Synthetic TEST_ONLY roster UUIDs
insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'), -- leader (L4)
 ('10000000-0000-0000-0000-000000000002'), -- member a (L4)
 ('10000000-0000-0000-0000-000000000003'), -- member b (L4)
 ('10000000-0000-0000-0000-000000000004'), -- unrelated student (L4)
 ('10000000-0000-0000-0000-000000000011'), -- coordinator
 ('10000000-0000-0000-0000-000000000012'), -- supervisor
 ('10000000-0000-0000-0000-000000000013'), -- unrelated supervisor
 ('10000000-0000-0000-0000-000000000014'), -- committee 1
 ('10000000-0000-0000-0000-000000000015'), -- committee 2
 ('10000000-0000-0000-0000-000000000099'), -- unauthorized admin-like faculty
 ('10000000-0000-0000-0000-000000000021'), -- L1 student
 ('10000000-0000-0000-0000-000000000022'), -- L2 student
 ('10000000-0000-0000-0000-000000000023'), -- L3 student
 ('10000000-0000-0000-0000-000000000024')  -- unknown-level student (no status row)
on conflict do nothing;

insert into public.departments(id) values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.programs(id, department_id, is_active) values
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', true),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', true)
on conflict (id) do update
set department_id = excluded.department_id,
    is_active = excluded.is_active;
insert into public.academic_years(id) values ('22000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.semesters(id) values ('23000000-0000-0000-0000-000000000001') on conflict do nothing;

insert into public.student_profiles(id, user_id, department_id) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001'),
 -- Extra synthetic students for L4 eligibility negatives (levels 1/2/3/unknown)
 ('30000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000023','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000024','20000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.academic_levels(id, name, level_number) values
 ('50000000-0000-0000-0000-000000000001', 'المستوى الأول', 1),
 ('50000000-0000-0000-0000-000000000002', 'المستوى الثاني', 2),
 ('50000000-0000-0000-0000-000000000003', 'المستوى الثالث', 3),
 ('50000000-0000-0000-0000-000000000004', 'المستوى الرابع', 4)
on conflict do nothing;

-- Default Package A roster students are L4 so existing verifiers stay green.
insert into public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
values
 ('30000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled'),
 ('30000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled'),
 ('30000000-0000-0000-0000-000000000003','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled'),
 ('30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled'),
 ('30000000-0000-0000-0000-000000000011','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','enrolled'),
 ('30000000-0000-0000-0000-000000000012','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','enrolled'),
 ('30000000-0000-0000-0000-000000000013','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','enrolled')
on conflict do nothing;

insert into public.faculty_profiles(id, user_id, department_id) values
 ('40000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','20000000-0000-0000-0000-000000000001')
on conflict do nothing;
