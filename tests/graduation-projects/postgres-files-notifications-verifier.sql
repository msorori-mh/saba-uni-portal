-- Executable disposable-PostgreSQL files/notifications verifier (psql).
-- NEVER run on production. Prerequisite: minimal schema + migrations
-- 20260730100000..20260730100004 (drafts GRADUATION-PROJECTS-M1..M5-*.NOT_APPLIED.sql
-- in docs/migration-drafts/) applied, plus synthetic fixtures.
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
select set_config('gp.faculty_user_id', :'faculty_user_id', true);

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

insert into auth.users values ('10000000-0000-0000-0000-000000000003');
insert into public.faculty_profiles values
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',:'department_id');

-- ------------------------------------------------------------- structure
do $$ begin
  if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='graduation_project_events' and t.tgname='graduation_project_events_notify') then
    raise exception 'CHECK FAILED: notification trigger missing';
  end if;
  if has_function_privilege('authenticated','public.list_graduation_project_orphan_files()','execute') then
    raise exception 'CHECK FAILED: orphan review must not be executable by authenticated';
  end if;
  if not has_function_privilege('authenticated','public.list_my_graduation_project_notifications()','execute') then
    raise exception 'CHECK FAILED: own-notifications read must be executable by authenticated';
  end if;
end $$;

-- ------------------------------------------------- project with student+supervisor
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values(:'department_id','Files A','active') returning id)
insert into gp_ids select 'p1',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'coordinator',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'coord1',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'student',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'stu1',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'supervisor','40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003',:'department_id',:'faculty_user_id') returning id)
insert into gp_ids select 'sup1',id from x;

-- ------------------------------------------------- attachment policy gates
select set_config('request.jwt.claim.sub', :'student_user_id', true);
select pg_temp.expect_gp_error(format(
  'select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),%L)',
  (select v from gp_ids where k='p1'),
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/evil.exe','evil.exe','application/x-msdownload','a',
  '21111111-0000-0000-0000-000000000001'),
  'file media type not allowed');
select pg_temp.expect_gp_error(format(
  'select public.register_graduation_project_file(%L,null,%L,%L,%L,52428801,repeat(%L,64),%L)',
  (select v from gp_ids where k='p1'),
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/big.pdf','big.pdf','application/pdf','b',
  '21111111-0000-0000-0000-000000000002'),
  'file size exceeds limit');
select pg_temp.expect_gp_error(format(
  'select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),%L,%L)',
  (select v from gp_ids where k='p1'),
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/k.pdf','k.pdf','application/pdf','c',
  '21111111-0000-0000-0000-000000000003','bogus_kind'),
  'file kind invalid');
select pg_temp.expect_gp_error(format(
  'select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),%L,%L)',
  (select v from gp_ids where k='p1'),
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/u.pdf','u.pdf','application/pdf','d',
  '21111111-0000-0000-0000-000000000004','milestone_submission'),
  'file stage binding invalid');
select pg_temp.expect_gp_error(format(
  'select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),%L,%L)',
  (select v from gp_ids where k='p1'),
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/f.pdf','f.pdf','application/pdf','e',
  '21111111-0000-0000-0000-000000000005','final_manuscript'),
  'final manuscript must attach to a final milestone submission');

-- valid registration keeps working and stamps the kind
with x as (select public.register_graduation_project_file(
  (select v from gp_ids where k='p1'),null,
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/doc.pdf',
  'doc.pdf','application/pdf',1024,repeat('f',64),'21111111-0000-0000-0000-000000000006','proposal') id)
insert into gp_ids select 'file1',id from x;
do $$ begin
  if not exists(select 1 from public.graduation_project_files where id=(select v from gp_ids where k='file1') and file_kind='proposal') then
    raise exception 'CHECK FAILED: file_kind not persisted';
  end if;
  if not exists(select 1 from public.graduation_project_events
    where entity_id=(select v from gp_ids where k='file1') and event_type='file_registered' and payload->>'file_kind'='proposal') then
    raise exception 'CHECK FAILED: file_kind missing from event payload';
  end if;
end $$;
-- 8-arg legacy call form still resolves (defaulted kind)
with x as (select public.register_graduation_project_file(
  (select v from gp_ids where k='p1'),null,
  'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/legacy.pdf',
  'legacy.pdf','application/pdf',512,repeat('1',64),'21111111-0000-0000-0000-000000000007') id)
insert into gp_ids select 'file2',id from x;

-- ------------------------------------------------- notification fan-out + dedupe
-- student registered files above; supervisor should hold a deliverable-style
-- notification only for mapped events. Trigger a mapped event as the student:
-- file_registered is intentionally unmapped (noise control) => no rows yet.
do $$ declare v_n integer; begin
  select count(*) into v_n from public.graduation_project_notification_log where project_id=(select v from gp_ids where k='p1');
  if v_n<>0 then raise exception 'CHECK FAILED: unmapped event produced notifications'; end if;
end $$;
-- milestone_set maps to students+supervisors (actor excluded)
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
select public.set_graduation_project_milestone((select v from gp_ids where k='p1'),'Phase 1','progress',1,100,'21111111-0000-0000-0000-000000000008');
do $$ declare v_n integer; begin
  select count(*) into v_n from public.graduation_project_notification_log
    where project_id=(select v from gp_ids where k='p1') and notification_type='milestone_set';
  if v_n<>2 then raise exception 'CHECK FAILED: milestone_set fan-out expected 2 recipients, got %',v_n; end if;
  if exists(select 1 from public.graduation_project_notification_log
    where project_id=(select v from gp_ids where k='p1') and recipient_user_id=current_setting('gp.faculty_user_id')::uuid) then
    raise exception 'CHECK FAILED: actor must not notify themselves';
  end if;
end $$;
-- re-firing the same logical event (same correlation) is impossible (events are
-- unique), but a direct duplicate insert must be absorbed by the dedupe key.
select pg_temp.expect_sqlstate(format(
  'insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
     select project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id
       from public.graduation_project_notification_log where project_id=%L limit 1',
  (select v from gp_ids where k='p1')),
  '23505','duplicate notification insert');

-- own-notifications read: student sees their rows, outsider sees nothing.
select set_config('request.jwt.claim.sub', :'student_user_id', true);
do $$ declare v_n integer; begin
  select count(*) into v_n from public.list_my_graduation_project_notifications();
  if v_n<1 then raise exception 'CHECK FAILED: student should see their notifications'; end if;
end $$;
insert into auth.users values ('10000000-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000009', true);
do $$ declare v_n integer; begin
  select count(*) into v_n from public.list_my_graduation_project_notifications();
  if v_n<>0 then raise exception 'CHECK FAILED: outsider must see zero notifications'; end if;
end $$;
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- orphan review: pending-scan file aged 31 days appears; clean recent does not.
update public.graduation_project_files set created_at=now()-interval '31 days' where id=(select v from gp_ids where k='file1');
do $$ declare v_n integer; begin
  select count(*) into v_n from public.list_graduation_project_orphan_files()
    where file_id=(select v from gp_ids where k='file1') and reason='scan_pending_expired';
  if v_n<>1 then raise exception 'CHECK FAILED: aged pending-scan file not flagged as orphan'; end if;
end $$;

-- Files & notifications contract verified: MIME/size/kind gates, stage binding,
-- legacy call form, fan-out recipients, actor exclusion, dedupe, scoped reads,
-- orphan review.
rollback;
