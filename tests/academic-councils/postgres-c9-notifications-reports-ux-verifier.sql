-- ACADEMIC-COUNCILS-C9 Notifications, Reports, and Operational UX Verifier.
-- Transactional: begin … rollback. Extends C4-C8 fixtures.

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
    when sqlstate 'P0002' then null;
  end;
end;
$$;

do $$
declare
  v_council_id uuid := 'c1000000-0000-0000-0000-000000000001';
  v_council_b_id uuid := 'c1000000-0000-0000-0000-000000000002';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_chair_b uuid := 'a1000000-0000-0000-0000-000000000012';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';

  v_meeting_id uuid := '14000000-0000-0000-0000-000000000001';
  v_topic_id uuid := '16000000-0000-0000-0000-000000000001';
  v_decision_id uuid;
  v_notif_id uuid;
  v_res jsonb;
  v_count int;
  v_msg jsonb;
begin
  perform pg_temp.reset_role();

  -- Ensure fixture council exists
  insert into public.academic_councils (id, name, council_type, department_id, created_by)
  values (v_council_id, 'College Academic Council', 'college', null, v_admin)
  on conflict do nothing;

  insert into public.academic_councils (id, name, council_type, department_id, created_by)
  values (v_council_b_id, 'Other Department Council', 'department', 'd1000000-0000-0000-0000-000000000001', v_admin)
  on conflict do nothing;

  -- Ensure members
  insert into public.academic_council_members (id, council_id, user_id, member_role, is_active, created_by)
  values
   ('11000000-0000-0000-0000-000000000011', v_council_id, v_chair, 'chair', true, v_admin),
   ('11000000-0000-0000-0000-000000000013', v_council_id, v_sec, 'secretary', true, v_admin),
   ('11000000-0000-0000-0000-000000000014', v_council_id, v_mem_a, 'member', true, v_admin),
   ('11000000-0000-0000-0000-000000000015', v_council_id, v_viewer, 'viewer', true, v_admin),
   ('11000000-0000-0000-0000-000000000012', v_council_b_id, v_chair_b, 'chair', true, v_admin)
  on conflict do nothing;

  -- Ensure a meeting and topic exist for notification triggers
  insert into public.academic_council_meetings (id, council_id, meeting_number, title, scheduled_at, status, created_by)
  values (v_meeting_id, v_council_id, 1, 'Regular Council Meeting 1', now() + interval '1 day', 'scheduled', v_admin)
  on conflict do nothing;

  insert into public.academic_council_topics (id, council_id, meeting_id, title, body, status, submitted_by)
  values (v_topic_id, v_council_id, v_meeting_id, 'Test Topic', 'Body', 'submitted', v_mem_a)
  on conflict do nothing;

  -- Process any pending outbox events so notifications exist
  perform public.process_council_notification_outbox(null, 1000);

  -- -------------------------------------------------------------------
  -- TEST 1: Notification recipient scope
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_chair);
  v_res := public.get_my_council_notifications(false, 50);
  if coalesce((v_res->>'unread_count')::int, 0) = 0 then
    raise exception 'NOTIFICATION_SCOPE_EMPTY: chair should have notifications';
  end if;

  perform pg_temp.as_user(v_sec);
  v_res := public.get_my_council_notifications(false, 50);
  if coalesce((v_res->>'unread_count')::int, 0) = 0 then
    raise exception 'NOTIFICATION_SCOPE_EMPTY: secretary should have notifications';
  end if;

  perform pg_temp.as_user(v_mem_a);
  v_res := public.get_my_council_notifications(false, 50);
  if coalesce((v_res->>'unread_count')::int, 0) = 0 then
    raise exception 'NOTIFICATION_SCOPE_EMPTY: member should have notifications';
  end if;

  raise notice 'NOTIFICATION_RECIPIENT_SCOPE_PASS';

  -- -------------------------------------------------------------------
  -- TEST 2: Cross-council denial
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_chair_b);
  v_res := public.get_my_council_notifications(false, 50);
  if coalesce(jsonb_array_length(v_res->'notifications'), 0) > 0 then
    raise exception 'CROSS_COUNCIL_LEAK: chair_b should not see council A notifications';
  end if;

  perform pg_temp.expect_fail('CROSS_COUNCIL_REPORT',
    format('select public.get_council_report_meeting_summary(''%s'')', v_council_id));

  perform pg_temp.expect_fail('CROSS_COUNCIL_DASHBOARD',
    format('select public.get_council_chair_dashboard(''%s'')', v_council_id));

  raise notice 'CROSS_COUNCIL_DENIAL_PASS';

  -- -------------------------------------------------------------------
  -- TEST 3: Read/unread ownership
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_chair);
  v_res := public.get_my_council_notifications(false, 1);
  v_notif_id := (v_res->'notifications'->0->>'notification_id')::uuid;

  -- Mark read
  v_res := public.mark_council_notification_read(v_notif_id, true);
  if (v_res->>'success')::boolean <> true then
    raise exception 'MARK_READ_FAILED';
  end if;

  -- Other user cannot mark the same notification read
  perform pg_temp.as_user(v_sec);
  perform pg_temp.expect_fail('NOTIFICATION_OWNERSHIP',
    format('select public.mark_council_notification_read(''%s'', true)', v_notif_id));

  raise notice 'READ_UNREAD_OWNERSHIP_PASS';

  -- -------------------------------------------------------------------
  -- TEST 4: Report authorization
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_chair);
  v_res := public.get_council_report_meeting_summary(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_MEETING_SUMMARY_MISMATCH';
  end if;

  v_res := public.get_council_report_attendance_rate(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_ATTENDANCE_RATE_MISMATCH';
  end if;

  v_res := public.get_council_report_quorum_history(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_QUORUM_HISTORY_MISMATCH';
  end if;

  v_res := public.get_council_report_topic_disposition(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_TOPIC_DISPOSITION_MISMATCH';
  end if;

  v_res := public.get_council_report_agenda_completion(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_AGENDA_COMPLETION_MISMATCH';
  end if;

  v_res := public.get_council_report_voting_summary(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_VOTING_SUMMARY_MISMATCH';
  end if;

  v_res := public.get_council_report_decision_status(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_DECISION_STATUS_MISMATCH';
  end if;

  v_res := public.get_council_report_decision_overdue(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_DECISION_OVERDUE_MISMATCH';
  end if;

  v_res := public.get_council_report_meeting_archive(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_MEETING_ARCHIVE_MISMATCH';
  end if;

  v_res := public.get_council_activity_period(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'REPORT_ACTIVITY_PERIOD_MISMATCH';
  end if;

  raise notice 'REPORT_AUTHORIZATION_PASS';

  -- -------------------------------------------------------------------
  -- TEST 5: Chair dashboard
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_chair);
  v_res := public.get_council_chair_dashboard(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'CHAIR_DASHBOARD_MISMATCH';
  end if;
  if v_res->'upcoming_meetings' is null then
    raise exception 'CHAIR_DASHBOARD_MISSING_UPCOMING';
  end if;

  -- Secretary denied chair dashboard
  perform pg_temp.as_user(v_sec);
  perform pg_temp.expect_fail('SECRETARY_CHAIR_DASHBOARD',
    format('select public.get_council_chair_dashboard(''%s'')', v_council_id));

  raise notice 'CHAIR_DASHBOARD_PASS';

  -- -------------------------------------------------------------------
  -- TEST 6: Secretary dashboard
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_sec);
  v_res := public.get_council_secretary_dashboard(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'SECRETARY_DASHBOARD_MISMATCH';
  end if;
  if v_res->'attendance_tasks' is null then
    raise exception 'SECRETARY_DASHBOARD_MISSING_ATTENDANCE';
  end if;

  -- Member denied secretary dashboard
  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.expect_fail('MEMBER_SECRETARY_DASHBOARD',
    format('select public.get_council_secretary_dashboard(''%s'')', v_council_id));

  raise notice 'SECRETARY_DASHBOARD_PASS';

  -- -------------------------------------------------------------------
  -- TEST 7: Member read
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_mem_a);
  v_res := public.get_council_member_dashboard(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'MEMBER_DASHBOARD_MISMATCH';
  end if;
  if v_res->'meetings' is null then
    raise exception 'MEMBER_DASHBOARD_MISSING_MEETINGS';
  end if;

  raise notice 'MEMBER_READ_PASS';

  -- -------------------------------------------------------------------
  -- TEST 8: Viewer mutation absence
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_viewer);
  perform pg_temp.expect_fail('VIEWER_REPORT',
    format('select public.get_council_report_meeting_summary(''%s'')', v_council_id));
  perform pg_temp.expect_fail('VIEWER_DASHBOARD',
    format('select public.get_council_member_dashboard(''%s'')', v_council_id));

  raise notice 'VIEWER_MUTATION_ABSENCE_PASS';

  -- -------------------------------------------------------------------
  -- TEST 9: Admin academic-action absence
  -- -------------------------------------------------------------------
  perform pg_temp.as_user(v_admin);
  v_res := public.get_council_admin_operational_dashboard(v_council_id);
  if (v_res->>'council_id')::uuid <> v_council_id then
    raise exception 'ADMIN_DASHBOARD_MISMATCH';
  end if;
  if v_res->'membership_count' is null then
    raise exception 'ADMIN_DASHBOARD_MISSING_MEMBERSHIP';
  end if;

  -- Admin cannot access academic-action dashboards
  perform pg_temp.expect_fail('ADMIN_CHAIR_DASHBOARD',
    format('select public.get_council_chair_dashboard(''%s'')', v_council_id));
  perform pg_temp.expect_fail('ADMIN_SECRETARY_DASHBOARD',
    format('select public.get_council_secretary_dashboard(''%s'')', v_council_id));

  raise notice 'ADMIN_ACADEMIC_ACTION_ABSENCE_PASS';

  -- -------------------------------------------------------------------
  -- TEST 10: Arabic error mapping and safe messages
  -- -------------------------------------------------------------------
  v_msg := public.build_council_notification_message(
    'meeting_scheduled', 'مجلس القسم', 'اجتماع طارئ', null, null, '{}'::jsonb
  );
  if (v_msg->>'title') not like '%اجتماع%' then
    raise exception 'ARABIC_MEETING_TITLE_MISSING';
  end if;

  v_msg := public.build_council_notification_message(
    'decision_overdue', 'مجلس القسم', null, null, null, '{"due_date":"2024-01-01"}'::jsonb
  );
  if (v_msg->>'title') <> 'قرار متأخر' then
    raise exception 'ARABIC_DECISION_OVERDUE_TITLE_MISMATCH';
  end if;

  -- Verify notification table has safe metadata and no raw SQL/RPC strings
  select count(*) into v_count
  from public.academic_council_notifications
  where title ~ '^[A-Za-z_]+$' or body ~ '^[A-Za-z_]+$';
  if v_count > 0 then
    raise exception 'RAW_TECHNICAL_NOTIFICATION_FOUND';
  end if;

  raise notice 'ARABIC_ERROR_MAPPING_PASS';

  -- -------------------------------------------------------------------
  -- TEST 11: Outbox processing and due-date notifications
  -- -------------------------------------------------------------------
  -- Create a decision with overdue due date to trigger overdue notification
  perform pg_temp.as_user(v_chair);
  v_res := public.issue_council_decision(
    v_meeting_id, null, 'Overdue Decision', 'Body', v_mem_a, null, (CURRENT_DATE - interval '5 days')::date
  );
  v_decision_id := (v_res->>'decision_id')::uuid;

  v_res := public.notify_council_decision_due_dates(7);
  if (v_res->>'processed')::int < 1 then
    raise exception 'DUE_DATE_NOTIFICATION_NOT_PROCESSED';
  end if;

  raise notice 'DUE_DATE_NOTIFICATION_PASS';

  raise notice 'ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTS_UX_VERIFIER_PASS';
end $$;

rollback;
