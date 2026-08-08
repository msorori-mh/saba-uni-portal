-- Integrated C1↔ C3 session gate verifier (disposable PG17).
-- Proves agenda_ready → in_session requires finalized quorum + exact chair.
begin;

create or replace function pg_temp.as_user(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.reset_role()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function pg_temp.expect_fail(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception '%_UNEXPECTED_SUCCESS', p_label;
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
    when sqlstate '28000' then null;
    when sqlstate 'P0001' then null;
  end;
end;
$$;

do $$
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (id, name, council_type, created_by) values
    ('c1000000-0000-0000-0000-000000000001', 'Council A', 'college', 'a1000000-0000-0000-0000-000000000001');

  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, created_by
  ) values
    ('11000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
    ('11000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000012', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
    ('11000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000013', 'secretary', true, 'a1000000-0000-0000-0000-000000000001'),
    ('11000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000014', 'member', true, 'a1000000-0000-0000-0000-000000000001'),
    ('11000000-0000-0000-0000-000000000018', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000018', 'member', true, 'a1000000-0000-0000-0000-000000000001'),
    ('11000000-0000-0000-0000-000000000019', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000019', 'member', true, 'a1000000-0000-0000-0000-000000000001');

  -- Wrong-council chair membership on a second council for isolation.
  insert into public.academic_councils (id, name, council_type, created_by) values
    ('c1000000-0000-0000-0000-000000000002', 'Council B', 'college', 'a1000000-0000-0000-0000-000000000001');
  update public.academic_council_members
  set council_id = 'c1000000-0000-0000-0000-000000000002'
  where id = '11000000-0000-0000-0000-000000000012';

  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values (
    '14000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    1, 'Session gate meeting', now() + interval '1 day',
    'agenda_ready', 'a1000000-0000-0000-0000-000000000011'
  );

  insert into public.academic_council_agenda_items (
    id, meeting_id, title, order_index, is_approved, created_by
  ) values (
    '15000000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Item 1', 1, true, 'a1000000-0000-0000-0000-000000000011'
  );
end $$;

create temporary table sg_counts as
select
  (select count(*) from public.academic_council_meetings) as meetings,
  (select md5(string_agg(id::text || status::text, ',' order by id))
     from public.academic_council_meetings) as meetings_fp;

create or replace function pg_temp.snapshot_counts()
returns void language plpgsql as $$
begin
  perform pg_temp.reset_role();
  delete from sg_counts;
  insert into sg_counts
  select
    (select count(*) from public.academic_council_meetings),
    (select md5(string_agg(id::text || status::text, ',' order by id))
       from public.academic_council_meetings);
end;
$$;

create or replace function pg_temp.assert_zero_mutation(p_label text)
returns void language plpgsql as $$
declare v_now record; v_base record;
begin
  perform pg_temp.reset_role();
  select * into v_base from sg_counts;
  select
    (select count(*) from public.academic_council_meetings) as meetings,
    (select md5(string_agg(id::text || status::text, ',' order by id))
       from public.academic_council_meetings) as meetings_fp
  into v_now;
  if v_now is distinct from v_base then
    raise exception '%_MUTATION_LEAK', p_label;
  end if;
end;
$$;

-- NO approved quorum policy → DENY
do $$
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'NO_POLICY',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('NO_POLICY');
  raise notice 'SESSION_GATE_NO_POLICY_DENY';
end $$;

-- Approve absolute quorum policy requiring 2 present of eligible members.
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_approve_quorum_policy(
    'c1000000-0000-0000-0000-000000000001',
    'absolute'::public.academic_council_quorum_threshold_kind,
    2, -- absolute_required
    null, -- ratio_numerator
    null  -- ratio_denominator
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'POLICY_APPROVE_FAILED';
  end if;
end $$;

-- Policy exists but attendance unfinished → DENY
do $$
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'ATTENDANCE_UNFINISHED',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('ATTENDANCE_UNFINISHED');
  raise notice 'SESSION_GATE_ATTENDANCE_UNFINISHED_DENY';
end $$;

-- Record attendance but do not finalize → DENY
do $$
declare v jsonb;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000011', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000013', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000014', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000019', 'attendance_state', 'absent')
    )
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'ATTENDANCE_RECORD_FAILED';
  end if;

  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'NOT_FINALIZED',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('NOT_FINALIZED');
  raise notice 'SESSION_GATE_NOT_FINALIZED_DENY';
end $$;

-- Finalize with insufficient present (quorum false) → DENY
do $$
declare v jsonb;
begin
  -- Only 1 present → absolute required 2 → quorum false
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000011', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000013', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000014', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000019', 'attendance_state', 'absent')
    )
  );

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000001');
  if coalesce((v->>'quorum_met')::boolean, true) is not false then
    raise exception 'EXPECTED_QUORUM_FALSE';
  end if;

  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'QUORUM_FALSE',
    $q$select public.council_transition_meeting(
         '14000000-0000-0000-0000-000000000001',
         'agenda_ready'::public.academic_council_meeting_status,
         'in_session'::public.academic_council_meeting_status,
         '{}'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('QUORUM_FALSE');
  raise notice 'SESSION_GATE_QUORUM_FALSE_DENY';
end $$;

-- Reset roll for quorum-true path: reopen via service role direct repair is not allowed.
-- Use a fresh meeting for ALLOW path.
do $$
begin
  perform pg_temp.reset_role();
  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values (
    '14000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    2, 'Session gate meeting 2', now() + interval '2 day',
    'agenda_ready', 'a1000000-0000-0000-0000-000000000011'
  );
  insert into public.academic_council_agenda_items (
    id, meeting_id, title, order_index, is_approved, created_by
  ) values (
    '15000000-0000-0000-0000-000000000002',
    '14000000-0000-0000-0000-000000000002',
    'Item 1', 1, true, 'a1000000-0000-0000-0000-000000000011'
  );
end $$;

do $$
declare
  v jsonb;
  v_status text;
  denied uuid;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000002',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000011', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000013', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000014', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000019', 'attendance_state', 'absent')
    )
  );

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000002');
  if coalesce((v->>'quorum_met')::boolean, false) is not true then
    raise exception 'EXPECTED_QUORUM_TRUE';
  end if;

  -- Wrong actors DENY with zero mutation
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  foreach denied in array array[
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'a1000000-0000-0000-0000-000000000003'::uuid,
    'a1000000-0000-0000-0000-000000000012'::uuid,
    'a1000000-0000-0000-0000-000000000013'::uuid,
    'a1000000-0000-0000-0000-000000000014'::uuid
  ] loop
    perform pg_temp.as_user(denied);
    perform pg_temp.expect_fail(
      'WRONG_ACTOR_SESSION',
      $q$select public.council_transition_meeting(
           '14000000-0000-0000-0000-000000000002',
           'agenda_ready'::public.academic_council_meeting_status,
           'in_session'::public.academic_council_meeting_status,
           '{}'::jsonb)$q$
    );
  end loop;
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('WRONG_ACTOR_SESSION');
  raise notice 'SESSION_GATE_WRONG_ACTORS_DENY';

  -- Exact chair ALLOW
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000002',
    'agenda_ready'::public.academic_council_meeting_status,
    'in_session'::public.academic_council_meeting_status,
    '{}'::jsonb
  );
  if (v->>'to_status') is distinct from 'in_session' then
    raise exception 'SESSION_OPEN_FAILED';
  end if;
  select status::text into v_status from public.academic_council_meetings
  where id = '14000000-0000-0000-0000-000000000002';
  if v_status is distinct from 'in_session' then
    raise exception 'SESSION_STATUS_NOT_SET';
  end if;
  raise notice 'SESSION_GATE_CHAIR_ALLOW';

  -- After in_session, attendance immutable
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'POST_SESSION_ATTENDANCE',
    $q$select public.record_council_meeting_attendance(
         '14000000-0000-0000-0000-000000000002',
         '[]'::jsonb)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('POST_SESSION_ATTENDANCE');
  raise notice 'SESSION_GATE_POST_IN_SESSION_IMMUTABLE';
end $$;

do $$ begin raise notice 'ACADEMIC_COUNCILS_C1_C3_SESSION_GATE_VERIFIER_PASS'; end $$;

rollback;
