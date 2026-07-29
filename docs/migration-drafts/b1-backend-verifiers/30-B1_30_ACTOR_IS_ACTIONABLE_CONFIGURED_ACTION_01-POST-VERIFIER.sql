-- B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01 — POST-VERIFIER
-- Run AFTER the draft migration is applied. Read-only. Any FAIL = HOLD.

-- Executed inside an explicit READ ONLY transaction; ends with ROLLBACK.
BEGIN READ ONLY;

-- DEFECT-3 FIX: supabase_migrations.schema_migrations is not readable by the
-- roles available to this verifier, so V1 no longer depends on it. The applied
-- version is attested from the source-of-truth migration file under
-- supabase/migrations (20260729173359_9a749214-c28e-489b-95ec-038f290a5c3c.sql)
-- and by PROMOTION-MAP.json. The optional ledger read is at the end of this
-- file, fully detached, and may only be run by a privileged operator.
\echo == V1: migration ledger read intentionally detached (see optional block at EOF)
select 'SKIPPED_BY_DESIGN_SEE_PROMOTION_MAP' as check;

\echo == V2: helper installed
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result, p.prosecdef, p.provolatile
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'workflow_runtime_step_configured_action';

\echo == V3: zero literal-'approve' probes remain in the catalog
select case when count(*) = 0 then 'PASS' else 'FAIL' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.prosrc ~* 'can_current_user_act_on_step\s*\([^)]*''approve''';

\echo == V4: ACL of the three RPCs identical to preflight P5 snapshot
select p.proname, coalesce(p.proacl::text, '<default>') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  )
order by 1;

\echo == V5: helper resolves the configured action for the Haitham fixture
select sr.request_number, s.step_key, s.status,
       public.workflow_runtime_step_configured_action(s.id) as resolved_action,
       c.action_type as configured_action,
       case when public.workflow_runtime_step_configured_action(s.id)
                 is not distinct from c.action_type
            then 'PASS' else 'FAIL_RESOLVER_MISMATCH' end as check
from public.student_request_workflow_steps s
join public.student_requests sr on sr.id = s.student_request_id
left join public.request_type_workflow_steps c on c.id = s.workflow_step_id
where sr.request_number = 'SR-20260727-695EC35B'
order by s.step_order;

\echo == V6: resolver agrees with configuration for every ACTIVE runtime step
select case when count(*) = 0 then 'PASS' else 'FAIL_RESOLVER_DRIFT' end as check
from public.student_request_workflow_steps s
left join public.request_type_workflow_steps c on c.id = s.workflow_step_id
where s.status = 'active'
  and public.workflow_runtime_step_configured_action(s.id) is distinct from c.action_type;

\echo == V7: zero data mutation (compare with preflight P8)
select
  (select count(*) from public.student_requests)                as requests,
  (select count(*) from public.student_request_workflow_steps)  as workflow_steps,
  (select count(*) from public.student_request_workflow_events) as workflow_events,
  (select count(*) from public.student_request_fee_assessments) as fee_assessments,
  (select count(*) from public.payment_receipts)                as payment_receipts,
  (select count(*) from public.official_documents)              as official_documents,
  (select count(*) from public.student_excused_absences)        as excused_absences,
  (select count(*) from public.request_types where student_visible) as student_visible_types;

\echo == V8: gate body unchanged (compare md5 with preflight P3 / structural S7)
select p.proname, md5(p.prosrc) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_current_user_act_on_step', 'user_matches_workflow_runtime_step');

ROLLBACK;

-- ###########################################################################
-- REMEDIATION-33 ADDENDUM (G1/G2/G3) — compare against the pinned baseline.
-- Fail-closed: any drift from the preflight baseline is a FAIL = HOLD.
-- ###########################################################################

BEGIN READ ONLY;

\echo == V9: helper pinned shape (owner / SECURITY DEFINER / STABLE / search_path public, pg_temp)
select case
  when to_regprocedure('public.workflow_runtime_step_configured_action(uuid)') is null then 'FAIL_HELPER_MISSING'
  when pg_get_userbyid(p.proowner) is distinct from 'postgres' then 'FAIL_HELPER_OWNER'
  when p.prosecdef is distinct from true then 'FAIL_HELPER_NOT_SECURITY_DEFINER'
  when p.provolatile::text is distinct from 's' then 'FAIL_HELPER_NOT_STABLE'
  when coalesce(p.proconfig::text, '<none>') is distinct from '{"search_path=public, pg_temp"}' then 'FAIL_HELPER_SEARCH_PATH'
  when p.proacl is null then 'FAIL_NULL_ACL_DEFAULT_PUBLIC_EXECUTE'
  when has_function_privilege('public', p.oid, 'EXECUTE') then 'FAIL_PUBLIC_EXECUTE'
  when has_function_privilege('anon', p.oid, 'EXECUTE') then 'FAIL_ANON_EXECUTE'
  when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'FAIL_AUTHENTICATED_EXECUTE'
  else 'PASS'
end as check
from pg_proc p
where p.oid = to_regprocedure('public.workflow_runtime_step_configured_action(uuid)');

\echo == V10: three RPCs identical to the preflight baseline (signature/owner/mode/volatility/search_path)
with expected(identity, owner, secdef, volatility, proconfig) as (
  values
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)',   'postgres', true, 's', '{"search_path=public, pg_temp"}'),
    ('public.get_student_request_detail_for_actor(uuid)',          'postgres', true, 's', '{"search_path=public, pg_temp"}'),
    ('public.get_student_request_fee_processing_context(uuid)',    'postgres', true, 's', '{"search_path=public, pg_temp"}')
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

\echo == V10a: grants preserved exactly (no grant added, none lost)
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

\echo == V11: five B1 services still pinned INDIVIDUALLY (active, hidden, exactly one row)
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

\echo == V12: enrollment_certificate unchanged (exactly one row, active, student_visible true)
select 'enrollment_certificate' as code,
  case
    when (select count(*) from public.request_types rt where rt.code = 'enrollment_certificate') <> 1 then 'FAIL_MISSING_OR_DUPLICATED'
    when (select rt.is_active from public.request_types rt where rt.code = 'enrollment_certificate') is distinct from true then 'FAIL_NOT_ACTIVE'
    when (select rt.student_visible from public.request_types rt where rt.code = 'enrollment_certificate') is distinct from true then 'FAIL_VISIBILITY_CHANGED'
    else 'PASS'
  end as check;

\echo == V12a: enrollment_certificate workflow + document counters (compare with preflight P11a)
select
  (select count(*) from public.request_type_workflows w
     join public.request_types rt on rt.id = w.request_type_id
    where rt.code = 'enrollment_certificate') as ec_workflows,
  (select count(*) from public.request_type_workflow_steps s
     join public.request_type_workflows w on w.id = s.workflow_id
     join public.request_types rt on rt.id = w.request_type_id
    where rt.code = 'enrollment_certificate') as ec_workflow_steps,
  (select count(*) from public.official_documents) as official_documents,
  (select count(*) from public.enrollment_certificate_document_details) as ec_document_details;

ROLLBACK;

-- OPTIONAL / SEPARATE — migration ledger attestation (privileged operator only).
-- Detached on purpose: a permission error here must never invalidate V2..V12a.
-- BEGIN READ ONLY;
-- select count(*) as migrations, max(version) as latest_version
-- from supabase_migrations.schema_migrations;
-- expected latest_version = 20260729173359
-- ROLLBACK;
