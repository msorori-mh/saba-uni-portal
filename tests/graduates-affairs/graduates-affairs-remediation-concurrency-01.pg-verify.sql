-- Targeted R6 concurrency proof (two sessions via dblink).
-- Chain: authorization-04.pg-setup + FOUNDATION + COMPLETION + AUTH-04 + this file.
-- Proves FOR SHARE serializes correction/revocation against in-flight self writes.

CREATE EXTENSION IF NOT EXISTS dblink;

INSERT INTO auth.users(id) VALUES ('a1000000-0000-4000-8000-0000000000aa')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_profiles(id, user_id) VALUES
  ('a2000000-0000-4000-8000-0000000000aa', 'a1000000-0000-4000-8000-0000000000aa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES (
  'ad000000-0000-4000-8000-0000000000aa',
  'a2000000-0000-4000-8000-0000000000aa',
  'registrar_approved_decision', 'REG-CONCURRENCY-AA', 'approved',
  now(), 'a1000000-0000-4000-8000-0000000000aa', '2026-06-30',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '{"seed":"concurrency"}'::jsonb,
  repeat('c', 64)
) ON CONFLICT (id) DO NOTHING;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text,
  false
);
SELECT public.create_graduate_record_from_official_decision('ad000000-0000-4000-8000-0000000000aa');

DO $$
DECLARE
  v_record uuid;
  v_user text := 'a1000000-0000-4000-8000-0000000000aa';
  v_conn text;
  v_state text;
  v_blocked boolean := false;
BEGIN
  SELECT id INTO v_record
  FROM public.graduate_records
  WHERE official_decision_id = 'ad000000-0000-4000-8000-0000000000aa'
    AND record_state = 'approved';
  IF v_record IS NULL THEN
    RAISE EXCEPTION 'concurrency seed record missing or not approved';
  END IF;

  v_conn := format('dbname=%s user=postgres', current_database());
  PERFORM dblink_connect('ga_a', v_conn);
  PERFORM dblink_connect('ga_b', v_conn);

  -- Session A: hold FOR SHARE, then insert a child artifact.
  PERFORM dblink_exec('ga_a', 'BEGIN');
  PERFORM dblink_exec('ga_a', format(
    $cmd$DO $do$ BEGIN PERFORM set_config('request.jwt.claims', %L, true); END $do$;$cmd$,
    json_build_object('sub', v_user, 'role', 'authenticated')::text
  ));
  PERFORM dblink_exec('ga_a', format(
    $cmd$DO $do$ BEGIN PERFORM public.graduate_require_approved_record_locked(%L::uuid); END $do$;$cmd$,
    v_record
  ));

  -- Session B: revocation must block on the share lock (short lock_timeout).
  PERFORM dblink_exec('ga_b', 'BEGIN');
  PERFORM dblink_exec('ga_b', 'SET LOCAL lock_timeout = ''250ms''');
  BEGIN
    PERFORM dblink_exec('ga_b',
      'UPDATE public.graduate_official_decisions
       SET decision_state = ''revoked''
       WHERE id = ''ad000000-0000-4000-8000-0000000000aa'''
    );
  EXCEPTION WHEN others THEN
    IF SQLERRM ILIKE '%lock timeout%' OR SQLERRM ILIKE '%canceling statement due to lock timeout%' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'revocation did not block on FOR SHARE lock';
  END IF;
  PERFORM dblink_exec('ga_b', 'ROLLBACK');

  -- A completes the in-lock child write, then commits (releases share lock).
  PERFORM dblink_exec('ga_a', format(
    $cmd$INSERT INTO public.graduate_consents (
       graduate_record_id, purpose_code, notice_version, consent_state, affirmative_action_at
     ) VALUES (%L::uuid, 'concurrency_probe', 'v1', 'granted', now())$cmd$,
    v_record
  ));
  PERFORM dblink_exec('ga_a', 'COMMIT');

  -- After A commits, B can revoke.
  PERFORM dblink_exec('ga_b', 'BEGIN');
  PERFORM dblink_exec('ga_b',
    'UPDATE public.graduate_official_decisions
     SET decision_state = ''revoked''
     WHERE id = ''ad000000-0000-4000-8000-0000000000aa'''
  );
  PERFORM dblink_exec('ga_b', 'COMMIT');

  SELECT record_state::text INTO v_state FROM public.graduate_records WHERE id = v_record;
  IF v_state <> 'revoked' THEN
    RAISE EXCEPTION 'expected revoked after B committed, got %', v_state;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.graduate_consents
    WHERE graduate_record_id = v_record AND purpose_code = 'concurrency_probe'
  ) THEN
    RAISE EXCEPTION 'in-lock consent insert missing';
  END IF;

  -- Post-revocation self-write must deny with zero late artifact.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.graduate_grant_consent(v_record, 'concurrency_probe_late', 'v1');
    RAISE EXCEPTION 'late self-write must be denied after revocation';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_NOT_APPROVED%'
       AND SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN
      RAISE;
    END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.graduate_consents
    WHERE graduate_record_id = v_record AND purpose_code = 'concurrency_probe_late'
  ) THEN
    RAISE EXCEPTION 'late consent landed on revoked record';
  END IF;

  PERFORM dblink_disconnect('ga_a');
  PERFORM dblink_disconnect('ga_b');
  RAISE NOTICE 'graduates-affairs-remediation-concurrency-01 forward R6: PASS';
END;
$$;

-- =====================================================================
-- QWEN-FINAL-NOTE-REVERSE-RACE
-- Reverse TOCTOU: lifecycle/revocation holds first → self-write blocks →
-- lifecycle commits → self-write re-evaluates → deny → zero late artifact.
-- Uses independent dblink sessions + async self-write (not timing-only).
-- =====================================================================

INSERT INTO auth.users(id) VALUES ('b1000000-0000-4000-8000-0000000000bb')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_profiles(id, user_id) VALUES
  ('b2000000-0000-4000-8000-0000000000bb', 'b1000000-0000-4000-8000-0000000000bb')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES (
  'bd000000-0000-4000-8000-0000000000bb',
  'b2000000-0000-4000-8000-0000000000bb',
  'registrar_approved_decision', 'REG-CONCURRENCY-BB', 'approved',
  now(), 'a1000000-0000-4000-8000-0000000000aa', '2026-06-30',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '{"seed":"concurrency-reverse"}'::jsonb,
  repeat('d', 64)
) ON CONFLICT (id) DO NOTHING;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1000000-0000-4000-8000-0000000000bb', 'role', 'authenticated')::text,
  false
);
SELECT public.create_graduate_record_from_official_decision('bd000000-0000-4000-8000-0000000000bb');

DO $$
DECLARE
  v_record uuid;
  v_user text := 'b1000000-0000-4000-8000-0000000000bb';
  v_conn text;
  v_busy integer;
  v_waited integer := 0;
  v_err text;
  v_consents_before integer;
  v_consents_after integer;
  v_profiles_before integer;
  v_employment_before integer;
  v_survey_before integer;
  v_events_before integer;
BEGIN
  SELECT id INTO v_record
  FROM public.graduate_records
  WHERE official_decision_id = 'bd000000-0000-4000-8000-0000000000bb'
    AND record_state = 'approved';
  IF v_record IS NULL THEN
    RAISE EXCEPTION 'reverse-race seed record missing or not approved';
  END IF;

  SELECT count(*) INTO v_consents_before FROM public.graduate_consents WHERE graduate_record_id = v_record;
  SELECT count(*) INTO v_profiles_before FROM public.graduate_profiles WHERE graduate_record_id = v_record;
  SELECT count(*) INTO v_employment_before FROM public.graduate_employment_events WHERE graduate_record_id = v_record;
  SELECT count(*) INTO v_survey_before FROM public.graduate_survey_responses WHERE graduate_record_id = v_record;
  SELECT count(*) INTO v_events_before FROM public.graduate_event_registrations WHERE graduate_record_id = v_record;

  v_conn := format('dbname=%s user=postgres', current_database());
  PERFORM dblink_connect('rev_life', v_conn);
  PERFORM dblink_connect('rev_self', v_conn);

  -- Lifecycle session: hold exclusive lock on the approved graduate_records row.
  PERFORM dblink_exec('rev_life', 'BEGIN');
  PERFORM dblink_exec('rev_life', format(
    $cmd$DO $do$ BEGIN
      PERFORM 1 FROM public.graduate_records WHERE id = %L::uuid FOR UPDATE;
    END $do$;$cmd$,
    v_record
  ));

  -- Self-write session: begin + auth, then async consent grant (needs FOR SHARE).
  PERFORM dblink_exec('rev_self', 'BEGIN');
  PERFORM dblink_exec('rev_self', format(
    $cmd$DO $do$ BEGIN PERFORM set_config('request.jwt.claims', %L, true); END $do$;$cmd$,
    json_build_object('sub', v_user, 'role', 'authenticated')::text
  ));
  PERFORM dblink_send_query('rev_self', format(
    $cmd$SELECT public.graduate_grant_consent(%L::uuid, 'reverse_race_probe', 'v1')$cmd$,
    v_record
  ));

  -- Prove the self-write is genuinely blocked behind the lifecycle lock.
  PERFORM pg_sleep(0.25);
  SELECT dblink_is_busy('rev_self') INTO v_busy;
  IF v_busy <> 1 THEN
    RAISE EXCEPTION 'reverse-race: self-write did not block while lifecycle held FOR UPDATE';
  END IF;

  -- Lifecycle completes revocation (propagation updates the locked record) and commits.
  PERFORM dblink_exec('rev_life',
    'UPDATE public.graduate_official_decisions
     SET decision_state = ''revoked''
     WHERE id = ''bd000000-0000-4000-8000-0000000000bb'''
  );
  PERFORM dblink_exec('rev_life', 'COMMIT');

  -- Wait for the blocked self-write to finish after lock release.
  LOOP
    SELECT dblink_is_busy('rev_self') INTO v_busy;
    EXIT WHEN v_busy = 0;
    v_waited := v_waited + 1;
    IF v_waited > 80 THEN
      RAISE EXCEPTION 'reverse-race: self-write did not complete after lifecycle commit';
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;

  -- Self-write must fail closed with the approved-record / access domain error.
  BEGIN
    PERFORM * FROM dblink_get_result('rev_self') AS t(result text);
    RAISE EXCEPTION 'reverse-race: self-write must not succeed after revocation';
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    IF v_err NOT LIKE '%GRADUATE_RECORD_NOT_APPROVED%'
       AND v_err NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN
      RAISE EXCEPTION 'reverse-race: unexpected self-write error: %', v_err;
    END IF;
  END;
  -- Drain any remaining dblink result slots.
  BEGIN
    PERFORM * FROM dblink_get_result('rev_self') AS t(result text);
  EXCEPTION WHEN others THEN
    NULL;
  END;

  PERFORM dblink_exec('rev_self', 'ROLLBACK');

  IF (SELECT record_state::text FROM public.graduate_records WHERE id = v_record) <> 'revoked' THEN
    RAISE EXCEPTION 'reverse-race: record must be revoked after lifecycle commit';
  END IF;

  SELECT count(*) INTO v_consents_after FROM public.graduate_consents WHERE graduate_record_id = v_record;
  IF v_consents_after <> v_consents_before THEN
    RAISE EXCEPTION 'reverse-race: late consent artifact created';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graduate_consents
    WHERE graduate_record_id = v_record AND purpose_code = 'reverse_race_probe'
  ) THEN
    RAISE EXCEPTION 'reverse-race: reverse_race_probe consent must not exist';
  END IF;
  IF (SELECT count(*) FROM public.graduate_profiles WHERE graduate_record_id = v_record) <> v_profiles_before THEN
    RAISE EXCEPTION 'reverse-race: late profile artifact created';
  END IF;
  IF (SELECT count(*) FROM public.graduate_employment_events WHERE graduate_record_id = v_record) <> v_employment_before THEN
    RAISE EXCEPTION 'reverse-race: late employment artifact created';
  END IF;
  IF (SELECT count(*) FROM public.graduate_survey_responses WHERE graduate_record_id = v_record) <> v_survey_before THEN
    RAISE EXCEPTION 'reverse-race: late survey artifact created';
  END IF;
  IF (SELECT count(*) FROM public.graduate_event_registrations WHERE graduate_record_id = v_record) <> v_events_before THEN
    RAISE EXCEPTION 'reverse-race: late event registration artifact created';
  END IF;

  PERFORM dblink_disconnect('rev_life');
  PERFORM dblink_disconnect('rev_self');
  RAISE NOTICE 'graduates-affairs-remediation-concurrency-01 reverse TOCTOU: PASS';
END;
$$;
