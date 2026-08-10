-- ACADEMIC-COUNCILS-C5-REV02 dedicated disposable PG17 verifier.
-- Proves fingerprint via extensions.digest under search_path=public, pg_temp,
-- chair-exact lock authority, bypass denials, and post-lock immutability.
-- Transactional: begin … rollback. LOCAL_TEST_ONLY.

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

-- 0) Defect contract + fix contract under pinned search_path
do $$
declare
  v_cfg text[];
  v_def text;
  v_hex text;
begin
  perform set_config('search_path', 'public, pg_temp', true);

  begin
    perform digest('x', 'sha256');
    raise exception 'DEFECT_NOT_REPRODUCED_UNQUALIFIED_DIGEST_SUCCEEDED';
  exception
    when undefined_function then
      if sqlstate <> '42883' then
        raise exception 'DEFECT_UNEXPECTED_SQLSTATE: %', sqlstate;
      end if;
      raise notice 'C5_REV02_DEFECT_REPRODUCED_42883';
  end;

  v_hex := encode(extensions.digest('x', 'sha256'), 'hex');
  if v_hex is null or length(v_hex) <> 64 or v_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'QUALIFIED_DIGEST_INVALID_HEX: %', v_hex;
  end if;
  raise notice 'C5_REV02_QUALIFIED_DIGEST_OK';

  select p.proconfig, pg_get_functiondef(p.oid)
  into v_cfg, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'approve_and_lock_council_minutes'
  order by p.oid
  limit 1;

  if not (coalesce(v_cfg, array[]::text[]) @> array['search_path=public, pg_temp']) then
    raise exception 'LOCK_RPC_SEARCH_PATH_DRIFT';
  end if;
  if position('extensions.digest(' in v_def) = 0 then
    raise exception 'LOCK_RPC_MISSING_EXTENSIONS_DIGEST';
  end if;
end $$;

-- 1) Fixture
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (id, name, council_type, created_by) values
    (v_council, 'C5 Rev02 Council', 'college', v_admin)
  on conflict do nothing;

  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, active_from, created_by
  ) values
    ('11000000-0000-0000-0000-000000000011', v_council, v_chair, 'chair', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000013', v_council, v_sec, 'secretary', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000014', v_council, v_mem_a, 'member', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000018', v_council, v_mem_b, 'member', true, current_date, v_admin),
    ('11000000-0000-0000-0000-000000000019', v_council, v_mem_c, 'member', true, current_date, v_admin)
  on conflict do nothing;
end $$;

-- 2) Lifecycle through minutes lock
do $$
declare
  v_council uuid := 'c1000000-0000-0000-0000-000000000001';
  v_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  v_dean uuid := 'a1000000-0000-0000-0000-000000000003';
  v_chair uuid := 'a1000000-0000-0000-0000-000000000011';
  v_sec uuid := 'a1000000-0000-0000-0000-000000000013';
  v_mem_a uuid := 'a1000000-0000-0000-0000-000000000014';
  v_mem_b uuid := 'a1000000-0000-0000-0000-000000000018';
  v_mem_c uuid := 'a1000000-0000-0000-0000-000000000019';
  v_meeting uuid;
  v_topic uuid;
  v_item uuid;
  v_res jsonb;
  v_fp text;
  v_fp2 text;
  v_body text := 'C5 Rev02 locked minutes body fixture';
begin
  perform pg_temp.as_user(v_chair);
  perform public.council_approve_quorum_policy(
    v_council, 'ratio'::public.academic_council_quorum_threshold_kind, null, 3, 5
  );

  v_res := public.council_schedule_meeting(
    v_council,
    'C5 Rev02 Meeting',
    now() + interval '2 days',
    'Hall A',
    now() - interval '1 hour',
    now() + interval '1 day'
  );
  v_meeting := (v_res->>'meeting_id')::uuid;

  perform public.council_transition_meeting(
    v_meeting, 'scheduled', 'intake_open', jsonb_build_object('via', 'c5_rev02')
  );

  perform pg_temp.as_user(v_mem_a);
  v_res := public.council_submit_topic(v_council, v_meeting, 'Topic A', 'Body A', 'academic');
  v_topic := (v_res->>'topic_id')::uuid;

  perform pg_temp.as_user(v_sec);
  perform public.council_review_topic(v_topic, 'under_review');
  perform pg_temp.as_user(v_chair);
  perform public.council_review_topic(v_topic, 'accepted_for_agenda');
  perform public.council_transition_meeting(
    v_meeting, 'intake_open', 'intake_closed', jsonb_build_object('via', 'c5_rev02')
  );

  perform pg_temp.as_user(v_sec);
  v_res := public.council_add_topic_to_agenda(v_meeting, v_topic, 1);
  v_item := (v_res->>'agenda_item_id')::uuid;

  perform pg_temp.as_user(v_chair);
  perform public.council_finalize_meeting_agenda(v_meeting);
  perform public.council_transition_meeting(
    v_meeting, 'intake_closed', 'agenda_ready', jsonb_build_object('via', 'c5_rev02')
  );

  perform pg_temp.as_user(v_sec);
  perform public.record_council_meeting_attendance(v_meeting, jsonb_build_array(
    jsonb_build_object('user_id', v_chair, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_sec, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_a, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_b, 'attendance_state', 'present'),
    jsonb_build_object('user_id', v_mem_c, 'attendance_state', 'absent')
  ));
  perform pg_temp.as_user(v_chair);
  perform public.evaluate_council_meeting_quorum(v_meeting);
  perform public.finalize_council_meeting_attendance(v_meeting);

  v_res := public.open_council_session(v_meeting);
  perform public.start_agenda_item_discussion(v_item);
  perform public.open_agenda_item_vote(v_item);
  perform public.cast_council_vote(v_item, 'yes');
  perform pg_temp.as_user(v_sec);
  perform public.cast_council_vote(v_item, 'yes');
  perform pg_temp.as_user(v_mem_a);
  perform public.cast_council_vote(v_item, 'yes');
  perform pg_temp.as_user(v_mem_b);
  perform public.cast_council_vote(v_item, 'yes');
  perform pg_temp.as_user(v_chair);
  perform public.close_agenda_item_vote(v_item);
  perform public.calculate_agenda_item_result(v_item);
  perform public.resolve_agenda_item(v_item, 'Approved');
  perform public.close_council_session(v_meeting);

  perform pg_temp.as_user(v_sec);
  perform public.draft_council_minutes(v_meeting, v_body);
  perform public.submit_council_minutes_for_review(v_meeting);
  raise notice 'C5_REV02_DRAFT_REVIEW_PASS';

  perform pg_temp.expect_fail(
    'NON_CHAIR_LOCK',
    format($q$select public.approve_and_lock_council_minutes('%s')$q$, v_meeting)
  );
  perform pg_temp.as_user(v_admin);
  perform pg_temp.expect_fail(
    'ADMIN_BYPASS_LOCK',
    format($q$select public.approve_and_lock_council_minutes('%s')$q$, v_meeting)
  );
  perform pg_temp.as_user(v_dean);
  perform pg_temp.expect_fail(
    'DEAN_BYPASS_LOCK',
    format($q$select public.approve_and_lock_council_minutes('%s')$q$, v_meeting)
  );
  perform pg_temp.reset_role();
  insert into auth.users(id) values ('a1000000-0000-0000-0000-000000000020')
  on conflict do nothing;
  insert into public.user_roles(user_id, role) values
    ('a1000000-0000-0000-0000-000000000020', 'registrar')
  on conflict do nothing;
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000020'::uuid);
  perform pg_temp.expect_fail(
    'REGISTRAR_BYPASS_LOCK',
    format($q$select public.approve_and_lock_council_minutes('%s')$q$, v_meeting)
  );
  perform pg_temp.as_user(v_mem_a);
  perform pg_temp.expect_fail(
    'MEMBER_BYPASS_LOCK',
    format($q$select public.approve_and_lock_council_minutes('%s')$q$, v_meeting)
  );
  raise notice 'C5_REV02_AUTHORIZATION_MATRIX_PASS';

  perform pg_temp.as_user(v_chair);
  v_res := public.approve_and_lock_council_minutes(v_meeting, v_body);
  if (v_res->>'is_locked')::boolean is not true then
    raise exception 'LOCK_FAILED: %', v_res;
  end if;
  v_fp := v_res->>'fingerprint';
  if v_fp is null or length(v_fp) <> 64 or v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'FINGERPRINT_INVALID: %', v_fp;
  end if;
  select fingerprint into v_fp2 from public.academic_council_minutes where meeting_id = v_meeting;
  if v_fp2 is distinct from v_fp then
    raise exception 'FINGERPRINT_PERSIST_MISMATCH';
  end if;
  raise notice 'C5_REV02_LOCK_FINGERPRINT_PASS:%', v_fp;

  perform pg_temp.as_user(v_sec);
  perform pg_temp.expect_fail(
    'LOCKED_MINUTES_UPDATE',
    format($q$select public.draft_council_minutes('%s','tamper')$q$, v_meeting)
  );
  perform pg_temp.as_user(v_admin);
  perform pg_temp.expect_fail(
    'LOCKED_MINUTES_DELETE',
    format($q$delete from public.academic_council_minutes where meeting_id = '%s'$q$, v_meeting)
  );
  perform pg_temp.expect_fail(
    'LOCKED_AGENDA_MUTATION',
    format($q$update public.academic_council_agenda_items set title = 'x' where id = '%s'$q$, v_item)
  );
  perform pg_temp.expect_fail(
    'LOCKED_VOTE_MUTATION',
    format($q$update public.academic_council_votes set vote_value = 'no' where agenda_item_id = '%s'$q$, v_item)
  );
  perform pg_temp.expect_fail(
    'LOCKED_VOTE_RESULT_MUTATION',
    format($q$update public.academic_council_vote_results set outcome = 'failed' where agenda_item_id = '%s'$q$, v_item)
  );
  raise notice 'C5_REV02_LOCK_IMMUTABILITY_PASS';
end $$;

do $$
begin
  raise notice 'COUNCILS_C5_REV02_DIGEST_VERIFIER_PASS';
end $$;

rollback;
