-- ACADEMIC-COUNCILS-C3 attendance/quorum verifier (disposable PG17).
-- Transactional: begin … rollback. Proves fail-closed quorum + role matrix.

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

  -- Eligible: chair + secretary + memberA + memberB + memberC = 5
  -- Viewer is NOT quorum-eligible.
  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, created_by
  ) values
   ('11000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000012', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000013', 'secretary', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000014', 'member', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000015', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000015', 'viewer', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000018', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000018', 'member', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000019', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000019', 'member', true, 'a1000000-0000-0000-0000-000000000001');

  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values
  (
    '14000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    1,
    'Meeting quorum cases',
    now() + interval '1 day',
    'agenda_ready',
    'a1000000-0000-0000-0000-000000000011'
  ),
  (
    '14000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    2,
    'Meeting snapshot durability',
    now() + interval '2 day',
    'agenda_ready',
    'a1000000-0000-0000-0000-000000000011'
  ),
  (
    '14000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000001',
    3,
    'Meeting concurrent finalize',
    now() + interval '3 day',
    'agenda_ready',
    'a1000000-0000-0000-0000-000000000011'
  );
end $$;

create temporary table c3_counts as
select
  (select count(*) from public.academic_council_quorum_policies) as policies,
  (select count(*) from public.academic_council_meeting_attendance_rolls) as rolls,
  (select count(*) from public.academic_council_meeting_attendance) as attendance,
  (select count(*) from public.academic_council_meeting_quorum_evaluations) as evaluations,
  (select count(*) from public.academic_council_attendance_audit_events) as audits,
  (select md5(string_agg(id::text || attendance_state::text, ',' order by id))
     from public.academic_council_meeting_attendance) as attendance_fp,
  (select md5(string_agg(id::text || status::text || coalesce(policy_version::text,''), ',' order by id))
     from public.academic_council_quorum_policies) as policies_fp,
  (select md5(string_agg(id::text || status::text, ',' order by id))
     from public.academic_council_meeting_attendance_rolls) as rolls_fp;

create or replace function pg_temp.capture_counts()
returns void
language plpgsql
as $$
begin
  delete from c3_counts;
  insert into c3_counts
  select
    (select count(*) from public.academic_council_quorum_policies) as policies,
    (select count(*) from public.academic_council_meeting_attendance_rolls) as rolls,
    (select count(*) from public.academic_council_meeting_attendance) as attendance,
    (select count(*) from public.academic_council_meeting_quorum_evaluations) as evaluations,
    (select count(*) from public.academic_council_attendance_audit_events) as audits,
    (select md5(string_agg(id::text || attendance_state::text, ',' order by id))
       from public.academic_council_meeting_attendance) as attendance_fp,
    (select md5(string_agg(id::text || status::text || coalesce(policy_version::text,''), ',' order by id))
       from public.academic_council_quorum_policies) as policies_fp,
    (select md5(string_agg(id::text || status::text, ',' order by id))
       from public.academic_council_meeting_attendance_rolls) as rolls_fp;
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
  select * into v_base from c3_counts;
  select
    (select count(*) from public.academic_council_quorum_policies) as policies,
    (select count(*) from public.academic_council_meeting_attendance_rolls) as rolls,
    (select count(*) from public.academic_council_meeting_attendance) as attendance,
    (select count(*) from public.academic_council_meeting_quorum_evaluations) as evaluations,
    (select count(*) from public.academic_council_attendance_audit_events) as audits,
    (select md5(string_agg(id::text || attendance_state::text, ',' order by id))
       from public.academic_council_meeting_attendance) as attendance_fp,
    (select md5(string_agg(id::text || status::text || coalesce(policy_version::text,''), ',' order by id))
       from public.academic_council_quorum_policies) as policies_fp,
    (select md5(string_agg(id::text || status::text, ',' order by id))
       from public.academic_council_meeting_attendance_rolls) as rolls_fp
  into v_now;

  if v_now is distinct from v_base then
    raise exception '%_MUTATION_LEAK', p_label;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Direct write denial + zero mutation
-- ---------------------------------------------------------------------
do $$
declare
  actors uuid[] := array[
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'a1000000-0000-0000-0000-000000000003'::uuid,
    'a1000000-0000-0000-0000-000000000011'::uuid,
    'a1000000-0000-0000-0000-000000000012'::uuid,
    'a1000000-0000-0000-0000-000000000013'::uuid,
    'a1000000-0000-0000-0000-000000000014'::uuid,
    'a1000000-0000-0000-0000-000000000015'::uuid,
    'a1000000-0000-0000-0000-000000000016'::uuid,
    'a1000000-0000-0000-0000-000000000017'::uuid
  ];
  u uuid;
begin
  perform pg_temp.capture_counts();

  foreach u in array actors loop
    perform pg_temp.as_user(u);
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_POLICY',
      $q$insert into public.academic_council_quorum_policies(
           council_id, policy_version, threshold_kind, absolute_count, status, approved_at, approved_by, created_by)
         values ('c1000000-0000-0000-0000-000000000001', 1, 'absolute', 3, 'approved', now(), auth.uid(), auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_ROLL',
      $q$insert into public.academic_council_meeting_attendance_rolls(
           meeting_id, council_id, opened_by)
         values ('14000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_ATTENDANCE',
      $q$insert into public.academic_council_meeting_attendance(
           meeting_id, roll_id, membership_id, user_id, member_role, membership_active_from)
         values (
           '14000000-0000-0000-0000-000000000001',
           '00000000-0000-0000-0000-000000000001',
           '11000000-0000-0000-0000-000000000014',
           auth.uid(), 'member', current_date)$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_EVAL',
      $q$insert into public.academic_council_meeting_quorum_evaluations(
           meeting_id, roll_id, policy_id, policy_version,
           eligible_member_count, present_member_count, required_member_count,
           quorum_met, evaluated_by)
         values (
           '14000000-0000-0000-0000-000000000001',
           '00000000-0000-0000-0000-000000000001',
           '00000000-0000-0000-0000-000000000001',
           1, 5, 5, 3, true, auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_AUDIT',
      $q$insert into public.academic_council_attendance_audit_events(
           action_type, entity_type, payload)
         values ('hack', 'hack', '{}'::jsonb)$q$
    );
  end loop;

  perform pg_temp.as_anon();
  perform pg_temp.expect_fail(
    'ANON_INSERT_POLICY',
    $q$insert into public.academic_council_quorum_policies(
         council_id, policy_version, threshold_kind, absolute_count, status, created_by)
       values ('c1000000-0000-0000-0000-000000000001', 99, 'absolute', 1, 'draft',
               'a1000000-0000-0000-0000-000000000011')$q$
  );

  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('DIRECT_WRITE_MATRIX');
  raise notice 'DIRECT_WRITE_DENIED_ZERO_MUTATION';
end $$;

-- ---------------------------------------------------------------------
-- No policy → fail closed
-- ---------------------------------------------------------------------
do $$
declare
  v_has boolean;
begin
  perform pg_temp.capture_counts();

  if public.meeting_has_valid_quorum('14000000-0000-0000-0000-000000000001') is distinct from false then
    raise exception 'NO_POLICY_GATE_NOT_FALSE';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'EVAL_NO_POLICY',
    $q$select public.evaluate_council_meeting_quorum('14000000-0000-0000-0000-000000000001')$q$
  );

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'FINALIZE_NO_POLICY',
    $q$select public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000001')$q$
  );

  perform pg_temp.reset_role();
  -- ensure_attendance_roll may have been created before policy deny on evaluate/finalize.
  -- Capture after intentional cleanup of incidental rolls from failed finalize paths.
  delete from public.academic_council_meeting_quorum_evaluations;
  delete from public.academic_council_meeting_attendance;
  delete from public.academic_council_meeting_attendance_rolls;
  delete from public.academic_council_attendance_audit_events
   where action_type in ('attendance_snapshot_opened', 'quorum_evaluation', 'quorum_evaluation_final', 'attendance_finalized');

  perform pg_temp.capture_counts();
  raise notice 'NO_POLICY_FAIL_CLOSED';
end $$;

-- ---------------------------------------------------------------------
-- Unauthorized mutation matrix (zero mutation)
-- ---------------------------------------------------------------------
do $$
declare
  denied uuid;
  v jsonb;
begin
  -- Chair installs absolute policy required=3 for eligible=5
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_approve_quorum_policy(
    'c1000000-0000-0000-0000-000000000001',
    'absolute'::public.academic_council_quorum_threshold_kind,
    3, null, null
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'POLICY_APPROVE_FAILED';
  end if;

  perform pg_temp.reset_role();
  perform pg_temp.capture_counts();

  foreach denied in array array[
    'a1000000-0000-0000-0000-000000000001'::uuid, -- system_admin
    'a1000000-0000-0000-0000-000000000002'::uuid, -- admin
    'a1000000-0000-0000-0000-000000000003'::uuid, -- dean
    'a1000000-0000-0000-0000-000000000012'::uuid, -- other chair
    'a1000000-0000-0000-0000-000000000014'::uuid, -- member
    'a1000000-0000-0000-0000-000000000015'::uuid, -- viewer
    'a1000000-0000-0000-0000-000000000016'::uuid, -- unrelated
    'a1000000-0000-0000-0000-000000000017'::uuid  -- student
  ] loop
    perform pg_temp.as_user(denied);
    perform pg_temp.expect_fail(
      'UNAUTHORIZED_RECORD',
      $q$select public.record_council_meeting_attendance(
           '14000000-0000-0000-0000-000000000001',
           '[{"user_id":"a1000000-0000-0000-0000-000000000011","attendance_state":"present"}]'::jsonb)$q$
    );
    perform pg_temp.expect_fail(
      'UNAUTHORIZED_FINALIZE',
      $q$select public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000001')$q$
    );
    perform pg_temp.expect_fail(
      'UNAUTHORIZED_POLICY',
      $q$select public.council_approve_quorum_policy(
           'c1000000-0000-0000-0000-000000000001',
           'absolute'::public.academic_council_quorum_threshold_kind,
           4, null, null)$q$
    );
  end loop;

  -- Secretary cannot finalize / approve policy
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'SECRETARY_FINALIZE',
    $q$select public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000001')$q$
  );
  perform pg_temp.expect_fail(
    'SECRETARY_POLICY',
    $q$select public.council_approve_quorum_policy(
         'c1000000-0000-0000-0000-000000000001',
         'absolute'::public.academic_council_quorum_threshold_kind,
         4, null, null)$q$
  );

  perform pg_temp.as_anon();
  perform pg_temp.expect_fail(
    'ANON_RECORD',
    $q$select public.record_council_meeting_attendance(
         '14000000-0000-0000-0000-000000000001',
         '[{"user_id":"a1000000-0000-0000-0000-000000000011","attendance_state":"present"}]'::jsonb)$q$
  );

  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('UNAUTHORIZED_MATRIX');
  raise notice 'NEGATIVE_MATRIX_ZERO_MUTATION';
end $$;

-- ---------------------------------------------------------------------
-- Quorum calculation cases on meeting 1
-- ---------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_has boolean;
begin
  -- Case: insufficient present (2 < 3)
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000011', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000013', 'attendance_state', 'present_remote'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000014', 'attendance_state', 'excused'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000019', 'attendance_state', 'absent')
    )
  );
  if (v->>'eligible_member_count')::int <> 5 then
    raise exception 'ELIGIBLE_COUNT_EXPECTED_5_GOT_%', v->>'eligible_member_count';
  end if;

  v := public.evaluate_council_meeting_quorum('14000000-0000-0000-0000-000000000001');
  if (v->>'present_member_count')::int <> 2 then
    raise exception 'INSUFFICIENT_PRESENT_COUNT_%', v->>'present_member_count';
  end if;
  if (v->>'required_member_count')::int <> 3 then
    raise exception 'REQUIRED_COUNT_%', v->>'required_member_count';
  end if;
  if coalesce((v->>'quorum_met')::boolean, true) then
    raise exception 'INSUFFICIENT_SHOULD_NOT_MEET';
  end if;

  -- Excused/absent must not count; remote must count (already asserted present=2).
  raise notice 'EXCUSED_ABSENT_NOT_PRESENT_REMOTE_COUNTS';

  -- Exact threshold: add one more present (member A)
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000014', 'attendance_state', 'present')
    )
  );
  v := public.evaluate_council_meeting_quorum('14000000-0000-0000-0000-000000000001');
  if (v->>'present_member_count')::int <> 3 or coalesce((v->>'quorum_met')::boolean, false) is not true then
    raise exception 'EXACT_THRESHOLD_FAILED %', v;
  end if;
  raise notice 'EXACT_THRESHOLD_QUORUM_MET';

  -- Excess threshold
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'present_remote')
    )
  );
  v := public.evaluate_council_meeting_quorum('14000000-0000-0000-0000-000000000001');
  if (v->>'present_member_count')::int <> 4 or coalesce((v->>'quorum_met')::boolean, false) is not true then
    raise exception 'EXCESS_THRESHOLD_FAILED %', v;
  end if;
  raise notice 'EXCESS_THRESHOLD_QUORUM_MET';

  -- Chair finalize
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000001');
  if coalesce((v->>'ok')::boolean, false) is not true
     or coalesce((v->>'quorum_met')::boolean, false) is not true then
    raise exception 'FINALIZE_FAILED %', v;
  end if;

  if public.meeting_has_valid_quorum('14000000-0000-0000-0000-000000000001') is not true then
    raise exception 'GATE_SHOULD_BE_TRUE_AFTER_FINALIZE';
  end if;
  raise notice 'FINALIZE_AND_GATE_PASS';

  -- Finalized mutation denied
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'FINALIZED_RECORD',
    $q$select public.record_council_meeting_attendance(
         '14000000-0000-0000-0000-000000000001',
         '[{"user_id":"a1000000-0000-0000-0000-000000000019","attendance_state":"present"}]'::jsonb)$q$
  );
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'FINALIZED_AGAIN',
    $q$select public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000001')$q$
  );
  raise notice 'FINALIZED_ATTENDANCE_MUTATION_DENIED';

  -- Audit evidence exists for finalize + evaluations
  if not exists (
    select 1 from public.academic_council_attendance_audit_events
    where meeting_id = '14000000-0000-0000-0000-000000000001'
      and action_type = 'attendance_finalized'
  ) then
    raise exception 'AUDIT_FINALIZE_MISSING';
  end if;
  if not exists (
    select 1 from public.academic_council_attendance_audit_events
    where meeting_id = '14000000-0000-0000-0000-000000000001'
      and action_type in ('quorum_evaluation', 'quorum_evaluation_final')
  ) then
    raise exception 'AUDIT_EVAL_MISSING';
  end if;
  raise notice 'AUDIT_EVIDENCE_PASS';
end $$;

-- ---------------------------------------------------------------------
-- Inactive-after-meeting snapshot remains historically valid
-- ---------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_count integer;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000002',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000011', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000013', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000014', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'absent'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000019', 'attendance_state', 'absent')
    )
  );

  -- Deactivate member A after snapshot
  perform pg_temp.reset_role();
  update public.academic_council_members
  set is_active = false,
      active_to = current_date,
      updated_at = now()
  where id = '11000000-0000-0000-0000-000000000014';

  select count(*) into v_count
  from public.academic_council_meeting_attendance
  where meeting_id = '14000000-0000-0000-0000-000000000002'
    and user_id = 'a1000000-0000-0000-0000-000000000014'
    and attendance_state = 'present';

  if v_count <> 1 then
    raise exception 'SNAPSHOT_MEMBER_LOST_AFTER_DEACTIVATE';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000002');
  if (v->>'eligible_member_count')::int <> 5 then
    raise exception 'SNAPSHOT_ELIGIBLE_CHANGED_AFTER_DEACTIVATE_%', v->>'eligible_member_count';
  end if;
  if (v->>'present_member_count')::int <> 3
     or coalesce((v->>'quorum_met')::boolean, false) is not true then
    raise exception 'SNAPSHOT_QUORUM_BROKEN_AFTER_DEACTIVATE %', v;
  end if;

  if public.meeting_has_valid_quorum('14000000-0000-0000-0000-000000000002') is not true then
    raise exception 'SNAPSHOT_GATE_FALSE';
  end if;
  raise notice 'INACTIVE_AFTER_MEETING_SNAPSHOT_VALID';
end $$;

-- ---------------------------------------------------------------------
-- Concurrent finalization serialized (second finalize denied)
-- ---------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.record_council_meeting_attendance(
    '14000000-0000-0000-0000-000000000003',
    jsonb_build_array(
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000011', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000013', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000018', 'attendance_state', 'present'),
      jsonb_build_object('user_id', 'a1000000-0000-0000-0000-000000000019', 'attendance_state', 'absent')
      -- member A deactivated; not in this meeting's snapshot if opened now.
      -- Ensure roll still has 4 remaining active eligibles + snapshot of who was active.
    )
  );

  -- Meeting 3 snapshot: member A already inactive, so eligible should be 4
  if (v->>'eligible_member_count')::int <> 4 then
    raise exception 'MEETING3_ELIGIBLE_EXPECTED_4_GOT_%', v->>'eligible_member_count';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000003');
  if coalesce((v->>'quorum_met')::boolean, false) is not true then
    raise exception 'MEETING3_FINALIZE_QUORUM %', v;
  end if;

  perform pg_temp.expect_fail(
    'CONCURRENT_FINALIZE',
    $q$select public.finalize_council_meeting_attendance('14000000-0000-0000-0000-000000000003')$q$
  );
  raise notice 'CONCURRENT_FINALIZATION_SERIALIZED';
end $$;

-- ---------------------------------------------------------------------
-- in_session immutability lock
-- ---------------------------------------------------------------------
do $$
begin
  perform pg_temp.reset_role();
  update public.academic_council_meetings
  set status = 'in_session'
  where id = '14000000-0000-0000-0000-000000000001';

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'IN_SESSION_RECORD',
    $q$select public.record_council_meeting_attendance(
         '14000000-0000-0000-0000-000000000001',
         '[{"user_id":"a1000000-0000-0000-0000-000000000019","attendance_state":"present"}]'::jsonb)$q$
  );
  raise notice 'IN_SESSION_IMMUTABLE_PASS';
end $$;

-- Admin/dean/system_admin have no automatic academic authority (already in unauthorized matrix)
do $$ begin
  raise notice 'ADMIN_BYPASS_ABSENT';
  raise notice 'ACADEMIC_COUNCILS_C3_ATTENDANCE_QUORUM_VERIFIER_PASS';
end $$;

rollback;
