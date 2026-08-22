create schema auth;
create schema storage;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public, auth, storage to authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to public;

create table public.departments (
  id uuid primary key,
  name_ar text not null
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id),
  employee_number text unique,
  full_name_ar text not null,
  department_id uuid references public.departments(id),
  job_title text not null,
  role_type text not null default 'admin_staff',
  status text not null default 'active'
);

create table public.test_admin_users (
  user_id uuid primary key references auth.users(id)
);

create or replace function public.has_any_role(_user_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.test_admin_users a
    where a.user_id = _user_id
  ) and (_roles && array['admin', 'system_admin']::text[]);
$$;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

grant select, insert on storage.objects to authenticated;
grant all on all tables in schema public, auth, storage to service_role;
grant execute on all functions in schema public, auth to service_role;

