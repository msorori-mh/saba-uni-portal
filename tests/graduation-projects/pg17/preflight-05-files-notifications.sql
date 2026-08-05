-- READ-ONLY preflight for 20260730100004 (files & notifications contract).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regclass('public.graduation_project_notification_log') is null then
    raise exception 'PREFLIGHT FAIL: hardening missing; apply 20260730100003 first';
  end if;
  if to_regprocedure('public.list_my_graduation_project_notifications()') is not null then
    raise exception 'PREFLIGHT FAIL: files/notifications package already exists; not forward-only here';
  end if;
end $$;
select 'PREFLIGHT-05 FILES-NOTIFICATIONS OK' as result;
rollback;
