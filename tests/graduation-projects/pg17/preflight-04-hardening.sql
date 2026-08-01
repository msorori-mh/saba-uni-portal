-- READ-ONLY preflight for 20260730100003 (completion hardening).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regprocedure('public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)') is null then
    raise exception 'PREFLIGHT FAIL: lifecycle missing; apply 20260730100001 first';
  end if;
  if not exists(
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'graduation_project_assignment_role' and e.enumlabel = 'co_supervisor'
  ) then
    raise exception 'PREFLIGHT FAIL: co_supervisor enum value missing; apply 20260730100002 first';
  end if;
  if to_regclass('public.graduation_project_rubrics') is not null
    or to_regclass('public.graduation_project_notification_log') is not null then
    raise exception 'PREFLIGHT FAIL: hardening objects already exist; not forward-only here';
  end if;
end $$;
select 'PREFLIGHT-04 HARDENING OK' as result;
rollback;
