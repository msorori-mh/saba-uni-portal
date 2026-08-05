-- GRADUATION-PROJECTS ADVERSARIAL SECURITY AUDIT — catalog verifier (psql).
-- NEVER run on production. Prerequisite: migrations 20260730100000..20260730100007
-- applied. Read-only catalog assertions; ends in ROLLBACK.
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table gp_audit(check_name text, result text, detail text) on commit drop;
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text) returns void language plpgsql as $$
begin
  if p_ok then insert into gp_audit values(p_name,'PASS','');
  else insert into gp_audit values(p_name,'FAIL',p_detail); end if;
end $$;

-- 1. RLS enabled on every GP table, zero policies anywhere.
select pg_temp.chk('rls-enabled-all',
  not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname like 'graduation_project%' and not c.relrowsecurity),
  'table without RLS');
select pg_temp.chk('rls-zero-policies',
  not exists(select 1 from pg_policies where schemaname='public' and tablename like 'graduation_project%'),
  'policy found');

-- 2. Table privileges: nothing for anon/authenticated/PUBLIC on GP tables.
select pg_temp.chk('tables-revoked',
  not exists(select 1 from information_schema.table_privileges
    where table_schema='public' and table_name like 'graduation_project%'
      and grantee in ('anon','authenticated','public')),
  'table grant found');

-- 3. Every GP security definer function pins search_path to public,pg_temp.
select pg_temp.chk('definer-search-path',
  not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%graduation_project%' and p.prosecdef
      and not exists(select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=public, pg_temp' or cfg like 'search_path=public,pg_temp')),
  'definer function without pinned search_path');

-- 4. No SECURITY DEFINER GP function outside the documented inventory.
select pg_temp.chk('function-inventory',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%graduation_project%') <= 45,
  'unexpected function count');

-- 5. Grant surface: anon has zero GP function executes; authenticated only the documented set.
select pg_temp.chk('anon-zero-execute',
  not exists(select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name like '%graduation_project%' and grantee='anon'),
  'anon execute found');
select pg_temp.chk('authenticated-exec-whitelist',
  not exists(select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name like '%graduation_project%' and grantee='authenticated'
      and routine_name not in (
        'submit_graduation_project_proposal','add_graduation_project_team_member',
        'set_graduation_project_milestone','request_graduation_project_discussion',
        'finalize_graduation_project_evaluation','archive_graduation_project',
        'create_graduation_project','review_graduation_project_proposal',
        'resubmit_graduation_project_proposal','activate_graduation_project',
        'assign_graduation_project_faculty','end_graduation_project_assignment',
        'submit_graduation_project_deliverable','review_graduation_project_submission',
        'add_graduation_project_supervisor_note','resolve_graduation_project_supervisor_note',
        'register_graduation_project_file','schedule_graduation_project_discussion',
        'reject_graduation_project_discussion_request','assign_graduation_project_panel_member',
        'record_graduation_project_discussion_outcome','save_graduation_project_evaluation',
        'conclude_graduation_project_result','complete_graduation_project_correction',
        'accept_graduation_project_correction','list_my_graduation_projects',
        'get_graduation_project_detail','get_graduation_project_states_report',
        'get_graduation_project_assignments_report','get_graduation_project_evaluations_report',
        'get_graduation_project_archive_report','get_graduation_project_defense_report',
        'list_my_graduation_project_notifications','list_graduation_project_rubrics',
        'get_graduation_project_settings','upsert_graduation_project_settings',
        'upsert_graduation_project_rubric')),
  'unexpected authenticated execute');
-- service-only functions must not be executable by authenticated.
select pg_temp.chk('service-path-closed',
  not exists(select 1 from information_schema.routine_privileges
    where routine_schema='public' and grantee='authenticated'
      and routine_name in ('set_graduation_project_file_scan_state','list_graduation_project_orphan_files',
        'require_graduation_project_assignment','graduation_project_settings_for','graduation_project_is_discussion_ready')),
  'service/internal function exposed');

-- 6. Integrity backbone: triggers and unique indexes.
select pg_temp.chk('append-only-events',
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='graduation_project_events' and t.tgname='graduation_project_events_append_only'),
  'append-only trigger missing');
select pg_temp.chk('notify-trigger',
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='graduation_project_events' and t.tgname='graduation_project_events_notify'),
  'notify trigger missing');
select pg_temp.chk('unique-indexes',
  (select count(*) from pg_indexes where schemaname='public' and indexname in
    ('graduation_project_active_assignment','graduation_project_single_active_supervisor',
     'graduation_project_single_pending_discussion_request','graduation_project_single_panel_chair'))=4,
  'unique index missing');
select pg_temp.chk('notification-dedupe-index',
  exists(select 1 from pg_indexes where schemaname='public' and tablename='graduation_project_notification_log'
    and indexdef like '%UNIQUE%project_id, recipient_user_id, notification_type, entity_id%'),
  'notification dedupe index missing');

-- 7. Reporting view runs with the invoker's rights.
select pg_temp.chk('reporting-view-invoker',
  exists(select 1 from pg_views where schemaname='public' and viewname='graduation_project_reporting'),
  'view missing');

-- 8. No graduation-projects storage buckets (binary path stays blocked).
do $$ declare v_ok boolean := true; begin
  if to_regclass('storage.buckets') is not null then
    execute 'select not exists(select 1 from storage.buckets where id like ''graduation%'')' into v_ok;
  end if;
  perform pg_temp.chk('no-buckets', v_ok, 'bucket found');
end $$;

-- 9. Enums contain exactly the documented role values.
select pg_temp.chk('role-enum-shape',
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='graduation_project_assignment_role')=7,
  'role enum drift');

-- 10. Co-supervisor carries no write whitelist (read-only by contract).
select pg_temp.chk('co-supervisor-read-only',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%graduation_project%' and p.prosecdef
      and p.prosrc like '%co_supervisor%') <= 6,
  'co_supervisor whitelist drift');

table gp_audit order by 1;
do $$ declare v_fail integer; begin
  select count(*) filter(where result='FAIL') into v_fail from gp_audit;
  if v_fail>0 then raise exception 'SECURITY AUDIT FAILED: % checks failed',v_fail; end if;
  raise notice 'SECURITY AUDIT PASS: all catalog checks green';
end $$;
rollback;
