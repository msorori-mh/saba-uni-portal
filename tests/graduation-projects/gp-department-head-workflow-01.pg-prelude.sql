-- GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01 — verifier-only prelude.
-- Roles and helper stubs the promoted GP migrations expect from the platform.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;
create or replace function public.update_updated_at_column() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
do $$ begin if not exists (select 1 from pg_type where typname='app_role') then
  create type public.app_role as enum ('admin','system_admin','dean','department_head','registrar','student_affairs','finance_officer','faculty_member','student','hr_officer'); end if; end $$;
create table if not exists public.user_roles(id uuid primary key default gen_random_uuid(), user_id uuid not null, role public.app_role not null, unique(user_id, role));
create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.has_any_role(_user_id uuid, _roles text[]) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role::text = any(_roles)) $$;
