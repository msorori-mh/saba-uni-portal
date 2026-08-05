-- NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY
-- Original k3 migration file: supabase/migrations/20260730100002_c8f89b6d-6521-4597-97bc-aae0b837023f.sql
-- Intended apply order: M3 of 8 (original timestamp 20260730100002).
-- Relocated from supabase/migrations/ to docs/migration-drafts/ per source-only mission rules.

-- GRADUATION-PROJECTS-CO-SUPERVISOR-ENUM-01 (forward-only, NOT_APPLIED).
-- Adds the co_supervisor assignment role. Isolated in its own migration because
-- a new enum value cannot be used by statements inside the same transaction;
-- the hardening migration that references it applies strictly after this one.
begin;
do $$ begin
  if to_regtype('public.graduation_project_assignment_role') is null then
    raise exception 'graduation projects foundation missing; apply reviewed foundation first';
  end if;
  if exists(
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'graduation_project_assignment_role' and e.enumlabel = 'co_supervisor'
  ) then
    raise exception 'co_supervisor enum value already exists; refuse ambiguous retry';
  end if;
end $$;
alter type public.graduation_project_assignment_role add value 'co_supervisor';
commit;
