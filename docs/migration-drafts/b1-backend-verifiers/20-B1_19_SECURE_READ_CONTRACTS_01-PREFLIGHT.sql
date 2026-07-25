-- READ ONLY
-- Preflight for B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01
-- Confirms prerequisite helpers exist and secure-read RPCs are not yet installed.

begin;

do $$
begin
  if to_regprocedure('public.user_matches_workflow_runtime_step(uuid)') is null then
    raise exception 'PREFLIGHT_FAIL: user_matches_workflow_runtime_step missing';
  end if;
  if to_regprocedure('public.can_current_user_act_on_step(uuid,text)') is null then
    raise exception 'PREFLIGHT_FAIL: can_current_user_act_on_step missing';
  end if;
  if to_regclass('public.student_requests') is null then
    raise exception 'PREFLIGHT_FAIL: student_requests missing';
  end if;
  if to_regclass('public.student_request_workflow_steps') is null then
    raise exception 'PREFLIGHT_FAIL: student_request_workflow_steps missing';
  end if;
  if to_regprocedure('public.get_b1_secure_read_runtime_capability()') is not null then
    raise exception 'PREFLIGHT_FAIL: secure read contracts already installed';
  end if;
end $$;

select 'PREFLIGHT_OK_B1_SECURE_READ_CONTRACTS_01' as status;

ROLLBACK;
