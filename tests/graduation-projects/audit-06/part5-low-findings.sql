-- AUDIT-06 PART 5 — LOW-FINDING REGRESSIONS: F-6 (department-scoped create replay),
-- F-7 (team-member replay before state gate), F-9 (note ownership), F-3/attachment
-- policy sanity. Disposable PG17; prerequisite: minimal schema + M1..M9. Synthetic
-- TEST_ONLY data (7e5a-prefixed ids); single rolled-back transaction. AUDIT06 rows.
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table gp_ids(k text primary key, v uuid not null) on commit drop;
insert into gp_ids values
  ('dept1','7e5a0000-0000-4000-8000-0000000000d1'),
  ('dept2','7e5a0000-0000-4000-8000-0000000000d2'),
  ('u_s1','7e5a0000-0000-4000-8000-0000000000a1'),
  ('u_s2','7e5a0000-0000-4000-8000-0000000000a2'),
  ('u_sup','7e5a0000-0000-4000-8000-0000000000b1'),
  ('u_sup2','7e5a0000-0000-4000-8000-0000000000b2'),
  ('u_head','7e5a0000-0000-4000-8000-0000000000b3'),
  ('u_coord','7e5a0000-0000-4000-8000-0000000000b4'),
  ('u_coord2','7e5a0000-0000-4000-8000-0000000000b5'),
  ('sp_s1','7e5a0000-0000-4000-8000-0000000000e1'),
  ('sp_s2','7e5a0000-0000-4000-8000-0000000000e2'),
  ('fp_sup','7e5a0000-0000-4000-8000-0000000000f1'),
  ('fp_sup2','7e5a0000-0000-4000-8000-0000000000f2'),
  ('fp_head','7e5a0000-0000-4000-8000-0000000000f3'),
  ('fp_coord','7e5a0000-0000-4000-8000-0000000000f4'),
  ('fp_coord2','7e5a0000-0000-4000-8000-0000000000f5'),
  ('corrC1','7e5a0000-0000-4000-8000-00000000c001'),
  ('corrX1','7e5a0000-0000-4000-8000-00000000c002'),
  ('corrX2','7e5a0000-0000-4000-8000-00000000c003'),
  ('corrRN','7e5a0000-0000-4000-8000-00000000c004');

insert into auth.users select v from gp_ids where k like 'u\_%';
insert into public.departments select v from gp_ids where k like 'dept_';
insert into public.student_profiles values
  ((select v from gp_ids where k='sp_s1'),(select v from gp_ids where k='u_s1'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_s2'),(select v from gp_ids where k='u_s2'),(select v from gp_ids where k='dept1'));
insert into public.faculty_profiles values
  ((select v from gp_ids where k='fp_sup'),(select v from gp_ids where k='u_sup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_sup2'),(select v from gp_ids where k='u_sup2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord2'),(select v from gp_ids where k='u_coord2'),(select v from gp_ids where k='dept2'));

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
create function pg_temp.deny(p_id text, p_desc text, p_stmt text, p_expected text) returns void language plpgsql as $$
begin execute p_stmt; insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected denial not raised: '||p_expected);
exception when sqlstate 'P0001' then
  if sqlerrm=p_expected then insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||sqlerrm);
  else insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected message: '||sqlerrm); end if;
when others then insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','sqlstate '||sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.aclr(p_id text, p_desc text, p_role text, p_stmt text, p_state text) returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  execute format('set role %I', p_role);
  begin
    execute p_stmt;
    execute 'reset role';
    insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','expected ACL denial '||p_state||' not raised');
  exception when others then
    v_state:=sqlstate; v_msg:=sqlerrm;
    execute 'reset role';
    if v_state=p_state then insert into a06r(id,description,result,detail) values(p_id,p_desc,'PASS','denied as expected: '||v_state||': '||v_msg);
    else insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','unexpected: '||v_state||': '||v_msg); end if;
  end;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  insert into a06r(id,description,result,detail) values(p_id,p_desc,'FAIL','outer: '||sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.as_user(p_user_key text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',(select v::text from gp_ids where k=p_user_key),true); end $$;
create function pg_temp.gp(p_key text) returns text language sql stable as $$
  select v::text from gp_ids where k=p_key $$;

-- privileged bootstrap fixtures: one project per department with coordinator (+head in dept1).
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept1'),'TEST_ONLY — A06 low d1','draft') returning id)
insert into gp_ids select 'p0',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'coordinator',(select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept2'),'TEST_ONLY — A06 low d2','draft') returning id)
insert into gp_ids select 'p0d2',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0d2'),'coordinator',(select v from gp_ids where k='fp_coord2'),(select v from gp_ids where k='u_coord2'),(select v from gp_ids where k='dept2'),(select v from gp_ids where k='u_coord2'));

-- ============================== F-6: department-scoped create replay
select pg_temp.as_user('u_coord');
select pg_temp.ok('T5.f6.dept1-create','dept1 coordinator creates a project with correlation corrC1',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — A06 F6 dept1 project',pg_temp.gp('corrC1'),'pX'));
select pg_temp.as_user('u_coord2');
select pg_temp.note('T5.f6.dept2-collision','RECORD: dept2 coordinator reuses corrC1 for a dept2 project (must NOT return the dept1 project id)',
  format('select public.create_graduation_project(%L,%L,null,null,null,null,%L)::text',pg_temp.gp('dept2'),'TEST_ONLY — A06 F6 dept2 project',pg_temp.gp('corrC1')));
with x as (select id from public.graduation_projects where department_id=(select v from gp_ids where k='dept2') and proposal_title='TEST_ONLY — A06 F6 dept2 project')
insert into gp_ids select 'pY',id from x;
select pg_temp.guard('T5.f6.dept2-new-project','the colliding call created a NEW dept2 project (no cross-department id leak)',
  format('do $$ begin
    if (select v from gp_ids where k=%L)=(select v from gp_ids where k=%L) then raise exception %L; end if;
    if not exists(select 1 from public.graduation_projects where id=(select v from gp_ids where k=%L) and department_id=%L::uuid) then raise exception %L; end if;
    end $$',
    'pX','pY','collision returned the dept1 project id','pY',pg_temp.gp('dept2'),'new project not in dept2'));
select pg_temp.as_user('u_coord');
select pg_temp.guard('T5.f6.dept1-faithful-replay','dept1 coordinator''s own faithful replay with corrC1 returns the original dept1 project id',
  format('do $$ begin if public.create_graduation_project(%L,%L,null,null,null,null,%L)<>%L::uuid then raise exception %L; end if; end $$',
    pg_temp.gp('dept1'),'TEST_ONLY — A06 F6 dept1 project',pg_temp.gp('corrC1'),pg_temp.gp('pX'),'faithful replay returned a different id'));

-- ============================== F-7: team-member replay before the state gate
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='pX'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord')) returning id)
insert into gp_ids select 'pX_asg_head',id from x;
select pg_temp.ok('T5.f7.add-member-draft','coordinator adds student 1 to pX (draft) with correlation corrX1',
  format('with x as (select public.add_graduation_project_team_member(%L,%L,%L,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pX'),pg_temp.gp('sp_s1'),pg_temp.gp('u_s1'),pg_temp.gp('corrX1'),'pX_asg_s1'));
select pg_temp.as_user('u_s1');
select pg_temp.ok('T5.f7.submit','student submits the pX proposal (project leaves the team-mutable states)',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('pX')));
select pg_temp.as_user('u_coord');
select pg_temp.guard('T5.f7.replay-after-state-change','faithful retry of add_team_member (same corrX1) after the state change returns the recorded assignment id',
  format('do $$ begin
    if public.add_graduation_project_team_member(%L,%L,%L,%L)<>%L::uuid then raise exception %L; end if;
    if (select count(*) from public.graduation_project_events where project_id=%L::uuid and correlation_id=%L and event_type=%L)<>1 then raise exception %L; end if;
    end $$',
    pg_temp.gp('pX'),pg_temp.gp('sp_s1'),pg_temp.gp('u_s1'),pg_temp.gp('corrX1'),pg_temp.gp('pX_asg_s1'),'replay returned a different id',
    pg_temp.gp('pX'),pg_temp.gp('corrX1'),'team_member_added','duplicate event after replay'));
select pg_temp.deny('T5.f7.new-add-wrong-state','a genuinely new add (different correlation) in the wrong state still fails',
  format('select public.add_graduation_project_team_member(%L,%L,%L,%L)',pg_temp.gp('pX'),pg_temp.gp('sp_s2'),pg_temp.gp('u_s2'),pg_temp.gp('corrX2')),
  'team mutation state denied');

-- ============================== F-9: note ownership
-- drive pX to active and assign supervisor A
select pg_temp.as_user('u_head');
select pg_temp.ok('T5.f9.start-review','head starts the pX review',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('pX'),'start_review'));
select pg_temp.ok('T5.f9.approve','head approves pX',
  format('select public.review_graduation_project_proposal(%L,%L,null,3,gen_random_uuid())',pg_temp.gp('pX'),'approve'));
select pg_temp.as_user('u_coord');
select pg_temp.ok('T5.f9.activate','coordinator activates pX',
  format('select public.activate_graduation_project(%L,4,gen_random_uuid())',pg_temp.gp('pX')));
select pg_temp.ok('T5.f9.assign-supA','coordinator assigns supervisor A',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pX'),'supervisor',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup'),'pX_asg_supA'));
select pg_temp.as_user('u_sup');
select pg_temp.ok('T5.f9.note1','supervisor A authors note 1',
  format('with x as (select public.add_graduation_project_supervisor_note(%L,null,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pX'),'TEST_ONLY — note 1','pX_note1'));
select pg_temp.ok('T5.f9.owner-resolve-positive','owning supervisor A resolves note 1',
  format('select public.resolve_graduation_project_supervisor_note(%L,%L,gen_random_uuid())',pg_temp.gp('pX'),pg_temp.gp('pX_note1')));
select pg_temp.ok('T5.f9.note2','supervisor A authors note 2',
  format('with x as (select public.add_graduation_project_supervisor_note(%L,null,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pX'),'TEST_ONLY — note 2','pX_note2'));
select pg_temp.as_user('u_head');
select pg_temp.ok('T5.f9.head-ends-supA','department_head ends supervisor A''s assignment (rank 50 > 30 — F-1 sanity)',
  format('select public.end_graduation_project_assignment(%L,%L,gen_random_uuid())',pg_temp.gp('pX'),pg_temp.gp('pX_asg_supA')));
select pg_temp.as_user('u_coord');
select pg_temp.ok('T5.f9.assign-supB','coordinator assigns replacement supervisor B',
  format('with x as (select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid()) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('pX'),'supervisor',pg_temp.gp('fp_sup2'),pg_temp.gp('u_sup2'),'pX_asg_supB'));
select pg_temp.as_user('u_sup2');
select pg_temp.deny('T5.f9.non-owner-resolve','replacement supervisor B resolving A''s note must fail',
  format('select public.resolve_graduation_project_supervisor_note(%L,%L,%L)',pg_temp.gp('pX'),pg_temp.gp('pX_note2'),pg_temp.gp('corrRN')),
  'note ownership required');
select pg_temp.guard('T5.f9.note-still-open','note 2 remains unresolved and zero events were written for the denied attempt',
  format('do $$ begin
    if (select resolved_at from public.graduation_project_supervisor_notes where id=%L::uuid) is not null then raise exception %L; end if;
    if (select count(*) from public.graduation_project_events where correlation_id=%L)<>0 then raise exception %L; end if;
    end $$',
    pg_temp.gp('pX_note2'),'note 2 was resolved by a non-owner',pg_temp.gp('corrRN'),'denied resolve wrote events'));
select pg_temp.as_user('u_s1');
select pg_temp.deny('T5.f9.student-resolve','student resolving a supervisor note must fail',
  format('select public.resolve_graduation_project_supervisor_note(%L,%L,gen_random_uuid())',pg_temp.gp('pX'),pg_temp.gp('pX_note2')),
  'exact direct processing assignment required');

-- ============================== F-3 / attachment policy sanity (unchanged by M9)
select pg_temp.aclr('T5.f3.scan-state-acl','set_graduation_project_file_scan_state as role authenticated still fails 42501',
  'authenticated',format('select public.set_graduation_project_file_scan_state(gen_random_uuid(),%L,gen_random_uuid())','clean'),'42501');
select pg_temp.as_user('u_s1');
select pg_temp.deny('T5.mime-negative','register_graduation_project_file still rejects a disallowed MIME type',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('pX'),'graduation-projects/'||pg_temp.gp('pX')||'/evil.exe','evil.exe','application/x-msdownload','a'),
  'file media type not allowed');

select 'AUDIT06|'||id||'|'||result||'|'||description||' :: '||detail from a06r order by n;
rollback;
