-- AUDIT-05 PART 3 — EXTENDED ACTOR-MATRIX RUNTIME TESTS (disposable PG17, psql).
-- INDEPENDENT audit asset; modeled on the e2e fixture style but fully self-contained.
-- Prerequisite: minimal schema + M1..M8 applied. 100% synthetic TEST_ONLY data
-- (7e57-prefixed ids). Everything runs inside ONE rolled-back transaction.
-- Prints AUDIT05|<id>|<PASS|FAIL|INFO>|<description :: detail> rows.
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table gp_ids(k text primary key, v uuid not null) on commit drop;
insert into gp_ids values
  ('dept1','7e570000-0000-4000-8000-0000000000d1'),
  ('dept2','7e570000-0000-4000-8000-0000000000d2'),
  ('u_s1','7e570000-0000-4000-8000-0000000000a1'),
  ('u_s2','7e570000-0000-4000-8000-0000000000a2'),
  ('u_solo','7e570000-0000-4000-8000-0000000000a3'),
  ('u_s3','7e570000-0000-4000-8000-0000000000a4'),
  ('u_s4','7e570000-0000-4000-8000-0000000000a5'),
  ('u_sup','7e570000-0000-4000-8000-0000000000b1'),
  ('u_cosup','7e570000-0000-4000-8000-0000000000b2'),
  ('u_head','7e570000-0000-4000-8000-0000000000b3'),
  ('u_coord','7e570000-0000-4000-8000-0000000000b4'),
  ('u_sup2','7e570000-0000-4000-8000-0000000000b5'),
  ('u_chair','7e570000-0000-4000-8000-0000000000c1'),
  ('u_panel2','7e570000-0000-4000-8000-0000000000c2'),
  ('u_panel3','7e570000-0000-4000-8000-0000000000c3'),
  ('u_coord2','7e570000-0000-4000-8000-0000000000c4'),
  ('u_head2','7e570000-0000-4000-8000-0000000000c5'),
  ('u_supd2','7e570000-0000-4000-8000-0000000000c6'),
  ('u_cosupd2','7e570000-0000-4000-8000-0000000000c7'),
  ('corr_s1','7e570000-0000-4000-8000-00000000c001'),
  ('corr_s2','7e570000-0000-4000-8000-00000000c002'),
  ('sp_s1','7e570000-0000-4000-8000-0000000000e1'),
  ('sp_s2','7e570000-0000-4000-8000-0000000000e2'),
  ('sp_solo','7e570000-0000-4000-8000-0000000000e3'),
  ('sp_s3','7e570000-0000-4000-8000-0000000000e4'),
  ('sp_s4','7e570000-0000-4000-8000-0000000000e5'),
  ('fp_sup','7e570000-0000-4000-8000-0000000000f1'),
  ('fp_cosup','7e570000-0000-4000-8000-0000000000f2'),
  ('fp_head','7e570000-0000-4000-8000-0000000000f3'),
  ('fp_coord','7e570000-0000-4000-8000-0000000000f4'),
  ('fp_chair','7e570000-0000-4000-8000-0000000000f5'),
  ('fp_panel2','7e570000-0000-4000-8000-0000000000f6'),
  ('fp_sup2','7e570000-0000-4000-8000-0000000000f7'),
  ('fp_panel3','7e570000-0000-4000-8000-0000000000f8'),
  ('fp_coord2','7e570000-0000-4000-8000-0000000000f9'),
  ('fp_head2','7e570000-0000-4000-8000-0000000000fa'),
  ('fp_supd2','7e570000-0000-4000-8000-0000000000fb'),
  ('fp_cosupd2','7e570000-0000-4000-8000-0000000000fc');

insert into auth.users select v from gp_ids where k like 'u\_%';
insert into public.departments select v from gp_ids where k like 'dept_';
insert into public.student_profiles values
  ((select v from gp_ids where k='sp_s1'),(select v from gp_ids where k='u_s1'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_s2'),(select v from gp_ids where k='u_s2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_solo'),(select v from gp_ids where k='u_solo'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_s3'),(select v from gp_ids where k='u_s3'),(select v from gp_ids where k='dept2')),
  ((select v from gp_ids where k='sp_s4'),(select v from gp_ids where k='u_s4'),(select v from gp_ids where k='dept2'));
insert into public.faculty_profiles values
  ((select v from gp_ids where k='fp_sup'),(select v from gp_ids where k='u_sup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_cosup'),(select v from gp_ids where k='u_cosup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_chair'),(select v from gp_ids where k='u_chair'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_panel2'),(select v from gp_ids where k='u_panel2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_sup2'),(select v from gp_ids where k='u_sup2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_panel3'),(select v from gp_ids where k='u_panel3'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord2'),(select v from gp_ids where k='u_coord2'),(select v from gp_ids where k='dept2')),
  ((select v from gp_ids where k='fp_head2'),(select v from gp_ids where k='u_head2'),(select v from gp_ids where k='dept2')),
  ((select v from gp_ids where k='fp_supd2'),(select v from gp_ids where k='u_supd2'),(select v from gp_ids where k='dept2')),
  ((select v from gp_ids where k='fp_cosupd2'),(select v from gp_ids where k='u_cosupd2'),(select v from gp_ids where k='dept2'));

create temporary table a05r(n bigint generated always as identity, id text, description text, result text, detail text) on commit drop;
create temporary table gp_num(k text primary key, v bigint) on commit drop;

create function pg_temp.ok(p_id text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into a05r(id,description,result,detail) values(p_id,p_desc,'PASS','completed');
exception when others then insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.errx(p_id text, p_desc text, p_statement text, p_expected text) returns void language plpgsql as $$
begin execute p_statement; insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected denial not raised: '||p_expected);
exception when sqlstate 'P0001' then
  if sqlerrm=p_expected then insert into a05r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||sqlerrm);
  else insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected message: '||sqlerrm); end if;
when others then insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL','sqlstate '||sqlstate||': '||sqlerrm);
end $$;
-- genuine ACL test: runs the statement as the authenticated role, expects p_state
create function pg_temp.acl(p_id text, p_desc text, p_statement text, p_state text) returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  execute 'set role authenticated';
  begin
    execute p_statement;
    execute 'reset role';
    insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected ACL denial '||p_state||' not raised');
  exception when others then
    v_state:=sqlstate; v_msg:=sqlerrm;
    execute 'reset role';
    if v_state=p_state then insert into a05r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||v_state||': '||v_msg);
    else insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected: '||v_state||': '||v_msg); end if;
  end;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL','outer: '||sqlstate||': '||sqlerrm);
end $$;
-- informational record: run the statement, capture verbatim outcome, never fails the suite
create function pg_temp.rec(p_id text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into a05r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: completed without error');
exception when others then insert into a05r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: raised '||sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.note(p_id text, p_desc text, p_query text) returns void language plpgsql as $$
declare v text;
begin execute p_query into v; insert into a05r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: '||coalesce(v,'(null)'));
exception when others then insert into a05r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD query raised: '||sqlerrm);
end $$;
create function pg_temp.as_user(p_user_key text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',(select v::text from gp_ids where k=p_user_key),true); end $$;
create function pg_temp.gp(p_key text) returns text language sql stable as $$
  select v::text from gp_ids where k=p_key $$;
create function pg_temp.guard(p_id text, p_desc text, p_check text) returns void language plpgsql as $$
begin execute p_check; insert into a05r(id,description,result,detail) values(p_id,p_desc,'PASS','invariant holds');
exception when others then insert into a05r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlerrm);
end $$;

-- privileged bootstrap fixtures (rolled back with the transaction): one project per
-- department carrying the first coordinator/department_head assignments (the G4
-- privileged provisioning step, reproduced as a fixture exactly like the e2e verifier).
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept1'),'TEST_ONLY — A05 bootstrap d1','draft') returning id)
insert into gp_ids select 'p0',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'coordinator',(select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept2'),'TEST_ONLY — A05 bootstrap d2','draft') returning id)
insert into gp_ids select 'p0d2',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0d2'),'coordinator',(select v from gp_ids where k='fp_coord2'),(select v from gp_ids where k='u_coord2'),(select v from gp_ids where k='dept2'),(select v from gp_ids where k='u_coord2'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0d2'),'department_head',(select v from gp_ids where k='fp_head2'),(select v from gp_ids where k='u_head2'),(select v from gp_ids where k='dept2'),(select v from gp_ids where k='u_coord2'));

-- ============================== PHASE A: main project pA in dept1 (draft)
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pA.create','coordinator creates main project pA',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — A05 main','51111111-0000-0000-0000-0000000000a1','pA'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pA'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
select pg_temp.ok('SETUP.pA.add-s1','coordinator adds student 1 (fixed correlation id for the dedupe probe)',
  format('select public.add_graduation_project_team_member(%L,%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('sp_s1'),pg_temp.gp('u_s1'),pg_temp.gp('corr_s1')));
select pg_temp.ok('SETUP.pA.add-s2','coordinator adds student 2 (fixed correlation id for the dedupe probe)',
  format('with x as (select public.add_graduation_project_team_member(%L,%L,%L,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('sp_s2'),pg_temp.gp('u_s2'),pg_temp.gp('corr_s2'),'pA_asg_s2'));
select pg_temp.ok('SETUP.pA.assign-sup','coordinator assigns supervisor',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),'supervisor',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup')));
select pg_temp.ok('SETUP.pA.assign-cosup','coordinator assigns co-supervisor',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),'co_supervisor',pg_temp.gp('fp_cosup'),pg_temp.gp('u_cosup')));

-- (o) notification dedupe: replay the exact corr_s2 team-member add while pA is still
-- in draft (the M6 rewrite of this RPC checks state before the idempotency replay, so a
-- faithful retry is only reachable in a team-mutable state) and verify no duplicate rows.
insert into gp_num
  select 's2_events',count(*) from public.graduation_project_events where project_id=(select v from gp_ids where k='pA') and correlation_id=(select v from gp_ids where k='corr_s2')
  union all
  select 's2_notif',count(*) from public.graduation_project_notification_log where entity_id=(select v from gp_ids where k='pA_asg_s2');
select pg_temp.rec('T3.o.replayed-write','RECORD: replayed add_graduation_project_team_member with the same correlation_id returns without re-writing',
  format('select public.add_graduation_project_team_member(%L,%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('sp_s2'),pg_temp.gp('u_s2'),pg_temp.gp('corr_s2')));
select pg_temp.guard('T3.o.dedupe-events','replayed correlation_id produced no duplicate event rows',
  format('do $$ begin if (select count(*) from public.graduation_project_events where project_id=%L and correlation_id=%L)<>(select v from gp_num where k=%L) then raise exception %L; end if; end $$',
    pg_temp.gp('pA'),pg_temp.gp('corr_s2'),'s2_events','duplicate event after replay'));
select pg_temp.guard('T3.o.dedupe-notifications','replayed correlation_id produced no duplicate notification rows',
  format('do $$ begin if (select count(*) from public.graduation_project_notification_log where entity_id=%L)<>(select v from gp_num where k=%L) then raise exception %L; end if; end $$',
    pg_temp.gp('pA_asg_s2'),'s2_notif','duplicate notification after replay'));

-- (c) negative: resubmit from draft
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.c.resubmit-from-draft','resubmit_graduation_project_proposal from draft state must fail',
  format('select public.resubmit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pA')),
  'proposal resubmission precondition failed');
-- (d) negative: activate from draft (coordinator and student)
select pg_temp.as_user('u_coord');
select pg_temp.errx('T3.d.activate-from-draft','activate_graduation_project from draft state must fail',
  format('select public.activate_graduation_project(%L,1,gen_random_uuid())',pg_temp.gp('pA')),
  'project activation precondition failed');
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.d.activate-as-student','activate_graduation_project as student must fail',
  format('select public.activate_graduation_project(%L,1,gen_random_uuid())',pg_temp.gp('pA')),
  'exact direct processing assignment required');

-- ============================== (q) optimistic concurrency on pA
select pg_temp.ok('T3.q.first-submit','student submits proposal (version 1) — first attempt wins',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pA')));
select pg_temp.errx('T3.q.stale-submit','second submit with stale version and a fresh correlation id must fail',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pA')),
  'proposal transition precondition failed');

-- ============================== PHASE D: project pB to active with a live submission
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pB.create','coordinator creates project pB',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — A05 pB','pB'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pB'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
select pg_temp.ok('SETUP.pB.add-s1','coordinator adds student 1 to pB',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pB'),pg_temp.gp('sp_s1'),pg_temp.gp('u_s1')));
select pg_temp.as_user('u_s1');
select pg_temp.ok('SETUP.pB.submit','student submits pB proposal',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pB')));
select pg_temp.as_user('u_head');
select pg_temp.ok('SETUP.pB.start-review','head starts pB review',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('pB'),'start_review'));
select pg_temp.ok('SETUP.pB.require-revision','head returns pB for revision',
  format('select public.review_graduation_project_proposal(%L,%L,%L,3,gen_random_uuid())',pg_temp.gp('pB'),'require_revision','TEST_ONLY — revise'));
-- (c) negative: unrelated user in same department
select pg_temp.as_user('u_solo');
select pg_temp.errx('T3.c.resubmit-unrelated','resubmit as unrelated same-department user must fail',
  format('select public.resubmit_graduation_project_proposal(%L,4,gen_random_uuid())',pg_temp.gp('pB')),
  'exact direct processing assignment required');
-- (c) positive: student resubmits from revision_required
select pg_temp.as_user('u_s1');
select pg_temp.ok('T3.c.resubmit-positive','student resubmits from revision_required',
  format('select public.resubmit_graduation_project_proposal(%L,4,gen_random_uuid())',pg_temp.gp('pB')));
select pg_temp.as_user('u_head');
select pg_temp.ok('SETUP.pB.review2','head starts second pB review round',
  format('select public.review_graduation_project_proposal(%L,%L,null,5,gen_random_uuid())',pg_temp.gp('pB'),'start_review'));
select pg_temp.ok('SETUP.pB.approve','head approves pB',
  format('select public.review_graduation_project_proposal(%L,%L,null,6,gen_random_uuid())',pg_temp.gp('pB'),'approve'));
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pB.activate','coordinator activates pB',
  format('select public.activate_graduation_project(%L,7,gen_random_uuid())',pg_temp.gp('pB')));
select pg_temp.ok('SETUP.pB.milestone','coordinator sets pB milestone',
  format('select public.set_graduation_project_milestone(%L,%L,%L,1,100,gen_random_uuid())',pg_temp.gp('pB'),'TEST_ONLY — pB final','final'));
select pg_temp.as_user('u_s1');
select pg_temp.ok('SETUP.pB.deliverable','student submits pB deliverable (cross-project submission fixture)',
  format('with x as (select public.submit_graduation_project_deliverable(%L,(select id from public.graduation_project_milestones where project_id=%L),%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pB'),pg_temp.gp('pB'),'TEST_ONLY — pB v1','pB_sub'));

-- ============================== PHASE E: pA to active with milestone plan
select pg_temp.as_user('u_head');
select pg_temp.ok('SETUP.pA.start-review','head starts pA review',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('pA'),'start_review'));
select pg_temp.ok('SETUP.pA.approve','head approves pA',
  format('select public.review_graduation_project_proposal(%L,%L,null,3,gen_random_uuid())',pg_temp.gp('pA'),'approve'));
-- (d) positive: coordinator activates from approved
select pg_temp.as_user('u_coord');
select pg_temp.ok('T3.d.activate-positive','coordinator activates pA from approved',
  format('select public.activate_graduation_project(%L,4,gen_random_uuid())',pg_temp.gp('pA')));
select pg_temp.ok('SETUP.pA.milestones','coordinator sets pA milestone plan (40 progress + 60 final)',
  format('select public.set_graduation_project_milestone(%L,%L,%L,1,40,gen_random_uuid())',pg_temp.gp('pA'),'TEST_ONLY — mid','progress'));
select pg_temp.ok('SETUP.pA.milestone-final','coordinator sets pA final milestone',
  format('select public.set_graduation_project_milestone(%L,%L,%L,2,60,gen_random_uuid())',pg_temp.gp('pA'),'TEST_ONLY — final','final'));

-- ============================== PHASE F: (b) review_graduation_project_submission
select pg_temp.as_user('u_s2');
select pg_temp.ok('SETUP.pA.deliverable-m1','student 2 submits pA milestone 1 deliverable',
  format('with x as (select public.submit_graduation_project_deliverable(%L,(select id from public.graduation_project_milestones where project_id=%L and sequence_no=1),%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('pA'),'TEST_ONLY — m1 v1','pA_sub1'));
select pg_temp.as_user('u_cosup');
select pg_temp.errx('T3.b.review-as-co-supervisor','review_graduation_project_submission as co_supervisor must fail',
  format('select public.review_graduation_project_submission(%L,%L,%L,null,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_sub1'),'accept'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.b.review-as-student','review_graduation_project_submission as student must fail',
  format('select public.review_graduation_project_submission(%L,%L,%L,null,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_sub1'),'accept'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_sup');
select pg_temp.errx('T3.b.review-cross-project','review with a submission_id of another project must fail',
  format('select public.review_graduation_project_submission(%L,%L,%L,null,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pB_sub'),'accept'),
  'submission review precondition failed');
select pg_temp.ok('T3.b.review-positive','assigned supervisor accepts the milestone 1 submission',
  format('select public.review_graduation_project_submission(%L,%L,%L,null,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_sub1'),'accept'));

-- ============================== PHASE G: final deliverable accepted
select pg_temp.as_user('u_s1');
select pg_temp.ok('SETUP.pA.deliverable-final','student submits the final deliverable',
  format('with x as (select public.submit_graduation_project_deliverable(%L,(select id from public.graduation_project_milestones where project_id=%L and sequence_no=2),%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('pA'),'TEST_ONLY — final v1','pA_sub2'));
select pg_temp.as_user('u_sup');
select pg_temp.ok('SETUP.pA.accept-final','supervisor accepts the final deliverable',
  format('select public.review_graduation_project_submission(%L,%L,%L,null,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_sub2'),'accept'));

-- ============================== PHASE H: (j) register_graduation_project_file matrix
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.j.bad-mime','disallowed MIME type must fail',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/evil.exe','evil.exe','application/x-msdownload','a'),
  'file media type not allowed');
select pg_temp.errx('T3.j.oversize','byte_size above 50 MiB must fail',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,52428801,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/big.pdf','big.pdf','application/pdf','b'),
  'file size exceeds limit');
select pg_temp.errx('T3.j.key-outside-scope','object_key outside graduation-projects/<project_id>/ must fail',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pB')||'/stolen.pdf','stolen.pdf','application/pdf','c'),
  'file object key outside project scope');
select pg_temp.errx('T3.j.key-dotdot','object_key containing a dot-dot segment must fail',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/../escape.pdf','escape.pdf','application/pdf','d'),
  'file object key outside project scope');
select pg_temp.errx('T3.j.stage-binding','file_kind milestone_submission without a submission must fail',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid(),%L)',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/unbound.pdf','unbound.pdf','application/pdf','e','milestone_submission'),
  'file stage binding invalid');
select pg_temp.as_user('u_solo');
select pg_temp.errx('T3.j.unrelated','file registration as unrelated user must fail',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/outsider.pdf','outsider.pdf','application/pdf','f'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_s1');
select pg_temp.ok('T3.j.student-positive','student registers the final manuscript (becomes the clean final file)',
  format('with f as (select public.register_graduation_project_file(%L,%L,%L,%L,%L,1200000,repeat(%L,64),gen_random_uuid(),%L) id) insert into gp_ids select %L,id from f',
    pg_temp.gp('pA'),pg_temp.gp('pA_sub2'),'graduation-projects/'||pg_temp.gp('pA')||'/final.pdf','final.pdf','application/pdf','0','final_manuscript','pA_ff1'));
select pg_temp.ok('SETUP.pA.second-final','student registers a second final manuscript (left scan-pending for archive negatives)',
  format('with f as (select public.register_graduation_project_file(%L,%L,%L,%L,%L,1200000,repeat(%L,64),gen_random_uuid(),%L) id) insert into gp_ids select %L,id from f',
    pg_temp.gp('pA'),pg_temp.gp('pA_sub2'),'graduation-projects/'||pg_temp.gp('pA')||'/final-v2.pdf','final-v2.pdf','application/pdf','1','final_manuscript','pA_ff2'));
select pg_temp.as_user('u_sup');
select pg_temp.ok('T3.j.supervisor-positive','supervisor registers an attachment',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,2048,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/feedback.txt','feedback.txt','text/plain','2'));
select pg_temp.as_user('u_s2');
select pg_temp.rec('T3.j.team-member','RECORD: second student (team member) registers an attachment',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,2048,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pA'),'graduation-projects/'||pg_temp.gp('pA')||'/teammate.txt','teammate.txt','text/plain','3'));

-- ============================== PHASE I: (f) resolve_graduation_project_supervisor_note
select pg_temp.as_user('u_sup');
select pg_temp.ok('SETUP.pA.note1','supervisor adds note 1',
  format('with x as (select public.add_graduation_project_supervisor_note(%L,null,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'TEST_ONLY — note 1','pA_note1'));
select pg_temp.ok('T3.f.resolve-owning','owning supervisor resolves note 1',
  format('select public.resolve_graduation_project_supervisor_note(%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_note1')));
select pg_temp.ok('SETUP.pA.note2','supervisor adds note 2',
  format('with x as (select public.add_graduation_project_supervisor_note(%L,null,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'TEST_ONLY — note 2','pA_note2'));
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pA.end-sup','coordinator ends the first supervisor assignment (supervision slot handover)',
  format('select public.end_graduation_project_assignment(%L,(select id from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L),gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA'),pg_temp.gp('u_sup'),'supervisor'));
select pg_temp.ok('SETUP.pA.assign-sup2','coordinator assigns the replacement supervisor',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),'supervisor',pg_temp.gp('fp_sup2'),pg_temp.gp('u_sup2')));
select pg_temp.as_user('u_sup2');
select pg_temp.rec('T3.f.resolve-other-supervisor','RECORD: replacement supervisor resolves a note authored by the previous supervisor',
  format('select public.resolve_graduation_project_supervisor_note(%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_note2')));
select pg_temp.note('T3.f.note2-end-state','RECORD: note 2 resolved_at after the cross-supervisor resolve attempt',
  format('select resolved_at::text from public.graduation_project_supervisor_notes where id=%L',pg_temp.gp('pA_note2')));
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.f.resolve-as-student','note resolution as student must fail',
  format('select public.resolve_graduation_project_supervisor_note(%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_note2')),
  'exact direct processing assignment required');

-- ============================== PHASE J: scan decision + genuine ACL probes
select pg_temp.ok('SETUP.pA.scan-clean','external scanner marks the first final file clean (service path)',
  format('select public.set_graduation_project_file_scan_state(%L,%L,gen_random_uuid())',pg_temp.gp('pA_ff1'),'clean'));
select pg_temp.acl('T3.i.orphan-files-acl','list_graduation_project_orphan_files as role authenticated must fail 42501',
  'select * from public.list_graduation_project_orphan_files()','42501');
select pg_temp.acl('T3.i.scan-state-acl','set_graduation_project_file_scan_state as role authenticated must fail 42501',
  format('select public.set_graduation_project_file_scan_state(%L,%L,gen_random_uuid())',pg_temp.gp('pA_ff2'),'clean'),'42501');
select pg_temp.acl('T3.p.direct-select-acl','direct select on graduation_projects as role authenticated must fail 42501 (RLS+grants default-deny)',
  'select * from public.graduation_projects','42501');
select pg_temp.acl('T3.p.direct-insert-acl','direct insert into graduation_projects as role authenticated must fail 42501',
  format('insert into public.graduation_projects(department_id,proposal_title) values(%L,%L)',pg_temp.gp('dept1'),'TEST_ONLY — acl probe'),'42501');

-- ============================== PHASE K: discussion path + (a) reject request matrix
select pg_temp.as_user('u_s1');
select pg_temp.ok('SETUP.pA.request-discussion','student requests the defense once ready',
  format('with x as (select public.request_graduation_project_discussion(%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'pA_req1'));
select pg_temp.errx('T3.a.reject-as-student','reject_graduation_project_discussion_request as student must fail',
  format('select public.reject_graduation_project_discussion_request(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_req1'),'TEST_ONLY — no'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_solo');
select pg_temp.errx('T3.a.reject-as-unrelated','reject as unrelated same-department user must fail',
  format('select public.reject_graduation_project_discussion_request(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_req1'),'TEST_ONLY — no'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_coord2');
select pg_temp.errx('T3.a.reject-as-cross-dept-coordinator','reject as a coordinator of another department must fail',
  format('select public.reject_graduation_project_discussion_request(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_req1'),'TEST_ONLY — no'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_coord');
select pg_temp.ok('T3.a.reject-positive','coordinator rejects the pending discussion request',
  format('select public.reject_graduation_project_discussion_request(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_req1'),'TEST_ONLY — panel unavailable'));
select pg_temp.as_user('u_s1');
select pg_temp.ok('SETUP.pA.re-request','student re-requests the defense',
  format('with x as (select public.request_graduation_project_discussion(%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'pA_req2'));
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pA.schedule','coordinator schedules the defense',
  format('with x as (select public.schedule_graduation_project_discussion(%L,%L,now()+%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('pA_req2'),'10 days','TEST_ONLY — Hall 7','pA_disc'));
select pg_temp.ok('SETUP.pA.assign-chair','coordinator assigns chair panel_member to the project',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'panel_member',pg_temp.gp('fp_chair'),pg_temp.gp('u_chair'),'pA_asg_chair'));
select pg_temp.ok('SETUP.pA.assign-panel2','coordinator assigns second panel_member to the project',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'panel_member',pg_temp.gp('fp_panel2'),pg_temp.gp('u_panel2'),'pA_asg_panel2'));
select pg_temp.ok('SETUP.pA.assign-panel3','coordinator assigns a third panel_member to the project (never attached to the discussion)',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'panel_member',pg_temp.gp('fp_panel3'),pg_temp.gp('u_panel3'),'pA_asg_panel3'));
select pg_temp.ok('SETUP.pA.attach-chair','coordinator attaches the chair to the discussion',
  format('select public.assign_graduation_project_panel_member(%L,%L,%L,true,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_disc'),pg_temp.gp('pA_asg_chair')));
select pg_temp.ok('SETUP.pA.attach-panel2','coordinator attaches the second panel member to the discussion',
  format('select public.assign_graduation_project_panel_member(%L,%L,%L,false,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_disc'),pg_temp.gp('pA_asg_panel2')));
select pg_temp.ok('SETUP.pA.held','coordinator records the defense as held',
  format('select public.record_graduation_project_discussion_outcome(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('pA_disc'),'held'));

-- ============================== PHASE L: (k) save / (l) finalize evaluation matrix
select pg_temp.as_user('u_panel3');
select pg_temp.errx('T3.k.save-unattached-panel','save_graduation_project_evaluation as project panel_member NOT attached to the discussion must fail',
  format('select public.save_graduation_project_evaluation(%L,%L,%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA_disc'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":100,"awarded_score":90}]'),
  'evaluation write precondition failed');
select pg_temp.as_user('u_sup2');
select pg_temp.errx('T3.k.save-as-supervisor','save_graduation_project_evaluation as supervisor must fail',
  format('select public.save_graduation_project_evaluation(%L,%L,%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA_disc'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":100,"awarded_score":90}]'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_chair');
select pg_temp.ok('T3.k.save-positive','attached chair submits their evaluation',
  format('with x as (select public.save_graduation_project_evaluation(%L,%L,%L,%L::jsonb,null,true,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('pA_disc'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":55},{"criterion_code":"defense","criterion_label":"Defense","maximum_score":40,"awarded_score":35}]','pA_ev1'));
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.l.finalize-as-student','finalize_graduation_project_evaluation as student must fail',
  format('select public.finalize_graduation_project_evaluation(%L,gen_random_uuid())',pg_temp.gp('pA_ev1')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_coord');
select pg_temp.errx('T3.l.finalize-as-coordinator','finalize_graduation_project_evaluation as coordinator must fail',
  format('select public.finalize_graduation_project_evaluation(%L,gen_random_uuid())',pg_temp.gp('pA_ev1')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_panel3');
select pg_temp.errx('T3.l.finalize-as-unattached-panel','finalize another panel member''s evaluation as an unattached panel_member must fail',
  format('select public.finalize_graduation_project_evaluation(%L,gen_random_uuid())',pg_temp.gp('pA_ev1')),
  'evaluator panel assignment mismatch');
select pg_temp.as_user('u_chair');
select pg_temp.ok('SETUP.pA.finalize-chair','chair finalizes their evaluation',
  format('select public.finalize_graduation_project_evaluation(%L,gen_random_uuid())',pg_temp.gp('pA_ev1')));
select pg_temp.as_user('u_panel2');
select pg_temp.ok('SETUP.pA.save-panel2','second panel member submits their evaluation',
  format('with x as (select public.save_graduation_project_evaluation(%L,%L,%L,%L::jsonb,null,true,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('pA_disc'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":50},{"criterion_code":"defense","criterion_label":"Defense","maximum_score":40,"awarded_score":38}]','pA_ev2'));
select pg_temp.ok('SETUP.pA.finalize-panel2','second panel member finalizes their evaluation',
  format('select public.finalize_graduation_project_evaluation(%L,gen_random_uuid())',pg_temp.gp('pA_ev2')));

-- ============================== PHASE M: conclude + (n) archive negatives
select pg_temp.as_user('u_head');
select pg_temp.ok('SETUP.pA.conclude','head concludes the result completed',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('pA'),'completed',pg_temp.gp('pA')));
select pg_temp.errx('T3.n.archive-wrong-version','archive with a wrong expected_version must fail',
  format('select public.archive_graduation_project(%L,%L,(select version+100 from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA_ff1'),pg_temp.gp('pA')),
  'project not archive-ready');
select pg_temp.errx('T3.n.archive-nonclean-file','archive with a scan-pending (non-clean) final file must fail',
  format('select public.archive_graduation_project(%L,%L,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA_ff2'),pg_temp.gp('pA')),
  'clean accepted final evidence and accepted corrections required');
insert into public.graduation_project_corrections(project_id,requested_by_assignment_id,description)
  values((select v from gp_ids where k='pA'),
    (select id from public.graduation_project_assignments where project_id=(select v from gp_ids where k='pA') and user_id=(select v from gp_ids where k='u_head')),
    'TEST_ONLY — injected unaccepted correction');
select pg_temp.errx('T3.n.archive-pending-correction','archive with an unaccepted correction outstanding must fail',
  format('select public.archive_graduation_project(%L,%L,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA_ff1'),pg_temp.gp('pA')),
  'clean accepted final evidence and accepted corrections required');
delete from public.graduation_project_corrections where project_id=(select v from gp_ids where k='pA');
select pg_temp.ok('T3.n.archive-positive','head archives with the clean final file and correct version',
  format('select public.archive_graduation_project(%L,%L,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('pA'),pg_temp.gp('pA_ff1'),pg_temp.gp('pA')));

-- ============================== PHASE N: (g) report RPC matrix, (h) notification scoping, (o) dedupe
-- (g) 5 report RPCs x {student, unrelated, cross-department coordinator, same-department coordinator}
select pg_temp.as_user('u_s1');
select pg_temp.errx('T3.g.states-report-as-student','states report as student must fail',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.assignments-report-as-student','assignments report as student must fail',
  format('select public.get_graduation_project_assignments_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.evaluations-report-as-student','evaluations report as student must fail',
  format('select public.get_graduation_project_evaluations_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.archive-report-as-student','archive report as student must fail',
  format('select public.get_graduation_project_archive_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.defense-report-as-student','defense report as student must fail',
  format('select public.get_graduation_project_defense_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.as_user('u_solo');
select pg_temp.errx('T3.g.states-report-as-unrelated','states report as unrelated user must fail',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.assignments-report-as-unrelated','assignments report as unrelated user must fail',
  format('select public.get_graduation_project_assignments_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.evaluations-report-as-unrelated','evaluations report as unrelated user must fail',
  format('select public.get_graduation_project_evaluations_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.archive-report-as-unrelated','archive report as unrelated user must fail',
  format('select public.get_graduation_project_archive_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.defense-report-as-unrelated','defense report as unrelated user must fail',
  format('select public.get_graduation_project_defense_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.as_user('u_coord2');
select pg_temp.errx('T3.g.states-report-cross-dept','states report as cross-department coordinator must fail',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.assignments-report-cross-dept','assignments report as cross-department coordinator must fail',
  format('select public.get_graduation_project_assignments_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.evaluations-report-cross-dept','evaluations report as cross-department coordinator must fail',
  format('select public.get_graduation_project_evaluations_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.archive-report-cross-dept','archive report as cross-department coordinator must fail',
  format('select public.get_graduation_project_archive_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.errx('T3.g.defense-report-cross-dept','defense report as cross-department coordinator must fail',
  format('select public.get_graduation_project_defense_report(%L)',pg_temp.gp('dept1')),'department report assignment required');
select pg_temp.as_user('u_coord');
select pg_temp.ok('T3.g.states-report-positive','states report as same-department coordinator',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('dept1')));
select pg_temp.ok('T3.g.assignments-report-positive','assignments report as same-department coordinator',
  format('select public.get_graduation_project_assignments_report(%L)',pg_temp.gp('dept1')));
select pg_temp.ok('T3.g.evaluations-report-positive','evaluations report as same-department coordinator',
  format('select public.get_graduation_project_evaluations_report(%L)',pg_temp.gp('dept1')));
select pg_temp.ok('T3.g.archive-report-positive','archive report as same-department coordinator',
  format('select public.get_graduation_project_archive_report(%L)',pg_temp.gp('dept1')));
select pg_temp.ok('T3.g.defense-report-positive','defense report as same-department coordinator',
  format('select public.get_graduation_project_defense_report(%L)',pg_temp.gp('dept1')));

-- (h) notification recipient scoping
select pg_temp.as_user('u_s2');
select pg_temp.guard('T3.h.recipient-positive','recipient (student 2) sees at least one pA notification of their own',
  format('do $$ begin if (select count(*) from public.list_my_graduation_project_notifications() where project_id=%L)<1 then raise exception %L; end if; end $$',
    pg_temp.gp('pA'),'recipient sees zero notifications'));
select pg_temp.as_user('u_solo');
select pg_temp.guard('T3.h.cross-user-isolation','unrelated user B receives zero of the pA actors'' notifications',
  format('do $$ begin if (select count(*) from public.list_my_graduation_project_notifications())<>0 then raise exception %L; end if; end $$',
    'unrelated user leaked notifications'));

-- ============================== PHASE O: (e) end_graduation_project_assignment on pB
select pg_temp.as_user('u_coord');
select pg_temp.errx('T3.e.self-end','coordinator ending their OWN assignment must fail',
  format('select public.end_graduation_project_assignment(%L,(select id from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L),gen_random_uuid())',
    pg_temp.gp('pB'),pg_temp.gp('pB'),pg_temp.gp('u_coord'),'coordinator'),
  'cannot end own assignment');
select pg_temp.rec('T3.e.coord-ends-dept-head','RECORD: coordinator ends the project''s department_head assignment',
  format('select public.end_graduation_project_assignment(%L,(select id from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L),gen_random_uuid())',
    pg_temp.gp('pB'),pg_temp.gp('pB'),pg_temp.gp('u_head'),'department_head'));
select pg_temp.note('T3.e.ended-head-state','RECORD: pB department_head assignment state after the coordinator end attempt (active / ended_at)',
  format('select active::text||'' / ''||coalesce(ended_at::text,''NULL'') from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L',
    pg_temp.gp('pB'),pg_temp.gp('u_head'),'department_head'));
select pg_temp.as_user('u_head');
select pg_temp.errx('T3.e.ended-user-write','ended department_head must fail a subsequent write RPC',
  format('select public.review_graduation_project_proposal(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('pB'),'start_review',pg_temp.gp('pB')),
  'exact direct processing assignment required');

-- ============================== PHASE P: (m) M6 settings enforcement in dept2
select pg_temp.as_user('u_head2');
select pg_temp.ok('SETUP.m.upsert-settings','dept2 head upserts settings (team 1..1)',
  format('select public.upsert_graduation_project_settings(%L,null,1,1,null,true,30,7,gen_random_uuid())',pg_temp.gp('dept2')));
select pg_temp.as_user('u_coord2');
select pg_temp.ok('SETUP.m.create-pS1','dept2 coordinator creates settings-test project pS1',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept2'),'TEST_ONLY — A05 pS1','pS1'));
select pg_temp.ok('SETUP.m.add-first-member','first team member within team_max=1',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pS1'),pg_temp.gp('sp_s3'),pg_temp.gp('u_s3')));
select pg_temp.errx('T3.m.team-max','adding a 2nd team member with team_max=1 must fail',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pS1'),pg_temp.gp('sp_s4'),pg_temp.gp('u_s4')),
  'team size limit reached');
update public.graduation_project_settings set supervisor_capacity=1 where department_id=(select v from gp_ids where k='dept2');
select pg_temp.as_user('u_coord2');
select pg_temp.ok('T3.m.capacity-first','first supervision within supervisor_capacity=1 succeeds',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pS1'),'supervisor',pg_temp.gp('fp_supd2'),pg_temp.gp('u_supd2')));
select pg_temp.ok('SETUP.m.create-pS2','dept2 coordinator creates second settings-test project pS2',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept2'),'TEST_ONLY — A05 pS2','pS2'));
select pg_temp.errx('T3.m.capacity-exceeded','assigning the same supervisor to a 2nd live project with capacity=1 must fail',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pS2'),'supervisor',pg_temp.gp('fp_supd2'),pg_temp.gp('u_supd2')),
  'supervisor capacity reached');
update public.graduation_project_settings set co_supervisor_allowed=false where department_id=(select v from gp_ids where k='dept2');
select pg_temp.errx('T3.m.cosup-denied','co_supervisor assignment with co_supervisor_allowed=false must fail',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pS1'),'co_supervisor',pg_temp.gp('fp_cosupd2'),pg_temp.gp('u_cosupd2')),
  'co-supervisor not allowed by settings');
update public.graduation_project_settings set co_supervisor_allowed=true where department_id=(select v from gp_ids where k='dept2');
select pg_temp.ok('T3.m.cosup-positive','co_supervisor assignment with co_supervisor_allowed=true succeeds',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('pS1'),'co_supervisor',pg_temp.gp('fp_cosupd2'),pg_temp.gp('u_cosupd2')));
update public.graduation_project_settings set proposal_window_closes_at=now()-interval '1 hour' where department_id=(select v from gp_ids where k='dept2');
select pg_temp.as_user('u_s3');
select pg_temp.errx('T3.m.window-closed','proposal submission outside the configured window must fail',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pS1')),
  'proposal window closed');
update public.graduation_project_settings set proposal_window_closes_at=null,proposal_window_opens_at=null where department_id=(select v from gp_ids where k='dept2');
select pg_temp.ok('T3.m.window-positive','proposal submission with an open window succeeds',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pS1')));

-- ============================================================ RESULTS
select 'AUDIT05|'||id||'|'||result||'|'||description||' :: '||detail from a05r order by n;
rollback;
