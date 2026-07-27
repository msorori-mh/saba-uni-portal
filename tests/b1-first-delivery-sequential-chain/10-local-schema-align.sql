-- LOCAL DISPOSABLE ONLY — first-delivery sequential chain schema align.
-- Adds Production-present columns missing from rpc-matrix minimal schema.
-- Does NOT activate services (student_visible stays false until Gate25 local).

alter table public.request_types
  add column if not exists student_visible boolean not null default false;

alter table public.student_requests add column if not exists title text;
alter table public.student_requests add column if not exists description text;
alter table public.student_requests add column if not exists student_notes text;

alter table public.academic_years add column if not exists name text;
alter table public.academic_years add column if not exists is_current boolean not null default false;
alter table public.semesters add column if not exists name text;
alter table public.semesters add column if not exists is_current boolean not null default false;
alter table public.programs add column if not exists name_ar text;
alter table public.course_offerings add column if not exists course_id uuid;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text,
  name_ar text
);
