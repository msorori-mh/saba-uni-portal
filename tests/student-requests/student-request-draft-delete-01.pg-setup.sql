-- STUDENT-REQUEST-DRAFT-DELETE-01 — verifier-only minimal schema.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.student_profiles(id uuid primary key, user_id uuid references auth.users(id));
create table public.student_requests(
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id),
  request_type text not null,
  status text not null default 'draft',
  submitted_at timestamptz
);
create table public.student_request_workflow_steps(
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id) on delete cascade);
create table public.student_request_workflow_events(
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id) on delete cascade);
create table public.official_documents(
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid references public.student_requests(id) on delete set null);
-- The two production references WITHOUT cascade that block a direct delete.
create table public.b1_draft_mutation_idempotency(
  idempotency_key text primary key,
  request_id uuid not null references public.student_requests(id));
create table public.student_request_attachment_uploads(
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null references public.student_requests(id));
