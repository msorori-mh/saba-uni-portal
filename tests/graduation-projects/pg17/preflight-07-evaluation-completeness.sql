-- READ-ONLY preflight for 20260730100006 (evaluation completeness guard).
\set ON_ERROR_STOP on
begin;
set local transaction read only;
do $$ begin
  if to_regprocedure('public.conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid)') is null then
    raise exception 'PREFLIGHT FAIL: lifecycle missing; apply 20260730100001 first';
  end if;
end $$;
select 'PREFLIGHT-07 EVALUATION-COMPLETENESS OK' as result;
rollback;
