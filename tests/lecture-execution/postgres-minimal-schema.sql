create extension if not exists pgcrypto;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.departments(id uuid primary key);
create table public.academic_levels(id uuid primary key);
create table public.academic_years(id uuid primary key);
create table public.semesters(id uuid primary key);
create table public.courses(id uuid primary key, department_id uuid references public.departments(id));
create table public.course_offerings(id uuid primary key, course_id uuid, level_id uuid, academic_year_id uuid, semester_id uuid, status text);
create table public.course_sections(id uuid primary key, course_offering_id uuid, faculty_profile_id uuid, status text);
create table public.rooms(id uuid primary key);
create table public.time_slots(id uuid primary key);
create table public.class_schedule(id uuid primary key, course_section_id uuid, faculty_profile_id uuid, room_id uuid, time_slot_id uuid, schedule_type text, status text);
create table public.student_profiles(id uuid primary key,user_id uuid references auth.users(id),department_id uuid references public.departments(id));
create table public.faculty_profiles(id uuid primary key,user_id uuid references auth.users(id),department_id uuid references public.departments(id));
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;

insert into auth.users values
 ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003');
insert into public.departments values
 ('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
insert into public.academic_levels values('60000000-0000-0000-0000-000000000001');
insert into public.academic_years values('60000000-0000-0000-0000-000000000002');
insert into public.semesters values('60000000-0000-0000-0000-000000000003');
insert into public.courses values('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into public.course_offerings values('70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000003','active');
insert into public.course_sections values('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','active');
insert into public.time_slots values('90000000-0000-0000-0000-000000000001');
insert into public.rooms values('90000000-0000-0000-0000-000000000002');
insert into public.class_schedule values('a0000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001','lecture','published');
insert into public.faculty_profiles values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002');
insert into public.student_profiles values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
