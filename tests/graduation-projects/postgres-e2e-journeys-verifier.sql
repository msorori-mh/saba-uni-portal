-- GRADUATION-PROJECTS ISOLATED OPERATIONAL E2E — disposable PG17 (psql).
-- NEVER run on production. Prerequisite: minimal schema + migrations
-- 20260730100000..20260730100007 applied.
-- Dataset is 100% synthetic TEST_ONLY (7e57-prefixed ids, TEST_ONLY names);
-- every journey ends inside one rolled-back transaction.
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table gp_ids(k text primary key,v uuid not null) on commit drop;
insert into gp_ids values
  ('dept1','7e570000-0000-4000-8000-0000000000d1'),
  ('dept2','7e570000-0000-4000-8000-0000000000d2'),
  ('u_s1','7e570000-0000-4000-8000-0000000000a1'),
  ('u_s2','7e570000-0000-4000-8000-0000000000a2'),
  ('u_solo','7e570000-0000-4000-8000-0000000000a3'),
  ('u_sup','7e570000-0000-4000-8000-0000000000b1'),
  ('u_cosup','7e570000-0000-4000-8000-0000000000b2'),
  ('u_head','7e570000-0000-4000-8000-0000000000b3'),
  ('u_coord','7e570000-0000-4000-8000-0000000000b4'),
  ('u_chair','7e570000-0000-4000-8000-0000000000c1'),
  ('u_panel2','7e570000-0000-4000-8000-0000000000c2'),
  ('u_admin2','7e570000-0000-4000-8000-0000000000c3'),
  ('sp_s1','7e570000-0000-4000-8000-0000000000e1'),
  ('sp_s2','7e570000-0000-4000-8000-0000000000e2'),
  ('sp_solo','7e570000-0000-4000-8000-0000000000e3'),
  ('fp_sup','7e570000-0000-4000-8000-0000000000f1'),
  ('fp_cosup','7e570000-0000-4000-8000-0000000000f2'),
  ('fp_head','7e570000-0000-4000-8000-0000000000f3'),
  ('fp_coord','7e570000-0000-4000-8000-0000000000f4'),
  ('fp_chair','7e570000-0000-4000-8000-0000000000f5'),
  ('fp_panel2','7e570000-0000-4000-8000-0000000000f6'),
  ('fp_admin2','7e570000-0000-4000-8000-0000000000f7');

insert into auth.users select v from gp_ids where k like 'u\_%';
insert into public.departments values
  ((select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='dept2'));
insert into public.student_profiles values
  ((select v from gp_ids where k='sp_s1'),(select v from gp_ids where k='u_s1'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_s2'),(select v from gp_ids where k='u_s2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='sp_solo'),(select v from gp_ids where k='u_solo'),(select v from gp_ids where k='dept1'));
insert into public.faculty_profiles values
  ((select v from gp_ids where k='fp_sup'),(select v from gp_ids where k='u_sup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_cosup'),(select v from gp_ids where k='u_cosup'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_chair'),(select v from gp_ids where k='u_chair'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_panel2'),(select v from gp_ids where k='u_panel2'),(select v from gp_ids where k='dept1')),
  ((select v from gp_ids where k='fp_admin2'),(select v from gp_ids where k='u_admin2'),(select v from gp_ids where k='dept2'));

create temporary table gp_journey(id text, description text, result text, detail text) on commit drop;
create function pg_temp.j_ok(p_id text, p_desc text, p_statement text) returns void language plpgsql as $$
begin execute p_statement; insert into gp_journey values(p_id,p_desc,'PASS','');
exception when others then insert into gp_journey values(p_id,p_desc,'FAIL',sqlerrm);
end $$;
create function pg_temp.j_err(p_id text, p_desc text, p_statement text, p_expected text) returns void language plpgsql as $$
begin execute p_statement; insert into gp_journey values(p_id,p_desc,'FAIL','expected denial not raised: '||p_expected);
exception when sqlstate 'P0001' then
  if sqlerrm=p_expected then insert into gp_journey values(p_id,p_desc,'PASS','');
  else insert into gp_journey values(p_id,p_desc,'FAIL','unexpected: '||sqlerrm); end if;
when others then
  insert into gp_journey values(p_id,p_desc,'FAIL','sqlstate '||sqlstate||': '||sqlerrm);
end $$;
create function pg_temp.as_user(p_user_key text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',(select v::text from gp_ids where k=p_user_key),true); end $$;
create function pg_temp.gp(p_key text) returns text language sql stable as $$
  select v::text from gp_ids where k=p_key $$;
create function pg_temp.guard(p_id text, p_desc text, p_check text) returns void language plpgsql as $$
begin execute p_check; insert into gp_journey values(p_id,p_desc,'PASS','');
exception when others then insert into gp_journey values(p_id,p_desc,'FAIL',sqlerrm);
end $$;

-- bootstrap (privileged fixture step, rolled back): one coordinator project
with x as (insert into public.graduation_projects(department_id,proposal_title,state)
  values((select v from gp_ids where k='dept1'),'TEST_ONLY — bootstrap','draft') returning id)
insert into gp_ids select 'p0',id from x;
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'coordinator',(select v from gp_ids where k='fp_coord'),(select v from gp_ids where k='u_coord'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='p0'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));

-- =================================================== J1: team project end-to-end
select pg_temp.as_user('u_coord');
select pg_temp.j_ok('J1','coordinator creates the team project',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — J1 team project','51111111-0000-0000-0000-000000000001','j1'));
-- privileged fixture: department_head authority on j1 (bootstrap role, not RPC-assignable)
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
  values((select v from gp_ids where k='j1'),'department_head',(select v from gp_ids where k='fp_head'),(select v from gp_ids where k='u_head'),(select v from gp_ids where k='dept1'),(select v from gp_ids where k='u_coord'));
select pg_temp.j_ok('J1','coordinator adds student 1',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('sp_s1'),pg_temp.gp('u_s1')));
select pg_temp.j_ok('J1','coordinator adds student 2',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('sp_s2'),pg_temp.gp('u_s2')));
select pg_temp.j_ok('J5','supervisor assigned',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('j1'),'supervisor',pg_temp.gp('fp_sup'),pg_temp.gp('u_sup')));
select pg_temp.j_ok('J5','co-supervisor assigned',
  format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,gen_random_uuid())',pg_temp.gp('j1'),'co_supervisor',pg_temp.gp('fp_cosup'),pg_temp.gp('u_cosup')));
select pg_temp.as_user('u_s1');
select pg_temp.j_ok('J1','student submits the proposal',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('j1')));
select pg_temp.as_user('u_head');
select pg_temp.j_ok('J1','head starts review',
  format('select public.review_graduation_project_proposal(%L,%L,null,2,gen_random_uuid())',pg_temp.gp('j1'),'start_review'));
select pg_temp.j_ok('J3','proposal returned for revision',
  format('select public.review_graduation_project_proposal(%L,%L,%L,3,gen_random_uuid())',pg_temp.gp('j1'),'require_revision','TEST_ONLY — expand methodology'));
select pg_temp.as_user('u_s1');
select pg_temp.j_ok('J3','student resubmits after revision',
  format('select public.resubmit_graduation_project_proposal(%L,4,gen_random_uuid())',pg_temp.gp('j1')));
select pg_temp.as_user('u_head');
select pg_temp.j_ok('J3','head starts the second review round',
  format('select public.review_graduation_project_proposal(%L,%L,null,5,gen_random_uuid())',pg_temp.gp('j1'),'start_review'));
select pg_temp.j_ok('J1','head approves the resubmitted proposal',
  format('select public.review_graduation_project_proposal(%L,%L,null,6,gen_random_uuid())',pg_temp.gp('j1'),'approve'));
select pg_temp.j_ok('J1','head activates the project',
  format('select public.activate_graduation_project(%L,7,gen_random_uuid())',pg_temp.gp('j1')));
select pg_temp.as_user('u_coord');
select pg_temp.j_ok('J1','milestone plan set (progress 40 + final 60)',
  format('select public.set_graduation_project_milestone(%L,%L,%L,1,40,gen_random_uuid())',pg_temp.gp('j1'),'TEST_ONLY — mid report','progress'));
select pg_temp.j_ok('J1','final milestone set',
  format('select public.set_graduation_project_milestone(%L,%L,%L,2,60,gen_random_uuid())',pg_temp.gp('j1'),'TEST_ONLY — final','final'));
select pg_temp.as_user('u_s2');
with m as (select id from public.graduation_project_milestones where project_id=(select v from gp_ids where k='j1') and sequence_no=1)
insert into gp_ids select 'j1_m1',id from m;
select pg_temp.j_ok('J1','student 2 submits milestone 1 deliverable',
  format('select public.submit_graduation_project_deliverable(%L,%L,%L,gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('j1_m1'),'TEST_ONLY — v1'));
select pg_temp.as_user('u_sup');
select pg_temp.j_ok('J7','supervisor returns the deliverable for revision',
  format('select public.review_graduation_project_submission(%L,(select id from public.graduation_project_submissions where project_id=%L and state=%L),%L,%L,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'submitted','require_revision','TEST_ONLY — needs citations'));
select pg_temp.as_user('u_s2');
select pg_temp.j_ok('J7','student resubmits v2 of the deliverable',
  format('select public.submit_graduation_project_deliverable(%L,%L,%L,gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('j1_m1'),'TEST_ONLY — v2'));
select pg_temp.as_user('u_sup');
select pg_temp.j_ok('J6','supervisor accepts the revised deliverable',
  format('select public.review_graduation_project_submission(%L,(select id from public.graduation_project_submissions where project_id=%L and state=%L),%L,null,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'submitted','accept'));
select pg_temp.as_user('u_s1');
select pg_temp.j_err('J8','invalid file type is rejected',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('j1'),'graduation-projects/'||pg_temp.gp('j1')||'/evil.exe','evil.exe','application/x-msdownload','a'),
  'file media type not allowed');
select pg_temp.j_err('J9','cross-project object key is rejected',
  format('select public.register_graduation_project_file(%L,null,%L,%L,%L,10,repeat(%L,64),gen_random_uuid())',
    pg_temp.gp('j1'),'graduation-projects/'||pg_temp.gp('p0')||'/stolen.pdf','stolen.pdf','application/pdf','b'),
  'file object key outside project scope');
select pg_temp.as_user('u_admin2');
select pg_temp.j_err('J9','outsider cannot read another project''s detail (file listing)',
  format('select public.get_graduation_project_detail(%L)',pg_temp.gp('j1')),
  'exact direct processing assignment required');
select pg_temp.as_user('u_s1');
select pg_temp.j_err('J10','defense request before readiness is rejected',
  format('select public.request_graduation_project_discussion(%L,gen_random_uuid())',pg_temp.gp('j1')),
  'discussion readiness failed');
-- finish readiness: final deliverable + accept + clean final file
select pg_temp.j_ok('J1','student submits the final deliverable',
  format('select public.submit_graduation_project_deliverable(%L,(select id from public.graduation_project_milestones where project_id=%L and sequence_no=2),%L,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'TEST_ONLY — final v1'));
select pg_temp.as_user('u_sup');
select pg_temp.j_ok('J1','supervisor accepts the final deliverable',
  format('select public.review_graduation_project_submission(%L,(select id from public.graduation_project_submissions where project_id=%L and state=%L),%L,null,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'submitted','accept'));
select pg_temp.as_user('u_s1');
select pg_temp.j_ok('J1','final manuscript registered',
  format('with f as (select public.register_graduation_project_file(%L,(select s.id from public.graduation_project_submissions s
      join public.graduation_project_milestones m on (m.id,m.project_id)=(s.milestone_id,s.project_id)
      where s.project_id=%L and s.state=%L and m.milestone_kind=%L),%L,%L,%L,1200000,repeat(%L,64),gen_random_uuid(),%L) id)
    insert into gp_ids select %L,id from f',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'accepted','final','graduation-projects/'||pg_temp.gp('j1')||'/final.pdf','final.pdf','application/pdf','c','final_manuscript','j1_ff'));
-- external scanner marks it clean (service path)
select pg_temp.j_ok('J1','external scan marks the final file clean',
  format('select public.set_graduation_project_file_scan_state(%L,%L,%L)',pg_temp.gp('j1_ff'),'clean','51111111-0000-0000-0000-000000000002'));
select pg_temp.j_ok('J1','student requests the defense once ready',
  format('select public.request_graduation_project_discussion(%L,gen_random_uuid())',pg_temp.gp('j1')));
select pg_temp.as_user('u_coord');
select pg_temp.j_ok('J1','coordinator schedules the defense',
  format('select public.schedule_graduation_project_discussion(%L,(select id from public.graduation_project_discussion_requests where project_id=%L and state=%L),now()+%L,%L,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'pending','10 days','TEST_ONLY — Hall 7'));
select pg_temp.j_err('J11','incomplete committee blocks the held transition',
  format('select public.record_graduation_project_discussion_outcome(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('j1'),'held'),
  'panel incomplete for defense');
select pg_temp.j_ok('J11','chair panel member assigned',
  format('with a as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
      values(%L,%L,%L,%L,%L,%L) returning id)
    select public.assign_graduation_project_panel_member(%L,(select id from public.graduation_project_discussions where project_id=%L),(select id from a),true,gen_random_uuid())',
    pg_temp.gp('j1'),'panel_member',pg_temp.gp('fp_chair'),pg_temp.gp('u_chair'),pg_temp.gp('dept1'),pg_temp.gp('u_coord'),
    pg_temp.gp('j1'),pg_temp.gp('j1')));
select pg_temp.j_ok('J11','second panel member assigned',
  format('with a as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
      values(%L,%L,%L,%L,%L,%L) returning id)
    select public.assign_graduation_project_panel_member(%L,(select id from public.graduation_project_discussions where project_id=%L),(select id from a),false,gen_random_uuid())',
    pg_temp.gp('j1'),'panel_member',pg_temp.gp('fp_panel2'),pg_temp.gp('u_panel2'),pg_temp.gp('dept1'),pg_temp.gp('u_coord'),
    pg_temp.gp('j1'),pg_temp.gp('j1')));
select pg_temp.j_ok('J11','defense held with a complete committee',
  format('select public.record_graduation_project_discussion_outcome(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('j1'),'held'));
select pg_temp.as_user('u_head');
select pg_temp.j_err('J12','missing evaluation blocks the result',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),gen_random_uuid())',pg_temp.gp('j1'),'completed',pg_temp.gp('j1')),
  'evaluations not finalized');
select pg_temp.as_user('u_chair');
select pg_temp.j_ok('J13','chair submits and finalizes own evaluation',
  format('select public.save_graduation_project_evaluation(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":55},{"criterion_code":"defense","criterion_label":"Defense","maximum_score":40,"awarded_score":35}]'));
select pg_temp.j_ok('J13','chair finalizes',
  format('select public.finalize_graduation_project_evaluation((select e.id from public.graduation_project_evaluations e
      join public.graduation_project_panel_members pm on pm.id=e.panel_member_id and pm.project_id=e.project_id
      join public.graduation_project_assignments a on a.id=pm.assignment_id and a.project_id=pm.project_id
      where e.project_id=%L and a.user_id=%L),gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('u_chair')));
select pg_temp.as_user('u_panel2');
select pg_temp.j_ok('J13','second member submits and finalizes own evaluation',
  format('select public.save_graduation_project_evaluation(%L,(select id from public.graduation_project_discussions where project_id=%L),%L,%L::jsonb,null,true,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":50},{"criterion_code":"defense","criterion_label":"Defense","maximum_score":40,"awarded_score":38}]'));
select pg_temp.j_ok('J13','second member finalizes',
  format('select public.finalize_graduation_project_evaluation((select e.id from public.graduation_project_evaluations e
      join public.graduation_project_panel_members pm on pm.id=e.panel_member_id and pm.project_id=e.project_id
      join public.graduation_project_assignments a on a.id=pm.assignment_id and a.project_id=pm.project_id
      where e.project_id=%L and a.user_id=%L),gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('u_panel2')));
select pg_temp.as_user('u_head');
select pg_temp.j_ok('J15','head requires corrections',
  format('select public.conclude_graduation_project_result(%L,%L,%L::jsonb,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('j1'),'corrections_required','[{"description":"TEST_ONLY — fix figures"}]',pg_temp.gp('j1')));
select pg_temp.as_user('u_s1');
select pg_temp.j_ok('J15','student completes the correction',
  format('select public.complete_graduation_project_correction(%L,(select id from public.graduation_project_corrections where project_id=%L),gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('j1')));
select pg_temp.as_user('u_head');
select pg_temp.j_ok('J15','head accepts the correction',
  format('select public.accept_graduation_project_correction(%L,(select id from public.graduation_project_corrections where project_id=%L),gen_random_uuid())',pg_temp.gp('j1'),pg_temp.gp('j1')));
select pg_temp.j_ok('J16','head concludes completed',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),%L)',
    pg_temp.gp('j1'),'completed',pg_temp.gp('j1'),'51111111-0000-0000-0000-000000000003'));
select pg_temp.j_ok('J14','double-click retry computes the result exactly once',
  format('select public.conclude_graduation_project_result(%L,%L,null,(select version from public.graduation_projects where id=%L),%L)',
    pg_temp.gp('j1'),'completed',pg_temp.gp('j1'),'51111111-0000-0000-0000-000000000003'));
select pg_temp.guard('J14','exactly one result event recorded',
  format('do $$ begin if (select count(*) from public.graduation_project_events where project_id=%L and event_type=%L)<>1 then raise exception %L; end if; end $$',
    pg_temp.gp('j1'),'result_completed','result not exactly once'));
select pg_temp.j_ok('J16','head archives the project',
  format('select public.archive_graduation_project(%L,%L,(select version from public.graduation_projects where id=%L),gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1_ff'),pg_temp.gp('j1')));
select pg_temp.as_user('u_s1');
select pg_temp.j_err('J17','archived project rejects further deliverables',
  format('select public.submit_graduation_project_deliverable(%L,(select id from public.graduation_project_milestones where project_id=%L and sequence_no=2),%L,gen_random_uuid())',
    pg_temp.gp('j1'),pg_temp.gp('j1'),'TEST_ONLY — late'),
  'deliverable submission state denied');

-- ============================= J2: individual project reaches submitted state
select pg_temp.as_user('u_coord');
select pg_temp.j_ok('J2','coordinator creates an individual project',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — J2 individual','51111111-0000-0000-0000-000000000004','j2'));
select pg_temp.j_ok('J2','single student team',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('j2'),pg_temp.gp('sp_solo'),pg_temp.gp('u_solo')));
select pg_temp.as_user('u_solo');
select pg_temp.j_ok('J2','individual student submits the proposal',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('j2')));

-- ==================== J4: member withdrawal before lock loses all powers
select pg_temp.as_user('u_coord');
select pg_temp.j_ok('J4','coordinator creates a project for the withdrawal journey',
  format('with x as (select public.create_graduation_project(%L,%L,null,null,null,null,%L) id) insert into gp_ids select %L,id from x',
    pg_temp.gp('dept1'),'TEST_ONLY — J4 withdrawal','51111111-0000-0000-0000-000000000005','j4'));
select pg_temp.j_ok('J4','student 2 joins the team',
  format('select public.add_graduation_project_team_member(%L,%L,%L,gen_random_uuid())',pg_temp.gp('j4'),pg_temp.gp('sp_s2'),pg_temp.gp('u_s2')));
select pg_temp.j_ok('J4','coordinator ends student 2 membership before lock',
  format('select public.end_graduation_project_assignment(%L,(select id from public.graduation_project_assignments where project_id=%L and user_id=%L and role=%L),gen_random_uuid())',
    pg_temp.gp('j4'),pg_temp.gp('j4'),pg_temp.gp('u_s2'),'student'));
select pg_temp.as_user('u_s2');
select pg_temp.j_err('J4','withdrawn member cannot submit the proposal',
  format('select public.submit_graduation_project_proposal(%L,1,gen_random_uuid())',pg_temp.gp('j4')),
  'exact direct processing assignment required');
select pg_temp.j_err('J4','withdrawn member cannot read the project',
  format('select public.get_graduation_project_detail(%L)',pg_temp.gp('j4')),
  'exact direct processing assignment required');

-- ============================================================ JOURNEY GATE
table gp_journey order by 1;
do $$ declare v_total integer; v_fail integer; begin
  select count(*),count(*) filter(where result='FAIL') into v_total,v_fail from gp_journey;
  if v_fail>0 then
    raise exception 'E2E JOURNEYS FAILED: % of % steps failed',v_fail,v_total;
  end if;
  raise notice 'E2E JOURNEYS PASS: % steps, fail=0',v_total;
end $$;
rollback;
