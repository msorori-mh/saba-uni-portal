-- Executable disposable-PostgreSQL verifier (psql). NEVER run on production.
-- Prerequisite: apply postgres-minimal-schema.sql then the lecture-execution
-- draft to an isolated clone, and provide the synthetic fixture ids:
-- psql -v department_id=... -v level_id=... -v faculty_profile_id=... \
--   -v faculty_user_id=... -v student_profile_id=... -v student_user_id=... \
--   -v class_schedule_id=... -f this-file
\set ON_ERROR_STOP on
\if :{?department_id}
\else
  \warn 'department_id is required'; \quit 1
\endif
\if :{?level_id}
\else
  \warn 'level_id is required'; \quit 1
\endif
\if :{?faculty_profile_id}
\else
  \warn 'faculty_profile_id is required'; \quit 1
\endif
\if :{?faculty_user_id}
\else
  \warn 'faculty_user_id is required'; \quit 1
\endif
\if :{?student_profile_id}
\else
  \warn 'student_profile_id is required'; \quit 1
\endif
\if :{?student_user_id}
\else
  \warn 'student_user_id is required'; \quit 1
\endif
\if :{?class_schedule_id}
\else
  \warn 'class_schedule_id is required'; \quit 1
\endif

begin;
set local role postgres;
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
select set_config('lex.department_id', :'department_id', true);
select set_config('lex.level_id', :'level_id', true);
select set_config('lex.faculty_profile_id', :'faculty_profile_id', true);
select set_config('lex.faculty_user_id', :'faculty_user_id', true);
select set_config('lex.student_profile_id', :'student_profile_id', true);
select set_config('lex.student_user_id', :'student_user_id', true);
select set_config('lex.class_schedule_id', :'class_schedule_id', true);

-- Fixture validation: published slot on active section/offering, same scope.
do $$ declare v record; begin
  select cs.status as schedule_status, cs.schedule_type, sec.status as section_status,
         off.status as offering_status, c.department_id, off.level_id,
         coalesce(cs.faculty_profile_id, sec.faculty_profile_id) as faculty_profile_id,
         sec.id as course_section_id
  into v
  from public.class_schedule cs
  join public.course_sections sec on sec.id = cs.course_section_id
  join public.course_offerings off on off.id = sec.course_offering_id
  join public.courses c on c.id = off.course_id
  where cs.id = current_setting('lex.class_schedule_id')::uuid;
  if v is null then raise exception 'bad class_schedule fixture'; end if;
  if v.schedule_status <> 'published' then raise exception 'schedule fixture must be published'; end if;
  if v.schedule_type <> 'lecture' then raise exception 'schedule fixture must be a lecture slot'; end if;
  if v.section_status <> 'active' or v.offering_status <> 'active' then raise exception 'fixture section/offering must be active'; end if;
  if v.department_id <> current_setting('lex.department_id')::uuid then raise exception 'schedule fixture wrong department'; end if;
  if v.level_id <> current_setting('lex.level_id')::uuid then raise exception 'schedule fixture wrong level'; end if;
  if v.faculty_profile_id <> current_setting('lex.faculty_profile_id')::uuid then raise exception 'schedule fixture wrong faculty'; end if;
  if (select user_id from public.faculty_profiles where id=current_setting('lex.faculty_profile_id')::uuid) <> current_setting('lex.faculty_user_id')::uuid then raise exception 'bad faculty fixture'; end if;
  if (select user_id from public.student_profiles where id=current_setting('lex.student_profile_id')::uuid) <> current_setting('lex.student_user_id')::uuid then raise exception 'bad student fixture'; end if;
  if (select department_id from public.student_profiles where id=current_setting('lex.student_profile_id')::uuid) <> current_setting('lex.department_id')::uuid then raise exception 'student fixture wrong department'; end if;
end $$;

create temporary table lex_ids(k text primary key, v uuid not null) on commit drop;
create function pg_temp.expect_fk(statement text, label text) returns void language plpgsql as $$
begin execute statement; raise exception '% unexpectedly allowed', label;
exception when foreign_key_violation then null;
end $$;
create function pg_temp.expect_le_error(statement text, expected_message text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected lecture-execution error was not raised: %', expected_message;
exception when sqlstate 'P0001' then
  if sqlerrm <> expected_message then raise exception 'unexpected error: %, expected: %', sqlerrm, expected_message; end if;
end $$;

-- Child authority/audit relations must carry composite same-department FKs.
do $$ declare t text; begin
  foreach t in array array['lecture_execution_confirmations','lecture_execution_events'] loop
    if (select count(*) from pg_constraint where conrelid=('public.'||t)::regclass and contype='f' and cardinality(conkey)>1) < 2 then
      raise exception '% lacks composite same-department FKs', t;
    end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.lecture_execution_actor_assignments'::regclass and contype='u' and cardinality(conkey)>1) then
    raise exception 'assignments lack composite (id, department_id) target';
  end if;
  if (select count(*) from pg_constraint where conrelid='public.lecture_execution_sessions'::regclass and contype='f' and cardinality(conkey)>1) < 1 then
    raise exception 'sessions lack composite recorded-by assignment FK';
  end if;
end $$;

insert into public.lecture_execution_actor_assignments(role,faculty_profile_id,user_id,department_id,course_section_id,assigned_by)
select 'faculty_recorder',:'faculty_profile_id',:'faculty_user_id',:'department_id',cs.course_section_id,:'faculty_user_id'
from public.class_schedule cs where cs.id=:'class_schedule_id' returning id;
insert into lex_ids select 'recorder',id from public.lecture_execution_actor_assignments limit 1;
insert into public.lecture_execution_actor_assignments(role,student_profile_id,user_id,department_id,level_id,assigned_by)
values('section_delegate',:'student_profile_id',:'student_user_id',:'department_id',:'level_id',:'faculty_user_id') returning id;
insert into lex_ids select 'delegate',id from public.lecture_execution_actor_assignments where role='section_delegate' limit 1;
with x as (insert into public.lecture_execution_actor_assignments(role,faculty_profile_id,user_id,department_id,course_section_id,active,ended_at,assigned_by)
select 'faculty_recorder','40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002',cs.course_section_id,false,now(),:'faculty_user_id'
from public.class_schedule cs where cs.id=:'class_schedule_id' returning id)
insert into lex_ids select 'foreign_recorder',id from x;

-- Wrong subject shape and wrong profile owner must be rejected.
do $$ begin
  begin
    insert into public.lecture_execution_actor_assignments(role,faculty_profile_id,user_id,department_id,level_id,assigned_by)
    values('section_delegate',current_setting('lex.faculty_profile_id')::uuid,current_setting('lex.faculty_user_id')::uuid,current_setting('lex.department_id')::uuid,current_setting('lex.level_id')::uuid,current_setting('lex.faculty_user_id')::uuid);
    raise exception 'wrong-role assignment unexpectedly allowed';
  exception when check_violation then
    if sqlstate <> '23514' or sqlerrm not like '%lecture_execution_assignment_subject_shape%' then raise; end if;
  end;
  begin
    insert into public.lecture_execution_actor_assignments(role,student_profile_id,user_id,department_id,level_id,assigned_by)
    values('section_delegate',current_setting('lex.student_profile_id')::uuid,current_setting('lex.faculty_user_id')::uuid,current_setting('lex.department_id')::uuid,current_setting('lex.level_id')::uuid,current_setting('lex.faculty_user_id')::uuid);
    raise exception 'wrong-owner assignment unexpectedly allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'lecture-execution assignment identity/department mismatch' then raise; end if;
  end;
end $$;

do $$ begin
  if has_function_privilege('anon','public.record_lecture_execution(uuid,smallint,lecture_execution_session_kind,lecture_execution_state,text,uuid)','EXECUTE') then
    raise exception 'anon unexpectedly has record RPC execution';
  end if;
  if has_function_privilege('anon','public.confirm_lecture_execution(uuid,text,text,uuid)','EXECUTE') then
    raise exception 'anon unexpectedly has confirm RPC execution';
  end if;
end $$;

-- All five foundation tables stay closed to client roles.
do $$ declare t text; begin
  foreach t in array array['lecture_execution_settings','lecture_execution_sessions','lecture_execution_actor_assignments','lecture_execution_confirmations','lecture_execution_events'] loop
    if has_table_privilege('anon','public.'||t,'SELECT')
       or has_table_privilege('authenticated','public.'||t,'SELECT')
       or has_table_privilege('anon','public.'||t,'INSERT')
       or has_table_privilege('authenticated','public.'||t,'INSERT')
       or has_table_privilege('authenticated','public.'||t,'UPDATE')
       or has_table_privilege('authenticated','public.'||t,'DELETE') then
      raise exception '% unexpectedly client-readable/writable', t;
    end if;
  end loop;
end $$;

-- Unassigned caller is denied before any write.
do $$ declare before_sessions bigint; before_events bigint; begin
  select count(*) into before_sessions from public.lecture_execution_sessions;
  select count(*) into before_events from public.lecture_execution_events;
  perform set_config('request.jwt.claim.sub', current_setting('lex.student_user_id'), true);
  perform pg_temp.expect_le_error(format(
    'select public.record_lecture_execution(%L,1::smallint,''theory'',''scheduled'',null,%L)',
    current_setting('lex.class_schedule_id'), gen_random_uuid()),
    'exact direct processing assignment required');
  if (select count(*) from public.lecture_execution_sessions) <> before_sessions
     or (select count(*) from public.lecture_execution_events) <> before_events then
    raise exception 'caller denial had side effects';
  end if;
end $$;

select set_config('request.jwt.claim.sub', :'faculty_user_id', true);

-- Explicit NULL guards fail with clean messages before any write.
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,1::smallint,''theory'',null,null,%L)',
  current_setting('lex.class_schedule_id'), gen_random_uuid()),
  'execution state is required');
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,1::smallint,null,''scheduled'',null,%L)',
  current_setting('lex.class_schedule_id'), gen_random_uuid()),
  'session kind is required');
select pg_temp.expect_le_error(format(
  'select public.confirm_lecture_execution(%L,null,null,%L)',
  gen_random_uuid(), gen_random_uuid()),
  'decision must be confirmed or rejected');

-- D-15 pending default: faculty recording is final without the delegate.
insert into lex_ids values('corr1', gen_random_uuid());
insert into lex_ids select 's1', public.record_lecture_execution(:'class_schedule_id',1::smallint,'theory','scheduled',null,(select v from lex_ids where k='corr1'));
insert into lex_ids select 's1_retry', public.record_lecture_execution(:'class_schedule_id',1::smallint,'theory','scheduled',null,(select v from lex_ids where k='corr1'));
do $$ begin
  if (select v from lex_ids where k='s1') <> (select v from lex_ids where k='s1_retry') then raise exception 'idempotent retry returned a different id'; end if;
  if (select state from public.lecture_execution_sessions where id=(select v from lex_ids where k='s1')) <> 'scheduled' then raise exception 'record RPC positive failed'; end if;
  if (select confirmation_status from public.lecture_execution_sessions where id=(select v from lex_ids where k='s1')) <> 'faculty_final' then raise exception 'D-15-pending recording must be faculty_final'; end if;
  if (select count(*) from public.lecture_execution_events where correlation_id=(select v from lex_ids where k='corr1') and event_type='execution_recorded') <> 1 then raise exception 'audit is not exactly once'; end if;
end $$;

-- Invalid initial transition is rejected (not_started -> executed).
insert into lex_ids values('corr_bad', gen_random_uuid());
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,2::smallint,''theory'',''executed'',null,%L)',
  current_setting('lex.class_schedule_id'), (select v from lex_ids where k='corr_bad')),
  'invalid execution transition: not_started -> executed');

-- Only published slots on active sections, and only the recorder of that
-- exact section, can be tracked (fixtures: draft slot, inactive section,
-- another active section in the same department).
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,5::smallint,''theory'',''scheduled'',null,%L)',
  'a0000000-0000-0000-0000-000000000002', gen_random_uuid()),
  'only published schedule slots can be tracked');
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,5::smallint,''theory'',''scheduled'',null,%L)',
  'a0000000-0000-0000-0000-000000000003', gen_random_uuid()),
  'schedule slot is not on an active section/offering');
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,5::smallint,''theory'',''scheduled'',null,%L)',
  'a0000000-0000-0000-0000-000000000004', gen_random_uuid()),
  'exact direct processing assignment required');

-- Delegate confirmation fails closed while D-15 keeps it disabled.
select pg_temp.expect_le_error(format(
  'select public.confirm_lecture_execution(%L,''confirmed'',null,%L)',
  (select v from lex_ids where k='s1'), gen_random_uuid()),
  'delegate confirmation is not enabled (D-15 pending)');

-- Lifecycle advance: scheduled -> executed, then terminal states are locked.
insert into lex_ids values('corr2', gen_random_uuid());
insert into lex_ids select 's1_done', public.record_lecture_execution(:'class_schedule_id',1::smallint,'theory','executed',null,(select v from lex_ids where k='corr2'));
insert into lex_ids select 's1_done_retry', public.record_lecture_execution(:'class_schedule_id',1::smallint,'theory','executed',null,gen_random_uuid());
do $$ begin
  if (select v from lex_ids where k='s1_done') <> (select v from lex_ids where k='s1') then raise exception 'advance returned a different session id'; end if;
  if (select v from lex_ids where k='s1_done_retry') <> (select v from lex_ids where k='s1') then raise exception 'same-state retry must be a no-op returning the same id'; end if;
  if (select version from public.lecture_execution_sessions where id=(select v from lex_ids where k='s1')) <> 2 then raise exception 'wrong version increment'; end if;
  if (select count(*) from public.lecture_execution_events where session_id=(select v from lex_ids where k='s1') and event_type='execution_recorded') <> 2 then raise exception 'natural idempotency wrote an event'; end if;
end $$;
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,1::smallint,''theory'',''scheduled'',null,%L)',
  current_setting('lex.class_schedule_id'), gen_random_uuid()),
  'invalid execution transition: executed -> scheduled');

-- Enable D-15 dual confirmation (separately authorized configuration path).
insert into public.lecture_execution_settings(department_id,term_weeks,delegate_confirmation_enabled)
values(null,15,true);

insert into lex_ids values('corr3', gen_random_uuid());
insert into lex_ids select 's2', public.record_lecture_execution(:'class_schedule_id',2::smallint,'theory','scheduled',null,(select v from lex_ids where k='corr3'));
do $$ begin
  if (select confirmation_status from public.lecture_execution_sessions where id=(select v from lex_ids where k='s2')) <> 'awaiting_delegate' then raise exception 'D-15-enabled recording must await the delegate'; end if;
end $$;

-- Wrong caller (faculty, not the delegate) cannot confirm.
select pg_temp.expect_le_error(format(
  'select public.confirm_lecture_execution(%L,''confirmed'',null,%L)',
  (select v from lex_ids where k='s2'), gen_random_uuid()),
  'exact direct processing assignment required');

select set_config('request.jwt.claim.sub', :'student_user_id', true);

-- Delegate confirms; retry is exactly-once; second decision is locked.
insert into lex_ids values('corr4', gen_random_uuid());
insert into lex_ids select 's2_confirmed', public.confirm_lecture_execution((select v from lex_ids where k='s2'),'confirmed',null,(select v from lex_ids where k='corr4'));
insert into lex_ids select 's2_confirmed_retry', public.confirm_lecture_execution((select v from lex_ids where k='s2'),'confirmed',null,(select v from lex_ids where k='corr4'));
do $$ begin
  if (select v from lex_ids where k='s2_confirmed') <> (select v from lex_ids where k='s2') then raise exception 'confirm RPC positive failed'; end if;
  if (select confirmation_status from public.lecture_execution_sessions where id=(select v from lex_ids where k='s2')) <> 'confirmed' then raise exception 'confirmation status not applied'; end if;
  if (select count(*) from public.lecture_execution_confirmations where session_id=(select v from lex_ids where k='s2')) <> 1 then raise exception 'duplicate confirmation'; end if;
  if (select count(*) from public.lecture_execution_events where correlation_id=(select v from lex_ids where k='corr4') and event_type='execution_confirmed') <> 1 then raise exception 'confirmation audit is not exactly once'; end if;
end $$;
select pg_temp.expect_le_error(format(
  'select public.confirm_lecture_execution(%L,''rejected'',''late'',%L)',
  (select v from lex_ids where k='s2'), gen_random_uuid()),
  'session is not awaiting delegate confirmation');

-- Rejection requires a note.
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
insert into lex_ids values('corr5', gen_random_uuid());
insert into lex_ids select 's3', public.record_lecture_execution(:'class_schedule_id',3::smallint,'theory','scheduled',null,(select v from lex_ids where k='corr5'));
select set_config('request.jwt.claim.sub', :'student_user_id', true);
select pg_temp.expect_le_error(format(
  'select public.confirm_lecture_execution(%L,''rejected'',null,%L)',
  (select v from lex_ids where k='s3'), gen_random_uuid()),
  'a rejection note is required');
insert into lex_ids values('corr6', gen_random_uuid());
insert into lex_ids select 's3_rejected', public.confirm_lecture_execution((select v from lex_ids where k='s3'),'rejected','لم تحضر الدفعة',(select v from lex_ids where k='corr6'));
do $$ begin
  if (select confirmation_status from public.lecture_execution_sessions where id=(select v from lex_ids where k='s3')) <> 'rejected' then raise exception 'rejection not applied'; end if;
  if (select session_version from public.lecture_execution_confirmations where session_id=(select v from lex_ids where k='s3')) <> 1 then raise exception 'confirmation must snapshot the recording version'; end if;
end $$;

-- MEDIUM-1: a rejected recording is corrected by re-recording (version bump)
-- which opens a NEW confirmation round; the old decision stays as history.
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
insert into lex_ids values('corr7', gen_random_uuid());
insert into lex_ids select 's3_resub', public.record_lecture_execution(:'class_schedule_id',3::smallint,'theory','scheduled',null,(select v from lex_ids where k='corr7'));
do $$ begin
  if (select v from lex_ids where k='s3_resub') <> (select v from lex_ids where k='s3') then raise exception 'resubmission returned a different session id'; end if;
  if (select version from public.lecture_execution_sessions where id=(select v from lex_ids where k='s3')) <> 3 then raise exception 'resubmission must bump the version'; end if;
  if (select confirmation_status from public.lecture_execution_sessions where id=(select v from lex_ids where k='s3')) <> 'awaiting_delegate' then raise exception 'resubmission must open a new confirmation round'; end if;
  if (select count(*) from public.lecture_execution_events where session_id=(select v from lex_ids where k='s3') and event_type='execution_recorded') <> 2 then raise exception 'resubmission must write its own audit event'; end if;
end $$;
select set_config('request.jwt.claim.sub', :'student_user_id', true);
insert into lex_ids values('corr8', gen_random_uuid());
insert into lex_ids select 's3_confirmed', public.confirm_lecture_execution((select v from lex_ids where k='s3'),'confirmed',null,(select v from lex_ids where k='corr8'));
do $$ begin
  if (select confirmation_status from public.lecture_execution_sessions where id=(select v from lex_ids where k='s3')) <> 'confirmed' then raise exception 'new confirmation round not applied'; end if;
  if (select count(*) from public.lecture_execution_confirmations where session_id=(select v from lex_ids where k='s3')) <> 2 then raise exception 'rejection history must be preserved alongside the new decision'; end if;
  if (select count(distinct session_version) from public.lecture_execution_confirmations where session_id=(select v from lex_ids where k='s3')) <> 2 then raise exception 'decisions must span distinct recording versions'; end if;
  if (select count(*) from public.lecture_execution_confirmations where session_id=(select v from lex_ids where k='s3') and session_version=3 and decision='confirmed') <> 1 then raise exception 'exactly one confirmation per recording version'; end if;
end $$;
-- After the new decision, same-state re-record is a natural-idempotency no-op.
select set_config('request.jwt.claim.sub', :'faculty_user_id', true);
insert into lex_ids select 's3_noop', public.record_lecture_execution(:'class_schedule_id',3::smallint,'theory','scheduled',null,gen_random_uuid());
do $$ begin
  if (select v from lex_ids where k='s3_noop') <> (select v from lex_ids where k='s3') then raise exception 'post-confirmation same-state retry must be a no-op'; end if;
  if (select version from public.lecture_execution_sessions where id=(select v from lex_ids where k='s3')) <> 4 then raise exception 'no-op retry must not bump the version'; end if;
end $$;

-- Term-week bound is enforced from configuration (15 weeks).
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,16::smallint,''theory'',''scheduled'',null,%L)',
  current_setting('lex.class_schedule_id'), gen_random_uuid()),
  'week number 16 is outside the configured term weeks (1..15)');

-- Session kind must match the published slot type (lecture = theory only).
select pg_temp.expect_le_error(format(
  'select public.record_lecture_execution(%L,4::smallint,''practical'',''scheduled'',null,%L)',
  current_setting('lex.class_schedule_id'), gen_random_uuid()),
  'session kind does not match the published schedule slot type');

-- Cross-department composite integrity is executable on child tables.
select pg_temp.expect_fk($q$insert into public.lecture_execution_confirmations(session_id,department_id,delegate_assignment_id,session_version,decision)
 values((select v from lex_ids where k='s1'),'20000000-0000-0000-0000-000000000002',(select v from lex_ids where k='foreign_recorder'),1,'confirmed')$q$,'confirmation scope');
select pg_temp.expect_fk($q$insert into public.lecture_execution_events(department_id,session_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
 values('20000000-0000-0000-0000-000000000002',(select v from lex_ids where k='s2'),current_setting('lex.faculty_user_id')::uuid,(select v from lex_ids where k='foreign_recorder'),'execution_recorded','lecture_execution_session',(select v from lex_ids where k='s2'),gen_random_uuid())$q$,'event scope');
do $$ begin
  if exists(select 1 from public.lecture_execution_confirmations where department_id='20000000-0000-0000-0000-000000000002') then raise exception 'denial had side effects'; end if;
end $$;

-- Append-only mutation boundary is executable.
do $$ begin
  perform pg_temp.expect_le_error(format(
    'update public.lecture_execution_events set reason=''tamper'' where correlation_id=%L',
    (select v from lex_ids where k='corr1')),
    'lecture_execution_events is append-only');
  perform pg_temp.expect_le_error(format(
    'delete from public.lecture_execution_events where correlation_id=%L',
    (select v from lex_ids where k='corr1')),
    'lecture_execution_events is append-only');
end $$;

-- Reporting view stays a source surface (not client-readable) and aggregates.
do $$ declare r record; begin
  if has_table_privilege('anon','public.lecture_execution_reporting','SELECT') then
    raise exception 'anon unexpectedly reads the reporting surface';
  end if;
  if has_table_privilege('authenticated','public.lecture_execution_reporting','SELECT') then
    raise exception 'authenticated unexpectedly reads the reporting surface';
  end if;
  select * into r from public.lecture_execution_reporting
  where department_id=current_setting('lex.department_id')::uuid
    and level_id=current_setting('lex.level_id')::uuid;
  if r.planned <> 3 or r.delivered <> 1 or r.pending <> 2 then
    raise exception 'reporting aggregation mismatch: %', r;
  end if;
end $$;

-- Record/confirm RPC matrices above exercise exact direct assignments. Direct
-- client table writes remain revoked; settings stay source-owned.
rollback;
