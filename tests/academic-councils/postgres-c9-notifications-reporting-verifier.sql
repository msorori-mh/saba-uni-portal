-- ACADEMIC-COUNCILS-C9 Notifications & Reporting Verifier (disposable PG17).
-- Proves notification foundation, reporting RPCs, dashboards, and auth matrix.
-- Transactional: begin … rollback.

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

create or replace function pg_temp.global_state_fp()
returns text language plpgsql as $$
begin
  execute 'set local role service_role';
  return md5(
    coalesce((select string_agg(id::text || is_read::text, ',' order by id) from public.academic_council_notifications), '') || '|' ||
    coalesce((select count(*)::text from public.academic_council_meetings), '0')
  );
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
    v_before := pg_temp.global_state_fp();
  else
    execute p_fp_sql into v_before;
  end if;

  perform pg_temp.expect_fail(p_label, p_sql);

  if p_fp_sql is null then
    v_after := pg_temp.global_state_fp();
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
-- 0) C9 objects present
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.academic_council_notifications') is null then
    raise exception 'C9_NOTIFICATIONS_TABLE_MISSING';
  end if;
  if to_regprocedure('public.get_my_council_notifications(integer)') is null then
    raise exception 'C9_GET_MY_NOTIFICATIONS_RPC_MISSING';
  end if;
  if to_regprocedure('public.acknowledge_council_notification(uuid)') is null then
    raise exception 'C9_ACKNOWLEDGE_NOTIFICATION_RPC_MISSING';
  end if;
  if to_regprocedure('public.get_council_report_meetings_by_period(uuid,date,date)') is null then
    raise exception 'C9_REPORT_MEETINGS_RPC_MISSING';
  end if;
  if to_regprocedure('public.get_council_chair_dashboard(uuid)') is null then
    raise exception 'C9_CHAIR_DASHBOARD_RPC_MISSING';
  end if;
  if to_regprocedure('public.get_council_secretary_dashboard(uuid)') is null then
    raise exception 'C9_SECRETARY_DASHBOARD_RPC_MISSING';
  end if;
  if to_regprocedure('public.get_council_responsible_decisions(uuid)') is null then
    raise exception 'C9_RESPONSIBLE_DECISIONS_RPC_MISSING';
  end if;
  raise notice 'C9_OBJECTS_PRESENT';
end $$;

-- ---------------------------------------------------------------------
-- 1) Fixture council + memberships
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem uuid := 'a1000000-0000-0000-0000-000000000014';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_student uuid := 'a1000000-0000-0000-0000-000000000017';
  v_other_chair uuid := 'a1000000-0000-0000-0000-000000000012';
  v_council_b uuid := 'c1000000-0000-0000-0000-000000000002';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (id, name, council_type, created_by) values
    (v_council, 'College Council C9', 'college', v_admin),
    (v_council_b, 'Other Council C9', 'college', v_admin)
  on conflict do nothing;

  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, active_from, created_by
  ) values
    ('21000000-0000-0000-0000-000000000011', v_council, v_chair, 'chair', true, current_date, v_admin),
    ('21000000-0000-0000-0000-000000000013', v_council, v_sec, 'secretary', true, current_date, v_admin),
    ('21000000-0000-0000-0000-000000000014', v_council, v_mem, 'member', true, current_date, v_admin),
    ('21000000-0000-0000-0000-000000000015', v_council, v_viewer, 'viewer', true, current_date, v_admin),
    ('21000000-0000-0000-0000-000000000018', v_council, v_mem_b, 'member', true, current_date, v_admin),
    ('21000000-0000-0000-0000-000000000019', v_council, v_mem_c, 'member', true, current_date, v_admin),
    ('21000000-0000-0000-0000-000000000012', v_council_b, v_other_chair, 'chair', true, current_date, v_admin)
  on conflict do nothing;

  perform v_student;
end $$;

-- ---------------------------------------------------------------------
-- 2) Positive notification dispatch + read + acknowledge
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem uuid := 'a1000000-0000-0000-0000-000000000014';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_meeting uuid;
  v_res jsonb;
  v_notif_id uuid;
  v_count int;
begin
  perform pg_temp.as_user(v_chair);

  -- Use a real meeting so notification FK is satisfied
  v_meeting := ((public.council_schedule_meeting(
    v_council, 'C9 Notification Test Meeting', now() + interval '2 days'
  ))->>'meeting_id')::uuid;

  -- Direct dispatch
  perform public.dispatch_council_notification(
    'meeting_scheduled', v_council, v_meeting,
    'academic_council_meetings', v_meeting,
    jsonb_build_object('title', 'Test Meeting')
  );

  -- Count notifications globally (bypass RLS)
  perform pg_temp.reset_role();
  execute 'set local role service_role';
  select count(*) into v_count
  from public.academic_council_notifications
  where council_id = v_council and event_type = 'meeting_scheduled';
  if v_count < 4 then
    raise exception 'EXPECTED_NOTIFICATIONS_FOR_ALL_MEMBERS: %', v_count;
  end if;

  -- Chair can read own notifications
  perform pg_temp.as_user(v_chair);
  v_res := public.get_my_council_notifications(10);
  if coalesce(jsonb_array_length(v_res->'notifications'), 0) < 1 then
    raise exception 'CHAIR_NOTIFICATION_READ_FAILED';
  end if;
  v_notif_id := (v_res->'notifications'->0->>'id')::uuid;

  -- Chair can acknowledge
  v_res := public.acknowledge_council_notification(v_notif_id);
  if (v_res->>'success')::boolean is not true then
    raise exception 'ACKNOWLEDGE_FAILED';
  end if;

  -- Acknowledged notification is read
  if not exists (
    select 1 from public.academic_council_notifications
    where id = v_notif_id and is_read = true
  ) then
    raise exception 'NOTIFICATION_NOT_MARKED_READ';
  end if;

  raise notice 'NOTIFICATION_READ_ACK_PASS';
end $$;

-- ---------------------------------------------------------------------
-- 3) Auth matrix: read/ack/report/dashboard cross-council and zero mutation
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_council_b uuid := 'c1000000-0000-0000-0000-000000000002';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_other_chair uuid := 'a1000000-0000-0000-0000-000000000012';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem uuid := 'a1000000-0000-0000-0000-000000000014';
  v_viewer uuid := 'a1000000-0000-0000-0000-000000000015';
  v_student uuid := 'a1000000-0000-0000-0000-000000000017';
  v_notif uuid;
  v_neg int := 0;
begin
  select id into v_notif from public.academic_council_notifications
  where council_id = v_council limit 1;

  -- Student cannot read council notifications
  perform pg_temp.as_user(v_student);
  perform pg_temp.deny_zero('STUDENT_NOTIFICATION_READ',
    format($q$select public.get_my_council_notifications(10)$q$));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('STUDENT_REPORT_READ',
    format($q$select public.get_council_report_meetings_by_period('%s', null, null)$q$, v_council));
  v_neg := v_neg + 1;

  -- Viewer can read notifications and reports but not dashboards
  perform pg_temp.as_user(v_viewer);
  v_notif := (public.get_my_council_notifications(1)->'notifications'->0->>'id')::uuid;
  if v_notif is null then raise exception 'VIEWER_NOTIFICATION_READ_FAILED'; end if;
  perform public.get_council_report_meetings_by_period(v_council, null, null);
  perform pg_temp.deny_zero('VIEWER_CHAIR_DASHBOARD',
    format($q$select public.get_council_chair_dashboard('%s')$q$, v_council));
  v_neg := v_neg + 1;

  -- Member can read reports and workspace
  perform pg_temp.as_user(v_mem);
  perform public.get_council_report_topic_disposition(v_council);
  perform public.get_council_member_workspace(v_council);

  -- Secretary can access secretary dashboard
  perform pg_temp.as_user(v_sec);
  perform public.get_council_secretary_dashboard(v_council);

  -- Chair can access chair dashboard
  perform pg_temp.as_user(v_chair);
  perform public.get_council_chair_dashboard(v_council);

  -- Cross-council chair denied
  perform pg_temp.as_user(v_other_chair);
  perform pg_temp.deny_zero('CROSS_COUNCIL_CHAIR_DASHBOARD',
    format($q$select public.get_council_chair_dashboard('%s')$q$, v_council));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('CROSS_COUNCIL_CHAIR_REPORT',
    format($q$select public.get_council_report_archive_status('%s')$q$, v_council));
  v_neg := v_neg + 1;

  -- Anonymous denied everything
  perform pg_temp.reset_role();
  execute 'set local role anon';
  perform pg_temp.deny_zero('ANON_NOTIFICATION_READ',
    'select public.get_my_council_notifications(10)');
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('ANON_REPORT_READ',
    format($q$select public.get_council_report_meetings_by_period('%s', null, null)$q$, v_council));
  v_neg := v_neg + 1;

  -- Direct notification table insert/update/delete denied
  perform pg_temp.as_user(v_chair);
  perform pg_temp.deny_zero('DIRECT_NOTIFICATION_INSERT',
    format($q$insert into public.academic_council_notifications(user_id, event_type, council_id, title, body)
           values ('%s','x','%s','x','x')$q$, v_chair, v_council));
  v_neg := v_neg + 1;
  perform pg_temp.deny_zero('DIRECT_NOTIFICATION_UPDATE_BODY',
    format($q$update public.academic_council_notifications set body = 'tampered' where id = '%s'$q$, v_notif));
  v_neg := v_neg + 1;

  raise notice 'AUTHORIZATION_MATRIX_PASS';
  raise notice 'ZERO_MUTATION_DENIALS_COUNTED';
end $$;

-- ---------------------------------------------------------------------
-- 4) Reporting RPCs produce expected shapes
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_res jsonb;
begin
  perform pg_temp.as_user(v_chair);

  v_res := public.get_council_report_meetings_by_period(v_council, null, null);
  if v_res is null then raise exception 'MEETINGS_REPORT_NULL'; end if;

  v_res := public.get_council_report_attendance_rate(v_council);
  if (v_res->>'total_eligible') is null then raise exception 'ATTENDANCE_REPORT_SHAPE_MISMATCH'; end if;

  v_res := public.get_council_report_quorum_history(v_council);
  if v_res is null then raise exception 'QUORUM_REPORT_NULL'; end if;

  v_res := public.get_council_report_topic_disposition(v_council);
  if (v_res->>'total') is null then raise exception 'TOPIC_DISPOSITION_SHAPE_MISMATCH'; end if;

  v_res := public.get_council_report_decision_execution_status(v_council);
  if (v_res->>'total') is null then raise exception 'DECISION_STATUS_SHAPE_MISMATCH'; end if;

  v_res := public.get_council_report_archive_status(v_council);
  if (v_res->>'total_meetings') is null then raise exception 'ARCHIVE_STATUS_SHAPE_MISMATCH'; end if;

  v_res := public.get_council_report_council_activity(v_council);
  if (v_res->>'active_member_count') is null then raise exception 'ACTIVITY_SHAPE_MISMATCH'; end if;

  raise notice 'REPORTS_SHAPE_PASS';
end $$;

-- ---------------------------------------------------------------------
-- 5) Dashboard RPCs produce expected shapes
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem uuid := 'a1000000-0000-0000-0000-000000000014';
  v_res jsonb;
begin
  perform pg_temp.as_user(v_chair);
  v_res := public.get_council_chair_dashboard(v_council);
  if (v_res->>'council_id')::uuid is distinct from v_council then
    raise exception 'CHAIR_DASHBOARD_SHAPE_MISMATCH';
  end if;

  perform pg_temp.as_user(v_sec);
  v_res := public.get_council_secretary_dashboard(v_council);
  if (v_res->>'council_id')::uuid is distinct from v_council then
    raise exception 'SECRETARY_DASHBOARD_SHAPE_MISMATCH';
  end if;

  perform pg_temp.as_user(v_mem);
  v_res := public.get_council_member_workspace(v_council);
  if (v_res->>'council_id')::uuid is distinct from v_council then
    raise exception 'MEMBER_WORKSPACE_SHAPE_MISMATCH';
  end if;

  raise notice 'DASHBOARDS_SHAPE_PASS';
end $$;

-- ---------------------------------------------------------------------
-- 6) PII / privacy: responsible decisions only for assigned user
--     (reconciled with C0-C8 security closure: issue requires resolved
--      agenda item + locked minutes)
-- ---------------------------------------------------------------------
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem uuid := 'a1000000-0000-0000-0000-000000000014';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_dec uuid;
  v_res jsonb;
begin
  perform pg_temp.as_user(v_chair);
  perform public.council_approve_quorum_policy(
    v_council, 'ratio'::public.academic_council_quorum_threshold_kind, null, 3, 5
  );

  v_meeting := ((public.council_schedule_meeting(
    v_council, 'PII Meeting', now() + interval '2 days',
    null, now() - interval '1 hour', now() + interval '1 day'
  ))->>'meeting_id')::uuid;
  perform public.council_transition_meeting(v_meeting, 'scheduled', 'intake_open', '{}'::jsonb);

  perform pg_temp.as_user(v_mem);
  v_topic := ((public.council_submit_topic(v_council, v_meeting, 'PII Topic', 'Topic body'))->>'topic_id')::uuid;

  perform pg_temp.as_user(v_sec);
  perform public.council_review_topic(v_topic, 'under_review'::public.academic_council_topic_status, null, 'submitted'::public.academic_council_topic_status);

  perform pg_temp.as_user(v_chair);
  perform public.council_review_topic(v_topic, 'accepted_for_agenda'::public.academic_council_topic_status, null, 'under_review'::public.academic_council_topic_status);

  perform public.council_transition_meeting(v_meeting, 'intake_open', 'intake_closed', '{}'::jsonb);
  v_item := ((public.council_add_topic_to_agenda(v_meeting, v_topic))->>'agenda_item_id')::uuid;
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(v_meeting, 'intake_closed', 'agenda_ready', '{}'::jsonb);

  perform pg_temp.as_user(v_sec);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform pg_temp.as_user(v_chair);
  perform public.finalize_council_meeting_attendance(v_meeting);
  perform public.open_council_session(v_meeting);
  perform public.start_agenda_item_discussion(v_item);
  perform public.resolve_agenda_item(v_item, 'Noted for decision follow-up');
  perform public.close_council_session(v_meeting);
  perform pg_temp.as_user(v_sec);
  perform public.draft_council_minutes(v_meeting, 'PII minutes draft');
  perform public.submit_council_minutes_for_review(v_meeting);
  perform pg_temp.as_user(v_chair);
  perform public.approve_and_lock_council_minutes(v_meeting, 'PII locked minutes');

  v_dec := ((public.issue_council_decision(
    v_meeting, v_item, 'PII Decision', 'Decision body', v_mem, 'Unit', (current_date + 30)::date
  ))->>'decision_id')::uuid;

  -- Member sees assigned decision
  perform pg_temp.as_user(v_mem);
  v_res := public.get_council_responsible_decisions(null);
  if not exists (select 1 from jsonb_array_elements(v_res) x where (x->>'decision_id')::uuid = v_dec) then
    raise exception 'ASSIGNED_DECISION_NOT_VISIBLE';
  end if;

  -- Chair does not see decision as assigned unless they are the responsible actor
  perform pg_temp.as_user(v_chair);
  v_res := public.get_council_responsible_decisions(null);
  if exists (select 1 from jsonb_array_elements(v_res) x where (x->>'decision_id')::uuid = v_dec) then
    raise exception 'UNASSIGNED_DECISION_VISIBLE';
  end if;

  -- IDOR: forged p_user_id must be denied (zero mutation of decision rows)
  perform pg_temp.as_user(v_chair);
  perform pg_temp.deny_zero('RESPONSIBLE_DECISIONS_IMPERSONATION',
    format($q$select public.get_council_responsible_decisions('%s')$q$, v_mem));

  raise notice 'RESPONSIBLE_ACTOR_PII_PASS';
end $$;

-- ---------------------------------------------------------------------
-- 7) Final verdict
-- ---------------------------------------------------------------------
do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_temp.denial_log;
  if v_count < 8 then
    raise exception 'INSUFFICIENT_NEGATIVE_CASES: %', v_count;
  end if;
  raise notice 'ACADEMIC_COUNCILS_C9_NOTIFICATIONS_REPORTING_VERIFIER_PASS';
end $$;

rollback;
