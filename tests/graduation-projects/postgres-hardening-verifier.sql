-- Executable disposable-PostgreSQL hardening verifier (psql). NEVER run on production.
-- Prerequisite: minimal schema + the four packaged migrations applied
-- (20260730100000..20260730100003) to an isolated clone, plus synthetic fixtures:
-- psql -v department_id=... -v student_profile_id=... -v student_user_id=... \
--   -v faculty_profile_id=... -v faculty_user_id=... -f this-file
\set ON_ERROR_STOP on
\if :{?department_id}
\else
  \warn 'department_id is required'; \quit 1
\endif
\if :{?student_profile_id}
\else
  \warn 'student_profile_id is required'; \quit 1
\endif
\if :{?student_user_id}
\else
  \warn 'student_user_id is required'; \quit 1
\endif
\if :{?faculty_profile_id}
\else
  \warn 'faculty_profile_id is required'; \quit 1
\endif
\if :{?faculty_user_id}
\else
  \warn 'faculty_user_id is required'; \quit 1
\endif

begin;
set local role postgres;
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

create temporary table gp_ids(k text primary key,v uuid not null) on commit drop;
create function pg_temp.expect_gp_error(statement text,expected_message text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected graduation-project error was not raised';
exception when sqlstate 'P0001' then
  if sqlerrm<>expected_message then raise exception 'unexpected error: %, expected: %',sqlerrm,expected_message; end if;
end $$;
create function pg_temp.expect_sqlstate(statement text,expected_state text,label text) returns void language plpgsql as $$
begin execute statement; raise exception '% unexpectedly allowed',label;
exception when others then
  if sqlstate<>expected_state then raise exception '% raised sqlstate %, expected %',label,sqlstate,expected_state; end if;
end $$;

-- Extra synthetic identities (rolled back with the transaction).
insert into auth.users values
  ('10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000005');
insert into public.faculty_profiles values
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',:'department_id'),
  ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',:'department_id');

-- ---------------------------------------------------------------- structure
do $$ begin
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='graduation_project_assignment_role' and e.enumlabel='co_supervisor') then
    raise exception 'CHECK FAILED: co_supervisor enum value missing';
  end if;
  if (select count(*) from pg_indexes where schemaname='public' and indexname in
    ('graduation_project_single_active_supervisor','graduation_project_single_pending_discussion_request','graduation_project_single_panel_chair'))<>3 then
    raise exception 'CHECK FAILED: exactly-one hardening indexes missing';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in
    ('graduation_project_rubrics','graduation_project_rubric_criteria','graduation_project_notification_log')
    and c.relrowsecurity)<>3 then
    raise exception 'CHECK FAILED: hardening tables missing or RLS disabled';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename in
    ('graduation_project_rubrics','graduation_project_rubric_criteria','graduation_project_notification_log')) then
    raise exception 'CHECK FAILED: hardening tables must stay policy-free (deny by default)';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public'
    and table_name='graduation_project_files' and column_name in ('scan_decided_at','scan_correlation_id'))<>2 then
    raise exception 'CHECK FAILED: scan audit columns missing';
  end if;
  if has_function_privilege('authenticated','public.set_graduation_project_file_scan_state(uuid,text,uuid)','execute') then
    raise exception 'CHECK FAILED: scan RPC must not be executable by authenticated';
  end if;
  if has_function_privilege('anon','public.set_graduation_project_file_scan_state(uuid,text,uuid)','execute') then
    raise exception 'CHECK FAILED: scan RPC must not be executable by anon';
  end if;
end $$;

-- ------------------------------------------------- project + coordinator setup
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Hardening A','draft') returning id)
insert into gp_ids select 'p1',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'coordinator',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'coord1',id from x;

-- ---------------------------------------------------------- co-supervisor flow
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
with x as (select public.assign_graduation_project_faculty(
  (select v from gp_ids where k='p1'),'supervisor','40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001') id)
insert into gp_ids select 'sup1',id from x;
select pg_temp.expect_gp_error(format(
  'select public.assign_graduation_project_faculty(%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p1'),'supervisor','40000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000002'),
  'project supervisor slot already filled');
with x as (select public.assign_graduation_project_faculty(
  (select v from gp_ids where k='p1'),'co_supervisor','40000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000003') id)
insert into gp_ids select 'cosup1',id from x;
select pg_temp.expect_gp_error(format(
  'select public.assign_graduation_project_faculty(%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p1'),'co_supervisor','40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000004'),
  'project supervisor slot already filled');
select pg_temp.expect_gp_error(format(
  'select public.assign_graduation_project_faculty(%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p1'),'dean','40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000005'),
  'faculty assignment role denied');

-- co_supervisor subject shape rejects a student-profile subject.
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
     values(%L,%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p1'),'co_supervisor',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id'),
  '23514','co_supervisor with student subject');

-- co_supervisor reads the detail payload (staff visibility), cannot write notes.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
do $$ declare v_detail jsonb; begin
  v_detail:=public.get_graduation_project_detail((select v from gp_ids where k='p1'));
  if not (v_detail->'viewer_roles' ? 'co_supervisor') then
    raise exception 'CHECK FAILED: co_supervisor missing from viewer_roles';
  end if;
end $$;
select pg_temp.expect_gp_error(format(
  'select public.add_graduation_project_supervisor_note(%L,null,%L,%L)',
  (select v from gp_ids where k='p1'),'co-supervisor write attempt','11111111-0000-0000-0000-000000000006'),
  'exact direct processing assignment required');

-- Unrelated user is denied the detail read.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select pg_temp.expect_gp_error(format(
  'select public.get_graduation_project_detail(%L)',
  (select v from gp_ids where k='p1')),
  'exact direct processing assignment required');
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- ------------------------------------- exactly-one pending discussion request
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Hardening B','active') returning id)
insert into gp_ids select 'p2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'student',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'stu2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'coordinator',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'coord2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'supervisor','40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'sup2',id from x;
-- Make p2 discussion-ready, then plant a pending request directly (privileged path)
-- to prove the RPC guard beats the raw unique-index violation.
with x as (insert into public.graduation_project_milestones(project_id,title,milestone_kind,sequence_no,weight,status,completion_percent)
  values((select v from gp_ids where k='p2'),'Final','final',1,100,'accepted',100) returning id)
insert into gp_ids select 'm2',id from x;
with x as (insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id,state,accepted_at)
  values((select v from gp_ids where k='p2'),(select v from gp_ids where k='m2'),1,(select v from gp_ids where k='stu2'),'accepted',now()) returning id)
insert into gp_ids select 's2',id from x;
insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,scan_state,uploaded_by_assignment_id)
  values((select v from gp_ids where k='p2'),(select v from gp_ids where k='s2'),
    'graduation-projects/'||(select v from gp_ids where k='p2')::text||'/h-final.pdf','final.pdf','application/pdf',1,repeat('b',64),'clean',(select v from gp_ids where k='stu2'));
with x as (insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id)
  values((select v from gp_ids where k='p2'),(select v from gp_ids where k='stu2')) returning id)
insert into gp_ids select 'req2',id from x;
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id)
     values(%L,%L)',
  (select v from gp_ids where k='p2'),(select v from gp_ids where k='stu2')),
  '23505','second pending discussion request');
select set_config('request.jwt.claim.sub', :'student_user_id', true);
select pg_temp.expect_gp_error(format(
  'select public.request_graduation_project_discussion(%L,%L)',
  (select v from gp_ids where k='p2'),'11111111-0000-0000-0000-000000000007'),
  'discussion request already pending');
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- ------------------------------------------------- exactly-one panel chair
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Hardening C','discussion_scheduled') returning id)
insert into gp_ids select 'p3',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p3'),'coordinator',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'coord3',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p3'),'panel_member','40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'pm3a',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p3'),'panel_member','40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'pm3b',id from x;
with x as (insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id,state)
  values((select v from gp_ids where k='p3'),(select v from gp_ids where k='coord3'),'approved') returning id)
insert into gp_ids select 'req3',id from x;
with x as (insert into public.graduation_project_discussions(project_id,request_id,starts_at,venue,coordinator_assignment_id)
  values((select v from gp_ids where k='p3'),(select v from gp_ids where k='req3'),now()+interval '7 days','Hall 1',(select v from gp_ids where k='coord3')) returning id)
insert into gp_ids select 'disc3',id from x;
with x as (insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id,chair)
  values((select v from gp_ids where k='p3'),(select v from gp_ids where k='disc3'),(select v from gp_ids where k='pm3a'),true) returning id)
insert into gp_ids select 'chair3',id from x;
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id,chair)
     values(%L,%L,%L,true)',
  (select v from gp_ids where k='p3'),(select v from gp_ids where k='disc3'),(select v from gp_ids where k='pm3b')),
  '23505','second panel chair');
select pg_temp.expect_gp_error(format(
  'select public.assign_graduation_project_panel_member(%L,%L,%L,true,%L)',
  (select v from gp_ids where k='p3'),(select v from gp_ids where k='disc3'),(select v from gp_ids where k='pm3b'),
  '11111111-0000-0000-0000-000000000008'),
  'panel chair already assigned');

-- ------------------------------------------------------------------ scan RPC
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Hardening D','active') returning id)
insert into gp_ids select 'p4',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p4'),'student',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'stu4',id from x;
select set_config('request.jwt.claim.sub', :'student_user_id', true);
with x as (select public.register_graduation_project_file(
  (select v from gp_ids where k='p4'),null,
  'graduation-projects/'||(select v from gp_ids where k='p4')::text||'/scan-fixture.pdf',
  'scan-fixture.pdf','application/pdf',2048,
  repeat('a',64),'11111111-0000-0000-0000-000000000009') id)
insert into gp_ids select 'file4',id from x;
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- authenticated must not execute the scan RPC at all.
select set_config('gp.file4', v::text, true) from gp_ids where k='file4';
set local role authenticated;
select pg_temp.expect_sqlstate(
  'select public.set_graduation_project_file_scan_state(current_setting(''gp.file4'')::uuid,''clean'',''11111111-0000-0000-0000-00000000000a'')',
  '42501','authenticated scan decision');
reset role;
set local role postgres;

-- service-path decision: pending -> clean, idempotent replay, conflict denied.
do $$ declare v_ret uuid; begin
  v_ret:=public.set_graduation_project_file_scan_state((select v from gp_ids where k='file4'),'clean','11111111-0000-0000-0000-00000000000b');
  if v_ret<>(select v from gp_ids where k='file4') then raise exception 'CHECK FAILED: scan RPC return mismatch'; end if;
  if not exists(select 1 from public.graduation_project_files
    where id=v_ret and scan_state='clean' and scan_decided_at is not null
      and scan_correlation_id='11111111-0000-0000-0000-00000000000b') then
    raise exception 'CHECK FAILED: scan decision not persisted with audit columns';
  end if;
  if public.set_graduation_project_file_scan_state(v_ret,'clean','11111111-0000-0000-0000-00000000000c')<>v_ret then
    raise exception 'CHECK FAILED: scan replay must be an idempotent no-op';
  end if;
end $$;
select pg_temp.expect_gp_error(format(
  'select public.set_graduation_project_file_scan_state(%L,%L,%L)',
  (select v from gp_ids where k='file4'),'quarantined','11111111-0000-0000-0000-00000000000d'),
  'file scan state already decided');
select pg_temp.expect_gp_error(
  'select public.set_graduation_project_file_scan_state(gen_random_uuid(),''clean'',''11111111-0000-0000-0000-00000000000e'')',
  'file not found');
select pg_temp.expect_gp_error(format(
  'select public.set_graduation_project_file_scan_state(%L,%L,%L)',
  (select v from gp_ids where k='file4'),'bogus','11111111-0000-0000-0000-00000000000f'),
  'scan state invalid');

-- -------------------------------------------- rubric + notification contracts
with x as (insert into public.graduation_project_rubrics(department_id,code,version_label,title,passing_threshold)
  values(:'department_id','GEN','v1','General rubric',60) returning id)
insert into gp_ids select 'rub1',id from x;
insert into public.graduation_project_rubric_criteria(rubric_id,department_id,criterion_code,criterion_label,maximum_score,weight,sequence_no)
  values((select v from gp_ids where k='rub1'),:'department_id','C1','Content',40,1,1);
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_rubric_criteria(rubric_id,department_id,criterion_code,criterion_label,maximum_score,weight,sequence_no)
     values(%L,%L,%L,%L,30,1,2)',
  (select v from gp_ids where k='rub1'),:'department_id','C1','Duplicate code'),
  '23505','duplicate criterion code');

select set_config('gp.p4', v::text, true) from gp_ids where k='p4';
set local role authenticated;
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_rubrics(department_id,code,version_label,title) values(%L,%L,%L,%L)',
  :'department_id','GEN','v2','Denied rubric'),
  '42501','authenticated rubric insert');
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
     values(%L,%L,%L,%L,%L,%L)',
  current_setting('gp.p4'),:'student_user_id','archived','graduation_projects',current_setting('gp.p4'),
  '11111111-0000-0000-0000-000000000010'),
  '42501','authenticated notification insert');
reset role;
set local role postgres;

insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
  values((select v from gp_ids where k='p4'),:'student_user_id','submission_uploaded','graduation_project_submissions',
    '50000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000011');
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
     values(%L,%L,%L,%L,%L,%L)',
  (select v from gp_ids where k='p4'),:'student_user_id','submission_uploaded','graduation_project_submissions',
  '50000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000012'),
  '23505','duplicate notification log entry');

-- Hardening verified: co-supervisor contract, exactly-one guards, scan RPC
-- one-way service path, rubric reference tables, notification dedupe log.
rollback;
