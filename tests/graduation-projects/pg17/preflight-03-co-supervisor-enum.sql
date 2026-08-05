-- READ-ONLY preflight for 20260730100002 (co_supervisor enum value).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regtype('public.graduation_project_assignment_role') is null then
    raise exception 'PREFLIGHT FAIL: assignment role enum missing; apply 20260730100000 first';
  end if;
  if exists(
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'graduation_project_assignment_role' and e.enumlabel = 'co_supervisor'
  ) then
    raise exception 'PREFLIGHT FAIL: co_supervisor enum value already exists; not forward-only here';
  end if;
end $$;
select 'PREFLIGHT-03 CO-SUPERVISOR-ENUM OK' as result;
rollback;
