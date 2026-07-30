-- READ-ONLY preflight for 20260730100007 (panel completeness at held).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regprocedure('public.record_graduation_project_discussion_outcome(uuid,uuid,text,uuid)') is null then
    raise exception 'PREFLIGHT FAIL: lifecycle missing; apply 20260730100001 first';
  end if;
end $$;
select 'PREFLIGHT-08 PANEL-COMPLETENESS OK' as result;
rollback;
