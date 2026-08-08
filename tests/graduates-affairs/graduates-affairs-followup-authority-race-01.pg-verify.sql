-- Follow-up authority-loss concurrency verifier (dblink + row-lock barrier).
-- Chain: authorization-04.pg-setup + FOUNDATION + COMPLETION + AUTH-04 + this file.
-- Proves mutating follow-up RPCs serialize against concurrent authority loss
-- via FOR SHARE on exact authorizing assignment/profile(/department) rows.
-- Directions covered: forward (mutation holds → revoke waits) and reverse
-- (revoke commits → mutation denies with ZERO MUTATION).

CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE IF NOT EXISTS public._ga_followup_auth_race_gate (
  id int PRIMARY KEY,
  note text NOT NULL DEFAULT 'barrier'
);
INSERT INTO public._ga_followup_auth_race_gate(id, note)
VALUES (1, 'followup-authority-race')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._ga_followup_auth_race_barrier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1 FROM public._ga_followup_auth_race_gate WHERE id = 1 FOR SHARE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS _ga_followup_auth_race_barrier ON public.graduate_followups;
CREATE TRIGGER _ga_followup_auth_race_barrier
  BEFORE INSERT OR UPDATE ON public.graduate_followups
  FOR EACH ROW EXECUTE FUNCTION public._ga_followup_auth_race_barrier();

-- Seed approved records for race scenarios.
INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES
  ('f1000000-0000-4000-8000-0000000000a1',
   '20000000-0000-4000-8000-00000000000a',
   'registrar_approved_decision', 'REG-FOLLOWUP-RACE-A', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', '{"seed":"followup-race-a"}',
   repeat('1', 64)),
  ('f1000000-0000-4000-8000-0000000000b1',
   '20000000-0000-4000-8000-00000000000b',
   'registrar_approved_decision', 'REG-FOLLOWUP-RACE-B', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', '{"seed":"followup-race-b"}',
   repeat('2', 64))
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE followup_race_ids (key text PRIMARY KEY, id uuid NOT NULL);


CREATE OR REPLACE FUNCTION public._ga_race_reopen_followup(
  p_record_id uuid,
  p_assignee uuid,
  p_purpose text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  ALTER TABLE public.graduate_followups DISABLE TRIGGER _ga_followup_auth_race_barrier;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text,
    true
  );
  FOR v_id IN
    SELECT id FROM public.graduate_followups
    WHERE graduate_record_id = p_record_id AND state IN ('open', 'in_progress')
  LOOP
    PERFORM public.graduate_affairs_transition_followup(v_id, 'cancelled');
  END LOOP;
  v_id := public.graduate_affairs_create_followup(p_record_id, p_assignee, p_purpose);
  ALTER TABLE public.graduate_followups ENABLE TRIGGER _ga_followup_auth_race_barrier;
  RETURN v_id;
END;
$$;


DO $$
DECLARE
  v_record_a uuid;
  v_followup uuid;
BEGIN
  SELECT id INTO v_record_a
  FROM public.graduate_records
  WHERE official_decision_id = 'f1000000-0000-4000-8000-0000000000a1';
  IF v_record_a IS NULL THEN
    v_record_a := public.create_graduate_record_from_official_decision(
      'f1000000-0000-4000-8000-0000000000a1'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.graduate_records
    WHERE official_decision_id = 'f1000000-0000-4000-8000-0000000000b1'
  ) THEN
    PERFORM public.create_graduate_record_from_official_decision(
      'f1000000-0000-4000-8000-0000000000b1'
    );
  END IF;

  UPDATE public.request_processing_assignments
  SET is_active = true, starts_at = NULL, ends_at = NULL
  WHERE id = '80000000-0000-4000-8000-000000000002';
  UPDATE public.staff_profiles
  SET status = 'active'
  WHERE id = '50000000-0000-4000-8000-00000000000d';
  INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
  VALUES (
    '50000000-0000-4000-8000-00000000000d',
    '30000000-0000-4000-8000-000000000001'
  )
  ON CONFLICT DO NOTHING;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text,
    true
  );
  ALTER TABLE public.graduate_followups DISABLE TRIGGER _ga_followup_auth_race_barrier;
  FOR v_followup IN
    SELECT id FROM public.graduate_followups
    WHERE graduate_record_id = v_record_a AND state IN ('open', 'in_progress')
  LOOP
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'cancelled');
  END LOOP;
  v_followup := public.graduate_affairs_create_followup(
    v_record_a,
    '10000000-0000-4000-8000-00000000000d',
    'authority_race_followup'
  );
  ALTER TABLE public.graduate_followups ENABLE TRIGGER _ga_followup_auth_race_barrier;

  INSERT INTO followup_race_ids VALUES
    ('record_a', v_record_a),
    ('followup', v_followup);
END;
$$;

-- =====================================================================
-- R1 FORWARD / ASSIGNMENT_REVOCATION:
-- mutation acquires authority FOR SHARE → revoke blocks → mutation commits
-- while authority still valid → revoke applies only after mutation commits.
-- =====================================================================
DO $$
DECLARE
  v_conn text := format('dbname=%s user=postgres', current_database());
  v_followup uuid := (SELECT id FROM followup_race_ids WHERE key = 'followup');
  v_specialist text := '10000000-0000-4000-8000-00000000000d';
  v_assignment uuid := '80000000-0000-4000-8000-000000000002';
  v_busy int;
  v_waited int := 0;
  v_blocked boolean := false;
  v_state text;
  v_active boolean;
  v_events_before int;
  v_events_after int;
BEGIN
  SELECT count(*) INTO v_events_before
  FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup
    AND event_type = 'graduate_followup_transitioned';

  PERFORM dblink_connect('fu_ctrl', v_conn);
  PERFORM dblink_connect('fu_mut', v_conn);
  PERFORM dblink_connect('fu_rev', v_conn);

  PERFORM dblink_exec('fu_ctrl', 'BEGIN');
  PERFORM dblink_exec(
    'fu_ctrl',
    $cmd$DO $do$ BEGIN PERFORM 1 FROM public._ga_followup_auth_race_gate WHERE id = 1 FOR UPDATE; END $do$;$cmd$
  );

  PERFORM dblink_exec('fu_mut', 'BEGIN');
  PERFORM dblink_exec('fu_mut', format(
    $cmd$DO $do$ BEGIN PERFORM set_config('request.jwt.claims', %L, true); END $do$;$cmd$,
    json_build_object('sub', v_specialist, 'role', 'authenticated')::text
  ));
  PERFORM dblink_send_query('fu_mut', format(
    $cmd$SELECT public.graduate_affairs_transition_followup(%L::uuid, 'in_progress', NULL, now() + interval '1 day')::text$cmd$,
    v_followup
  ));

  PERFORM pg_sleep(0.25);
  SELECT dblink_is_busy('fu_mut') INTO v_busy;
  IF v_busy <> 1 THEN
    RAISE EXCEPTION 'R1 FORWARD: mutation did not block on follow-up barrier after authority lock';
  END IF;

  -- Revocation must block on the mutation's FOR SHARE of the assignment row.
  PERFORM dblink_exec('fu_rev', 'BEGIN');
  PERFORM dblink_exec('fu_rev', 'SET LOCAL lock_timeout = ''250ms''');
  BEGIN
    PERFORM dblink_exec('fu_rev', format(
      'UPDATE public.request_processing_assignments SET is_active = false WHERE id = %L::uuid',
      v_assignment
    ));
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%lock timeout%'
       OR SQLERRM ILIKE '%canceling statement due to lock timeout%' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'R1 FORWARD: assignment revocation did not block on authority FOR SHARE';
  END IF;
  PERFORM dblink_exec('fu_rev', 'ROLLBACK');

  -- Release barrier; mutation completes while still holding authority share lock.
  PERFORM dblink_exec('fu_ctrl', 'COMMIT');
  LOOP
    SELECT dblink_is_busy('fu_mut') INTO v_busy;
    EXIT WHEN v_busy = 0;
    v_waited := v_waited + 1;
    IF v_waited > 200 THEN
      RAISE EXCEPTION 'R1 FORWARD: mutation did not complete after barrier release';
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  PERFORM * FROM dblink_get_result('fu_mut') AS t(result text);
  BEGIN
    PERFORM * FROM dblink_get_result('fu_mut') AS t(result text);
  EXCEPTION WHEN others THEN
    NULL;
  END;
  PERFORM dblink_exec('fu_mut', 'COMMIT');

  SELECT state::text INTO v_state FROM public.graduate_followups WHERE id = v_followup;
  IF v_state <> 'in_progress' THEN
    RAISE EXCEPTION 'R1 FORWARD: expected in_progress after serialized mutation, got %', v_state;
  END IF;

  -- After mutation commits, revocation proceeds.
  PERFORM dblink_exec('fu_rev', 'BEGIN');
  PERFORM dblink_exec('fu_rev', format(
    'UPDATE public.request_processing_assignments SET is_active = false WHERE id = %L::uuid',
    v_assignment
  ));
  PERFORM dblink_exec('fu_rev', 'COMMIT');

  SELECT is_active INTO v_active
  FROM public.request_processing_assignments WHERE id = v_assignment;
  IF v_active THEN
    RAISE EXCEPTION 'R1 FORWARD: assignment should be inactive after post-commit revoke';
  END IF;

  SELECT count(*) INTO v_events_after
  FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup
    AND event_type = 'graduate_followup_transitioned';
  IF v_events_after <> v_events_before + 1 THEN
    RAISE EXCEPTION 'R1 FORWARD: expected exactly one transition audit event';
  END IF;

  PERFORM dblink_disconnect('fu_ctrl');
  PERFORM dblink_disconnect('fu_mut');
  PERFORM dblink_disconnect('fu_rev');
  RAISE NOTICE 'ASSIGNMENT_REVOCATION FORWARD: PASS';
END;
$$;

-- =====================================================================
-- R1 REVERSE / ASSIGNMENT_REVOCATION:
-- revoke commits first → transition denies → ZERO MUTATION.
-- =====================================================================
DO $$
DECLARE
  v_followup uuid := (SELECT id FROM followup_race_ids WHERE key = 'followup');
  v_state_before text;
  v_state_after text;
  v_events_before int;
  v_events_after int;
  v_fp_before jsonb;
  v_fp_after jsonb;
BEGIN
  -- Restore assignment, reset follow-up to open for reverse probe.
  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = '80000000-0000-4000-8000-000000000002';
  v_followup := public._ga_race_reopen_followup(
    (SELECT id FROM followup_race_ids WHERE key = 'record_a'),
    '10000000-0000-4000-8000-00000000000d'::uuid,
    'authority_race_followup'
  );
  INSERT INTO followup_race_ids VALUES ('followup', v_followup)
  ON CONFLICT (key) DO UPDATE SET id = EXCLUDED.id;

  SELECT state::text INTO v_state_before FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_before FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;
  SELECT jsonb_build_object(
    'state', state, 'outcome', outcome, 'next_action_at', next_action_at,
    'assignee_user_id', assignee_user_id, 'purpose_code', purpose_code
  ) INTO v_fp_before
  FROM public.graduate_followups WHERE id = v_followup;

  UPDATE public.request_processing_assignments
  SET is_active = false
  WHERE id = '80000000-0000-4000-8000-000000000002';

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'R1 REVERSE: transition must deny after revocation';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN
      RAISE;
    END IF;
  END;

  SELECT state::text INTO v_state_after FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_after FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;
  SELECT jsonb_build_object(
    'state', state, 'outcome', outcome, 'next_action_at', next_action_at,
    'assignee_user_id', assignee_user_id, 'purpose_code', purpose_code
  ) INTO v_fp_after
  FROM public.graduate_followups WHERE id = v_followup;

  IF v_state_after <> v_state_before OR v_events_after <> v_events_before OR v_fp_after <> v_fp_before THEN
    RAISE EXCEPTION 'R1 REVERSE: ZERO MUTATION violated';
  END IF;
  RAISE NOTICE 'ASSIGNMENT_REVOCATION REVERSE: PASS';
END;
$$;

-- =====================================================================
-- R2 ASSIGNMENT_EXPIRY (forward + reverse)
-- =====================================================================
DO $$
DECLARE
  v_followup uuid;
BEGIN
  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = '80000000-0000-4000-8000-000000000002';
  v_followup := public._ga_race_reopen_followup(
    (SELECT id FROM followup_race_ids WHERE key = 'record_a'),
    '10000000-0000-4000-8000-00000000000d'::uuid,
    'authority_race_followup'
  );
  INSERT INTO followup_race_ids VALUES ('followup', v_followup)
  ON CONFLICT (key) DO UPDATE SET id = EXCLUDED.id;
END;
$$;

DO $$
DECLARE
  v_conn text := format('dbname=%s user=postgres', current_database());
  v_followup uuid := (SELECT id FROM followup_race_ids WHERE key = 'followup');
  v_specialist text := '10000000-0000-4000-8000-00000000000d';
  v_assignment uuid := '80000000-0000-4000-8000-000000000002';
  v_busy int;
  v_waited int := 0;
  v_blocked boolean := false;
  v_state text;
BEGIN
  PERFORM dblink_connect('ex_ctrl', v_conn);
  PERFORM dblink_connect('ex_mut', v_conn);
  PERFORM dblink_connect('ex_rev', v_conn);

  PERFORM dblink_exec('ex_ctrl', 'BEGIN');
  PERFORM dblink_exec(
    'ex_ctrl',
    $cmd$DO $do$ BEGIN PERFORM 1 FROM public._ga_followup_auth_race_gate WHERE id = 1 FOR UPDATE; END $do$;$cmd$
  );
  PERFORM dblink_exec('ex_mut', 'BEGIN');
  PERFORM dblink_exec('ex_mut', format(
    $cmd$DO $do$ BEGIN PERFORM set_config('request.jwt.claims', %L, true); END $do$;$cmd$,
    json_build_object('sub', v_specialist, 'role', 'authenticated')::text
  ));
  PERFORM dblink_send_query('ex_mut', format(
    $cmd$SELECT public.graduate_affairs_transition_followup(%L::uuid, 'in_progress')::text$cmd$,
    v_followup
  ));
  PERFORM pg_sleep(0.25);
  SELECT dblink_is_busy('ex_mut') INTO v_busy;
  IF v_busy <> 1 THEN
    RAISE EXCEPTION 'R2 FORWARD: mutation not blocked on barrier';
  END IF;

  PERFORM dblink_exec('ex_rev', 'BEGIN');
  PERFORM dblink_exec('ex_rev', 'SET LOCAL lock_timeout = ''250ms''');
  BEGIN
    PERFORM dblink_exec('ex_rev', format(
      'UPDATE public.request_processing_assignments SET ends_at = now() - interval ''1 second'' WHERE id = %L::uuid',
      v_assignment
    ));
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%lock timeout%'
       OR SQLERRM ILIKE '%canceling statement due to lock timeout%' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'R2 FORWARD: expiry update did not block on authority FOR SHARE';
  END IF;
  PERFORM dblink_exec('ex_rev', 'ROLLBACK');
  PERFORM dblink_exec('ex_ctrl', 'COMMIT');
  LOOP
    SELECT dblink_is_busy('ex_mut') INTO v_busy;
    EXIT WHEN v_busy = 0;
    v_waited := v_waited + 1;
    IF v_waited > 200 THEN
      RAISE EXCEPTION 'R2 FORWARD: mutation did not complete';
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  PERFORM * FROM dblink_get_result('ex_mut') AS t(result text);
  BEGIN
    PERFORM * FROM dblink_get_result('ex_mut') AS t(result text);
  EXCEPTION WHEN others THEN
    NULL;
  END;
  PERFORM dblink_exec('ex_mut', 'COMMIT');
  SELECT state::text INTO v_state FROM public.graduate_followups WHERE id = v_followup;
  IF v_state <> 'in_progress' THEN
    RAISE EXCEPTION 'R2 FORWARD: expected serialized success, got %', v_state;
  END IF;
  PERFORM dblink_disconnect('ex_ctrl');
  PERFORM dblink_disconnect('ex_mut');
  PERFORM dblink_disconnect('ex_rev');
  RAISE NOTICE 'ASSIGNMENT_EXPIRY FORWARD: PASS';
END;
$$;

DO $$
DECLARE
  v_followup uuid;
  v_specialist text := '10000000-0000-4000-8000-00000000000d';
  v_assignment uuid := '80000000-0000-4000-8000-000000000002';
  v_fp_before jsonb;
  v_fp_after jsonb;
  v_events_before int;
  v_events_after int;
BEGIN
  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = v_assignment;
  v_followup := public._ga_race_reopen_followup(
    (SELECT id FROM followup_race_ids WHERE key = 'record_a'),
    '10000000-0000-4000-8000-00000000000d'::uuid,
    'authority_race_followup'
  );
  INSERT INTO followup_race_ids VALUES ('followup', v_followup)
  ON CONFLICT (key) DO UPDATE SET id = EXCLUDED.id;

  SELECT jsonb_build_object('state', state, 'outcome', outcome, 'next_action_at', next_action_at)
    INTO v_fp_before FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_before FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;

  UPDATE public.request_processing_assignments
  SET ends_at = now() - interval '1 second'
  WHERE id = v_assignment;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_specialist, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'R2 REVERSE: expired assignment must deny';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;

  SELECT jsonb_build_object('state', state, 'outcome', outcome, 'next_action_at', next_action_at)
    INTO v_fp_after FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_after FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;
  IF v_fp_after <> v_fp_before OR v_events_after <> v_events_before THEN
    RAISE EXCEPTION 'R2 REVERSE: ZERO MUTATION violated';
  END IF;

  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = v_assignment;
  RAISE NOTICE 'ASSIGNMENT_EXPIRY REVERSE: PASS';
END;
$$;

-- =====================================================================
-- R3 PROFILE_DEACTIVATION (forward + reverse)
-- =====================================================================
DO $$
DECLARE
  v_followup uuid;
BEGIN
  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = '80000000-0000-4000-8000-000000000002';
  UPDATE public.staff_profiles
  SET status = 'active'
  WHERE id = '50000000-0000-4000-8000-00000000000d';
  v_followup := public._ga_race_reopen_followup(
    (SELECT id FROM followup_race_ids WHERE key = 'record_a'),
    '10000000-0000-4000-8000-00000000000d'::uuid,
    'authority_race_followup'
  );
  INSERT INTO followup_race_ids VALUES ('followup', v_followup)
  ON CONFLICT (key) DO UPDATE SET id = EXCLUDED.id;
END;
$$;

DO $$
DECLARE
  v_conn text := format('dbname=%s user=postgres', current_database());
  v_followup uuid := (SELECT id FROM followup_race_ids WHERE key = 'followup');
  v_specialist text := '10000000-0000-4000-8000-00000000000d';
  v_profile uuid := '50000000-0000-4000-8000-00000000000d';
  v_busy int;
  v_waited int := 0;
  v_blocked boolean := false;
  v_state text;
BEGIN
  PERFORM dblink_connect('pf_ctrl', v_conn);
  PERFORM dblink_connect('pf_mut', v_conn);
  PERFORM dblink_connect('pf_rev', v_conn);
  PERFORM dblink_exec('pf_ctrl', 'BEGIN');
  PERFORM dblink_exec(
    'pf_ctrl',
    $cmd$DO $do$ BEGIN PERFORM 1 FROM public._ga_followup_auth_race_gate WHERE id = 1 FOR UPDATE; END $do$;$cmd$
  );
  PERFORM dblink_exec('pf_mut', 'BEGIN');
  PERFORM dblink_exec('pf_mut', format(
    $cmd$DO $do$ BEGIN PERFORM set_config('request.jwt.claims', %L, true); END $do$;$cmd$,
    json_build_object('sub', v_specialist, 'role', 'authenticated')::text
  ));
  PERFORM dblink_send_query('pf_mut', format(
    $cmd$SELECT public.graduate_affairs_transition_followup(%L::uuid, 'in_progress')::text$cmd$,
    v_followup
  ));
  PERFORM pg_sleep(0.25);
  SELECT dblink_is_busy('pf_mut') INTO v_busy;
  IF v_busy <> 1 THEN
    RAISE EXCEPTION 'R3 FORWARD: mutation not blocked on barrier';
  END IF;

  PERFORM dblink_exec('pf_rev', 'BEGIN');
  PERFORM dblink_exec('pf_rev', 'SET LOCAL lock_timeout = ''250ms''');
  BEGIN
    PERFORM dblink_exec('pf_rev', format(
      'UPDATE public.staff_profiles SET status = ''suspended'' WHERE id = %L::uuid',
      v_profile
    ));
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%lock timeout%'
       OR SQLERRM ILIKE '%canceling statement due to lock timeout%' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'R3 FORWARD: profile deactivation did not block on FOR SHARE';
  END IF;
  PERFORM dblink_exec('pf_rev', 'ROLLBACK');
  PERFORM dblink_exec('pf_ctrl', 'COMMIT');
  LOOP
    SELECT dblink_is_busy('pf_mut') INTO v_busy;
    EXIT WHEN v_busy = 0;
    v_waited := v_waited + 1;
    IF v_waited > 200 THEN
      RAISE EXCEPTION 'R3 FORWARD: mutation did not complete';
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  PERFORM * FROM dblink_get_result('pf_mut') AS t(result text);
  BEGIN
    PERFORM * FROM dblink_get_result('pf_mut') AS t(result text);
  EXCEPTION WHEN others THEN
    NULL;
  END;
  PERFORM dblink_exec('pf_mut', 'COMMIT');
  SELECT state::text INTO v_state FROM public.graduate_followups WHERE id = v_followup;
  IF v_state <> 'in_progress' THEN
    RAISE EXCEPTION 'R3 FORWARD: expected serialized success, got %', v_state;
  END IF;
  PERFORM dblink_disconnect('pf_ctrl');
  PERFORM dblink_disconnect('pf_mut');
  PERFORM dblink_disconnect('pf_rev');
  RAISE NOTICE 'PROFILE_DEACTIVATION FORWARD: PASS';
END;
$$;

DO $$
DECLARE
  v_followup uuid;
  v_specialist text := '10000000-0000-4000-8000-00000000000d';
  v_profile uuid := '50000000-0000-4000-8000-00000000000d';
  v_fp_before jsonb;
  v_fp_after jsonb;
  v_events_before int;
  v_events_after int;
BEGIN
  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = '80000000-0000-4000-8000-000000000002';
  UPDATE public.staff_profiles SET status = 'active' WHERE id = v_profile;
  v_followup := public._ga_race_reopen_followup(
    (SELECT id FROM followup_race_ids WHERE key = 'record_a'),
    '10000000-0000-4000-8000-00000000000d'::uuid,
    'authority_race_followup'
  );
  INSERT INTO followup_race_ids VALUES ('followup', v_followup)
  ON CONFLICT (key) DO UPDATE SET id = EXCLUDED.id;

  SELECT jsonb_build_object('state', state, 'outcome', outcome)
    INTO v_fp_before FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_before FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;

  UPDATE public.staff_profiles SET status = 'suspended' WHERE id = v_profile;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_specialist, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'R3 REVERSE: inactive profile must deny';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;
  SELECT jsonb_build_object('state', state, 'outcome', outcome)
    INTO v_fp_after FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_after FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;
  IF v_fp_after <> v_fp_before OR v_events_after <> v_events_before THEN
    RAISE EXCEPTION 'R3 REVERSE: ZERO MUTATION violated';
  END IF;

  UPDATE public.staff_profiles SET status = 'active' WHERE id = v_profile;
  RAISE NOTICE 'PROFILE_DEACTIVATION REVERSE: PASS';
END;
$$;

-- =====================================================================
-- R4 DEPARTMENT_SCOPE_LOSS (create_followup reverse; specialist D1 only)
-- =====================================================================
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM followup_race_ids WHERE key = 'record_a');
  v_followups_before int;
  v_followups_after int;
  v_events_before int;
  v_events_after int;
BEGIN
  UPDATE public.request_processing_assignments
  SET is_active = true, ends_at = NULL
  WHERE id = '80000000-0000-4000-8000-000000000002';
  UPDATE public.staff_profiles
  SET status = 'active'
  WHERE id = '50000000-0000-4000-8000-00000000000d';

  -- Cancel active follow-up on A so create can run.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text,
    true
  );
  ALTER TABLE public.graduate_followups DISABLE TRIGGER _ga_followup_auth_race_barrier;
  PERFORM public.graduate_affairs_transition_followup(
    (SELECT id FROM followup_race_ids WHERE key = 'followup'),
    'cancelled'
  );
  ALTER TABLE public.graduate_followups ENABLE TRIGGER _ga_followup_auth_race_barrier;

  SELECT count(*) INTO v_followups_before FROM public.graduate_followups;
  SELECT count(*) INTO v_events_before FROM public.graduate_domain_events;

  DELETE FROM public.staff_profile_departments
  WHERE staff_profile_id = '50000000-0000-4000-8000-00000000000d'
    AND department_id = '30000000-0000-4000-8000-000000000001';

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.graduate_affairs_create_followup(
      v_record_a,
      '10000000-0000-4000-8000-00000000000d',
      'dept_scope_loss_probe'
    );
    RAISE EXCEPTION 'R4 REVERSE: department scope loss must deny create_followup';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_followups_after FROM public.graduate_followups;
  SELECT count(*) INTO v_events_after FROM public.graduate_domain_events;
  IF v_followups_after <> v_followups_before OR v_events_after <> v_events_before THEN
    RAISE EXCEPTION 'R4 REVERSE: ZERO MUTATION violated';
  END IF;

  -- Restore department binding for cleanliness.
  INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
  VALUES (
    '50000000-0000-4000-8000-00000000000d',
    '30000000-0000-4000-8000-000000000001'
  )
  ON CONFLICT DO NOTHING;
  RAISE NOTICE 'DEPARTMENT_SCOPE_LOSS REVERSE: PASS';
END;
$$;

-- =====================================================================
-- R5 DIRECT-USER assignment change + R6 manager role binding (manager path)
-- =====================================================================
DO $$
DECLARE
  v_followup uuid;
  v_record_a uuid := (SELECT id FROM followup_race_ids WHERE key = 'record_a');
  v_fp_before jsonb;
  v_fp_after jsonb;
  v_events_before int;
  v_events_after int;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text,
    true
  );
  ALTER TABLE public.graduate_followups DISABLE TRIGGER _ga_followup_auth_race_barrier;
  v_followup := public.graduate_affairs_create_followup(
    v_record_a,
    '10000000-0000-4000-8000-00000000000d',
    'manager_role_race_followup'
  );
  ALTER TABLE public.graduate_followups ENABLE TRIGGER _ga_followup_auth_race_barrier;

  SELECT jsonb_build_object('state', state, 'outcome', outcome)
    INTO v_fp_before FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_before FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;

  -- R5: inactivate direct-user manager assignment.
  UPDATE public.request_processing_assignments
  SET is_active = false
  WHERE id = '80000000-0000-4000-8000-000000000001';

  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'R5 REVERSE: revoked direct-user manager must deny';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;

  SELECT jsonb_build_object('state', state, 'outcome', outcome)
    INTO v_fp_after FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_after FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;
  IF v_fp_after <> v_fp_before OR v_events_after <> v_events_before THEN
    RAISE EXCEPTION 'R5 REVERSE: ZERO MUTATION violated';
  END IF;

  -- Restore manager assignment, then R6: rebind role to specialist role id
  -- (manager capability disappears while row remains active).
  UPDATE public.request_processing_assignments
  SET is_active = true,
      role_id = '70000000-0000-4000-8000-000000000001'
  WHERE id = '80000000-0000-4000-8000-000000000001';

  UPDATE public.request_processing_assignments
  SET role_id = '70000000-0000-4000-8000-000000000002'
  WHERE id = '80000000-0000-4000-8000-000000000001';

  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'R6 REVERSE: role rebind away from manager must deny';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;

  SELECT jsonb_build_object('state', state, 'outcome', outcome)
    INTO v_fp_after FROM public.graduate_followups WHERE id = v_followup;
  SELECT count(*) INTO v_events_after FROM public.graduate_domain_events
  WHERE aggregate_id = v_followup;
  IF v_fp_after <> v_fp_before OR v_events_after <> v_events_before THEN
    RAISE EXCEPTION 'R6 REVERSE: ZERO MUTATION violated';
  END IF;

  -- Restore manager binding.
  UPDATE public.request_processing_assignments
  SET is_active = true,
      role_id = '70000000-0000-4000-8000-000000000001'
  WHERE id = '80000000-0000-4000-8000-000000000001';

  RAISE NOTICE 'DIRECT_USER_AND_ROLE_BINDING REVERSE: PASS';
END;
$$;

-- Cleanup barrier objects so later scripts are unaffected.
DROP TRIGGER IF EXISTS _ga_followup_auth_race_barrier ON public.graduate_followups;
DROP FUNCTION IF EXISTS public._ga_followup_auth_race_barrier();
DROP FUNCTION IF EXISTS public._ga_race_reopen_followup(uuid, uuid, text);

SELECT 'graduates-affairs-followup-authority-race-01 pg-verify: PASS' AS status;
