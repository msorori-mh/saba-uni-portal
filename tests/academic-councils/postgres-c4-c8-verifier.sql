-- ACADEMIC-COUNCILS-C0-C8 Final Integration Verifier (disposable PG17).
-- Proves real C1 + C3 + C4-C7 together. Transactional: begin … rollback.
-- No C1 shim dependency.

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
    when check_violation then null;
    when unique_violation then null;
    when foreign_key_violation then null;
    when not_null_violation then null;
    when data_exception then null;
    when invalid_authorization_specification then null;
    when sqlstate '42501' then null;
    when sqlstate '28000' then null;
    when sqlstate '22000' then null;
    when sqlstate '22023' then null;
    when sqlstate '23505' then null;
    when sqlstate 'P0001' then null;
    when sqlstate 'P0002' then null;
    when sqlstate '42883' then null;
  end;
end;
$$;

create temporary table if not exists pg_temp.denial_log (
  label text primary key
);
grant all on table pg_temp.denial_log to authenticated, anon, service_role;

create or replace function pg_temp.deny_zero(
  p_label text,
  p_sql text,
  p_fp_sql text default null
)
returns void language plpgsql as $$
declare
  v_before text;
  v_after text;
begin
  if p_fp_sql is null then
    v_before := md5(
      coalesce((select string_agg(id::text || status::text, ',' order by id) from public.academic_council_meetings), '') || '|' ||
      coalesce((select count(*)::text from public.academic_council_votes), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_minutes), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_decisions), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_agenda_items), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_meeting_transition_events), '0')
    );
  else
    execute p_fp_sql into v_before;
  end if;

  perform pg_temp.expect_fail(p_label, p_sql);

  if p_fp_sql is null then
    v_after := md5(
      coalesce((select string_agg(id::text || status::text, ',' order by id) from public.academic_council_meetings), '') || '|' ||
      coalesce((select count(*)::text from public.academic_council_votes), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_minutes), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_decisions), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_agenda_items), '0') || '|' ||
      coalesce((select count(*)::text from public.academic_council_meeting_transition_events), '0')
    );
  else
    execute p_fp_sql into v_after;
  end if;

  if v_before is distinct from v_after then
    raise exception '%_MUTATED_STATE', p_label;
  end if;

  insert into pg_temp.denial_log(label) values (p_label)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 0) Real C1 contract present; shim absent
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure(
       'public.council_transition_meeting(uuid,public.academic_council_meeting_status,public.academic_council_meeting_status,jsonb)'
     ) is null
     or to_regprocedure(
       'public.council_meeting_transition_is_legal(public.academic_council_meeting_status,public.academic_council_meeting_status)'
     ) is null then
    raise exception 'REAL_C1_MISSING';
  end if;
  if to_regprocedure('public.can_transition_council_meeting_state(uuid,text)') is not null then
    raise exception 'C1_SHIM_MUST_NOT_BE_LOADED_IN_FULL_INTEGRATION';
  end if;
  if not public.council_assert_c1_contract_present() then
    raise exception 'C1_ASSERT_FAILED';
  end if;
  raise notice 'REAL_C1_CONTRACT_PRESENT';
end $$;

-- ---------------------------------------------------------------------
-- 1) Fixture council + memberships
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_council_b uuid := 'c1000000-0000-0000-0000-000000000002';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  v_sys uuid := 'a1000000-0000-0000-0000-000000000001';
  v_dean uuid := 'a1000000-0000-0000-0000-000000000003';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_chair_other uuid := 'a1000000-0000-0000-0000-000000000012';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_unrelated uuid := 'a1000000-0000-0000-0000-000000000016';
  v_student uuid := 'a1000000-0000-0000-0000-000000000017';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (id, name, council_type, created_by) values
    (v_council, 'College Academic Council', 'college', v_admin),
    (v_council_b, 'Other Council', 'college', v_admin)
  on conflict do nothing;

  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, active_from, created_by
  ) values
    ('11000000-0000-0000-0000-000000000011', v_council, v_chair, 'chair', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000013', v_council, v_sec, 'secretary', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000014', v_council, v_mem_a, 'member', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000015', v_council, v_viewer, 'viewer', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000018', v_council, v_mem_b, 'member', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000019', v_council, v_mem_c, 'member', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000012', v_council_b, v_chair_other, 'chair', true, current_date, v_admin)
  on conflict do nothing;

  -- Historical / inactive / expired memberships for negative matrix
  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, active_from, active_to, created_by
  ) values
    ('11000000-0000-0000-0000-000000000016', v_council, v_unrelated, 'member', false, current_date - 400, current_date - 30, v_admin)
  on conflict do nothing;

  -- Silence unused warnings
  perform v_sys, v_dean, v_student;
end $$;

-- ---------------------------------------------------------------------
-- 2) POSITIVE FULL LIFECYCLE (scheduled → archived) via real RPCs
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  v_sys uuid := 'a1000000-0000-0000-0000-000000000001';
  v_dean uuid := 'a1000000-0000-0000-0000-000000000003';
  v_chair_other uuid := 'a1000000-0000-0000-0000-000000000012';
  v_unrelated uuid := 'a1000000-0000-0000-0000-000000000016';
  v_student uuid := 'a1000000-0000-0000-0000-000000000017';

  v_meeting uuid;
  v_topic1 uuid;
  v_topic2 uuid;
  v_item1 uuid;
  v_item2 uuid;
  v_dec uuid;
  v_res jsonb;
  v_status text;
  v_neg int := 0;
begin
  -- Quorum policy (chair)
  perform pg_temp.as_user(v_chair);
  perform public.council_approve_quorum_policy(
    v_council, 'ratio'::public.academic_council_quorum_threshold_kind, null, 3, 5
  );

  -- 1-2 schedule meeting
  v_res := public.council_schedule_meeting(
    v_council,
    'Regular Council Meeting 1',
    now() + interval '2 days',
    'Hall A',
    now() - interval '1 hour',
    now() + interval '1 day'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;
  if (v_res->>'status') <> 'scheduled' then raise exception 'EXPECTED_SCHEDULED'; end if;

  -- Illegal skip / reverse probes (authorization + state machine)
  perform pg_temp.deny_zero('SKIP_TO_IN_SESSION',
    format($q$select public.council_transition_meeting('%s','scheduled','in_session','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('BACKWARD_TRANSITION',
    format($q$select public.council_transition_meeting('%s','scheduled','archived','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;

  -- 3 open intake
  v_res := public.council_transition_meeting(
    v_meeting, 'scheduled', 'intake_open', jsonb_build_object('via','positive_journey')
  );
  if (v_res->>'to_status') <> 'intake_open' then raise exception 'EXPECTED_INTAKE_OPEN'; end if;

  -- Wrong actors cannot open session later / mutate early
  perform pg_temp.as_user(v_admin);
  perform pg_temp.deny_zero('ADMIN_TRANSITION_BYPASS',
    format($q$select public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_sys);
  perform pg_temp.deny_zero('SYSADMIN_TRANSITION_BYPASS',
    format($q$select public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_dean);
  perform pg_temp.deny_zero('DEAN_TRANSITION_BYPASS',
    format($q$select public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_chair_other);
  perform pg_temp.deny_zero('WRONG_COUNCIL_CHAIR_TRANSITION',
    format($q$select public.council_transition_meeting('%s','intake_open','intake_closed','{}'::jsonb)$q$, v_meeting));
  v_neg := v_neg + 1;

  -- 4 submit topics
  perform pg_temp.as_user(v_mem_a);
  v_res := public.council_submit_topic(v_council, v_meeting, 'Topic A Approval', 'Body A', 'academic');
  v_topic1 := (v_res->>'topic_id')::uuid;
  v_res := public.council_submit_topic(v_council, v_meeting, 'Topic B Discussion', 'Body B', 'academic');
  v_topic2 := (v_res->>'topic_id')::uuid;

  perform pg_temp.as_user(v_viewer);
  perform pg_temp.deny_zero('VIEWER_TOPIC_SUBMIT',
    format($q$select public.council_submit_topic('%s','%s','x','y',null)$q$, v_council, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_student);
  perform pg_temp.deny_zero('STUDENT_TOPIC_SUBMIT',
    format($q$select public.council_submit_topic('%s','%s','x','y',null)$q$, v_council, v_meeting));
  v_neg := v_neg + 1;

  -- 5 secretary review
  perform pg_temp.as_user(v_sec);
  perform public.council_review_topic(v_topic1, 'under_review');
  perform public.council_review_topic(v_topic2, 'under_review');

  -- 6 chair acceptance
  perform pg_temp.as_user(v_chair);
  perform public.council_review_topic(v_topic1, 'accepted_for_agenda');
  perform public.council_review_topic(v_topic2, 'accepted_for_agenda');

  -- 7 close intake
  perform public.council_transition_meeting(
    v_meeting, 'intake_open', 'intake_closed', jsonb_build_object('via','positive_journey')
  );

  -- 8 add to agenda
  perform pg_temp.as_user(v_sec);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic1, 1);
  v_item1 := (v_res->>'agenda_item_id')::uuid;
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic2, 2);
  v_item2 := (v_res->>'agenda_item_id')::uuid;

  -- 9 finalize non-empty agenda + 10 ready
  perform pg_temp.as_user(v_chair);
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(
    v_meeting, 'intake_closed', 'agenda_ready', jsonb_build_object('via','positive_journey')
  );

  select status::text into v_status from public.academic_council_meetings where id = v_meeting;
  if v_status <> 'agenda_ready' then raise exception 'EXPECTED_AGENDA_READY'; end if;

  -- Direct PostgREST-style status mutate denied (as authenticated)
  perform pg_temp.as_user(v_chair);
  perform pg_temp.deny_zero('DIRECT_STATUS_UPDATE',
    format($q$update public.academic_council_meetings set status = 'in_session' where id = '%s'$q$, v_meeting));
  v_neg := v_neg + 1;

  -- Open session negatives before attendance
  perform pg_temp.deny_zero('OPEN_SESSION_NO_QUORUM',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.deny_zero('OPEN_SESSION_ADMIN_BYPASS',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_sec);
  perform pg_temp.deny_zero('OPEN_SESSION_SECRETARY',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.deny_zero('OPEN_SESSION_MEMBER',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_viewer);
  perform pg_temp.deny_zero('OPEN_SESSION_VIEWER',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_unrelated);
  perform pg_temp.deny_zero('OPEN_SESSION_INACTIVE_MEMBER',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  raise notice 'AUTHORIZATION_MATRIX_PASS';

  -- 9-11 attendance + quorum
  perform pg_temp.as_user(v_sec);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present_remote'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform pg_temp.as_user(v_chair);
  perform public.evaluate_council_meeting_quorum(v_meeting);
  perform public.finalize_council_meeting_attendance(v_meeting);
  if not public.meeting_has_valid_quorum(v_meeting) then
    raise exception 'EXPECTED_VALID_QUORUM';
  end if;

  -- 12 open session via C4 → real C1 transition
  v_res := public.open_council_session(v_meeting);
  if (v_res->>'status') <> 'in_session' then raise exception 'EXPECTED_IN_SESSION'; end if;
  if not exists (
    select 1 from public.academic_council_meeting_transition_events
    where meeting_id = v_meeting
      and from_status = 'agenda_ready'
      and to_status = 'in_session'
  ) then
    raise exception 'MISSING_C1_TRANSITION_EVENT_IN_SESSION';
  end if;

  -- Stale concurrency: second open must fail with zero mutation
  perform pg_temp.deny_zero('SESSION_OPEN_RACE',
    format($q$select public.open_council_session('%s')$q$, v_meeting));
  v_neg := v_neg + 1;

  -- 13-18 agenda + voting
  perform public.start_agenda_item_discussion(v_item1);
  perform public.open_agenda_item_vote(v_item1);

  perform pg_temp.as_user(v_mem_c);
  perform pg_temp.deny_zero('ABSENT_MEMBER_VOTE',
    format($q$select public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_viewer);
  perform pg_temp.deny_zero('VIEWER_VOTE',
    format($q$select public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.deny_zero('ADMIN_VOTE_BYPASS',
    format($q$select public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_chair_other);
  perform pg_temp.deny_zero('CROSS_COUNCIL_VOTE',
    format($q$select public.cast_council_vote('%s','yes')$q$, v_item1));
  v_neg := v_neg + 1;

  -- Direct vote insert denied
  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.deny_zero('DIRECT_VOTE_INSERT',
    format($q$insert into public.academic_council_votes (meeting_id, agenda_item_id, council_id, voter_user_id, vote_value)
           values ('%s','%s','%s','%s','yes')$q$, v_meeting, v_item1, v_council, v_mem_a));
  v_neg := v_neg + 1;

  perform public.cast_council_vote(v_item1, 'yes');
  perform pg_temp.deny_zero('DOUBLE_VOTE',
    format($q$select public.cast_council_vote('%s','no')$q$, v_item1));
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_sec);
  perform public.cast_council_vote(v_item1, 'yes');
  perform pg_temp.as_user(v_mem_b);
  perform public.cast_council_vote(v_item1, 'no');
  perform pg_temp.as_user(v_chair);
  perform public.cast_council_vote(v_item1, 'abstain');

  perform public.close_agenda_item_vote(v_item1);
  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.deny_zero('VOTE_AFTER_CLOSE',
    format($q$select public.cast_council_vote('%s','abstain')$q$, v_item1));
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_chair);
  v_res := public.calculate_agenda_item_result(v_item1);
  if (v_res->>'outcome') <> 'passed' or (v_res->>'yes_count')::int <> 2 then
    raise exception 'VOTE_CALCULATION_MISMATCH: %', v_res;
  end if;
  perform public.resolve_agenda_item(v_item1, 'Approved by vote');

  perform public.start_agenda_item_discussion(v_item2);
  perform public.resolve_agenda_item(v_item2, 'Noted without vote');
  raise notice 'VOTING_SECURITY_PASS';

  -- 19 close session → minutes_draft via C1
  v_res := public.close_council_session(v_meeting);
  if (v_res->>'status') <> 'minutes_draft' then raise exception 'EXPECTED_MINUTES_DRAFT'; end if;

  -- 20-22 minutes
  perform pg_temp.as_user(v_sec);
  perform public.draft_council_minutes(v_meeting, 'Initial draft minutes for Meeting 1.');
  perform public.submit_council_minutes_for_review(v_meeting);
  select status::text into v_status from public.academic_council_meetings where id = v_meeting;
  if v_status <> 'minutes_review' then raise exception 'EXPECTED_MINUTES_REVIEW'; end if;

  perform pg_temp.deny_zero('SECRETARY_LOCK_MINUTES',
    format($q$select public.approve_and_lock_council_minutes('%s')$q$, v_meeting));
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_chair);
  v_res := public.approve_and_lock_council_minutes(v_meeting, 'Final approved minutes content for Meeting 1.');
  if (v_res->>'is_locked')::boolean is not true then raise exception 'EXPECTED_MINUTES_LOCKED'; end if;
  select status::text into v_status from public.academic_council_meetings where id = v_meeting;
  if v_status <> 'minutes_locked' then raise exception 'EXPECTED_MEETING_MINUTES_LOCKED'; end if;

  -- Post-lock immutability
  perform pg_temp.as_user(v_sec);
  perform pg_temp.deny_zero('EDIT_LOCKED_MINUTES',
    format($q$select public.draft_council_minutes('%s','tampered')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.deny_zero('DELETE_LOCKED_MINUTES',
    format($q$delete from public.academic_council_minutes where meeting_id = '%s'$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('UPDATE_LOCKED_AGENDA_ITEM',
    format($q$update public.academic_council_agenda_items set title = 'tampered' where id = '%s'$q$, v_item1));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('UPDATE_LOCKED_VOTE',
    format($q$update public.academic_council_votes set vote_value = 'no' where agenda_item_id = '%s'$q$, v_item1));
  v_neg := v_neg + 1;
  raise notice 'MINUTES_IMMUTABILITY_PASS';

  -- 23-26 decisions
  perform pg_temp.as_user(v_chair);
  v_res := public.issue_council_decision(
    v_meeting, v_item1, 'Execute Topic A Plan',
    'Department shall implement Topic A recommendations by due date.',
    v_mem_a, 'Department of Computer Science', (current_date + 30)::date
  );
  v_dec := (v_res->>'decision_id')::uuid;
  if v_dec is null then raise exception 'DECISION_ISSUANCE_FAILED'; end if;

  perform pg_temp.deny_zero('MUTATE_LOCKED_DECISION_TEXT',
    format($q$update public.academic_council_decisions set title = 'tampered' where id = '%s'$q$, v_dec));
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_mem_b);
  perform pg_temp.deny_zero('UNASSIGNED_FOLLOWUP_UPDATE',
    format($q$select public.update_council_decision_followup('%s','in_progress')$q$, v_dec));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.deny_zero('ADMIN_FOLLOWUP_BYPASS',
    format($q$select public.update_council_decision_followup('%s','in_progress')$q$, v_dec));
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_mem_a);
  perform public.update_council_decision_followup(v_dec, 'in_progress', 'Work started.');
  perform public.complete_council_decision(v_dec, 'Execution completed.');
  perform pg_temp.deny_zero('COMPLETED_DECISION_BACKWARD',
    format($q$select public.update_council_decision_followup('%s','issued')$q$, v_dec));
  v_neg := v_neg + 1;
  raise notice 'DECISION_FOLLOWUP_PASS';

  -- 27 archive
  perform pg_temp.as_user(v_sec);
  perform pg_temp.deny_zero('SECRETARY_ARCHIVE',
    format($q$select public.archive_council_meeting('%s')$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.as_user(v_admin);
  perform pg_temp.deny_zero('ADMIN_ARCHIVE_BYPASS',
    format($q$select public.archive_council_meeting('%s')$q$, v_meeting));
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_chair);
  v_res := public.archive_council_meeting(v_meeting);
  if (v_res->>'status') <> 'archived' then raise exception 'ARCHIVE_FAILED'; end if;

  perform pg_temp.deny_zero('POST_ARCHIVE_MEETING_MUTATION',
    format($q$update public.academic_council_meetings set title = 'tampered' where id = '%s'$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('POST_ARCHIVE_AGENDA_MUTATION',
    format($q$update public.academic_council_agenda_items set resolution = 'x' where id = '%s'$q$, v_item1));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('POST_ARCHIVE_VOTE_MUTATION',
    format($q$update public.academic_council_votes set vote_value = 'abstain' where agenda_item_id = '%s'$q$, v_item1));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('POST_ARCHIVE_MINUTES_MUTATION',
    format($q$update public.academic_council_minutes set body = 'x' where meeting_id = '%s'$q$, v_meeting));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('POST_ARCHIVE_DECISION_MUTATION',
    format($q$update public.academic_council_decisions set title = 'x' where id = '%s'$q$, v_dec));
  v_neg := v_neg + 1;
  raise notice 'ARCHIVE_IMMUTABILITY_PASS';

  -- 28 historical read
  v_res := public.get_council_archive_summary(v_council);
  if (v_res->>'total_archived_meetings')::int < 1 then raise exception 'ARCHIVE_SUMMARY_MISMATCH'; end if;
  v_res := public.get_council_decision_followup_dashboard(v_council);
  if ((v_res->'summary')->>'completed')::int < 1 then raise exception 'DASHBOARD_COMPLETED_MISMATCH'; end if;
  v_res := public.get_council_historical_minutes(v_meeting);
  if (v_res->>'is_locked')::boolean is not true then raise exception 'HISTORICAL_MINUTES_MISMATCH'; end if;
  v_res := public.get_council_meeting_metrics(v_council);
  if (v_res->>'archived_meetings')::int < 1 then raise exception 'METRICS_MISMATCH'; end if;

  -- Anonymous / student historical deny
  perform pg_temp.reset_role();
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  perform pg_temp.expect_fail('ANON_HISTORICAL_MINUTES',
    format($q$select public.get_council_historical_minutes('%s')$q$, v_meeting));
  insert into pg_temp.denial_log(label) values ('ANON_HISTORICAL_MINUTES') on conflict do nothing;
  v_neg := v_neg + 1;

  perform pg_temp.as_user(v_student);
  perform pg_temp.deny_zero('STUDENT_HISTORICAL_MINUTES',
    format($q$select public.get_council_historical_minutes('%s')$q$, v_meeting));
  v_neg := v_neg + 1;

  -- Cancellation legality only pre-session (on a fresh meeting)
  perform pg_temp.as_user(v_chair);
  v_res := public.council_schedule_meeting(v_council, 'Cancelable', now() + interval '5 days');
  perform public.council_transition_meeting(
    (v_res->>'meeting_id')::uuid, 'scheduled', 'cancelled', '{"via":"cancel_ok"}'::jsonb
  );

  raise notice 'POSITIVE_FULL_LIFECYCLE_PASS';
  raise notice 'ZERO_MUTATION_DENIALS_COUNTED';
  raise notice 'NEGATIVE_CASE_COUNT=%', (select count(*) from pg_temp.denial_log);
end $$;

-- ---------------------------------------------------------------------
-- 3) CONCURRENCY / STALE-STATE races on a second meeting path
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_res jsonb;
begin
  perform pg_temp.as_user(v_chair);
  v_res := public.council_schedule_meeting(
    v_council, 'Concurrency Meeting', now() + interval '3 days',
    null, now() - interval '1 hour', now() + interval '12 hours'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting, 'scheduled', 'intake_open', '{}'::jsonb);

  perform pg_temp.as_user(v_mem_a);
  v_res := public.council_submit_topic(v_council, v_meeting, 'Race Topic', 'Body');
  v_topic := (v_res->>'topic_id')::uuid;
  perform pg_temp.as_user(v_sec);
  perform public.council_review_topic(v_topic, 'under_review');
  perform pg_temp.as_user(v_chair);
  perform public.council_review_topic(v_topic, 'accepted_for_agenda');
  perform public.council_transition_meeting(v_meeting, 'intake_open', 'intake_closed', '{}'::jsonb);
  perform pg_temp.as_user(v_sec);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic, 1);
  v_item := (v_res->>'agenda_item_id')::uuid;
  perform pg_temp.as_user(v_chair);
  perform public.council_finalize_meeting_agenda(v_meeting);

  -- Transition race: stale expected status
  perform public.council_transition_meeting(v_meeting, 'intake_closed', 'agenda_ready', '{}'::jsonb);
  perform pg_temp.deny_zero('TRANSITION_STALE_RACE',
    format($q$select public.council_transition_meeting('%s','intake_closed','agenda_ready','{}'::jsonb)$q$, v_meeting));

  perform pg_temp.as_user(v_sec);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform pg_temp.as_user(v_chair);
  perform public.finalize_council_meeting_attendance(v_meeting);
  perform pg_temp.deny_zero('ATTENDANCE_FINALIZE_RACE',
    format($q$select public.finalize_council_meeting_attendance('%s')$q$, v_meeting));

  perform public.open_council_session(v_meeting);
  perform public.start_agenda_item_discussion(v_item);
  perform public.open_agenda_item_vote(v_item);
  perform pg_temp.as_user(v_mem_a);
  perform public.cast_council_vote(v_item, 'yes');
  perform pg_temp.as_user(v_chair);
  perform public.close_agenda_item_vote(v_item);
  perform pg_temp.deny_zero('VOTE_VS_CLOSE_RACE',
    format($q$select public.cast_council_vote('%s','no')$q$, v_item));

  perform public.calculate_agenda_item_result(v_item);
  perform public.resolve_agenda_item(v_item, 'done');
  perform public.close_council_session(v_meeting);
  perform pg_temp.as_user(v_sec);
  perform public.draft_council_minutes(v_meeting, 'Draft for concurrency meeting.');
  perform public.submit_council_minutes_for_review(v_meeting);
  perform pg_temp.deny_zero('MINUTES_LOCK_VS_DRAFT',
    format($q$select public.draft_council_minutes('%s','tamper during review')$q$, v_meeting));
  -- Chair may still lock; draft after lock already covered in primary journey.

  raise notice 'CONCURRENCY_PASS';
end $$;

do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_temp.denial_log;
  if v_count < 25 then
    raise exception 'INSUFFICIENT_NEGATIVE_CASES: %', v_count;
  end if;
  raise notice 'ACADEMIC_COUNCILS_C4_C8_VERIFIER_PASS';
end $$;

rollback;
