-- Executable disposable-PostgreSQL lifecycle verifier (psql). NEVER run on production.
-- Prerequisite: minimal schema + foundation draft + lifecycle completion draft applied
-- to an isolated clone, plus synthetic fixtures from one department:
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
select set_config('gp.department_id', :'department_id', true);
select set_config('gp.student_profile_id', :'student_profile_id', true);
select set_config('gp.student_user_id', :'student_user_id', true);
select set_config('gp.faculty_profile_id', :'faculty_profile_id', true);
select set_config('gp.faculty_user_id', :'faculty_user_id', true);

create temporary table gp_ids(k text primary key,v uuid not null) on commit drop;
create function pg_temp.expect_gp_error(statement text,expected_message text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected graduation-project error was not raised';
exception when sqlstate 'P0001' then
  if sqlerrm<>expected_message then raise exception 'unexpected error: %, expected: %',sqlerrm,expected_message; end if;
end $$;

-- Privileged bootstrap fixture (G4): a department coordinator exists on a prior
-- project p0 so delegated creation can be exercised end to end.
with x as (insert into public.graduation_projects(department_id,proposal_title,state) values(:'department_id','Lifecycle Bootstrap','draft') returning id)
insert into gp_ids select 'p0',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'coordinator',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p0' returning id)
insert into gp_ids select 'coordinator0',id from x;

-- Delegated creation is denied without a department coordinator/head assignment.
do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  perform pg_temp.expect_gp_error(format('select public.create_graduation_project(%L,%L,%L,null,null,null,%L)',
    current_setting('gp.department_id'),'Denied Project','x',gen_random_uuid()),'project creation assignment required');
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
end $$;

-- p1: full happy path create -> archive.
insert into gp_ids values('create1',gen_random_uuid());
insert into gp_ids select 'p1',public.create_graduation_project(:'department_id','Lifecycle Project One','Abstract',null,null,null,(select v from gp_ids where k='create1'));
insert into gp_ids select 'create1_retry',public.create_graduation_project(:'department_id','Lifecycle Project One','Abstract',null,null,null,(select v from gp_ids where k='create1'));
insert into gp_ids values('team1',gen_random_uuid());
insert into gp_ids select 'student1',public.add_graduation_project_team_member((select v from gp_ids where k='p1'),:'student_profile_id',:'student_user_id',(select v from gp_ids where k='team1'));
insert into gp_ids select 'team1_retry',public.add_graduation_project_team_member((select v from gp_ids where k='p1'),:'student_profile_id',:'student_user_id',(select v from gp_ids where k='team1'));
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids values('prop1',gen_random_uuid());
insert into gp_ids select 'prop1_result',public.submit_graduation_project_proposal((select v from gp_ids where k='p1'),1,(select v from gp_ids where k='prop1'));
insert into gp_ids select 'prop1_retry',public.submit_graduation_project_proposal((select v from gp_ids where k='p1'),1,(select v from gp_ids where k='prop1'));
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
insert into gp_ids values('rev1',gen_random_uuid());
insert into gp_ids select 'rev1_result',public.review_graduation_project_proposal((select v from gp_ids where k='p1'),'start_review',null,(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='rev1'));
insert into gp_ids select 'rev1_retry',public.review_graduation_project_proposal((select v from gp_ids where k='p1'),'start_review',null,(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='rev1'));
insert into gp_ids values('rev2',gen_random_uuid());
insert into gp_ids select 'rev2_result',public.review_graduation_project_proposal((select v from gp_ids where k='p1'),'approve',null,(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='rev2'));
insert into gp_ids select 'rev2_retry',public.review_graduation_project_proposal((select v from gp_ids where k='p1'),'approve',null,(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='rev2'));
insert into gp_ids values('ms1',gen_random_uuid());
insert into gp_ids select 'm1',public.set_graduation_project_milestone((select v from gp_ids where k='p1'),'Final report','final',1,100,(select v from gp_ids where k='ms1'));
insert into gp_ids values('act1',gen_random_uuid());
insert into gp_ids select 'act1_result',public.activate_graduation_project((select v from gp_ids where k='p1'),(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='act1'));
insert into gp_ids select 'act1_retry',public.activate_graduation_project((select v from gp_ids where k='p1'),(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='act1'));
insert into gp_ids values('asg1',gen_random_uuid());
insert into gp_ids select 'supervisor1',public.assign_graduation_project_faculty((select v from gp_ids where k='p1'),'supervisor',:'faculty_profile_id',:'faculty_user_id',(select v from gp_ids where k='asg1'));
insert into gp_ids select 'asg1_retry',public.assign_graduation_project_faculty((select v from gp_ids where k='p1'),'supervisor',:'faculty_profile_id',:'faculty_user_id',(select v from gp_ids where k='asg1'));
insert into gp_ids values('asg2',gen_random_uuid());
insert into gp_ids select 'panelasg1',public.assign_graduation_project_faculty((select v from gp_ids where k='p1'),'panel_member',:'faculty_profile_id',:'faculty_user_id',(select v from gp_ids where k='asg2'));
insert into gp_ids select 'asg2_retry',public.assign_graduation_project_faculty((select v from gp_ids where k='p1'),'panel_member',:'faculty_profile_id',:'faculty_user_id',(select v from gp_ids where k='asg2'));

-- Denial matrix (preconditions and role walls) on the active project.
do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  perform pg_temp.expect_gp_error(format('select public.review_graduation_project_proposal(%L,%L,null,1,%L)',(select v from gp_ids where k='p1'),'approve',gen_random_uuid()),'exact direct processing assignment required');
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
  perform pg_temp.expect_gp_error(format('select public.activate_graduation_project(%L,%s,%L)',(select v from gp_ids where k='p1'),(select version+99 from public.graduation_projects where id=(select v from gp_ids where k='p1')),gen_random_uuid()),'project activation precondition failed');
  perform pg_temp.expect_gp_error(format('select public.assign_graduation_project_faculty(%L,%L,%L,%L,%L)',(select v from gp_ids where k='p1'),'dean',current_setting('gp.faculty_profile_id'),current_setting('gp.faculty_user_id'),gen_random_uuid()),'faculty assignment role denied');
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
end $$;

-- Deliverable flow with review denial (missing revision note) and file denials.
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids values('del1',gen_random_uuid());
insert into gp_ids select 's1',public.submit_graduation_project_deliverable((select v from gp_ids where k='p1'),(select v from gp_ids where k='m1'),'Final v1',(select v from gp_ids where k='del1'));
insert into gp_ids select 'del1_retry',public.submit_graduation_project_deliverable((select v from gp_ids where k='p1'),(select v from gp_ids where k='m1'),'Final v1',(select v from gp_ids where k='del1'));
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.register_graduation_project_file(%L,null,%L,%L,%L,1,%L,%L)',
    (select v from gp_ids where k='p1'),'other-project/final.pdf','final.pdf','application/pdf',repeat('a',64),gen_random_uuid()),'file object key outside project scope');
  perform pg_temp.expect_gp_error(format('select public.register_graduation_project_file(%L,null,%L,%L,%L,1,%L,%L)',
    (select v from gp_ids where k='p1'),'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/t-final.pdf','final.pdf','application/pdf','not-a-sha',gen_random_uuid()),'file metadata invalid');
end $$;
insert into gp_ids values('file1',gen_random_uuid());
insert into gp_ids select 'f1',public.register_graduation_project_file((select v from gp_ids where k='p1'),(select v from gp_ids where k='s1'),'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/a-final.pdf','final.pdf','application/pdf',1024,repeat('a',64),(select v from gp_ids where k='file1'));
insert into gp_ids select 'file1_retry',public.register_graduation_project_file((select v from gp_ids where k='p1'),(select v from gp_ids where k='s1'),'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/a-final.pdf','final.pdf','application/pdf',1024,repeat('a',64),(select v from gp_ids where k='file1'));
insert into gp_ids values('file2',gen_random_uuid());
insert into gp_ids select 'f2',public.register_graduation_project_file((select v from gp_ids where k='p1'),(select v from gp_ids where k='s1'),'graduation-projects/'||(select v from gp_ids where k='p1')::text||'/b-annex.pdf','annex.pdf','application/pdf',2048,repeat('b',64),(select v from gp_ids where k='file2'));
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.review_graduation_project_submission(%L,%L,%L,null,%L)',(select v from gp_ids where k='p1'),(select v from gp_ids where k='s1'),'require_revision',gen_random_uuid()),'revision note required');
end $$;
insert into gp_ids values('subrev1',gen_random_uuid());
insert into gp_ids select 'subrev1_result',public.review_graduation_project_submission((select v from gp_ids where k='p1'),(select v from gp_ids where k='s1'),'accept',null,(select v from gp_ids where k='subrev1'));
insert into gp_ids select 'subrev1_retry',public.review_graduation_project_submission((select v from gp_ids where k='p1'),(select v from gp_ids where k='s1'),'accept',null,(select v from gp_ids where k='subrev1'));

-- External scanner marks the final file clean; then the discussion request succeeds.
update public.graduation_project_files set scan_state='clean' where id=(select v from gp_ids where k='f1');
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids values('req1',gen_random_uuid());
insert into gp_ids select 'r1',public.request_graduation_project_discussion((select v from gp_ids where k='p1'),(select v from gp_ids where k='req1'));
insert into gp_ids select 'req1_retry',public.request_graduation_project_discussion((select v from gp_ids where k='p1'),(select v from gp_ids where k='req1'));
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
insert into gp_ids values('sch1',gen_random_uuid());
insert into gp_ids select 'd1',public.schedule_graduation_project_discussion((select v from gp_ids where k='p1'),(select v from gp_ids where k='r1'),now()+interval '7 days','Hall A',(select v from gp_ids where k='sch1'));
insert into gp_ids select 'sch1_retry',public.schedule_graduation_project_discussion((select v from gp_ids where k='p1'),(select v from gp_ids where k='r1'),now()+interval '7 days','Hall A',(select v from gp_ids where k='sch1'));
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.assign_graduation_project_panel_member(%L,%L,%L,false,%L)',
    (select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),(select v from gp_ids where k='student1'),gen_random_uuid()),'panel assignment precondition failed');
end $$;
insert into gp_ids values('pm1',gen_random_uuid());
insert into gp_ids select 'panel1',public.assign_graduation_project_panel_member((select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),(select v from gp_ids where k='panelasg1'),true,(select v from gp_ids where k='pm1'));
insert into gp_ids select 'pm1_retry',public.assign_graduation_project_panel_member((select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),(select v from gp_ids where k='panelasg1'),true,(select v from gp_ids where k='pm1'));
insert into gp_ids values('out1',gen_random_uuid());
insert into gp_ids select 'out1_result',public.record_graduation_project_discussion_outcome((select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'held',(select v from gp_ids where k='out1'));
insert into gp_ids select 'out1_retry',public.record_graduation_project_discussion_outcome((select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'held',(select v from gp_ids where k='out1'));
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.record_graduation_project_discussion_outcome(%L,%L,%L,%L)',(select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'postponed',gen_random_uuid()),'discussion outcome precondition failed');
end $$;

-- Evaluation: invalid scores denied, then submitted, then re-save denied.
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.save_graduation_project_evaluation(%L,%L,%L,%L::jsonb,null,false,%L)',
    (select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'v1','[{"criterion_code":"","criterion_label":"X","maximum_score":10,"awarded_score":5}]',gen_random_uuid()),'evaluation scores invalid');
end $$;
insert into gp_ids values('eval1',gen_random_uuid());
insert into gp_ids select 'e1',public.save_graduation_project_evaluation((select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'v1',
  '[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":55},{"criterion_code":"defense","criterion_label":"Defense","maximum_score":40,"awarded_score":35}]'::jsonb,
  'solid',true,(select v from gp_ids where k='eval1'));
insert into gp_ids select 'eval1_retry',public.save_graduation_project_evaluation((select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'v1',
  '[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":55}]'::jsonb,null,true,(select v from gp_ids where k='eval1'));
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.save_graduation_project_evaluation(%L,%L,%L,%L::jsonb,null,false,%L)',
    (select v from gp_ids where k='p1'),(select v from gp_ids where k='d1'),'v1','[{"criterion_code":"content","criterion_label":"Content","maximum_score":60,"awarded_score":50}]',gen_random_uuid()),'evaluation already submitted');
end $$;

-- Visibility gates for the student before finalization.
do $$ declare v_detail jsonb; v_n integer; begin
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  v_detail:=public.get_graduation_project_detail((select v from gp_ids where k='p1'));
  if jsonb_array_length(v_detail->'evaluations')<>0 then raise exception 'student saw non-finalized evaluation'; end if;
  select count(*) into v_n from jsonb_array_elements(v_detail->'files') f where f->>'object_key' is null;
  if v_n<>1 then raise exception 'pending-scan file key leaked'; end if;
  select count(*) into v_n from jsonb_array_elements(v_detail->'files') f where f->>'object_key' is not null;
  if v_n<>1 then raise exception 'clean file key missing for team'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
end $$;

-- Finalize evaluation, conclude with corrections, complete/accept loop, conclude completed.
insert into gp_ids values('evalfin1',gen_random_uuid());
insert into gp_ids select 'evalfin1_result',public.finalize_graduation_project_evaluation((select v from gp_ids where k='e1'),(select v from gp_ids where k='evalfin1'));
insert into gp_ids select 'evalfin1_retry',public.finalize_graduation_project_evaluation((select v from gp_ids where k='e1'),(select v from gp_ids where k='evalfin1'));
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'dean',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p1' returning id)
insert into gp_ids select 'dean1',id from x;
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.conclude_graduation_project_result(%L,%L,%L::jsonb,%s,%L)',
    (select v from gp_ids where k='p1'),'corrections_required','[]',(select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),gen_random_uuid()),'corrections payload invalid');
end $$;
insert into gp_ids values('conc1',gen_random_uuid());
insert into gp_ids select 'conc1_result',public.conclude_graduation_project_result((select v from gp_ids where k='p1'),'corrections_required',
  '[{"description":"Fix references","due_at":"2026-12-01T00:00:00Z"}]'::jsonb,
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='conc1'));
insert into gp_ids select 'conc1_retry',public.conclude_graduation_project_result((select v from gp_ids where k='p1'),'corrections_required',
  '[{"description":"Fix references"}]'::jsonb,
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='conc1'));
insert into gp_ids select 'c1',id from public.graduation_project_corrections where project_id=(select v from gp_ids where k='p1');
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.accept_graduation_project_correction(%L,%L,%L)',(select v from gp_ids where k='p1'),(select v from gp_ids where k='c1'),gen_random_uuid()),'correction acceptance precondition failed');
end $$;
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids values('corr1',gen_random_uuid());
insert into gp_ids select 'corr1_result',public.complete_graduation_project_correction((select v from gp_ids where k='p1'),(select v from gp_ids where k='c1'),(select v from gp_ids where k='corr1'));
insert into gp_ids select 'corr1_retry',public.complete_graduation_project_correction((select v from gp_ids where k='p1'),(select v from gp_ids where k='c1'),(select v from gp_ids where k='corr1'));
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
insert into gp_ids values('acc1',gen_random_uuid());
insert into gp_ids select 'acc1_result',public.accept_graduation_project_correction((select v from gp_ids where k='p1'),(select v from gp_ids where k='c1'),(select v from gp_ids where k='acc1'));
insert into gp_ids select 'acc1_retry',public.accept_graduation_project_correction((select v from gp_ids where k='p1'),(select v from gp_ids where k='c1'),(select v from gp_ids where k='acc1'));
do $$ begin
  if (select state from public.graduation_projects where id=(select v from gp_ids where k='p1'))<>'evaluating' then raise exception 'last accepted correction must return project to evaluating'; end if;
end $$;
insert into gp_ids values('conc2',gen_random_uuid());
insert into gp_ids select 'conc2_result',public.conclude_graduation_project_result((select v from gp_ids where k='p1'),'completed',null,
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='conc2'));
insert into gp_ids select 'conc2_retry',public.conclude_graduation_project_result((select v from gp_ids where k='p1'),'completed',null,
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='conc2'));

-- Archive via the merged foundation RPC (dean assignment, clean accepted file, accepted corrections).
insert into gp_ids values('arch1',gen_random_uuid());
insert into gp_ids select 'arch1_result',public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='arch1'));
insert into gp_ids select 'arch1_retry',public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p1')),(select v from gp_ids where k='arch1'));
do $$ begin
  if (select state from public.graduation_projects where id=(select v from gp_ids where k='p1'))<>'archived' then raise exception 'archive positive failed'; end if;
end $$;

-- p2: revision loop (require_revision -> resubmit -> reject) with reason denials.
insert into gp_ids values('create2',gen_random_uuid());
insert into gp_ids select 'p2',public.create_graduation_project(:'department_id','Lifecycle Project Two','Abstract',null,null,null,(select v from gp_ids where k='create2'));
insert into gp_ids select 'student2',public.add_graduation_project_team_member((select v from gp_ids where k='p2'),:'student_profile_id',:'student_user_id',gen_random_uuid());
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids select 'prop2',public.submit_graduation_project_proposal((select v from gp_ids where k='p2'),1,gen_random_uuid());
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.review_graduation_project_proposal(%L,%L,null,%s,%L)',
    (select v from gp_ids where k='p2'),'start_review',(select version+99 from public.graduation_projects where id=(select v from gp_ids where k='p2')),gen_random_uuid()),'proposal review precondition failed');
  perform pg_temp.expect_gp_error(format('select public.review_graduation_project_proposal(%L,%L,null,%s,%L)',
    (select v from gp_ids where k='p2'),'require_revision',(select version from public.graduation_projects where id=(select v from gp_ids where k='p2')),gen_random_uuid()),'review reason required');
end $$;
insert into gp_ids select 'rev2b',public.review_graduation_project_proposal((select v from gp_ids where k='p2'),'require_revision','Expand the scope',
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p2')),gen_random_uuid());
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids values('resub1',gen_random_uuid());
insert into gp_ids select 'resub1_result',public.resubmit_graduation_project_proposal((select v from gp_ids where k='p2'),
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p2')),(select v from gp_ids where k='resub1'));
insert into gp_ids select 'resub1_retry',public.resubmit_graduation_project_proposal((select v from gp_ids where k='p2'),
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p2')),(select v from gp_ids where k='resub1'));
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
insert into gp_ids select 'rev3b',public.review_graduation_project_proposal((select v from gp_ids where k='p2'),'reject','Out of scope',
  (select version from public.graduation_projects where id=(select v from gp_ids where k='p2')),gen_random_uuid());
do $$ begin
  if (select state from public.graduation_projects where id=(select v from gp_ids where k='p2'))<>'rejected' then raise exception 'revision loop positive failed'; end if;
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  perform pg_temp.expect_gp_error(format('select public.submit_graduation_project_deliverable(%L,%L,%L,%L)',(select v from gp_ids where k='p2'),gen_random_uuid(),'x',gen_random_uuid()),'deliverable submission state denied');
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
end $$;

-- p3: discussion request rejection, postponement, held outcome; evaluations not finalized denial.
insert into gp_ids select 'p3',public.create_graduation_project(:'department_id','Lifecycle Project Three','Abstract',null,null,null,gen_random_uuid());
update public.graduation_projects set state='active' where id=(select v from gp_ids where k='p3');
with x as (insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
select v,'student',:'student_profile_id',:'student_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p3' returning id)
insert into gp_ids select 'student3',id from x;
insert into gp_ids select 'supervisor3',public.assign_graduation_project_faculty((select v from gp_ids where k='p3'),'supervisor',:'faculty_profile_id',:'faculty_user_id',gen_random_uuid());
insert into gp_ids select 'panelasg3',public.assign_graduation_project_faculty((select v from gp_ids where k='p3'),'panel_member',:'faculty_profile_id',:'faculty_user_id',gen_random_uuid());
with x as (insert into public.graduation_project_milestones(project_id,title,milestone_kind,sequence_no,weight,status,completion_percent)
select v,'Final','final',1,100,'accepted',100 from gp_ids where k='p3' returning id)
insert into gp_ids select 'm3',id from x;
with x as (insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id,state,accepted_at)
select (select v from gp_ids where k='p3'),v,1,(select v from gp_ids where k='student3'),'accepted',now() from gp_ids where k='m3' returning id)
insert into gp_ids select 's3',id from x;
insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,scan_state,uploaded_by_assignment_id)
select (select v from gp_ids where k='p3'),v,'graduation-projects/'||(select v from gp_ids where k='p3')::text||'/c-final.pdf','final.pdf','application/pdf',1,repeat('c',64),'clean',(select v from gp_ids where k='student3') from gp_ids where k='s3';
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids select 'r3',public.request_graduation_project_discussion((select v from gp_ids where k='p3'),gen_random_uuid());
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
insert into gp_ids values('rej3',gen_random_uuid());
insert into gp_ids select 'rej3_result',public.reject_graduation_project_discussion_request((select v from gp_ids where k='p3'),(select v from gp_ids where k='r3'),'Queue full',(select v from gp_ids where k='rej3'));
insert into gp_ids select 'rej3_retry',public.reject_graduation_project_discussion_request((select v from gp_ids where k='p3'),(select v from gp_ids where k='r3'),'Queue full',(select v from gp_ids where k='rej3'));
select set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
insert into gp_ids select 'r3b',public.request_graduation_project_discussion((select v from gp_ids where k='p3'),gen_random_uuid());
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
insert into gp_ids select 'd3',public.schedule_graduation_project_discussion((select v from gp_ids where k='p3'),(select v from gp_ids where k='r3b'),now()+interval '5 days','Hall B',gen_random_uuid());
insert into gp_ids select 'panel3',public.assign_graduation_project_panel_member((select v from gp_ids where k='p3'),(select v from gp_ids where k='d3'),(select v from gp_ids where k='panelasg3'),false,gen_random_uuid());
insert into gp_ids select 'out3',public.record_graduation_project_discussion_outcome((select v from gp_ids where k='p3'),(select v from gp_ids where k='d3'),'postponed',gen_random_uuid());
insert into gp_ids select 'out3b',public.record_graduation_project_discussion_outcome((select v from gp_ids where k='p3'),(select v from gp_ids where k='d3'),'held',gen_random_uuid());
insert into gp_ids select 'e3',public.save_graduation_project_evaluation((select v from gp_ids where k='p3'),(select v from gp_ids where k='d3'),'v1',
  '[{"criterion_code":"content","criterion_label":"Content","maximum_score":100,"awarded_score":88}]'::jsonb,null,true,gen_random_uuid());
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'dean',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p3' returning id)
insert into gp_ids select 'dean3',id from x;
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.conclude_graduation_project_result(%L,%L,null,%s,%L)',
    (select v from gp_ids where k='p3'),'completed',(select version from public.graduation_projects where id=(select v from gp_ids where k='p3')),gen_random_uuid()),'evaluations not finalized');
  perform pg_temp.expect_gp_error(format('select public.end_graduation_project_assignment(%L,%L,%L)',
    (select v from gp_ids where k='p3'),(select a.id from public.graduation_project_assignments a where a.project_id=(select v from gp_ids where k='p3') and a.role='coordinator' and a.active limit 1),gen_random_uuid()),'cannot end own assignment');
end $$;

-- Read surface: lists, detail, and the four department reports.
do $$ declare v_report jsonb; begin
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  if not exists(select 1 from public.list_my_graduation_projects() where project_id=(select v from gp_ids where k='p1')) then raise exception 'student list missing own project'; end if;
  perform pg_temp.expect_gp_error(format('select public.get_graduation_project_states_report(%L)',current_setting('gp.department_id')),'department report assignment required');
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
  if not exists(select 1 from public.list_my_graduation_projects() where project_id=(select v from gp_ids where k='p1')) then raise exception 'faculty list missing own project'; end if;
  v_report:=public.get_graduation_project_states_report(:'department_id');
  if (v_report->'summary'->>'total')::integer<3 then raise exception 'states report incomplete'; end if;
  v_report:=public.get_graduation_project_assignments_report(:'department_id');
  if not exists(select 1 from jsonb_array_elements(v_report->'supervisors') s where (s->>'user_id')::uuid=:'faculty_user_id') then raise exception 'assignments report missing supervisor'; end if;
  v_report:=public.get_graduation_project_evaluations_report(:'department_id');
  if jsonb_array_length(v_report->'projects')<1 then raise exception 'evaluations report incomplete'; end if;
  v_report:=public.get_graduation_project_archive_report(:'department_id');
  if jsonb_array_length(v_report->'archives')<>1 then raise exception 'archive report incomplete'; end if;
  if has_function_privilege('anon','public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)','EXECUTE') then
    raise exception 'anon unexpectedly has create RPC execution';
  end if;
  if has_function_privilege('anon','public.get_graduation_project_states_report(uuid)','EXECUTE') then
    raise exception 'anon unexpectedly has report RPC execution';
  end if;
end $$;

-- Idempotent retries returned the same ids and emitted exactly one event each.
do $$ declare pair text[]; begin
  foreach pair slice 1 in array array[
    ['p1','create1_retry','create1','project_created'],
    ['student1','team1_retry','team1','team_member_added'],
    ['prop1_result','prop1_retry','prop1','proposal_submitted'],
    ['rev1_result','rev1_retry','rev1','proposal_review_started'],
    ['rev2_result','rev2_retry','rev2','proposal_approved'],
    ['act1_result','act1_retry','act1','project_activated'],
    ['supervisor1','asg1_retry','asg1','faculty_assigned'],
    ['s1','del1_retry','del1','deliverable_submitted'],
    ['subrev1_result','subrev1_retry','subrev1','submission_accepted'],
    ['f1','file1_retry','file1','file_registered'],
    ['r1','req1_retry','req1','discussion_requested'],
    ['d1','sch1_retry','sch1','discussion_scheduled'],
    ['panel1','pm1_retry','pm1','panel_member_assigned'],
    ['out1_result','out1_retry','out1','discussion_held'],
    ['e1','eval1_retry','eval1','evaluation_submitted'],
    ['evalfin1_result','evalfin1_retry','evalfin1','evaluation_finalized'],
    ['conc1_result','conc1_retry','conc1','corrections_requested'],
    ['corr1_result','corr1_retry','corr1','correction_completed'],
    ['acc1_result','acc1_retry','acc1','correction_accepted'],
    ['conc2_result','conc2_retry','conc2','result_completed'],
    ['arch1_result','arch1_retry','arch1','project_archived'],
    ['resub1_result','resub1_retry','resub1','proposal_resubmitted'],
    ['rej3_result','rej3_retry','rej3','discussion_request_rejected']
  ] loop
    if (select v from gp_ids where k=pair[1])<>(select v from gp_ids where k=pair[2]) then raise exception '% retry result mismatch',pair[4]; end if;
    if (select count(*) from public.graduation_project_events where correlation_id=(select v from gp_ids where k=pair[3]) and event_type=pair[4])<>1 then raise exception '% audit is not exactly once',pair[4]; end if;
  end loop;
end $$;

-- Full lifecycle walked via RPCs only: create/proposal/revision/activation/team/
-- milestones/deliverables/files/discussion/panel/evaluation/result/corrections/
-- archive, with exact denials, idempotent retries and visibility gates.
rollback;
