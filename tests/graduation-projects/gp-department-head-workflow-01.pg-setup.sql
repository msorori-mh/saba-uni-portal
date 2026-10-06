-- GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01 — verifier-only schema additions.
-- Adds the production objects the minimal GP schema does not model. Runs after
-- the canonical GP chain and before the draft migration.
alter table public.semesters
  add column if not exists academic_year_id uuid,
  add column if not exists is_current boolean not null default false,
  add column if not exists start_date date;
alter table public.departments add column if not exists name_ar text;
alter table public.programs add column if not exists name_ar text;
alter table public.faculty_profiles add column if not exists academic_rank text;

create table if not exists public.organizational_positions(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  is_active boolean not null default true,
  department_id uuid,
  is_department_head_position boolean not null default false
);
create table if not exists public.position_assignments(
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.organizational_positions(id),
  user_id uuid not null,
  assigned_from date not null default current_date,
  assigned_to date,
  is_active boolean not null default true
);
