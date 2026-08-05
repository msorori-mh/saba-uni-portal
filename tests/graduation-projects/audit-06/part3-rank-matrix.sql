-- AUDIT-06 PART 3 — F-1 RANK-BOUNDARY MATRIX for M9 end_graduation_project_assignment.
-- Disposable PG17; prerequisite: minimal schema + M1..M9. 100% synthetic TEST_ONLY
-- data (7e58-prefixed ids); single rolled-back transaction. Every rejection also
-- proves ZERO mutation (target assignment row unchanged + zero events for the
-- attempt's correlation_id). Prints AUDIT06|id|result|description :: detail rows.
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table gp_ids(k text primary key, v uuid not null) on commit drop;
insert into gp_ids values
  ('dept1','7e580000-0000-4000-8000-0000000000d1'),
  ('dept2','7e580000-0000-4000-8000-0000000000d2'),
  ('u_s1','7e580000-0000-4000-8000-0000000000a1'),
  ('u_s2','7e580000-0000-4000-8000-0000000000a2'),
  ('u_sup','7e580000-0000-4000-8000-0000000000b1'),
  ('u_cosup','7e580000-0000-4000-8000-0000000000b2'),
  ('u_head','7e580000-0000-4000-8000-0000000000b3'),
  ('u_coord','7e580000-0000-4000-8000-0000000000b4'),
  ('u_sup2','7e580000-0000-4000-8000-0000000000b5'),
  ('u_dean','7e580000-0000-4000-8000-0000000000b6'),
  ('u_panel','7e580000-0000-4000-8000-0000000000b7'),
  ('u_coordb','7e580000-0000-4000-8000-0000000000b8'),
  ('u_head2','7e580000-0000-4000-8000-0000000000b9'),
  ('u_coord2','7e580000-0000-4000-8000-0000000000c1'),
  ('u_solo','7e580000-0000-4000-8000-0000000000c2'),
  ('sp_s1','7e580000-0000-4000-8000-0000000000e1'),
  ('sp_s2','7e580000-0000-4000-8000-0000000000e2'),
  ('fp_sup','7e580000-0000-4000-8000-0000000000f1'),
  ('fp_cosup','7e580000-0000-4000-8000-0000000000f2'),
  ('fp_head','7e580000-0000-4000-8000-0000000000f3'),
  ('fp_coord','7e580000-0000-4000-8000-0000000000f4'),
  ('fp_sup2','7e580000-0000-4000-8000-0000000000f5'),
  ('fp_dean','7e580000-0000-4000-8000-0000000000f6'),
  ('fp_panel','7e580000-0000-4000-8000-0000000000f7'),
  ('fp_coordb','7e580000-0000-4000-8000-0000000000f8'),
  ('fp_head2','7e580000-0000-4000-8000-0000000000f9'),
  ('fp_coord2','7e580000-0000-4000-8000-0000000000fa'),
  ('fp_solo','7e580000-0000-4000-8000-0000000000fb');

insert into auth.users select v from gp_ids where k like 'u\_%';
insert into public.departments select v from gp_ids where k like 'dept_';
insert into public.student_profiles values
  ((select v from gp_ids where k='sp_s1'),(select v from gp_ids where k='u_s1'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_s2'),(select v from gp_ids where k='u_s2'),(select v from gp_ids where k='dept1'));
insert into public.faculty_profiles values
  ((select v from gp_ids where k='fp_sup'),(select v from gp_ids where k='u_sup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_cosup'),(select v from gp_ids where k='u_cosup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_sup2'),(select v from gp_ids where k='u_sup2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_dean'),(select v from gp_ids where k='u_dean'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_panel'),(select v from gp_ids where k='u_panel'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coordb'),(select v from gp_ids where k='u_coordb'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_head2'),(select v from gp_ids where k='u_head2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord2'),(select v from gp_ids where k='u_coord2'),(select v from gp_ids where k='dept2')),
  ((select v from gp_ids where k='fp_solo'),(select v from gp_ids where k='u_solo'),(select v from gp_ids where k='dept1'));

create temporary table a06r(n bigint generated always as identity, id text, description text, result text, detail text) on commit drop;
create function pg_temp.ok(p_id text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','completed');
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.guard(p_id text, p_desc text, p_check text) returns void language plpgsql as $$
begin execute p_check; insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','invariant holds');
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlerrm);
end $$;
create function pg_temp.note(p_id text, p_desc text, p_query text) returns void language plpgsql as $$
declare v text;
begin execute p_query into v; insert into a06r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD: '||coalesce(v,'(null)'));
exception when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'INFO','RECORD query raised: '||sqlerrm);
end $$;
create function pg_temp.as_user(p_user_key text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',(select v::text from gp_ids where k=p_user_key),true); end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub','',true); end $$;
create function pg_temp.gp(p_key text) returns text language sql stable as $$
  select v::text from gp_ids where k=p_key $$;
-- denial with zero-mutation proof: exact P0001 message, zero events for the
-- attempt correlation id, target assignment row byte-identical (active, ended_at).
create function pg_temp.deny(p_id text, p_desc text, p_stmt text, p_expected text, p_target_key text, p_corr_key text)
returns void language plpgsql as $$
declare v_active boolean; v_ended timestamptz; w_active boolean; w_ended timestamptz; v_events bigint;
begin
  if p_target_key is not null then
    select active, ended_at into v_active, v_ended from public.graduation_project_assignments
      where id=(select v from gp_ids where k=p_target_key);
  end if;
  execute p_stmt;
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected denial not raised: '||p_expected);
exception when sqlstate 'P0001' then
  if sqlerrm<>p_expected then
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected message: '||sqlerrm);
    return;
  end if;
  select count(*) into v_events from public.graduation_project_events
    where correlation_id=(select v from gp_ids where k=p_corr_key);
  if v_events>0 then
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','denied with '||v_events||' event rows written: '||sqlerrm);
    return;
  end if;
  if p_target_key is not null then
    select active, ended_at into w_active, w_ended from public.graduation_project_assignments
      where id=(select v from gp_ids where k=p_target_key);
    if w_active is distinct from v_active or w_ended is distinct from v_ended then
      insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','denied but target assignment mutated: '||sqlerrm);
      return;
    end if;
  end if;
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||sqlerrm||' | zero events, target unchanged');
when others then
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','sqlstate '||sqlstate||': '||sqlerrm);
end $$;
-- allowed end: target becomes inactive+ended, exactly one assignment_ended event
-- carrying the attempt correlation id with entity_id = target.
create function pg_temp.allow_end(p_id text, p_desc text, p_stmt text, p_target_key text, p_corr_key text)
returns void language plpgsql as $$
declare v_events bigint; v_target uuid;
begin
  v_target:=(select v from gp_ids where k=p_target_key);
  execute p_stmt;
  if not exists(select 1 from public.graduation_project_assignments where id=v_target and not active and ended_at is not null) then
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','target assignment not ended');
    return;
  end if;
  select count(*) into v_events from public.graduation_project_events
    where correlation_id=(select v from gp_ids where k=p_corr_key) and event_type='assignment_ended' and entity_id=v_target;
  if v_events<>1 then
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected exactly 1 assignment_ended event, found '||v_events);
    return;
  end if;
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','allowed: assignment ended, exactly one assignment_ended event with the correlation id');
exception when others then
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL',sqlstate||': '||sqlerrm);
end $$;

-- privileged bootstrap fixtures (rolled back): p0 in dept1 carrying the first
-- coordinator/department_head/dean assignments; pC in dept2 for its coordinator.
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept1'),'TEST_ONLY — A06 bootstrap d1','draft') returning id)
insert into gp_ids select 'p0',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'coordinator',(select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord')) returning id)
insert into gp_ids select 'p0_asg_head',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'dean',(select v from gp_ids where k='fp_dean'),(select v from gp_ids where k='u_dean'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept2'),'TEST_ONLY — A06 bootstrap d2','draft') returning id)
insert into gp_ids select 'pC',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pC'),'coordinator',(select v from gp_ids where k='fp_coord2'),(select v from gp_ids where k='u_coord2'),(select v from gp_ids where k='dept2'),(select v from gp_ids where k='u_coord2'));

-- main project pA in dept1 (draft) with the full role set
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pA.create','coordinator creates project pA',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — A06 rank matrix','pA'));
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pA'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord')) returning id)
insert into gp_ids select 'pA_asg_head',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pA'),'dean',(select v from gp_ids where k='fp_dean'),(select v from gp_ids where k='u_dean'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord')) returning id)
insert into gp_ids select 'pA_asg_dean',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pA'),'department_head',(select v from gp_ids where k='fp_head2'),(select v from gp_ids where k='u_head2'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord')) returning id)
insert into gp_ids select 'pA_asg_head2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pA'),'panel_member',(select v from gp_ids where k='fp_panel'),(select v from gp_ids where k='u_panel'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord')) returning id)
insert into gp_ids select 'pA_asg_panel',id from x;
select pg_temp.ok('SETUP.pA.assign-sup','coordinator assigns supervisor',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'supervisor',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup'),'pA_asg_sup'));
select pg_temp.ok('SETUP.pA.assign-cosup','coordinator assigns co-supervisor',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'co_supervisor',pg_temp.gp('fp_cosup'),pg_temp.gp('u_cosup'),'pA_asg_cosup'));
select pg_temp.ok('SETUP.pA.assign-coordb','coordinator assigns a second coordinator',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'coordinator',pg_temp.gp('fp_coordb'),pg_temp.gp('u_coordb'),'pA_asg_coordb'));
select pg_temp.ok('SETUP.pA.add-s1','coordinator adds student 1',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('pA'),pg_temp.gp('sp_s1'),pg_temp.gp('u_s1')));
select pg_temp.ok('SETUP.pA.add-s2','coordinator adds student 2',
  format('with x as (select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),pg_temp.gp('sp_s2'),pg_temp.gp('u_s2'),'pA_asg_s2'));
select pg_temp.ok('SETUP.coord-own-asg','capture the coordinator''s own pA assignment id',
  format('insert into gp_ids select %L,id from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L',
    'pA_asg_coord',pg_temp.gp('pA'),pg_temp.gp('u_coord'),'coordinator'));
select pg_temp.ok('SETUP.p0-coord-asg','capture the p0 coordinator assignment id (cross-project probe)',
  format('insert into gp_ids select %L,id from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L',
    'p0_asg_coord',pg_temp.gp('p0'),pg_temp.gp('u_coord'),'coordinator'));
insert into gp_ids select 'corr'||g, gen_random_uuid() from generate_series(1,30) g;

-- 18. self-end must fail before any rank logic
select pg_temp.deny('T3.18.self-end','coordinator ending their OWN assignment must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_coord'),pg_temp.gp('corr18')),
  'cannot end own assignment','pA_asg_coord','corr18');
-- 19. assignment id of another project must fail
select pg_temp.deny('T3.19.cross-project-id','end with an assignment_id of another project must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('p0_asg_coord'),pg_temp.gp('corr19')),
  'assignment not found','p0_asg_coord','corr19');
-- 15. anonymous (claim unset)
select pg_temp.as_anon();
select pg_temp.deny('T3.15.anonymous','anonymous caller (auth.uid() null) must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr15')),
  'exact direct processing assignment required','pA_asg_sup','corr15');
-- 14. unrelated faculty, no assignment on pA
select pg_temp.as_user('u_solo');
select pg_temp.deny('T3.14.unrelated','unrelated faculty without a pA assignment must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr14')),
  'exact direct processing assignment required','pA_asg_sup','corr14');
-- 13. wrong-department coordinator
select pg_temp.as_user('u_coord2');
select pg_temp.deny('T3.13.wrong-dept-coordinator','a coordinator of another department must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr13')),
  'exact direct processing assignment required','pA_asg_sup','corr13');
-- 12. dean is not in the actor whitelist
select pg_temp.as_user('u_dean');
select pg_temp.deny('T3.12.dean-not-whitelisted','dean ending a supervisor must fail (dean not whitelisted)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr12')),
  'exact direct processing assignment required','pA_asg_sup','corr12');
-- 5. coordinator ends department_head -> rank boundary
select pg_temp.as_user('u_coord');
select pg_temp.deny('T3.05.coord-ends-head','coordinator ending a department_head must fail the rank boundary',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_head'),pg_temp.gp('corr5')),
  'assignment termination authority denied','pA_asg_head','corr5');
-- 6. coordinator ends dean -> rank boundary
select pg_temp.deny('T3.06.coord-ends-dean','coordinator ending a dean must fail the rank boundary',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_dean'),pg_temp.gp('corr6')),
  'assignment termination authority denied','pA_asg_dean','corr6');
-- 7. coordinator ends another coordinator (same rank)
select pg_temp.deny('T3.07.coord-ends-coord','coordinator ending another coordinator (same rank) must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_coordb'),pg_temp.gp('corr7')),
  'assignment termination authority denied','pA_asg_coordb','corr7');
-- 11. department_head ends dean -> rank boundary
select pg_temp.as_user('u_head');
select pg_temp.deny('T3.11.head-ends-dean','department_head ending a dean must fail the rank boundary',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_dean'),pg_temp.gp('corr11')),
  'assignment termination authority denied','pA_asg_dean','corr11');
-- 10. department_head ends another department_head (same rank)
select pg_temp.deny('T3.10.head-ends-head','department_head ending another department_head (same rank) must fail',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_head2'),pg_temp.gp('corr10')),
  'assignment termination authority denied','pA_asg_head2','corr10');
-- 1. coordinator ends supervisor -> ALLOWED
select pg_temp.as_user('u_coord');
select pg_temp.allow_end('T3.01.coord-ends-supervisor','coordinator ends the supervisor assignment (rank 40 > 30)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr1')),
  'pA_asg_sup','corr1');
-- 20. faithful replay of case 1: recorded id, no second event, no duplicate notification
select pg_temp.guard('T3.20.replay-returns-recorded','replay with the same correlation id returns the recorded assignment id',
  format('do $$ begin if public.end_graduation_project_assignment(%L,%L,%L)<>%L::uuid then raise exception %L; end if; end $$',
    pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr1'),pg_temp.gp('pA_asg_sup'),'replay returned a different id'));
select pg_temp.guard('T3.20.replay-no-second-event','replay wrote no second event for the correlation id',
  format('do $$ begin if (select count(*) from public.graduation_project_events where correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if; end $$',
    pg_temp.gp('corr1'),'assignment_ended','second event after replay'));
select pg_temp.guard('T3.20.replay-no-duplicate-notification','replay produced no duplicate notification',
  format('do $$ begin if (select count(*) from public.graduation_project_notification_log where entity_id=%L and notification_type=%L)<>1 then raise exception %L; end if; end $$',
    pg_temp.gp('pA_asg_sup'),'assignment_ended','duplicate notification after replay'));
-- 16. stale: coordinator ends the ALREADY-ENDED supervisor with a fresh correlation -> no-op return, zero mutation
select pg_temp.guard('T3.16.stale-ended-supervisor','ending an already-ended lower-rank assignment returns its id with zero mutation',
  format('do $$ begin if public.end_graduation_project_assignment(%L,%L,%L)<>%L::uuid then raise exception %L; end if;
    if (select count(*) from public.graduation_project_events where correlation_id=%L)<>0 then raise exception %L; end if; end $$',
    pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup'),pg_temp.gp('corr16'),pg_temp.gp('pA_asg_sup'),'stale end returned a different id',pg_temp.gp('corr16'),'stale end wrote events'));
-- 21. the ended supervisor must fail a subsequent write RPC
select pg_temp.as_user('u_sup');
select pg_temp.deny('T3.21.ended-supervisor-write','the ended supervisor must fail a subsequent write RPC',
  format('select public.submit_graduation_project_deliverable(%L,gen_random_uuid(),%L,%L)',pg_temp.gp('pA'),'TEST_ONLY — late',pg_temp.gp('corr21')),
  'exact direct processing assignment required',null,'corr21');
-- 17. stale+rank: coordinator ends an ALREADY-ENDED department_head -> rank denied BEFORE the no-op return
update public.graduation_project_assignments set active=false, ended_at=now()
  where id=(select v from gp_ids where k='pA_asg_head2');
select pg_temp.as_user('u_coord');
select pg_temp.deny('T3.17.stale-ended-head-rank','coordinator ending an already-ended department_head must still fail the rank boundary',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_head2'),pg_temp.gp('corr17')),
  'assignment termination authority denied','pA_asg_head2','corr17');
-- 2. coordinator ends co_supervisor -> ALLOWED
select pg_temp.allow_end('T3.02.coord-ends-co-supervisor','coordinator ends the co_supervisor assignment (rank 40 > 30)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_cosup'),pg_temp.gp('corr2')),
  'pA_asg_cosup','corr2');
-- 3. coordinator ends panel_member -> ALLOWED
select pg_temp.allow_end('T3.03.coord-ends-panel','coordinator ends the panel_member assignment (rank 40 > 20)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_panel'),pg_temp.gp('corr3')),
  'pA_asg_panel','corr3');
-- 4. coordinator ends student -> ALLOWED
select pg_temp.allow_end('T3.04.coord-ends-student','coordinator ends a student assignment (rank 40 > 10)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_s2'),pg_temp.gp('corr4')),
  'pA_asg_s2','corr4');
-- 8. department_head ends coordinator -> ALLOWED
select pg_temp.as_user('u_head');
select pg_temp.allow_end('T3.08.head-ends-coordinator','department_head ends the second coordinator (rank 50 > 40)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_coordb'),pg_temp.gp('corr8')),
  'pA_asg_coordb','corr8');
-- 9. department_head ends supervisor -> ALLOWED (fresh supervisor slot)
select pg_temp.as_user('u_coord');
select pg_temp.ok('SETUP.pA.assign-sup2','coordinator assigns a replacement supervisor',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pA'),'supervisor',pg_temp.gp('fp_sup2'),pg_temp.gp('u_sup2'),'pA_asg_sup2'));
select pg_temp.as_user('u_head');
select pg_temp.allow_end('T3.09.head-ends-supervisor','department_head ends the supervisor assignment (rank 50 > 30)',
  format('select public.end_graduation_project_assignment(%L,%L,%L)',pg_temp.gp('pA'),pg_temp.gp('pA_asg_sup2'),pg_temp.gp('corr9')),
  'pA_asg_sup2','corr9');

-- rank function spot checks (internal semantics)
select pg_temp.note('T3.rank-table','RECORD: rank of each role (dean/head/coordinator/supervisor/co_supervisor/panel_member/student)',
  $$select (select public.graduation_project_assignment_rank('dean'))||'/'||
    (select public.graduation_project_assignment_rank('department_head'))||'/'||
    (select public.graduation_project_assignment_rank('coordinator'))||'/'||
    (select public.graduation_project_assignment_rank('supervisor'))||'/'||
    (select public.graduation_project_assignment_rank('co_supervisor'))||'/'||
    (select public.graduation_project_assignment_rank('panel_member'))||'/'||
    (select public.graduation_project_assignment_rank('student'))$$);

select 'AUDIT06|'||id||'|'||result||'|'||description||' :: '||detail from a06r order by n;
rollback;
