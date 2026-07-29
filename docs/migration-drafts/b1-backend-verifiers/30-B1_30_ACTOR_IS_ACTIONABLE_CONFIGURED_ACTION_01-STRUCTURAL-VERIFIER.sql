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

-- ###########################################################################
-- REMEDIATION-33 ADDENDUM (G1/G2/G3) — explicit fail-closed pins.
-- ###########################################################################

BEGIN READ ONLY;

\echo == S9: helper owner / SECURITY DEFINER / STABLE / exact search_path pin
select case
  when to_regprocedure('public.workflow_runtime_step_configured_action(uuid)') is null then 'FAIL_HELPER_MISSING'
  when pg_get_userbyid(p.proowner) is distinct from 'postgres' then 'FAIL_HELPER_OWNER'
  when p.prosecdef is distinct from true then 'FAIL_HELPER_NOT_SECURITY_DEFINER'
  when p.provolatile::text is distinct from 's' then 'FAIL_HELPER_NOT_STABLE'
  when coalesce(p.proconfig::text, '<none>') is distinct from '{"search_path=public, pg_temp"}' then 'FAIL_HELPER_SEARCH_PATH'
  else 'PASS'
end as check
from pg_proc p
where p.oid = to_regprocedure('public.workflow_runtime_step_configured_action(uuid)');

\echo == S9a: helper EXECUTE denied to PUBLIC, anon and authenticated (fail-closed, NULL acl refused)
select case
  when to_regprocedure('public.workflow_runtime_step_configured_action(uuid)') is null then 'FAIL_HELPER_MISSING'
  when p.proacl is null then 'FAIL_NULL_ACL_DEFAULT_PUBLIC_EXECUTE'
  when has_function_privilege('public', p.oid, 'EXECUTE') then 'FAIL_PUBLIC_EXECUTE'
  when has_function_privilege('anon', p.oid, 'EXECUTE') then 'FAIL_ANON_EXECUTE'
  when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'FAIL_AUTHENTICATED_EXECUTE'
  else 'PASS'
end as check
from pg_proc p
where p.oid = to_regprocedure('public.workflow_runtime_step_configured_action(uuid)');

\echo == S10: three RPCs — exact signature, owner, security mode, volatility, search_path
with expected(identity, owner, secdef, volatility, proconfig) as (
  values
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)',   'postgres', true, 's', '{search_path=public}'),
    ('public.get_student_request_detail_for_actor(uuid)',          'postgres', true, 's', '{search_path=public}'),
    ('public.get_student_request_fee_processing_context(uuid)',    'postgres', true, 's', '{search_path=public}')
)
select e.identity,
  case
    when to_regprocedure(e.identity) is null then 'FAIL_MISSING_OR_SIGNATURE_CHANGED'
    when pg_get_userbyid(p.proowner) is distinct from e.owner then 'FAIL_OWNER'
    when p.prosecdef is distinct from e.secdef then 'FAIL_SECURITY_MODE'
    when p.provolatile::text is distinct from e.volatility then 'FAIL_VOLATILITY'
    when coalesce(p.proconfig::text, '<none>') is distinct from e.proconfig then 'FAIL_SEARCH_PATH'
    else 'PASS'
  end as check
from expected e left join pg_proc p on p.oid = to_regprocedure(e.identity)
order by 1;

\echo == S10a: three RPCs — EXECUTE grants identical to the pinned production baseline
with expected(identity, grantee, allowed) as (
  values
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)','public',        false),
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)','anon',          true),
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)','authenticated', true),
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)','service_role',  true),
    ('public.get_student_request_detail_for_actor(uuid)','public',        false),
    ('public.get_student_request_detail_for_actor(uuid)','anon',          true),
    ('public.get_student_request_detail_for_actor(uuid)','authenticated', true),
    ('public.get_student_request_detail_for_actor(uuid)','service_role',  true),
    ('public.get_student_request_fee_processing_context(uuid)','public',        false),
    ('public.get_student_request_fee_processing_context(uuid)','anon',          false),
    ('public.get_student_request_fee_processing_context(uuid)','authenticated', true),
    ('public.get_student_request_fee_processing_context(uuid)','service_role',  true)
)
select e.identity, e.grantee,
  case
    when to_regprocedure(e.identity) is null then 'FAIL_MISSING'
    when has_function_privilege(e.grantee, to_regprocedure(e.identity), 'EXECUTE') is distinct from e.allowed
      then 'FAIL_ACL_DRIFT'
    else 'PASS'
  end as check
from expected e order by 1, 2;

\echo == S11: five B1 services pinned INDIVIDUALLY (is_active true, student_visible false, exactly one row)
with expected(code) as (
  values ('enrollment_suspension'), ('excused_absence'), ('department_transfer'),
         ('final_chance'), ('file_withdrawal')
)
select e.code,
  case
    when (select count(*) from public.request_types rt where rt.code = e.code) <> 1 then 'FAIL_ROW_COUNT'
    when (select rt.is_active from public.request_types rt where rt.code = e.code) is distinct from true then 'FAIL_NOT_ACTIVE'
    when (select rt.student_visible from public.request_types rt where rt.code = e.code) is distinct from false then 'FAIL_STUDENT_VISIBLE'
    else 'PASS'
  end as check
from expected e order by 1;

\echo == S12: enrollment_certificate pinned INDIVIDUALLY and untouched by Package 30
select 'enrollment_certificate' as code,
  case
    when (select count(*) from public.request_types rt where rt.code = 'enrollment_certificate') <> 1 then 'FAIL_MISSING_OR_DUPLICATED'
    when (select rt.is_active from public.request_types rt where rt.code = 'enrollment_certificate') is distinct from true then 'FAIL_NOT_ACTIVE'
    when (select rt.student_visible from public.request_types rt where rt.code = 'enrollment_certificate') is distinct from true then 'FAIL_VISIBILITY_CHANGED'
    else 'PASS'
  end as check;

\echo == S12a: Package 30 declares no enrollment_certificate object (static contract)
select case when count(*) = 0 then 'PASS' else 'FAIL_EC_FUNCTION_TOUCHED' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'archive_enrollment_certificate_from_workflow_step',
    'build_enrollment_certificate_issuance_snapshot',
    'assert_enrollment_certificate_pdf_generation_ready'
  )
  and pg_get_functiondef(p.oid) ~* 'workflow_runtime_step_configured_action';

ROLLBACK;
