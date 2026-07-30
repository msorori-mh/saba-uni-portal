-- READ-ONLY preflight for 20260730100001 (graduation projects lifecycle completion).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regclass('public.graduation_projects') is null
    or to_regclass('public.graduation_project_events') is null then
    raise exception 'PREFLIGHT FAIL: foundation missing; apply 20260730100000 first';
  end if;
  if to_regprocedure('public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)') is not null then
    raise exception 'PREFLIGHT FAIL: lifecycle completion already exists; not forward-only here';
  end if;
end $$;
select 'PREFLIGHT-02 LIFECYCLE OK' as result;
rollback;
