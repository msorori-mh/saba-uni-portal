-- READ-ONLY preflight for 20260730100005 (admin settings & rubrics).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regclass('public.graduation_project_rubrics') is null then
    raise exception 'PREFLIGHT FAIL: hardening missing; apply 20260730100003 first';
  end if;
  if to_regclass('public.graduation_project_settings') is not null then
    raise exception 'PREFLIGHT FAIL: admin settings package already exists; not forward-only here';
  end if;
end $$;
select 'PREFLIGHT-06 ADMIN-SETTINGS OK' as result;
rollback;
