-- B1_30_ACTOR_IS_ACTIONABLE_CONFIGURED_ACTION_01 — PRODUCTION READ-ONLY PREFLIGHT
-- Run BEFORE the draft migration. Read-only: SELECT only, no DDL/DML.
-- Every check must report PASS; any FAIL = HOLD.

-- Executed inside an explicit READ ONLY transaction; ends with ROLLBACK.
BEGIN READ ONLY;

\echo == P1: the three faulty actor-facing RPCs still probe the literal 'approve'
select p.proname,
       case when pg_get_functiondef(p.oid) ~* 'can_current_user_act_on_step\s*\([^)]*''approve'''
            then 'PASS_DEFECT_PRESENT' else 'FAIL_UNEXPECTED_SHAPE' end as check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  )
order by 1;

\echo == P2: no other public function probes the gate with a literal action
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~* 'can_current_user_act_on_step\s*\([^)]*''approve'''
  and p.proname not in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  );
-- expected: zero rows

\echo == P3: the authorization gate itself is present and untouched by this change
select proname,
       md5(pg_get_functiondef(oid)) as body_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('can_current_user_act_on_step', 'user_matches_workflow_runtime_step');

\echo == P4: helper name is free (must not already exist)
select count(*) as existing_helper
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'workflow_runtime_step_configured_action';
-- expected: 0

\echo == P5: current ACL snapshot of the three RPCs (must be identical post-apply)
select p.proname, coalesce(p.proacl::text, '<default>') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_my_request_actor_inbox',
    'get_student_request_detail_for_actor',
    'get_student_request_fee_processing_context'
  )
order by 1;

\echo == P6: configured action_type coverage for ACTIVE runtime steps
select coalesce(c.action_type, '<NULL>') as configured_action,
       count(*) as active_steps
from public.student_request_workflow_steps s
left join public.request_type_workflow_steps c on c.id = s.workflow_step_id
where s.status = 'active'
group by 1
order by 2 desc;

\echo == P7: Haitham regression fixture (excused_absence / student_affairs_intake)
select sr.request_number,
       s.step_key,
       s.status         as runtime_status,
       c.action_type    as configured_action,
       (c.action_type = 'approve') as would_pass_old_probe
from public.student_request_workflow_steps s
join public.student_requests sr on sr.id = s.student_request_id
left join public.request_type_workflow_steps c on c.id = s.workflow_step_id
where sr.request_number = 'SR-20260727-695EC35B'
order by s.step_order;

\echo == P8: baseline invariants (must be unchanged by a read-only migration)
select
  (select count(*) from supabase_migrations.schema_migrations) as migrations,
  (select count(*) from public.student_requests)               as requests,
  (select count(*) from public.student_request_workflow_steps) as workflow_steps,
  (select count(*) from public.student_request_workflow_events) as workflow_events,
  (select count(*) from public.student_request_fee_assessments) as fee_assessments,
  (select count(*) from public.official_documents)              as official_documents,
  (select count(*) from public.request_types where student_visible) as student_visible_types;

ROLLBACK;

-- ###########################################################################
-- REMEDIATION-33 ADDENDUM (G1/G2/G3) — authoritative baseline capture.
-- Read-only. Run inside the same READ ONLY transaction as the block above.
-- ###########################################################################

BEGIN READ ONLY;

\echo == P9: authoritative owner / security / volatility / search_path baseline of the three RPCs
select p.oid::regprocedure::text                 as identity,
       pg_get_userbyid(p.proowner)               as owner,
       p.prosecdef                               as security_definer,
       p.provolatile                             as volatility,
       coalesce(p.proconfig::text, '<none>')     as proconfig,
       coalesce(p.proacl::text, '<default>')     as acl
from pg_proc p
where p.oid in (
  to_regprocedure('public.get_my_request_actor_inbox(jsonb, integer, integer)'),
  to_regprocedure('public.get_student_request_detail_for_actor(uuid)'),
  to_regprocedure('public.get_student_request_fee_processing_context(uuid)')
)
order by 1;

\echo == P9a: each RPC exists exactly once with the pinned baseline shape (fail-closed)
with expected(identity, owner, secdef, volatility, proconfig) as (
  values
    ('public.get_my_request_actor_inbox(jsonb,integer,integer)',        'postgres', true, 's', '{search_path=public}'),
    ('public.get_student_request_detail_for_actor(uuid)',               'postgres', true, 's', '{search_path=public}'),
    ('public.get_student_request_fee_processing_context(uuid)',         'postgres', true, 's', '{search_path=public}')
)
select e.identity,
       case
         when to_regprocedure(e.identity) is null then 'FAIL_MISSING'
         when pg_get_userbyid(p.proowner) is distinct from e.owner then 'FAIL_OWNER'
         when p.prosecdef is distinct from e.secdef then 'FAIL_SECURITY_MODE'
         when p.provolatile::text is distinct from e.volatility then 'FAIL_VOLATILITY'
         when coalesce(p.proconfig::text, '<none>') is distinct from e.proconfig then 'FAIL_SEARCH_PATH'
         else 'PASS'
       end as check
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.identity)
order by 1;

\echo == P9b: authoritative EXECUTE grants that MUST be preserved by Package 30
select f.identity, g.grantee,
       has_function_privilege(g.grantee, to_regprocedure(f.identity), 'EXECUTE') as has_execute
from (values
  ('public.get_my_request_actor_inbox(jsonb,integer,integer)'),
  ('public.get_student_request_detail_for_actor(uuid)'),
  ('public.get_student_request_fee_processing_context(uuid)')
) as f(identity),
lateral (values ('public'), ('anon'), ('authenticated'), ('service_role')) as g(grantee)
order by 1, 2;

\echo == P9c: helper must not exist yet (its owner/search_path/ACL are pinned post-apply)
select case when to_regprocedure('public.workflow_runtime_step_configured_action(uuid)') is null
            then 'PASS' else 'FAIL_HELPER_ALREADY_EXISTS' end as check;

\echo == P10: five B1 services pinned INDIVIDUALLY by exact code (no aggregate counts)
with expected(code) as (
  values ('enrollment_suspension'), ('excused_absence'), ('department_transfer'),
         ('final_chance'), ('file_withdrawal')
)
select e.code,
       (select count(*) from public.request_types rt where rt.code = e.code) as rows,
       case
         when (select count(*) from public.request_types rt where rt.code = e.code) <> 1 then 'FAIL_ROW_COUNT'
         when (select rt.is_active from public.request_types rt where rt.code = e.code) is distinct from true then 'FAIL_NOT_ACTIVE'
         when (select rt.student_visible from public.request_types rt where rt.code = e.code) is distinct from false then 'FAIL_STUDENT_VISIBLE'
         else 'PASS'
       end as check
from expected e
order by 1;

\echo == P11: enrollment_certificate pinned INDIVIDUALLY (must stay untouched)
select 'enrollment_certificate' as code,
       (select count(*) from public.request_types rt where rt.code = 'enrollment_certificate') as rows,
       case
         when (select count(*) from public.request_types rt where rt.code = 'enrollment_certificate') <> 1 then 'FAIL_ROW_COUNT'
         when (select rt.is_active from public.request_types rt where rt.code = 'enrollment_certificate') is distinct from true then 'FAIL_NOT_ACTIVE'
         when (select rt.student_visible from public.request_types rt where rt.code = 'enrollment_certificate') is distinct from true then 'FAIL_NOT_STUDENT_VISIBLE'
         else 'PASS'
       end as check;

\echo == P11a: enrollment_certificate workflow + authorization surface baseline (must not change)
select
  (select count(*) from public.request_type_workflows w where w.request_type_code = 'enrollment_certificate') as ec_workflows,
  (select count(*) from public.request_type_workflow_steps s
     join public.request_type_workflows w on w.id = s.workflow_id
    where w.request_type_code = 'enrollment_certificate') as ec_workflow_steps,
  (select count(*) from public.official_documents) as official_documents,
  (select count(*) from public.enrollment_certificate_document_details) as ec_document_details;

ROLLBACK;
