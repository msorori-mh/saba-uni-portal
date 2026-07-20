-- Executable disposable-PostgreSQL verifier (psql). NEVER run on production.
-- Prerequisite: apply the draft to an isolated clone and provide existing,
-- synthetic profiles from one department:
-- psql -v department_id=... -v student_profile_id=... -v student_user_id=... \
--   -v faculty_profile_id=... -v faculty_user_id=... -f this-file
\set ON_ERROR_STOP on
\if :{?department_id}
\else
  \warn 'department_id is required'; \quit
\endif
\if :{?student_profile_id}
\else
  \warn 'student_profile_id is required'; \quit
\endif
\if :{?student_user_id}
\else
  \warn 'student_user_id is required'; \quit
\endif
\if :{?faculty_profile_id}
\else
  \warn 'faculty_profile_id is required'; \quit
\endif
\if :{?faculty_user_id}
\else
  \warn 'faculty_user_id is required'; \quit
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
insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by,active,ended_at)
select v,'dean',:'faculty_profile_id',:'faculty_user_id',:'department_id',:'faculty_user_id',false,now() from gp_ids where k='p2';

-- Wrong role/subject and wrong profile owner must be rejected by executable inserts.
do $$ begin
  begin
    insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values((select v from gp_ids where k='p1'),'student',current_setting('gp.faculty_profile_id')::uuid,current_setting('gp.faculty_user_id')::uuid,current_setting('gp.department_id')::uuid,current_setting('gp.faculty_user_id')::uuid);
    raise exception 'wrong-role assignment unexpectedly allowed';
  exception when check_violation then null; end;
  begin
    insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
    values((select v from gp_ids where k='p1'),'student',current_setting('gp.student_profile_id')::uuid,current_setting('gp.faculty_user_id')::uuid,current_setting('gp.department_id')::uuid,current_setting('gp.faculty_user_id')::uuid);
    raise exception 'wrong-owner assignment unexpectedly allowed';
  exception when others then
    if sqlerrm='wrong-owner assignment unexpectedly allowed' then raise; end if;
  end;
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

-- Anonymous/unassigned and inactive-assignment RPC denials.
do $$ declare before_archives bigint; begin
  select count(*) into before_archives from public.graduation_project_final_archives;
  perform set_config('request.jwt.claim.sub',current_setting('gp.student_user_id'),true);
  begin perform public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),1,gen_random_uuid());
    raise exception 'unassigned caller unexpectedly allowed';
  exception when others then if sqlerrm='unassigned caller unexpectedly allowed' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',current_setting('gp.faculty_user_id'),true);
  begin perform public.archive_graduation_project((select v from gp_ids where k='p2'),(select v from gp_ids where k='f1'),1,gen_random_uuid());
    raise exception 'inactive assignment unexpectedly allowed';
  exception when others then if sqlerrm='inactive assignment unexpectedly allowed' then raise; end if; end;
  if (select count(*) from public.graduation_project_final_archives)<>before_archives then raise exception 'caller denial had side effects'; end if;
end $$;

-- With an active actor, non-completed state is independently rejected.
update public.graduation_project_assignments set active=true,ended_at=null where project_id=(select v from gp_ids where k='p2');
do $$ begin
  begin perform public.archive_graduation_project((select v from gp_ids where k='p2'),(select v from gp_ids where k='f1'),1,gen_random_uuid());
    raise exception 'active project unexpectedly archived';
  exception when others then if sqlerrm='active project unexpectedly archived' then raise; end if; end;
end $$;

-- Dirty evidence denial and zero side effects.
do $$ declare before_archives bigint; before_events bigint; begin
  select count(*) into before_archives from public.graduation_project_final_archives;
  select count(*) into before_events from public.graduation_project_events;
  begin perform public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),1,gen_random_uuid());
    raise exception 'dirty archive unexpectedly allowed';
  exception when others then if sqlerrm='dirty archive unexpectedly allowed' then raise; end if; end;
  if (select count(*) from public.graduation_project_final_archives)<>before_archives or (select count(*) from public.graduation_project_events)<>before_events then raise exception 'archive denial had side effects'; end if;
end $$;

update public.graduation_project_files set scan_state='clean' where id=(select v from gp_ids where k='f1');
insert into public.graduation_project_corrections(project_id,requested_by_assignment_id,description)
values((select v from gp_ids where k='p1'),(select v from gp_ids where k='a1'),'pending');
do $$ begin
  begin perform public.archive_graduation_project((select v from gp_ids where k='p1'),(select v from gp_ids where k='f1'),1,gen_random_uuid());
    raise exception 'pending-correction archive unexpectedly allowed';
  exception when others then if sqlerrm='pending-correction archive unexpectedly allowed' then raise; end if; end;
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
  begin update public.graduation_project_events set reason='tamper' where correlation_id=(select v from gp_ids where k='corr'); raise exception 'event update allowed';
  exception when others then if sqlerrm='event update allowed' then raise; end if; end;
  begin delete from public.graduation_project_events where correlation_id=(select v from gp_ids where k='corr'); raise exception 'event delete allowed';
  exception when others then if sqlerrm='event delete allowed' then raise; end if; end;
end $$;

-- Lifecycle RPC matrix remains intentionally unavailable: direct table writes are
-- denied and source status stays HOLD until proposal/team/milestone/discussion/
-- evaluation transition RPCs and their role matrices are implemented.
rollback;
