create extension if not exists pgcrypto;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.departments(id uuid primary key);
create table public.programs(id uuid primary key);
create table public.academic_years(id uuid primary key);
create table public.semesters(id uuid primary key);
create table public.student_profiles(id uuid primary key,user_id uuid references auth.users(id),department_id uuid references public.departments(id));
create table public.faculty_profiles(id uuid primary key,user_id uuid references auth.users(id),department_id uuid references public.departments(id));
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;

insert into auth.users values
 ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.departments values('20000000-0000-0000-0000-000000000001');
insert into public.student_profiles values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into public.faculty_profiles values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
