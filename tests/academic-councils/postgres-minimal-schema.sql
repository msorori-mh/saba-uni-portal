-- Disposable PG17 stub schema for Academic Councils C0–C3 integrated harness.
-- Synthetic identities only. No production connection.

create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'admin', 'editor', 'viewer', 'system_admin', 'dean',
      'department_head', 'registrar', 'student_affairs',
      'finance_officer', 'faculty_member', 'student', 'graduate'
    );
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create table if not exists public.departments(id uuid primary key);
create table if not exists public.academic_years(id uuid primary key);

do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- Synthetic TEST_ONLY roster
insert into auth.users(id) values
 ('a1000000-0000-0000-0000-000000000001'), -- system_admin (no council membership)
 ('a1000000-0000-0000-0000-000000000002'), -- admin (no council membership)
 ('a1000000-0000-0000-0000-000000000003'), -- dean (no council membership)
 ('a1000000-0000-0000-0000-000000000011'), -- chair same council
 ('a1000000-0000-0000-0000-000000000012'), -- chair other council
 ('a1000000-0000-0000-0000-000000000013'), -- secretary same
 ('a1000000-0000-0000-0000-000000000014'), -- member A
 ('a1000000-0000-0000-0000-000000000015'), -- viewer same
 ('a1000000-0000-0000-0000-000000000016'), -- unrelated faculty
 ('a1000000-0000-0000-0000-000000000017'), -- student
 ('a1000000-0000-0000-0000-000000000018'), -- member B / membership link target
 ('a1000000-0000-0000-0000-000000000019')  -- member C
on conflict do nothing;

insert into public.departments(id) values ('d1000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.academic_years(id) values ('b1000000-0000-0000-0000-000000000001') on conflict do nothing;

insert into public.user_roles(user_id, role) values
 ('a1000000-0000-0000-0000-000000000001', 'system_admin'),
 ('a1000000-0000-0000-0000-000000000002', 'admin'),
 ('a1000000-0000-0000-0000-000000000003', 'dean'),
 ('a1000000-0000-0000-0000-000000000011', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000012', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000013', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000014', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000015', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000016', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000017', 'student'),
 ('a1000000-0000-0000-0000-000000000018', 'faculty_member'),
 ('a1000000-0000-0000-0000-000000000019', 'faculty_member')
on conflict do nothing;
