\set ON_ERROR_STOP on

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'registrar_approved_decision', 'REG-2026-001', 'approved', now(),
  '33333333-3333-4333-8333-333333333333', '2026-07-01',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555', '{"freeze":"approved"}',
  repeat('a', 64)
);

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  source_payload_sha256
) VALUES (
  '12121212-1212-4212-8212-121212121212',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'registrar_approved_decision', 'REG-PENDING', 'pending', repeat('b', 64)
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.graduate_records (
      official_decision_id, student_profile_id, effective_graduation_date,
      program_id, department_id, academic_snapshot, created_by
    ) VALUES (
      '12121212-1212-4212-8212-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-07-01',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '55555555-5555-4555-8555-555555555555', '{"forged":true}',
      '33333333-3333-4333-8333-333333333333'
    );
    RAISE EXCEPTION 'expected pending decision rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%OFFICIAL_GRADUATION_DECISION_NOT_APPROVED%' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.graduate_records (
      official_decision_id, student_profile_id, effective_graduation_date,
      program_id, department_id, academic_snapshot, created_by
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-07-01',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '55555555-5555-4555-8555-555555555555', '{"forged":true}',
      '33333333-3333-4333-8333-333333333333'
    );
    RAISE EXCEPTION 'expected forged graduate record rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_MUST_MATCH_OFFICIAL_DECISION%' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.graduate_records', 'SELECT')
     OR has_table_privilege('authenticated', 'public.graduate_records', 'INSERT')
     OR has_table_privilege('anon', 'public.graduate_records', 'SELECT')
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename LIKE 'graduate_%'
         AND permissive = 'PERMISSIVE'
     )
     OR EXISTS (
       SELECT 1 FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'graduate_%'
         AND relkind = 'r' AND NOT relrowsecurity
     ) THEN
    RAISE EXCEPTION 'default-deny RLS/ACL contract failed';
  END IF;
END;
$$;

SELECT public.create_graduate_record_from_official_decision('11111111-1111-4111-8111-111111111111');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.graduate_records WHERE record_state = 'approved') <> 1 THEN
    RAISE EXCEPTION 'official graduate record not created exactly once';
  END IF;
END;
$$;

INSERT INTO public.graduate_profiles(graduate_record_id)
SELECT id FROM public.graduate_records;

INSERT INTO public.graduate_consents (
  id, graduate_record_id, purpose_code, notice_version, consent_state, affirmative_action_at
) SELECT '66666666-6666-4666-8666-666666666666', id, 'employment_quality', 'v1', 'granted', now()
FROM public.graduate_records;

INSERT INTO public.graduate_surveys(id, purpose_code, title, state)
VALUES ('77777777-7777-4777-8777-777777777777', 'employment_quality', 'Quality', 'active');
INSERT INTO public.graduate_survey_versions(id, survey_id, version, notice_version, questions, published_at)
VALUES ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 1, 'v1', '[]', now());

INSERT INTO public.graduate_survey_responses(survey_version_id, graduate_record_id, consent_id, answers)
SELECT '88888888-8888-4888-8888-888888888888', id,
       '66666666-6666-4666-8666-666666666666', '{}'
FROM public.graduate_records;

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_consents SET purpose_code = 'wrong-purpose'
    WHERE id = '66666666-6666-4666-8666-666666666666';
    RAISE EXCEPTION 'expected immutable consent identity rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_CONSENT_IDENTITY_IMMUTABLE%' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO public.graduate_consents (
  id, graduate_record_id, purpose_code, notice_version, consent_state,
  affirmative_action_at, withdrawn_at
) SELECT '67676767-6767-4676-8676-676767676767', id, 'employment_quality',
         'wrong-version', 'withdrawn', now(), now()
FROM public.graduate_records;

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_survey_responses
    SET consent_id = '67676767-6767-4676-8676-676767676767';
    RAISE EXCEPTION 'expected withdrawn/wrong-version consent rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%ACTIVE_MATCHING_SURVEY_CONSENT_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO public.graduate_events(
  id, title, event_type, purpose_code, notice_version, starts_at, ends_at, state
) VALUES (
  '99999999-9999-4999-8999-999999999999', 'Career event', 'career',
  'employment_quality', 'v1', now() + interval '1 day', now() + interval '2 days', 'published'
);

INSERT INTO public.graduate_event_registrations(event_id, graduate_record_id, consent_id)
SELECT '99999999-9999-4999-8999-999999999999', id,
       '66666666-6666-4666-8666-666666666666'
FROM public.graduate_records;

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_event_registrations
    SET consent_id = '67676767-6767-4676-8676-676767676767';
    RAISE EXCEPTION 'expected event consent rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%ACTIVE_MATCHING_EVENT_CONSENT_REQUIRED%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.graduate_events SET notice_version = 'v2';
    RAISE EXCEPTION 'expected published event scope rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%PUBLISHED_GRADUATE_EVENT_SCOPE_IMMUTABLE%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.graduate_surveys SET purpose_code = 'changed';
    RAISE EXCEPTION 'expected active survey scope rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%PUBLISHED_GRADUATE_SURVEY_SCOPE_IMMUTABLE%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.graduate_survey_versions SET notice_version = 'v2';
    RAISE EXCEPTION 'expected published survey version rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.graduate_official_decisions SET academic_snapshot = '{"tampered":true}'
    WHERE id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'expected approved decision immutability rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%APPROVED_GRADUATION_DECISION_FACT_IMMUTABLE%' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE public.graduate_official_decisions SET decision_state = 'revoked'
WHERE id = '11111111-1111-4111-8111-111111111111';

DO $$
BEGIN
  IF (SELECT record_state FROM public.graduate_records) <> 'revoked' THEN
    RAISE EXCEPTION 'revocation did not propagate';
  END IF;
END;
$$;

INSERT INTO public.graduate_domain_events(event_type, aggregate_type, aggregate_id, actor_user_id, purpose_code)
VALUES ('verification', 'graduate_record', '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333', 'local_test');

DO $$
BEGIN
  BEGIN
    DELETE FROM public.graduate_domain_events;
    RAISE EXCEPTION 'expected append-only rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
END;
$$;
