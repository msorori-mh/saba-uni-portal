-- READ-ONLY preflight for 20260730100000 (graduation projects foundation).
-- Runs SELECT-only catalog checks; raises on any violated precondition.
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regclass('public.departments') is null
    or to_regclass('public.student_profiles') is null
    or to_regclass('public.faculty_profiles') is null
    or to_regclass('auth.users') is null then
    raise exception 'PREFLIGHT FAIL: portal identity/org backbone tables missing';
  end if;
  if to_regclass('public.graduation_projects') is not null then
    raise exception 'PREFLIGHT FAIL: graduation_projects already exists; foundation migration is not forward-only here';
  end if;
  if to_regtype('public.graduation_project_state') is not null then
    raise exception 'PREFLIGHT FAIL: graduation_project_state enum already exists';
  end if;
end $$;
select 'PREFLIGHT-01 FOUNDATION OK' as result;
rollback;
