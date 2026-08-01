-- GRADUATION-PROJECTS AUTHORIZATION CLOSURE MATRIX — disposable PG17 (psql).
-- NEVER run on production. Prerequisite: minimal schema + migrations
-- 20260730100000..20260730100005 (drafts GRADUATION-PROJECTS-M1..M6-*.NOT_APPLIED.sql
-- in docs/migration-drafts/) applied, plus synthetic fixtures.
-- Every row is a positive (must succeed) or negative (exact denial) case.
-- The script raises unless fail_rows = 0. Everything rolls back.
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
select set_config('gp.department_id', :'department_id', true);
select set_config('gp.student_user_id', :'student_user_id', true);
select set_config('gp.faculty_user_id', :'faculty_user_id', true);

create temporary table gp_ids(k text primary key,v uuid not null) on commit drop;
insert into gp_ids values
  ('deptA', :'department_id'),
  ('deptB', '20000000-0000-0000-0000-000000000002'),
  ('sp1', :'student_profile_id'),       -- dept A student (fixture)
  ('fp1', :'faculty_profile_id'),       -- dept A faculty/manager (fixture)
  ('u_student', :'student_user_id'),
  ('u_manager', :'faculty_user_id'),
  ('u_student2', '10000000-0000-0000-0000-000000000005'),
  ('u_studentB', '10000000-0000-0000-0000-000000000006'),
  ('u_sup', '10000000-0000-0000-0000-000000000003'),
  ('u_cosup', '10000000-0000-0000-0000-000000000004'),
  ('u_panel1', '10000000-0000-0000-0000-000000000007'),
  ('u_panel2', '10000000-0000-0000-0000-000000000008'),
  ('u_headB', '10000000-0000-0000-0000-000000000009'),
  ('u_outside', '10000000-0000-0000-0000-000000000010'),
  ('sp2', '30000000-0000-0000-0000-000000000002'),
  ('spB', '30000000-0000-0000-0000-000000000003'),
  ('fp_sup', '40000000-0000-0000-0000-000000000002'),
  ('fp_cosup', '40000000-0000-0000-0000-000000000003'),
  ('fp_panel1', '40000000-0000-0000-0000-000000000004'),
  ('fp_panel2', '40000000-0000-0000-0000-000000000005'),
  ('fp_headB', '40000000-0000-0000-0000-000000000006');

insert into auth.users
  select v from gp_ids where k like 'u\_%' and v not in (select id from auth.users);
insert into public.departments values ('20000000-0000-0000-0000-000000000002');
insert into public.student_profiles values
  ((select v from gp_ids where k='sp2'),(select v from gp_ids where k='u_student2'),(select v from gp_ids where k='deptA')),
  ((select v from gp_ids where k='spB'),(select v from gp_ids where k='u_studentB'),(select v from gp_ids where k='deptB'));
insert into public.faculty_profiles values
  ((select v from gp_ids where k='fp_sup'),(select v from gp_ids where k='u_sup'),(select v from gp_ids where k='deptA')),
  ((select v from gp_ids where k='fp_cosup'),(select v from gp_ids where k='u_cosup'),(select v from gp_ids where k='deptA')),
  ((select v from gp_ids where k='fp_panel1'),(select v from gp_ids where k='u_panel1'),(select v from gp_ids where k='deptA')),
  ((select v from gp_ids where k='fp_panel2'),(select v from gp_ids where k='u_panel2'),(select v from gp_ids where k='deptA')),
  ((select v from gp_ids where k='fp_headB'),(select v from gp_ids where k='u_headB'),(select v from gp_ids where k='deptB'));

create temporary table gp_matrix(area text, description text, result text, detail text) on commit drop;
grant select on pg_temp.gp_ids to authenticated;
grant insert on pg_temp.gp_matrix to authenticated;
create function pg_temp.mtx_ok(p_area text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into gp_matrix values(p_area,p_desc,'PASS','');
exception when others then insert into gp_matrix values(p_area,p_desc,'FAIL',sqlerrm);
end $$;
create function pg_temp.mtx_err(p_area text, p_desc text, p_statement text, p_expected text) returns void language plpgsql as $$
begin execute p_statement; insert into gp_matrix values(p_area,p_desc,'FAIL','expected denial not raised: '||p_expected);
exception when sqlstate 'P0001' then
  if sqlerrm=p_expected then insert into gp_matrix values(p_area,p_desc,'PASS','');
  else insert into gp_matrix values(p_area,p_desc,'FAIL','unexpected message: '||sqlerrm); end if;
when others then
  insert into gp_matrix values(p_area,p_desc,'FAIL','unexpected sqlstate '||sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.mtx_sqlstate(p_area text, p_desc text, p_statement text, p_state text) returns void language plpgsql as $$
begin execute p_statement; insert into gp_matrix values(p_area,p_desc,'FAIL','expected sqlstate not raised: '||p_state);
exception when others then
  if sqlstate=p_state then insert into gp_matrix values(p_area,p_desc,'PASS','');
  else insert into gp_matrix values(p_area,p_desc,'FAIL','unexpected sqlstate '||sqlstate||': '||sqlerrm); end if;
end $$;
create function pg_temp.as_user(p_user_key text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',(select v::text from gp_ids where k=p_user_key),true); end $$;
create function pg_temp.gp(p_key text) returns text language sql stable as $$
  select v::text from gp_ids where k=p_key $$;

-- ============================================================ project fixture
-- P1 draft (dept A): manager(fp1), student(sp1)
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='deptA'),'Matrix P1','draft') returning id)
insert into gp_ids select 'p1',id from x;
-- P2 active-ready (dept A): manager, student, supervisor, co_supervisor, final milestone accepted + clean file
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='deptA'),'Matrix P2','active') returning id)
insert into gp_ids select 'p2',id from x;
-- P3 archived (dept A): student + manager
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='deptA'),'Matrix P3','archived') returning id)
insert into gp_ids select 'p3',id from x;
-- P4 active (dept B): headB + studentB
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='deptB'),'Matrix P4','active') returning id)
insert into gp_ids select 'p4',id from x;

-- assignments P1
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'coordinator',(select v from gp_ids where k='fp1'),(select v from gp_ids where k='u_manager'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p1'),'student',(select v from gp_ids where k='sp1'),(select v from gp_ids where k='u_student'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
-- assignments P2
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'coordinator',(select v from gp_ids where k='fp1'),(select v from gp_ids where k='u_manager'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'student',(select v from gp_ids where k='sp1'),(select v from gp_ids where k='u_student'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'supervisor',(select v from gp_ids where k='fp_sup'),(select v from gp_ids where k='u_sup'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'co_supervisor',(select v from gp_ids where k='fp_cosup'),(select v from gp_ids where k='u_cosup'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
-- P2 ready: accepted final milestone + accepted submission + clean file
with x as (insert into public.graduation_project_milestones(project_id,title,milestone_kind,sequence_no,weight,status,completion_percent)
  values((select v from gp_ids where k='p2'),'Final','final',1,100,'accepted',100) returning id)
insert into gp_ids select 'p2_m1',id from x;
with x as (insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id,state,accepted_at)
  select (select v from gp_ids where k='p2'),(select v from gp_ids where k='p2_m1'),1,a.id,'accepted',now()
  from public.graduation_project_assignments a
  where a.project_id=(select v from gp_ids where k='p2') and a.role='student' returning id)
insert into gp_ids select 'p2_s1',id from x;
insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,scan_state,uploaded_by_assignment_id,file_kind)
  select (select v from gp_ids where k='p2'),(select v from gp_ids where k='p2_s1'),
    'graduation-projects/'||(select v from gp_ids where k='p2')::text||'/m-final.pdf','final.pdf','application/pdf',1,repeat('9',64),'clean',
    a.id,'final_manuscript'
  from public.graduation_project_assignments a
  where a.project_id=(select v from gp_ids where k='p2') and a.role='student';
-- assignments P3
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p3'),'coordinator',(select v from gp_ids where k='fp1'),(select v from gp_ids where k='u_manager'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p3'),'student',(select v from gp_ids where k='sp1'),(select v from gp_ids where k='u_student'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
-- assignments P4
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p4'),'department_head',(select v from gp_ids where k='fp_headB'),(select v from gp_ids where k='u_headB'),(select v from gp_ids where k='deptB'),(select v from gp_ids where k='u_headB'));
insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p4'),'student',(select v from gp_ids where k='spB'),(select v from gp_ids where k='u_studentB'),(select v from gp_ids where k='deptB'),(select v from gp_ids where k='u_headB'));

-- ================================================================ READ ACCESS
select pg_temp.as_user('u_outside');
select pg_temp.mtx_err('read','outsider cannot read project detail',
  format('select public.get_graduation_project_detail(%L)',pg_temp.gp('p1')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_studentB');
select pg_temp.mtx_err('read','other-department student cannot read project detail',
  format('select public.get_graduation_project_detail(%L)',pg_temp.gp('p1')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_student');
select pg_temp.mtx_ok('read','assigned student reads project detail',
  format('select public.get_graduation_project_detail(%L)',pg_temp.gp('p1')));
select pg_temp.as_user('u_cosup');
select pg_temp.mtx_ok('read','co_supervisor reads project detail (staff visibility)',
  format('select public.get_graduation_project_detail(%L)',pg_temp.gp('p2')));
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('read','student cannot read department states report',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('deptA')),
  'department report assignment required');
select pg_temp.as_user('u_headB');
select pg_temp.mtx_err('read','department head of B cannot read department A report',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('deptA')),
  'department report assignment required');
select pg_temp.mtx_ok('read','department head of B reads department B report',
  format('select public.get_graduation_project_states_report(%L)',pg_temp.gp('deptB')));

-- ====================================================================== TEAM
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('team','student cannot add team members',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('p1'),pg_temp.gp('sp2'),pg_temp.gp('u_student2')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_manager');
select pg_temp.mtx_ok('team','coordinator adds a team member (draft state)',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('p1'),pg_temp.gp('sp2'),pg_temp.gp('u_student2')));

-- ================================================================== PROPOSAL
select pg_temp.as_user('u_studentB');
select pg_temp.mtx_err('proposal','non-member student cannot submit proposal',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('p1')),
  'exact direct processing assignment required');
select pg_temp.mtx_err('proposal','forged project id is denied at assignment check',
  'select public.submit_graduation_project_proposal(gen_random_uuid(),1,gen_random_uuid())',
  'exact direct processing assignment required');
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('proposal','wrong expected version is denied',
  format('select public.submit_graduation_project_proposal(%L,99,gen_random_uuid())',pg_temp.gp('p1')),
  'proposal transition precondition failed');
select pg_temp.mtx_err('proposal','archived project cannot be submitted',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('p3')),
  'proposal transition precondition failed');
select pg_temp.mtx_ok('proposal','member student submits proposal',
  format('select public.submit_graduation_project_proposal(%L,1,%L)',pg_temp.gp('p1'),'41111111-0000-0000-0000-000000000001'));
select pg_temp.mtx_ok('proposal','idempotent replay returns the same project',
  format('select public.submit_graduation_project_proposal(%L,1,%L)',pg_temp.gp('p1'),'41111111-0000-0000-0000-000000000001'));
select pg_temp.mtx_err('proposal','student cannot review proposals',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('p1'),'approve'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_manager');
select pg_temp.mtx_err('proposal','unknown literal review action is denied',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('p1'),'approve_all'),
  'proposal review action unknown');
select pg_temp.mtx_ok('proposal','coordinator starts review',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('p1'),'start_review'));
select pg_temp.mtx_ok('proposal','coordinator approves proposal',
  format('select public.review_graduation_project_proposal(%L,%L,null,3,gen_random_uuid())',pg_temp.gp('p1'),'approve'));
select pg_temp.mtx_err('proposal','re-approve after state moved is denied',
  format('select public.review_graduation_project_proposal(%L,%L,null,4,gen_random_uuid())',pg_temp.gp('p1'),'approve'),
  'proposal review precondition failed');

-- ====================================================================== TEAM
select pg_temp.as_user('u_manager');
select pg_temp.mtx_err('team','institutional roles are not RPC-assignable',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('p1'),'dean',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup')),
  'faculty assignment role denied');
select pg_temp.mtx_ok('team','coordinator assigns supervisor',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('p1'),'supervisor',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup')));
select pg_temp.mtx_err('team','second active supervisor is denied',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('p1'),'supervisor',pg_temp.gp('fp_cosup'),pg_temp.gp('u_cosup')),
  'project supervisor slot already filled');
select pg_temp.mtx_err('team','faculty assignment on archived project is denied',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('p3'),'coordinator',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup')),
  'faculty assignment state denied');
select pg_temp.as_user('u_cosup');
select pg_temp.mtx_err('team','co_supervisor cannot write supervisor notes',
  format('select public.add_graduation_project_supervisor_note(%L,null,%L,gen_random_uuid())',pg_temp.gp('p2'),'x'),
  'exact direct processing assignment required');

-- =========================================================== MILESTONES/FILES
select pg_temp.as_user('u_manager');
select pg_temp.mtx_ok('milestone','coordinator sets a milestone',
  format('select public.set_graduation_project_milestone(%L,%L,%L,2,40,gen_random_uuid())',pg_temp.gp('p1'),'Report','progress'));
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('milestone','student cannot set milestones',
  format('select public.set_graduation_project_milestone(%L,%L,%L,3,20,gen_random_uuid())',pg_temp.gp('p1'),'X','progress'),
  'exact direct processing assignment required');
select pg_temp.mtx_err('milestone','forged milestone id is denied',
  format('select public.submit_graduation_project_deliverable(%L,gen_random_uuid(),%L,gen_random_uuid())',pg_temp.gp('p2'),'x'),
  'milestone not found');
select pg_temp.mtx_err('files','object key outside project scope is denied',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('p2'),'graduation-projects/00000000-0000-0000-0000-000000000000/x.pdf','x.pdf','application/pdf','a'),
  'file object key outside project scope');

-- ============================================================== DISCUSSION
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('discussion','request before readiness is denied',
  format('select public.request_graduation_project_discussion(%L,gen_random_uuid())',pg_temp.gp('p1')),
  'discussion readiness failed');
select pg_temp.as_user('u_manager');
select pg_temp.mtx_err('discussion','schedule without a pending request is denied',
  format('select public.schedule_graduation_project_discussion(%L,gen_random_uuid(),now()+%L,%L,gen_random_uuid())',pg_temp.gp('p2'),'2 days','Hall'),
  'discussion scheduling precondition failed');
select pg_temp.as_user('u_student');
select pg_temp.mtx_ok('discussion','ready project requests discussion',
  format('select public.request_graduation_project_discussion(%L,%L)',pg_temp.gp('p2'),'41111111-0000-0000-0000-000000000002'));
select pg_temp.mtx_err('discussion','second pending request is denied',
  format('select public.request_graduation_project_discussion(%L,gen_random_uuid())',pg_temp.gp('p2')),
  'discussion readiness failed');
select pg_temp.as_user('u_manager');
with r as (select id from public.graduation_project_discussion_requests where project_id=(select v from gp_ids where k='p2') and state='pending')
insert into gp_ids select 'p2_req',id from r;
select pg_temp.mtx_ok('discussion','coordinator schedules the discussion',
  format('select public.schedule_graduation_project_discussion(%L,%L,now()+%L,%L,gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('p2_req'),'5 days','Hall A'));
select pg_temp.mtx_ok('discussion','coordinator assigns panel chair',
  format('with a as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values(%L,%L,%L,%L,%L,%L) returning id)
    select public.assign_graduation_project_panel_member(%L,(select id from public.graduation_project_discussions where project_id=%L),(select id from a),true,gen_random_uuid())',
    pg_temp.gp('p2'),'panel_member',pg_temp.gp('fp_panel1'),pg_temp.gp('u_panel1'),pg_temp.gp('deptA'),pg_temp.gp('u_manager'),
    pg_temp.gp('p2'),pg_temp.gp('p2')));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'panel_member',(select v from gp_ids where k='fp_panel2'),(select v from gp_ids where k='u_panel2'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
select pg_temp.mtx_err('discussion','second panel chair is denied',
  format('select public.assign_graduation_project_panel_member(%L,(select id from public.graduation_project_discussions where project_id=%L),(select id from public.graduation_project_assignments where project_id=%L and role=%L and user_id=%L),true,gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),pg_temp.gp('p2'),'panel_member',pg_temp.gp('u_panel2')),
  'panel chair already assigned');
select pg_temp.mtx_ok('discussion','second panel member (non-chair) is assigned',
  format('select public.assign_graduation_project_panel_member(%L,(select id from public.graduation_project_discussions where project_id=%L),(select id from public.graduation_project_assignments where project_id=%L and role=%L and user_id=%L),false,gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),pg_temp.gp('p2'),'panel_member',pg_temp.gp('u_panel2')));
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('discussion','student cannot record discussion outcome',
  format('select public.record_graduation_project_discussion_outcome(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('p2'),'held'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_manager');
select pg_temp.mtx_ok('discussion','coordinator records held outcome',
  format('select public.record_graduation_project_discussion_outcome(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('p2'),'held'));

-- ============================================================== EVALUATION
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('evaluation','student cannot save evaluations',
  format('select public.save_graduation_project_evaluation(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),'v1','[{"criterion_code":"c1","criterion_label":"C","maximum_score":100,"awarded_score":90}]'),
  'exact direct processing assignment required');
select pg_temp.as_user('u_panel1');
select pg_temp.mtx_ok('evaluation','panel member submits own evaluation',
  format('select public.save_graduation_project_evaluation(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),'v1','[{"criterion_code":"c1","criterion_label":"C","maximum_score":100,"awarded_score":90}]'));
select pg_temp.mtx_err('evaluation','re-save after submit is denied',
  format('select public.save_graduation_project_evaluation(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),'v1','[{"criterion_code":"c1","criterion_label":"C","maximum_score":100,"awarded_score":95}]'),
  'evaluation already submitted');
select pg_temp.as_user('u_panel2');
select pg_temp.mtx_err('evaluation','panel member cannot finalize another member''s evaluation',
  format('select public.finalize_graduation_project_evaluation((select e.id from public.graduation_project_evaluations e
      join public.graduation_project_panel_members pm on pm.id=e.panel_member_id and pm.project_id=e.project_id
      join public.graduation_project_assignments a on a.id=pm.assignment_id and a.project_id=pm.project_id
      where e.project_id=%L and a.user_id=%L),gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('u_panel1')),
  'evaluator panel assignment mismatch');
select pg_temp.as_user('u_panel1');
select pg_temp.mtx_ok('evaluation','panel member finalizes own evaluation',
  format('select public.finalize_graduation_project_evaluation((select e.id from public.graduation_project_evaluations e
      join public.graduation_project_panel_members pm on pm.id=e.panel_member_id and pm.project_id=e.project_id
      join public.graduation_project_assignments a on a.id=pm.assignment_id and a.project_id=pm.project_id
      where e.project_id=%L and a.user_id=%L),gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('u_panel1')));
-- promote the manager to department_head on P2 for the result/archive powers
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p2'),'department_head',(select v from gp_ids where k='fp1'),(select v from gp_ids where k='u_manager'),(select v from gp_ids where k='deptA'),(select v from gp_ids where k='u_manager'));
select pg_temp.as_user('u_manager');
select pg_temp.mtx_err('evaluation','result conclusion before all finalized is denied',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',pg_temp.gp('p2'),'completed',pg_temp.gp('p2')),
  'evaluations not finalized');
select pg_temp.as_user('u_panel2');
select pg_temp.mtx_ok('evaluation','second panel member submits and finalizes',
  format('select public.save_graduation_project_evaluation(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),'v1','[{"criterion_code":"c1","criterion_label":"C","maximum_score":100,"awarded_score":80}]'));
select pg_temp.mtx_ok('evaluation','second panel member finalizes own',
  format('select public.finalize_graduation_project_evaluation((select e.id from public.graduation_project_evaluations e
      join public.graduation_project_panel_members pm on pm.id=e.panel_member_id and pm.project_id=e.project_id
      join public.graduation_project_assignments a on a.id=pm.assignment_id and a.project_id=pm.project_id
      where e.project_id=%L and a.user_id=%L),gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('u_panel2')));

-- ================================================================== RESULT
select pg_temp.as_user('u_sup');
select pg_temp.mtx_err('result','supervisor cannot conclude results (head/dean only)',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',pg_temp.gp('p2'),'completed',pg_temp.gp('p2')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_manager');
select pg_temp.mtx_ok('result','department_head concludes with corrections',
  format('select public.conclude_graduation_project_result(%L,%L,%L::jsonb,(select version from public.graduation_projects where id=%L),%L)',
    pg_temp.gp('p2'),'corrections_required','[{"description":"Fix figures"}]',pg_temp.gp('p2'),'41111111-0000-0000-0000-000000000003'));
select pg_temp.as_user('u_student');
select pg_temp.mtx_ok('result','student completes the correction',
  format('select public.complete_graduation_project_correction(%L,(select id from public.graduation_project_corrections where project_id=%L),gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('p2')));
select pg_temp.as_user('u_manager');
select pg_temp.mtx_ok('result','department_head accepts the correction',
  format('select public.accept_graduation_project_correction(%L,(select id from public.graduation_project_corrections where project_id=%L),gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('p2')));
select pg_temp.mtx_ok('result','department_head concludes completed',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',pg_temp.gp('p2'),'completed',pg_temp.gp('p2')));
select pg_temp.mtx_err('result','second conclusion is denied',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',pg_temp.gp('p2'),'completed',pg_temp.gp('p2')),
  'result conclusion precondition failed');
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('result','student cannot archive',
  format('select public.archive_graduation_project(%L,(select id from public.graduation_project_files where project_id=%L and scan_state=%L),1,gen_random_uuid())',pg_temp.gp('p2'),pg_temp.gp('p2'),'clean'),
  'direct archive assignment required');
select pg_temp.as_user('u_manager');
select pg_temp.mtx_ok('result','department_head archives with the clean final file',
  format('select public.archive_graduation_project(%L,(select id from public.graduation_project_files where project_id=%L and scan_state=%L),(select version from public.graduation_projects where id=%L),%L)',
    pg_temp.gp('p2'),pg_temp.gp('p2'),'clean',pg_temp.gp('p2'),'41111111-0000-0000-0000-000000000004'));
select pg_temp.mtx_err('result','re-archive is denied',
  format('select public.archive_graduation_project(%L,(select id from public.graduation_project_files where project_id=%L and scan_state=%L),(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('p2'),pg_temp.gp('p2'),'clean',pg_temp.gp('p2')),
  'project not archive-ready');
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('result','archived project rejects deliverable submission',
  format('select public.submit_graduation_project_deliverable(%L,gen_random_uuid(),%L,gen_random_uuid())',pg_temp.gp('p2'),'x'),
  'deliverable submission state denied');
select pg_temp.as_user('u_sup');
select pg_temp.mtx_err('result','archived project rejects supervisor notes',
  format('select public.add_graduation_project_supervisor_note(%L,null,%L,gen_random_uuid())',pg_temp.gp('p2'),'late note'),
  'note state denied');

-- ===================================================== CROSS-DEPT / PRIVILEGE
select pg_temp.as_user('u_headB');
select pg_temp.mtx_err('xdept','department head of B cannot conclude results in A',
  format('select public.conclude_graduation_project_result(%L,%L,null,1,gen_random_uuid())',pg_temp.gp('p1'),'completed'),
  'exact direct processing assignment required');
select pg_temp.mtx_err('xdept','department head of B cannot create a project in A',
  format('select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid())',pg_temp.gp('deptA'),'Forged dept project'),
  'project creation assignment required');
select pg_temp.mtx_ok('xdept','department head of B creates a project in B',
  format('select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid())',pg_temp.gp('deptB'),'Dept B project'));
select pg_temp.as_user('u_outside');
select pg_temp.mtx_err('xdept','unassigned user cannot create projects',
  format('select public.create_graduation_project(%L,%L,null,null,null,null,gen_random_uuid())',pg_temp.gp('deptA'),'Outsider project'),
  'project creation assignment required');
-- authenticated role (not a superuser) must hit the grant wall, not the logic.
set local role authenticated;
select pg_temp.mtx_sqlstate('xdept','authenticated cannot execute the scan RPC',
  'select public.set_graduation_project_file_scan_state(gen_random_uuid(),''clean'',gen_random_uuid())',
  '42501');
select pg_temp.mtx_sqlstate('xdept','authenticated cannot insert into graduation_projects directly',
  format('insert into public.graduation_projects(department_id,proposal_title) values(%L,%L)',pg_temp.gp('deptA'),'Direct insert'),
  '42501');
select pg_temp.mtx_sqlstate('xdept','authenticated cannot read graduation_project_evaluations directly',
  'select * from public.graduation_project_evaluations limit 1',
  '42501');
reset role;
set local role postgres;

-- ============================================================ SETTINGS AUTH
select pg_temp.as_user('u_student');
select pg_temp.mtx_err('settings','student cannot upsert settings',
  format('select public.upsert_graduation_project_settings(%L,null,1,3,null,true,30,7,gen_random_uuid())',pg_temp.gp('deptA')),
  'settings administration assignment required');
select pg_temp.mtx_err('settings','student cannot manage rubrics',
  format('select public.upsert_graduation_project_rubric(%L,null,%L,%L,%L,60,%L::jsonb,gen_random_uuid())',
    pg_temp.gp('deptA'),'GEN','v1','Rubric','[{"criterion_code":"c1","criterion_label":"C","maximum_score":10,"sequence_no":1}]'),
  'rubric administration assignment required');

-- ===================================================== VISIBILITY (SQL side)
select pg_temp.as_user('u_student');
do $$ declare v_detail jsonb; v_n integer; begin
  v_detail:=public.get_graduation_project_detail((select v from gp_ids where k='p2'));
  select count(*) into v_n from jsonb_array_elements(v_detail->'evaluations') e where e->>'state'<>'finalized';
  if v_n<>0 then
    insert into gp_matrix values('visibility','student sees only finalized evaluations','FAIL','non-finalized visible');
  else
    insert into gp_matrix values('visibility','student sees only finalized evaluations','PASS','');
  end if;
end $$;

-- ================================================================ MATRIX GATE
table gp_matrix order by 1,2;
do $$ declare v_total integer; v_fail integer; begin
  select count(*),count(*) filter(where result='FAIL') into v_total,v_fail from gp_matrix;
  if v_fail>0 then
    raise exception 'AUTHORIZATION MATRIX FAILED: % of % rows failed',v_fail,v_total;
  end if;
  raise notice 'AUTHORIZATION MATRIX PASS: % rows, fail_rows=0',v_total;
end $$;
rollback;
