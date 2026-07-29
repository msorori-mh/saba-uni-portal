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
