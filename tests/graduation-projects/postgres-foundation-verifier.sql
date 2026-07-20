-- Executable disposable-PostgreSQL verifier (psql). NEVER run on production.
-- Prerequisite: apply the draft to an isolated clone and provide existing,
-- synthetic profiles from one department:
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

do $$ begin
  if (select user_id from public.student_profiles where id=current_setting('gp.student_profile_id')::uuid) <> current_setting('gp.student_user_id')::uuid then raise exception 'bad student fixture'; end if;
  if (select department_id from public.student_profiles where id=current_setting('gp.student_profile_id')::uuid) <> current_setting('gp.department_id')::uuid then raise exception 'student fixture wrong department'; end if;
  if (select user_id from public.faculty_profiles where id=current_setting('gp.faculty_profile_id')::uuid) <> current_setting('gp.faculty_user_id')::uuid then raise exception 'bad faculty fixture'; end if;
  if (select department_id from public.faculty_profiles where id=current_setting('gp.faculty_profile_id')::uuid) <> current_setting('gp.department_id')::uuid then raise exception 'faculty fixture wrong department'; end if;
end $$;

create temporary table gp_ids(k text primary key,v uuid not null) on commit drop;
create function pg_temp.expect_fk(statement text,label text) returns void language plpgsql as $$
begin execute statement; raise exception '% unexpectedly allowed',label;
exception when foreign_key_violation then null;
end $$;
create function pg_temp.expect_gp_error(statement text,expected_message text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected graduation-project error was not raised';
exception when sqlstate 'P0001' then
  if sqlerrm<>expected_message then raise exception 'unexpected error: %, expected: %',sqlerrm,expected_message; end if;
end $$;
with x as (insert into public.graduation_projects(department_id,proposal_title,state) values(:'department_id','Verifier A','completed') returning id)
insert into gp_ids select 'p1',id from x;
with x as (insert into public.graduation_projects(department_id,proposal_title,state) values(:'department_id','Verifier B','active') returning id)
insert into gp_ids select 'p2',id from x;

-- Every listed child authority/evidence relation must have a composite FK.
do $$ declare t text; begin
  foreach t in array array['graduation_project_approvals','graduation_project_submissions','graduation_project_supervisor_notes',
    'graduation_project_files','graduation_project_discussion_requests','graduation_project_discussions',
    'graduation_project_panel_members','graduation_project_evaluations','graduation_project_corrections',
    'graduation_project_final_archives','graduation_project_events'] loop
    if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and contype='f' and cardinality(conkey)>1) then
      raise exception '% lacks composite same-scope FK',t;
    end if;
  end loop;
end $$;

insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'dean',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p1';
insert into gp_ids select 'a1',id from public.graduation_project_assignments where project_id=(select v from gp_ids where k='p1');
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by,active,ended_at)
select v,'dean',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id',false,now() from gp_ids where k='p2' returning id)
insert into gp_ids select 'a2',id from x;

-- Wrong role/subject and wrong profile owner must be rejected by executable inserts.
do $$ begin
  begin
    insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values((select v from gp_ids where k='p1'),'student',current_setting('gp.faculty_profile_id')::uuid,current_setting('gp.faculty_user_id')::uuid,current_setting('gp.department_id')::uuid,current_setting('gp.faculty_user_id')::uuid);
    raise exception 'wrong-role assignment unexpectedly allowed';
  exception when check_violation then
    if sqlstate<>'23514' or sqlerrm not like '%assignment_subject_shape%' then raise; end if;
  end;
  begin
    insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
    values((select v from gp_ids where k='p1'),'student',current_setting('gp.student_profile_id')::uuid,current_setting('gp.faculty_user_id')::uuid,current_setting('gp.department_id')::uuid,current_setting('gp.faculty_user_id')::uuid);
    raise exception 'wrong-owner assignment unexpectedly allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'assignment identity/department mismatch' then raise; end if;
  end;
end $$;

do $$ begin
  if has_function_privilege('anon','public.archive_graduation_project(uuid,uuid,bigint,uuid)','EXECUTE') then
    raise exception 'anon unexpectedly has archive RPC execution';
  end if;
end $$;

-- Cross-project actor evidence must fail and leave zero rows.
do $$ begin
  begin
    insert into public.graduation_project_approvals(project_id,stage,decision,assignment_id)
    values((select v from gp_ids where k='p2'),'proposal','approved',(select v from gp_ids where k='a1'));
    raise exception 'cross-project approval unexpectedly allowed';
  exception when foreign_key_violation then null; end;
  if exists(select 1 from public.graduation_project_approvals where project_id=(select v from gp_ids where k='p2')) then raise exception 'denial had side effects'; end if;
end $$;

insert into public.graduation_project_milestones(project_id,title,milestone_kind,sequence_no,weight,status)
select v,'Final','final',1,100,'accepted' from gp_ids where k='p1';
insert into gp_ids select 'm1',id from public.graduation_project_milestones where project_id=(select v from gp_ids where k='p1');
insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id,state,accepted_at)
select (select v from gp_ids where k='p1'),v,1,(select v from gp_ids where k='a1'),'accepted',now() from gp_ids where k='m1';
insert into gp_ids select 's1',id from public.graduation_project_submissions where project_id=(select v from gp_ids where k='p1');
insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,scan_state,uploaded_by_assignment_id)
select (select v from gp_ids where k='p1'),v,'graduation-projects/verifier/final.pdf','final.pdf','application/pdf',1,repeat('a',64),'quarantined',(select v from gp_ids where k='a1') from gp_ids where k='s1';
insert into gp_ids select 'f1',id from public.graduation_project_files where project_id=(select v from gp_ids where k='p1');

with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'panel_member',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p1' returning id)
insert into gp_ids select 'panel_assignment',id from x;
with x as (insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id,state)
select (select v from gp_ids where k='p1'),(select v from gp_ids where k='a1'),'approved' returning id)
insert into gp_ids select 'r1',id from x;
with x as (insert into public.graduation_project_discussions(project_id,request_id,starts_at,venue,coordinator_assignment_id)
select (select v from gp_ids where k='p1'),v,now(),'Verifier',(select v from gp_ids where k='a1') from gp_ids where k='r1' returning id)
insert into gp_ids select 'd1',id from x;
with x as (insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id)
select (select v from gp_ids where k='p1'),v,(select v from gp_ids where k='panel_assignment') from gp_ids where k='d1' returning id)
insert into gp_ids select 'panel1',id from x;
with x as (insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id,state)
select (select v from gp_ids where k='p1'),(select v from gp_ids where k='a1'),'approved' returning id)
insert into gp_ids select 'r1cross',id from x;

-- Executable cross-project DML for every sensitive child binding. Only the
-- expected composite-FK SQLSTATE is accepted; any other error fails the script.
select pg_temp.expect_fk($q$insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='m1'),99,(select v from gp_ids where k='a2'))$q$,'submission milestone');
select pg_temp.expect_fk($q$insert into public.graduation_project_supervisor_notes(project_id,submission_id,supervisor_assignment_id,note)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='s1'),(select v from gp_ids where k='a2'),'cross')$q$,'supervisor note');
select pg_temp.expect_fk($q$insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,uploaded_by_assignment_id)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='s1'),'graduation-projects/cross/file','x','x',1,repeat('b',64),(select v from gp_ids where k='a2'))$q$,'file submission');
select pg_temp.expect_fk($q$insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='a1'))$q$,'discussion request actor');
select pg_temp.expect_fk($q$insert into public.graduation_project_discussions(project_id,request_id,starts_at,venue,coordinator_assignment_id)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='r1cross'),now(),'cross',(select v from gp_ids where k='a2'))$q$,'discussion request');
select pg_temp.expect_fk($q$insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='d1'),(select v from gp_ids where k='a2'))$q$,'panel discussion');
select pg_temp.expect_fk($q$insert into public.graduation_project_evaluations(project_id,discussion_id,panel_member_id,rubric_version)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='d1'),(select v from gp_ids where k='panel1'),'v1')$q$,'evaluation panel');
select pg_temp.expect_fk($q$insert into public.graduation_project_corrections(project_id,requested_by_assignment_id,description)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='a1'),'cross')$q$,'correction actor');
select pg_temp.expect_fk($q$insert into public.graduation_project_final_archives(project_id,final_file_id,approved_by_assignment_id,correlation_id)
 values((select v from gp_ids where k='p2'),(select v from gp_ids where k='f1'),(select v from gp_ids where k='a2'),gen_random_uuid())$q$,'archive file');
select pg_temp.expect_fk($q$insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,correlation_id)
 values((select v from gp_ids where k='p2'),current_setting('gp.faculty_user_id')::uuid,(select v from gp_ids where k='a1'),'cross','test',gen_random_uuid())$q$,'event actor');

-- Executable positive/negative direct-RPC lifecycle matrix on p2.
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'coordinator',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p2' returning id)
insert into gp_ids select 'coordinator2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'supervisor',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p2' returning id)
insert into gp_ids select 'supervisor2',id from x;
with x as (insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
select v,'panel_member',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id' from gp_ids where k='p2' returning id)
insert into gp_ids select 'panel_assignment2',id from x;
update public.graduation_projects set state='draft',version=1 where id=(select v from gp_ids where k='p2');
insert into gp_ids values('team_corr',gen_random_uuid());
insert into gp_ids select 'student2',public.add_graduation_project_team_member((select v from gp_ids where k='p2'),:'student_profile_id',:'student_user_id',(select v from gp_ids where k='team_corr'));
insert into gp_ids select 'team_retry',public.add_graduation_project_team_member((select v from gp_ids where k='p2'),:'student_profile_id',:'student_user_id',(select v from gp_ids where k='team_corr'));
do $$ begin
 if (select count(*) from public.graduation_project_events where correlation_id=(select v from gp_ids where k='team_corr') and event_type='team_member_added')<>1 then raise exception 'team RPC positive failed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.add_graduation_project_team_member(%L,%L,%L,%L)',(select v from gp_ids where k='p2'),current_setting('gp.student_profile_id'),current_setting('gp.student_user_id'),gen_random_uuid()),'exact direct processing assignment required');
end $$;

insert into gp_ids values('proposal_corr',gen_random_uuid());
insert into gp_ids select 'proposal_result',public.submit_graduation_project_proposal((select v from gp_ids where k='p2'),1,(select v from gp_ids where k='proposal_corr'));
insert into gp_ids select 'proposal_retry',public.submit_graduation_project_proposal((select v from gp_ids where k='p2'),1,(select v from gp_ids where k='proposal_corr'));
do $$ begin
 if (select state from public.graduation_projects where id=(select v from gp_ids where k='p2'))<>'submitted' then raise exception 'proposal RPC positive failed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.submit_graduation_project_proposal(%L,2,%L)',(select v from gp_ids where k='p2'),gen_random_uuid()),'exact direct processing assignment required');
 perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.submit_graduation_project_proposal(%L,2,%L)',(select v from gp_ids where k='p2'),gen_random_uuid()),'proposal transition precondition failed');
 perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.add_graduation_project_team_member(%L,%L,%L,%L)',(select v from gp_ids where k='p2'),current_setting('gp.student_profile_id'),current_setting('gp.student_user_id'),gen_random_uuid()),'team mutation state denied');
end $$;

update public.graduation_projects set state='approved' where id=(select v from gp_ids where k='p2');
insert into gp_ids values('milestone_corr',gen_random_uuid());
insert into gp_ids select 'm2',public.set_graduation_project_milestone((select v from gp_ids where k='p2'),'Final','final',1,100,(select v from gp_ids where k='milestone_corr'));
insert into gp_ids select 'milestone_retry',public.set_graduation_project_milestone((select v from gp_ids where k='p2'),'ignored','final',1,100,(select v from gp_ids where k='milestone_corr'));
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.set_graduation_project_milestone(%L,%L,%L,2,1,%L)',(select v from gp_ids where k='p2'),'Denied','progress',gen_random_uuid()),'exact direct processing assignment required');
end $$;
update public.graduation_projects set state='submitted' where id=(select v from gp_ids where k='p2');
select set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
select pg_temp.expect_gp_error(format('select public.set_graduation_project_milestone(%L,%L,%L,2,1,%L)',(select v from gp_ids where k='p2'),'Denied','progress',gen_random_uuid()),'milestone mutation state denied');
update public.graduation_projects set state='approved' where id=(select v from gp_ids where k='p2');
update public.graduation_project_milestones set status='accepted',completion_percent=100 where id=(select v from gp_ids where k='m2');
insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id,state,accepted_at)
values((select v from gp_ids where k='p2'),(select v from gp_ids where k='m2'),1,(select v from gp_ids where k='student2'),'accepted',now()) returning id;
insert into gp_ids select 's2',id from public.graduation_project_submissions where milestone_id=(select v from gp_ids where k='m2');
insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,scan_state,uploaded_by_assignment_id)
values((select v from gp_ids where k='p2'),(select v from gp_ids where k='s2'),'graduation-projects/verifier/p2-final.pdf','final.pdf','application/pdf',1,repeat('c',64),'clean',(select v from gp_ids where k='student2'));
update public.graduation_projects set state='active' where id=(select v from gp_ids where k='p2');
insert into gp_ids values('discussion_corr',gen_random_uuid());
insert into gp_ids select 'request2',public.request_graduation_project_discussion((select v from gp_ids where k='p2'),(select v from gp_ids where k='discussion_corr'));
insert into gp_ids select 'discussion_retry',public.request_graduation_project_discussion((select v from gp_ids where k='p2'),(select v from gp_ids where k='discussion_corr'));
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.request_graduation_project_discussion(%L,%L)',(select v from gp_ids where k='p2'),gen_random_uuid()),'discussion readiness failed');
end $$;

insert into public.graduation_project_discussions(project_id,request_id,starts_at,venue,coordinator_assignment_id)
values((select v from gp_ids where k='p2'),(select v from gp_ids where k='request2'),now(),'Verifier',(select v from gp_ids where k='coordinator2')) returning id;
insert into gp_ids select 'd2',id from public.graduation_project_discussions where request_id=(select v from gp_ids where k='request2');
insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id)
values((select v from gp_ids where k='p2'),(select v from gp_ids where k='d2'),(select v from gp_ids where k='panel_assignment2')) returning id;
insert into gp_ids select 'panel2',id from public.graduation_project_panel_members where discussion_id=(select v from gp_ids where k='d2');
insert into public.graduation_project_evaluations(project_id,discussion_id,panel_member_id,rubric_version,state,total_score)
values((select v from gp_ids where k='p2'),(select v from gp_ids where k='d2'),(select v from gp_ids where k='panel2'),'v1','submitted',90) returning id;
insert into gp_ids select 'evaluation2',id from public.graduation_project_evaluations where discussion_id=(select v from gp_ids where k='d2');
select pg_temp.expect_gp_error(format('select public.finalize_graduation_project_evaluation(%L,%L)',(select v from gp_ids where k='evaluation2'),gen_random_uuid()),'evaluation lifecycle precondition failed');
update public.graduation_project_discussions set state='held' where id=(select v from gp_ids where k='d2');
update public.graduation_projects set state='evaluating' where id=(select v from gp_ids where k='p2');
insert into gp_ids values('evaluation_corr',gen_random_uuid());
insert into gp_ids select 'evaluation_result',public.finalize_graduation_project_evaluation((select v from gp_ids where k='evaluation2'),(select v from gp_ids where k='evaluation_corr'));
insert into gp_ids select 'evaluation_retry',public.finalize_graduation_project_evaluation((select v from gp_ids where k='evaluation2'),(select v from gp_ids where k='evaluation_corr'));
do $$ begin
 if (select state from public.graduation_project_evaluations where id=(select v from gp_ids where k='evaluation2'))<>'finalized' then raise exception 'evaluation RPC positive failed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.finalize_graduation_project_evaluation(%L,%L)',(select v from gp_ids where k='evaluation2'),gen_random_uuid()),'exact direct processing assignment required');
 perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
 perform pg_temp.expect_gp_error(format('select public.finalize_graduation_project_evaluation(%L,%L)',(select v from gp_ids where k='evaluation2'),gen_random_uuid()),'evaluation finalization precondition failed');
end $$;

do $$ declare pair text[]; begin
 foreach pair slice 1 in array array[
   ['student2','team_retry','team_corr','team_member_added'],
   ['proposal_result','proposal_retry','proposal_corr','proposal_submitted'],
   ['m2','milestone_retry','milestone_corr','milestone_set'],
   ['request2','discussion_retry','discussion_corr','discussion_requested'],
   ['evaluation_result','evaluation_retry','evaluation_corr','evaluation_finalized']
 ] loop
   if (select v from gp_ids where k=pair[1])<>(select v from gp_ids where k=pair[2]) then raise exception '% retry result mismatch',pair[4]; end if;
   if (select count(*) from public.graduation_project_events where correlation_id=(select v from gp_ids where k=pair[3]) and event_type=pair[4])<>1 then raise exception '% audit is not exactly once',pair[4]; end if;
 end loop;
end $$;

-- Anonymous/unassigned and inactive-assignment RPC denials.
do $$ declare before_archives bigint; begin
  select count(*) into before_archives from public.graduation_project_final_archives;
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  perform pg_temp.expect_gp_error(format('select public.archive_graduation_project(%L,%L,1,%L)',
    (select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),gen_random_uuid()),'direct archive assignment required');
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
  perform pg_temp.expect_gp_error(format('select public.archive_graduation_project(%L,%L,1,%L)',
    (select v from gp_ids where k='p2'),(select v from gp_ids where k='f1'),gen_random_uuid()),'direct archive assignment required');
  if (select count(*) from public.graduation_project_final_archives)<>before_archives then raise exception 'caller denial had side effects'; end if;
end $$;

-- With an active actor, non-completed state is independently rejected.
update public.graduation_project_assignments set active=true,ended_at=null where project_id=(select v from gp_ids where k='p2');
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.archive_graduation_project(%L,%L,1,%L)',
    (select v from gp_ids where k='p2'),(select v from gp_ids where k='f1'),gen_random_uuid()),'project not archive-ready');
end $$;

-- Dirty evidence denial and zero side effects.
do $$ declare before_archives bigint; before_events bigint; begin
  select count(*) into before_archives from public.graduation_project_final_archives;
  select count(*) into before_events from public.graduation_project_events;
  perform pg_temp.expect_gp_error(format('select public.archive_graduation_project(%L,%L,1,%L)',
    (select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),gen_random_uuid()),'clean accepted final evidence and accepted corrections required');
  if (select count(*) from public.graduation_project_final_archives)<>before_archives or (select count(*) from public.graduation_project_events)<>before_events then raise exception 'archive denial had side effects'; end if;
end $$;

update public.graduation_project_files set scan_state='clean' where id=(select v from gp_ids where k='f1');
insert into public.graduation_project_corrections(project_id,requested_by_assignment_id,description)
values((select v from gp_ids where k='p1'),(select v from gp_ids where k='a1'),'pending');
do $$ begin
  perform pg_temp.expect_gp_error(format('select public.archive_graduation_project(%L,%L,1,%L)',
    (select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),gen_random_uuid()),'clean accepted final evidence and accepted corrections required');
end $$;
update public.graduation_project_corrections set completed_at=now(),accepted_at=now() where project_id=(select v from gp_ids where k='p1');

-- Success + idempotent retry: one archive, one event, one version increment.
insert into gp_ids values('corr',gen_random_uuid());
insert into gp_ids select 'archive',public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),1,(select v from gp_ids where k='corr'));
insert into gp_ids select 'retry',public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),1,(select v from gp_ids where k='corr'));
do $$ begin
  if (select v from gp_ids where k='archive')<>(select v from gp_ids where k='retry') then raise exception 'idempotent retry returned a different id'; end if;
  if (select count(*) from public.graduation_project_final_archives where correlation_id=(select v from gp_ids where k='corr'))<>1 then raise exception 'duplicate archive'; end if;
  if (select count(*) from public.graduation_project_events where correlation_id=(select v from gp_ids where k='corr') and event_type='project_archived')<>1 then raise exception 'duplicate/missing event'; end if;
  if (select version from public.graduation_projects where id=(select v from gp_ids where k='p1'))<>2 then raise exception 'wrong version increment'; end if;
end $$;

-- Append-only mutation boundary is executable.
do $$ begin
  perform pg_temp.expect_gp_error(format('update public.graduation_project_events set reason=''tamper'' where correlation_id=%L',
    (select v from gp_ids where k='corr')),'graduation project events are append-only');
  perform pg_temp.expect_gp_error(format('delete from public.graduation_project_events where correlation_id=%L',
    (select v from gp_ids where k='corr')),'graduation project events are append-only');
end $$;

-- Proposal/team/milestone/discussion/evaluation RPC matrices above exercise
-- exact direct processing assignments. Direct client table writes remain denied.
rollback;
