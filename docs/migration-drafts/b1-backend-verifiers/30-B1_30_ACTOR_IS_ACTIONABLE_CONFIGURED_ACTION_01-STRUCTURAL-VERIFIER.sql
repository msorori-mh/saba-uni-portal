-- B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01 — STRUCTURAL VERIFIER
-- Purely structural / static contract checks on the draft SQL text and on the
-- resulting catalog shape. Read-only. Any FAIL = HOLD.

-- Executed inside an explicit READ ONLY transaction; ends with ROLLBACK.
BEGIN READ ONLY;

\echo == S1: helper exists with the exact signature and volatility contract
select
  case when count(*) = 1 then 'PASS' else 'FAIL_HELPER_SIGNATURE' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'workflow_runtime_step_configured_action'
  and pg_get_function_identity_arguments(p.oid) = 'p_step_id uuid'
  and pg_get_function_result(p.oid) = 'text'
  and p.provolatile = 's'
  and p.prosecdef = true;

\echo == S2: helper never defaults to 'approve' and performs no write
select case
  when pg_get_functiondef(p.oid) ~* '''approve''' then 'FAIL_DEFAULT_APPROVE'
  when pg_get_functiondef(p.oid) ~* '\m(insert|update|delete|create|drop|alter)\M' then 'FAIL_WRITE_IN_HELPER'
  else 'PASS' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'workflow_runtime_step_configured_action';

\echo == S3: helper execute is revoked from PUBLIC, anon and authenticated
select case
  when coalesce(p.proacl::text, '') ~ '(^|,)=X/' then 'FAIL_PUBLIC_EXECUTE'
  when coalesce(p.proacl::text, '') ~ 'anon=X' then 'FAIL_ANON_EXECUTE'
  when coalesce(p.proacl::text, '') ~ 'authenticated=X' then 'FAIL_AUTHENTICATED_EXECUTE'
  else 'PASS' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'workflow_runtime_step_configured_action';

\echo == S4: no actor-facing RPC probes the gate with a literal action anymore
select case when count(*) = 0 then 'PASS' else 'FAIL_LITERAL_ACTION_REMAINS' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~* 'can_current_user_act_on_step\s*\([^)]*''approve''';

\echo == S5: the three fixed RPCs resolve the configured action
select p.proname,
  case
    when p.proname = 'get_student_request_fee_processing_context'
         and pg_get_functiondef(p.oid) ~* 'v_config\.action_type\s+IS NOT NULL' then 'PASS'
    when p.proname <> 'get_student_request_fee_processing_context'
         and pg_get_functiondef(p.oid) ~* 'workflow_runtime_step_configured_action\(s\.id\)\s+IS NOT NULL' then 'PASS'
    else 'FAIL_NOT_FAIL_CLOSED' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  )
order by 1;

\echo == S6: no new role bypass introduced in the three RPCs
select p.proname, case
  when p.proname <> 'get_student_request_fee_processing_context'
       and pg_get_functiondef(p.oid) ~* '(has_role|has_any_role|is_current_user_admin_actor|''admin''|''registrar''|''dean'')'
    then 'FAIL_ROLE_BYPASS_INTRODUCED'
  else 'PASS' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  )
order by 1;

\echo == S7: authorization gate body untouched (compare md5 to preflight P3)
select proname, md5(pg_get_functiondef(oid)) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('can_current_user_act_on_step', 'user_matches_workflow_runtime_step');

\echo == S8: signatures of the three RPCs are unchanged (no overload created)
select p.proname, count(*) as overloads
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  )
group by 1 order by 1;
-- expected: exactly 1 overload each

ROLLBACK;
