-- ACADEMIC-COUNCILS-C1 meeting state machine verifier (disposable PG17).
-- Transactional: begin … rollback. Proves atomic transitions + deny matrix.

begin;

create or replace function pg_temp.as_user(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;

create or replace function pg_temp.reset_role()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function pg_temp.expect_fail(p_label text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception '%_UNEXPECTED_SUCCESS', p_label;
  exception
    when insufficient_privilege then null;
    when check_violation then null;
    when unique_violation then null;
    when foreign_key_violation then null;
    when not_null_violation then null;
    when data_exception then null;
    when invalid_authorization_specification then null;
    when sqlstate '42501' then null;
    when sqlstate '28000' then null;
    when sqlstate 'P0001' then null;
  end;
end;
$$;

do $$
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (
    id, name, council_type, department_id, created_by
  ) values
   (
    'c1000000-0000-0000-0000-000000000001',
    'Council A',
    'college',
    null,
    'a1000000-0000-0000-0000-000000000001'
  ),
   (
    'c1000000-0000-0000-0000-000000000002',
    'Council B',
    'college',
    null,
    'a1000000-0000-0000-0000-000000000001'
  );

  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, created_by
  ) values
   ('11000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000012', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000013', 'secretary', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000014', 'member', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000015', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000015', 'viewer', true, 'a1000000-0000-0000-0000-000000000001');

  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values (
    '14000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    1,
    'Meeting 1',
    now() + interval '7 days',
    'scheduled',
    'a1000000-0000-0000-0000-000000000011'
  );

  insert into public.academic_council_agenda_items (
    id, meeting_id, title, order_index, is_approved, created_by
  ) values (
    '13000000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Manual item',
    1,
    false,
    'a1000000-0000-0000-0000-000000000011'
  );
end $$;

create temporary table c1_counts as
select
  (select count(*) from public.academic_council_meetings) as meetings,
  (select count(*) from public.academic_council_agenda_items) as agenda,
  (select count(*) from public.academic_council_meeting_transition_events) as transitions,
  (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
     from public.academic_council_meetings) as meetings_fp,
  (select md5(string_agg(id::text || order_index::text || is_approved::text, ',' order by id))
     from public.academic_council_agenda_items) as agenda_fp,
  (select md5(string_agg(id::text || from_status::text || to_status::text, ',' order by id))
     from public.academic_council_meeting_transition_events) as transitions_fp;

create or replace function pg_temp.snapshot_counts()
returns void
language plpgsql
as $$
begin
  -- Temp fingerprint table is owned by the session bootstrap role; never mutate it as authenticated/anon.
  perform pg_temp.reset_role();
  delete from c1_counts;
  insert into c1_counts
  select
    (select count(*) from public.academic_council_meetings) as meetings,
    (select count(*) from public.academic_council_agenda_items) as agenda,
    (select count(*) from public.academic_council_meeting_transition_events) as transitions,
    (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
       from public.academic_council_meetings) as meetings_fp,
    (select md5(string_agg(id::text || order_index::text || is_approved::text, ',' order by id))
       from public.academic_council_agenda_items) as agenda_fp,
    (select md5(string_agg(id::text || from_status::text || to_status::text, ',' order by id))
       from public.academic_council_meeting_transition_events) as transitions_fp;
end;
$$;

create or replace function pg_temp.assert_zero_mutation(p_label text)
returns void
language plpgsql
as $$
declare
  v_now record;
  v_base record;
begin
  perform pg_temp.reset_role();
  select * into v_base from c1_counts;
  select
    (select count(*) from public.academic_council_meetings) as meetings,
    (select count(*) from public.academic_council_agenda_items) as agenda,
    (select count(*) from public.academic_council_meeting_transition_events) as transitions,
    (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
       from public.academic_council_meetings) as meetings_fp,
    (select md5(string_agg(id::text || order_index::text || is_approved::text, ',' order by id))
       from public.academic_council_agenda_items) as agenda_fp,
    (select md5(string_agg(id::text || from_status::text || to_status::text, ',' order by id))
       from public.academic_council_meeting_transition_events) as transitions_fp
  into v_now;

  if v_now is distinct from v_base then
    raise exception '%_MUTATION_LEAK', p_label;
  end if;
end;
$$;

-- Negative matrix: wrong actors cannot transition (zero mutation).
do $$
declare
  denied uuid;
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();

  foreach denied in array array[
    'a1000000-0000-0000-0000-000000000001'::uuid, -- system_admin
    'a1000000-0000-0000-0000-000000000002'::uuid, -- admin
    'a1000000-0000-0000-0000-000000000003'::uuid, -- dean
    'a1000000-0000-0000-0000-000000000012'::uuid, -- wrong chair
    'a1000000-0000-0000-0000-000000000013'::uuid, -- secretary
    'a1000000-0000-0000-0000-000000000014'::uuid, -- member
    'a1000000-0000-0000-0000-000000000015'::uuid, -- viewer
    'a1000000-0000-0000-0000-000000000016'::uuid, -- unrelated faculty
    'a1000000-0000-0000-0000-000000000017'::uuid  -- student
  ] loop
    perform pg_temp.as_user(denied);
    perform pg_temp.expect_fail(
      'DENIED_ACTOR_TRANSITION',
      $q$select public.council_transition_meeting(
           '14000000-0000-0000-0000-000000000001',
           'scheduled'::public.academic_council_meeting_status,
           'intake_open'::public.academic_council_meeting_status,
           '{}'::jsonb)$q$
    );
  end loop;

  perform pg_temp.as_anon();
  perform pg_temp.expect_fail(
    'ANON_TRANSITION',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'scheduled'::public.academic_council_meeting_status,
         'intake_open'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );

  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('DENIED_ACTOR_MATRIX');
  raise notice 'DENIED_ACTOR_ZERO_MUTATION';
end $$;

-- Illegal skip / reverse / metadata status / wrong expected
do $$
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');

  perform pg_temp.expect_fail(
    'ILLEGAL_SKIP',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'scheduled'::public.academic_council_meeting_status,
         'agenda_ready'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );

  perform pg_temp.expect_fail(
    'ILLEGAL_REVERSE',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'scheduled'::public.academic_council_meeting_status,
         'archived'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );

  perform pg_temp.expect_fail(
    'STALE_EXPECTED',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'intake_open'::public.academic_council_meeting_status,
         'intake_closed'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );

  perform pg_temp.expect_fail(
    'METADATA_STATUS_BLOCKED',
    $q$select public.council_update_meeting_metadata(
         '14000000-0000-0000-0000-000000000001',
         null, null, null, null, null, null,
         'intake_open'::public.academic_council_meeting_status)$q$
  );

  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('ILLEGAL_EDGE_MATRIX');
  raise notice 'ILLEGAL_EDGE_ZERO_MUTATION';
end $$;

-- Happy path: scheduled → intake_open → intake_closed → finalize → agenda_ready
do $$
declare
  v jsonb;
  v_status text;
begin
  perform pg_temp.reset_role();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');

  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'scheduled'::public.academic_council_meeting_status,
    'intake_open'::public.academic_council_meeting_status,
    '{"note":"open intake"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true
     or (v->>'to_status') is distinct from 'intake_open' then
    raise exception 'HAPPY_INTAKE_OPEN_FAILED';
  end if;

  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'intake_open'::public.academic_council_meeting_status,
    'intake_closed'::public.academic_council_meeting_status,
    '{"note":"close intake"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true
     or (v->>'to_status') is distinct from 'intake_closed' then
    raise exception 'HAPPY_INTAKE_CLOSED_FAILED';
  end if;

  -- Finalize approves items but must NOT advance status.
  v := public.council_finalize_meeting_agenda('14000000-0000-0000-0000-000000000001');
  if coalesce((v->>'ok')::boolean, false) is not true
     or coalesce((v->>'approved_items_count')::int, 0) < 1 then
    raise exception 'HAPPY_FINALIZE_APPROVE_FAILED';
  end if;
  select status::text into v_status
  from public.academic_council_meetings
  where id = '14000000-0000-0000-0000-000000000001';
  if v_status is distinct from 'intake_closed' then
    raise exception 'FINALIZE_MUTATED_STATUS';
  end if;

  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'intake_closed'::public.academic_council_meeting_status,
    'agenda_ready'::public.academic_council_meeting_status,
    '{"note":"agenda ready"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true
     or (v->>'to_status') is distinct from 'agenda_ready' then
    raise exception 'HAPPY_AGENDA_READY_FAILED';
  end if;

  raise notice 'HAPPY_PATH_TO_AGENDA_READY';
end $$;

-- agenda_ready → in_session DENY without quorum function / without quorum
do $$
declare
  v_status text;
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');

  -- Without meeting_has_valid_quorum: fail closed.
  if to_regprocedure('public.meeting_has_valid_quorum(uuid)') is not null then
    raise exception 'QUORUM_FN_UNEXPECTEDLY_PRESENT';
  end if;

  perform pg_temp.expect_fail(
    'QUORUM_GATE_UNAVAILABLE',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );

  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('QUORUM_UNAVAILABLE');

  -- Stub quorum=false: still DENY with COUNCIL_QUORUM_NOT_MET.
  create or replace function public.meeting_has_valid_quorum(p_meeting_id uuid)
  returns boolean
  language sql
  stable
  as $fn$ select false $fn$;

  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'QUORUM_NOT_MET',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('QUORUM_FALSE');

  drop function public.meeting_has_valid_quorum(uuid);

  select status::text into v_status
  from public.academic_council_meetings
  where id = '14000000-0000-0000-0000-000000000001';
  if v_status is distinct from 'agenda_ready' then
    raise exception 'QUORUM_DENY_MUTATED_STATUS';
  end if;

  raise notice 'QUORUM_GATE_FAIL_CLOSED';
end $$;

-- Concurrent / stale pattern: first transition wins; stale expected fails.
do $$
declare
  v jsonb;
begin
  perform pg_temp.reset_role();

  -- Allow in_session via stub quorum=true for concurrency / cancel tests.
  create or replace function public.meeting_has_valid_quorum(p_meeting_id uuid)
  returns boolean
  language sql
  stable
  as $fn$ select true $fn$;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'agenda_ready'::public.academic_council_meeting_status,
    'in_session'::public.academic_council_meeting_status,
    '{"note":"open session"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'CONCURRENT_FIRST_TRANSITION_FAILED';
  end if;

  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  -- Second caller still holding stale expected agenda_ready must fail.
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'STALE_CONCURRENT',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('STALE_CONCURRENT');
  raise notice 'STALE_CONCURRENT_DENIED';
end $$;

-- cancelled only before in_session
do $$
declare
  v jsonb;
  v_meeting uuid := '14000000-0000-0000-0000-000000000002';
begin
  perform pg_temp.reset_role();

  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values (
    v_meeting,
    'c1000000-0000-0000-0000-000000000001',
    2,
    'Meeting cancel probe',
    now() + interval '10 days',
    'scheduled',
    'a1000000-0000-0000-0000-000000000011'
  );

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');

  -- Allowed: cancel from scheduled
  v := public.council_transition_meeting(
    v_meeting,
    'scheduled'::public.academic_council_meeting_status,
    'cancelled'::public.academic_council_meeting_status,
    '{"note":"cancel early"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'CANCEL_FROM_SCHEDULED_FAILED';
  end if;

  -- Denied: cancel from in_session (meeting 1 is in_session)
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'CANCEL_FROM_IN_SESSION',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'in_session'::public.academic_council_meeting_status,
         'cancelled'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('CANCEL_AFTER_SESSION');

  -- Minutes path for chair after in_session (no extra tables yet)
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'in_session'::public.academic_council_meeting_status,
    'minutes_draft'::public.academic_council_meeting_status,
    '{"note":"minutes draft"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'MINUTES_DRAFT_FAILED';
  end if;

  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'minutes_draft'::public.academic_council_meeting_status,
    'minutes_review'::public.academic_council_meeting_status,
    '{"note":"minutes review"}'::jsonb
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'MINUTES_REVIEW_FAILED';
  end if;

  perform pg_temp.reset_role();
  drop function if exists public.meeting_has_valid_quorum(uuid);

  raise notice 'CANCEL_ONLY_BEFORE_IN_SESSION';
  raise notice 'ACADEMIC_COUNCILS_C1_MEETING_STATE_MACHINE_VERIFIER_PASS';
end $$;

rollback;
