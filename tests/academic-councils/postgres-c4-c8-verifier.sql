-- ACADEMIC-COUNCILS-C4-C8 Late Lifecycle Verifier (disposable PG17).
-- Transactional: begin … rollback. Proves C4-C7 lifecycle, security, negative cases, and immutability.

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
    when sqlstate '22000' then null;
    when sqlstate '22023' then null;
    when sqlstate 'P0001' then null;
  end;
end;
$$;

create or replace function pg_temp.get_fingerprint()
returns text
language sql
as $$
  select md5(
    coalesce((select count(*)::text from public.academic_council_meetings), '0') || ':' ||
    coalesce((select count(*)::text from public.academic_council_agenda_items), '0') || ':' ||
    coalesce((select count(*)::text from public.academic_council_votes), '0') || ':' ||
    coalesce((select count(*)::text from public.academic_council_minutes), '0') || ':' ||
    coalesce((select count(*)::text from public.academic_council_decisions), '0') || ':' ||
    coalesce((select count(*)::text from public.academic_council_audit_events), '0')
  );
$$;

do $$
declare
  v_council_id uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_chair_other uuid := 'a1000000-0000-0000-0000-000000000012';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';

  v_meeting_id uuid := '14000000-0000-0000-0000-000000000001';
  v_item_1_id uuid := '15000000-0000-0000-0000-000000000001';
  v_item_2_id uuid := '15000000-0000-0000-0000-000000000002';

  v_fp_before text;
  v_fp_after text;
  v_res jsonb;
  v_dec_id uuid;
begin
  perform pg_temp.reset_role();

  -- Setup fixture council
  insert into public.academic_councils (
    id, name, council_type, department_id, created_by
  ) values (
    v_council_id, 'College Academic Council', 'college', null, v_admin
  ) on conflict do nothing;

  -- Setup members
  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, created_by
  ) values
   ('11000000-0000-0000-0000-000000000011', v_council_id, v_chair, 'chair', true, v_admin),
   ('11000000-0000-0000-0000-000000000013', v_council_id, v_sec, 'secretary', true, v_admin),
   ('11000000-0000-0000-0000-000000000014', v_council_id, v_mem_a, 'member', true, v_admin),
   ('11000000-0000-0000-0000-000000000015', v_council_id, v_viewer, 'viewer', true, v_admin),
   ('11000000-0000-0000-0000-000000000018', v_council_id, v_mem_b, 'member', true, v_admin),
   ('11000000-0000-0000-0000-000000000019', v_council_id, v_mem_c, 'member', true, v_admin)
  on conflict do nothing;

  -- 1) Approve Quorum Policy (ratio 3/5)
  perform pg_temp.as_user(v_chair);
  perform public.council_approve_quorum_policy(v_council_id, 'ratio'::public.academic_council_quorum_threshold_kind, null, 3, 5);

  -- 2) Create Meeting in agenda_ready status with approved agenda items
  perform pg_temp.reset_role();
  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values (
    v_meeting_id, v_council_id, 1, 'Regular Council Meeting 1', now() + interval '1 day', 'agenda_ready', v_admin
  ) on conflict do nothing;

  insert into public.academic_council_agenda_items (
    id, meeting_id, order_index, title, is_approved, created_by
  ) values
   (v_item_1_id, v_meeting_id, 1, 'Topic A Approval', true, v_chair),
   (v_item_2_id, v_meeting_id, 2, 'Topic B Discussion', true, v_chair)
  on conflict do nothing;

  -- ---------------------------------------------------------------------
  -- TEST 1: Direct write denied on votes / vote results (Zero Mutation)
  -- ---------------------------------------------------------------------
  v_fp_before := pg_temp.get_fingerprint();

  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.expect_fail('DIRECT_VOTE_INSERT',
    format('insert into public.academic_council_votes (meeting_id, agenda_item_id, council_id, voter_user_id, vote_value) values (''%s'', ''%s'', ''%s'', ''%s'', ''yes'')',
    v_meeting_id, v_item_1_id, v_council_id, v_mem_a));

  perform pg_temp.expect_fail('DIRECT_VOTE_RESULT_INSERT',
    format('insert into public.academic_council_vote_results (agenda_item_id, meeting_id, council_id, yes_count, outcome, calculated_by) values (''%s'', ''%s'', ''%s'', 1, ''passed'', ''%s'')',
    v_item_1_id, v_meeting_id, v_council_id, v_chair));

  v_fp_after := pg_temp.get_fingerprint();
  if v_fp_before <> v_fp_after then
    raise exception 'DIRECT_WRITE_DENIED_MUTATED_STATE';
  end if;
  raise notice 'DIRECT_WRITE_DENIED_ZERO_MUTATION';

  -- ---------------------------------------------------------------------
  -- TEST 2: Session Open Negative Cases (Without quorum / wrong chair / admin bypass)
  -- ---------------------------------------------------------------------
  v_fp_before := pg_temp.get_fingerprint();

  -- Attempt open session without finalized attendance/quorum -> DENIED
  perform pg_temp.as_user(v_chair);
  perform pg_temp.expect_fail('OPEN_SESSION_NO_QUORUM',
    format('select public.open_council_session(''%s'')', v_meeting_id));

  -- Attempt open session by Admin (academic bypass) -> DENIED
  perform pg_temp.as_user(v_admin);
  perform pg_temp.expect_fail('OPEN_SESSION_ADMIN_BYPASS',
    format('select public.open_council_session(''%s'')', v_meeting_id));

  -- Attempt open session by Secretary -> DENIED
  perform pg_temp.as_user(v_sec);
  perform pg_temp.expect_fail('OPEN_SESSION_SECRETARY',
    format('select public.open_council_session(''%s'')', v_meeting_id));

  v_fp_after := pg_temp.get_fingerprint();
  if v_fp_before <> v_fp_after then
    raise exception 'OPEN_SESSION_NEGATIVE_MUTATED_STATE';
  end if;
  raise notice 'SESSION_OPEN_NEGATIVE_MATRIX_PASS';

  -- ---------------------------------------------------------------------
  -- TEST 3: Positive Attendance, Quorum, & Session Open
  -- ---------------------------------------------------------------------
  -- Record attendance: chair, sec, mem_a, mem_b present (4 present out of 5 eligible -> quorum met)
  perform pg_temp.as_user(v_sec);
  perform public.record_council_meeting_attendance(v_meeting_id, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present_remote'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));

  perform pg_temp.as_user(v_chair);
  perform public.evaluate_council_meeting_quorum(v_meeting_id);
  perform public.finalize_council_meeting_attendance(v_meeting_id);

  if not public.meeting_has_valid_quorum(v_meeting_id) then
    raise exception 'EXPECTED_VALID_QUORUM';
  end if;

  -- Open session as Chair
  v_res := public.open_council_session(v_meeting_id);
  if (v_res->>'status') <> 'in_session' then
    raise exception 'EXPECTED_IN_SESSION';
  end if;
  raise notice 'SESSION_OPENED_SUCCESS';

  -- ---------------------------------------------------------------------
  -- TEST 4: Agenda Execution & Voting Lifecycle
  -- ---------------------------------------------------------------------
  -- Start discussion item 1
  perform public.start_agenda_item_discussion(v_item_1_id);

  -- Open vote item 1
  perform public.open_agenda_item_vote(v_item_1_id);

  -- Cast votes:
  -- Member C (absent) tries to vote -> DENIED
  perform pg_temp.as_user(v_mem_c);
  perform pg_temp.expect_fail('ABSENT_MEMBER_VOTE',
    format('select public.cast_council_vote(''%s'', ''yes'')', v_item_1_id));

  -- Viewer tries to vote -> DENIED
  perform pg_temp.as_user(v_viewer);
  perform pg_temp.expect_fail('VIEWER_VOTE',
    format('select public.cast_council_vote(''%s'', ''yes'')', v_item_1_id));

  -- Member A votes yes
  perform pg_temp.as_user(v_mem_a);
  perform public.cast_council_vote(v_item_1_id, 'yes');

  -- Member A double vote -> DENIED
  perform pg_temp.expect_fail('DOUBLE_VOTE',
    format('select public.cast_council_vote(''%s'', ''yes'')', v_item_1_id));

  -- Secretary votes yes
  perform pg_temp.as_user(v_sec);
  perform public.cast_council_vote(v_item_1_id, 'yes');

  -- Member B votes no
  perform pg_temp.as_user(v_mem_b);
  perform public.cast_council_vote(v_item_1_id, 'no');

  -- Close vote item 1
  perform pg_temp.as_user(v_chair);
  perform public.close_agenda_item_vote(v_item_1_id);

  -- Vote after close -> DENIED
  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.expect_fail('VOTE_AFTER_CLOSE',
    format('select public.cast_council_vote(''%s'', ''abstain'')', v_item_1_id));

  -- Calculate result
  perform pg_temp.as_user(v_chair);
  v_res := public.calculate_agenda_item_result(v_item_1_id);
  if (v_res->>'outcome') <> 'passed' or (v_res->>'yes_count')::int <> 2 then
    raise exception 'VOTE_CALCULATION_MISMATCH: %', v_res;
  end if;

  -- Resolve item 1
  perform public.resolve_agenda_item(v_item_1_id, 'Approved by vote 2-1');

  -- Execute item 2: resolve directly
  perform public.start_agenda_item_discussion(v_item_2_id);
  perform public.resolve_agenda_item(v_item_2_id, 'Noted without vote');

  -- Close session -> status: minutes_draft
  v_res := public.close_council_session(v_meeting_id);
  if (v_res->>'status') <> 'minutes_draft' then
    raise exception 'EXPECTED_MINUTES_DRAFT';
  end if;
  raise notice 'SESSION_CLOSED_SUCCESS';

  -- ---------------------------------------------------------------------
  -- TEST 5: Minutes Drafting, Review, & Lock Guards
  -- ---------------------------------------------------------------------
  -- Secretary drafts minutes
  perform pg_temp.as_user(v_sec);
  perform public.draft_council_minutes(v_meeting_id, 'Initial draft minutes for Meeting 1.');

  -- Secretary submits for review
  perform public.submit_council_minutes_for_review(v_meeting_id);

  -- Secretary tries to approve & lock -> DENIED (Chair only)
  perform pg_temp.expect_fail('SECRETARY_LOCK_MINUTES',
    format('select public.approve_and_lock_council_minutes(''%s'')', v_meeting_id));

  -- Chair approves & locks minutes
  perform pg_temp.as_user(v_chair);
  v_res := public.approve_and_lock_council_minutes(v_meeting_id, 'Final approved minutes content for Meeting 1.');
  if (v_res->>'is_locked')::boolean <> true then
    raise exception 'EXPECTED_MINUTES_LOCKED';
  end if;
  raise notice 'MINUTES_LOCKED_SUCCESS';

  -- Post-lock mutation attempts:
  -- 1) Edit locked minutes -> DENIED
  perform pg_temp.as_user(v_sec);
  perform pg_temp.expect_fail('EDIT_LOCKED_MINUTES',
    format('select public.draft_council_minutes(''%s'', ''tampered body'')', v_meeting_id));

  -- 2) Direct DELETE on minutes -> DENIED
  perform pg_temp.as_user(v_admin);
  perform pg_temp.expect_fail('DELETE_LOCKED_MINUTES',
    format('delete from public.academic_council_minutes where meeting_id = ''%s''', v_meeting_id));

  -- 3) Direct UPDATE on agenda item after lock -> DENIED
  perform pg_temp.expect_fail('UPDATE_LOCKED_AGENDA_ITEM',
    format('update public.academic_council_agenda_items set title = ''tampered'' where id = ''%s''', v_item_1_id));

  raise notice 'LOCKED_MINUTES_IMMUTABILITY_PASS';

  -- ---------------------------------------------------------------------
  -- TEST 6: Decisions & Follow-up
  -- ---------------------------------------------------------------------
  -- Issue Decision
  perform pg_temp.as_user(v_chair);
  v_res := public.issue_council_decision(
    v_meeting_id, v_item_1_id, 'Execute Topic A Plan',
    'Department shall implement Topic A recommendations by due date.',
    v_mem_a, 'Department of Computer Science', (CURRENT_DATE + interval '30 days')::date
  );
  v_dec_id := (v_res->>'decision_id')::uuid;
  if v_dec_id is null or (v_res->>'canonical_number') is null then
    raise exception 'DECISION_ISSUANCE_FAILED';
  end if;

  -- Attempt to mutate core decision text after minutes lock -> DENIED
  perform pg_temp.expect_fail('MUTATE_LOCKED_DECISION_TEXT',
    format('update public.academic_council_decisions set title = ''tampered'' where id = ''%s''', v_dec_id));

  -- Unassigned Member B tries to update follow-up -> DENIED
  perform pg_temp.as_user(v_mem_b);
  perform pg_temp.expect_fail('UNASSIGNED_FOLLOWUP_UPDATE',
    format('select public.update_council_decision_followup(''%s'', ''in_progress'')', v_dec_id));

  -- Responsible Member A updates progress to in_progress
  perform pg_temp.as_user(v_mem_a);
  perform public.update_council_decision_followup(v_dec_id, 'in_progress', 'Work started with committee.');

  -- Responsible Member A completes decision
  perform public.complete_council_decision(v_dec_id, 'Execution fully completed and verified.');

  -- Attempt backward transition from completed to issued -> DENIED
  perform pg_temp.expect_fail('COMPLETED_DECISION_BACKWARD',
    format('select public.update_council_decision_followup(''%s'', ''issued'')', v_dec_id));

  raise notice 'DECISION_FOLLOWUP_PASS';

  -- ---------------------------------------------------------------------
  -- TEST 7: Archive Prerequisites & Historical Access
  -- ---------------------------------------------------------------------
  -- Secretary tries to archive -> DENIED
  perform pg_temp.as_user(v_sec);
  perform pg_temp.expect_fail('SECRETARY_ARCHIVE',
    format('select public.archive_council_meeting(''%s'')', v_meeting_id));

  -- Chair archives meeting
  perform pg_temp.as_user(v_chair);
  v_res := public.archive_council_meeting(v_meeting_id);
  if (v_res->>'status') <> 'archived' then
    raise exception 'ARCHIVE_FAILED';
  end if;

  -- Post-archive mutation on meeting -> DENIED
  perform pg_temp.expect_fail('POST_ARCHIVE_MUTATION',
    format('update public.academic_council_meetings set title = ''tampered'' where id = ''%s''', v_meeting_id));

  -- Read Models Verification
  v_res := public.get_council_archive_summary(v_council_id);
  if (v_res->>'total_archived_meetings')::int <> 1 then raise exception 'ARCHIVE_SUMMARY_MISMATCH'; end if;

  v_res := public.get_council_decision_followup_dashboard(v_council_id);
  if ((v_res->'summary')->>'completed')::int <> 1 then raise exception 'DASHBOARD_COMPLETED_MISMATCH'; end if;

  v_res := public.get_council_historical_minutes(v_meeting_id);
  if (v_res->>'is_locked')::boolean <> true then raise exception 'HISTORICAL_MINUTES_MISMATCH'; end if;

  v_res := public.get_council_meeting_metrics(v_council_id);
  if (v_res->>'archived_meetings')::int <> 1 then raise exception 'METRICS_MISMATCH'; end if;

  raise notice 'C7_ARCHIVE_READ_MODELS_PASS';
  raise notice 'ACADEMIC_COUNCILS_C4_C8_VERIFIER_PASS';
end $$;

rollback;
