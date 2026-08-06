-- Disposable PG17 stub schema for Graduation Projects Package A verification.
-- Synthetic identities only. No production connection.

create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists public.departments(id uuid primary key);
create table if not exists public.programs(id uuid primary key);
create table if not exists public.academic_years(id uuid primary key);
create table if not exists public.semesters(id uuid primary key);
create table if not exists public.student_profiles(
  id uuid primary key,
  user_id uuid references auth.users(id),
  department_id uuid references public.departments(id)
);
create table if not exists public.faculty_profiles(
  id uuid primary key,
  user_id uuid references auth.users(id),
  department_id uuid references public.departments(id)
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

do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;

-- Synthetic TEST_ONLY roster UUIDs
insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'), -- leader
 ('10000000-0000-0000-0000-000000000002'), -- member a
 ('10000000-0000-0000-0000-000000000003'), -- member b
 ('10000000-0000-0000-0000-000000000004'), -- unrelated student
 ('10000000-0000-0000-0000-000000000011'), -- coordinator
 ('10000000-0000-0000-0000-000000000012'), -- supervisor
 ('10000000-0000-0000-0000-000000000013'), -- unrelated supervisor
 ('10000000-0000-0000-0000-000000000014'), -- committee 1
 ('10000000-0000-0000-0000-000000000015'), -- committee 2
 ('10000000-0000-0000-0000-000000000099')  -- unauthorized admin-like faculty
on conflict do nothing;

insert into public.departments(id) values ('20000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.programs(id) values ('21000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.academic_years(id) values ('22000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.semesters(id) values ('23000000-0000-0000-0000-000000000001') on conflict do nothing;

insert into public.student_profiles(id, user_id, department_id) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.faculty_profiles(id, user_id, department_id) values
 ('40000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000099','20000000-0000-0000-0000-000000000001')
on conflict do nothing;
