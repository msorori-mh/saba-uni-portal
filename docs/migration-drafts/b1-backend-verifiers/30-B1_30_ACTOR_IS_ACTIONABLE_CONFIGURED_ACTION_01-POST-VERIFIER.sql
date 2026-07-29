-- B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01 — POST-VERIFIER
-- Run AFTER the draft migration is applied. Read-only. Any FAIL = HOLD.

-- Executed inside an explicit READ ONLY transaction; ends with ROLLBACK.
BEGIN READ ONLY;

\echo == V1: migration history advanced by exactly one and nothing was rewritten
select count(*) as migrations,
       max(version) as latest_version
from supabase_migrations.schema_migrations;

\echo == V2: helper installed
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result, p.prosecdef, p.provolatile
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'workflow_runtime_step_configured_action';

\echo == V3: zero literal-'approve' probes remain in the catalog
select case when count(*) = 0 then 'PASS' else 'FAIL' end as check
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~* 'can_current_user_act_on_step\s*\([^)]*''approve''';

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
select proname, md5(pg_get_functiondef(oid)) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('can_current_user_act_on_step', 'user_matches_workflow_runtime_step');

ROLLBACK;
