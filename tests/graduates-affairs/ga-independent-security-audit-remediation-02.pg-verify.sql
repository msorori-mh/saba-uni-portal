\set ON_ERROR_STOP on

-- PORTAL-GA-INDEPENDENT-SECURITY-AUDIT-FINDINGS-REMEDIATION-02
-- Executable negative matrix for H-02, M-04, M-05.
-- Chain: graduates-affairs-authorization-04.pg-setup.sql
--   -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
--   -> GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql
--   -> GRADUATES-AFFAIRS-AUTHORIZATION-04.sql
--   -> 20260811230000_ga_independent_security_audit_remediation_02.sql
--   -> this file.
-- Disposable PG17 only. No production contact.

CREATE TEMP TABLE remediation_ids (key text PRIMARY KEY, id uuid NOT NULL);

-- Continuity policy for positive self-context continuity_allowed.
INSERT INTO public.graduate_account_continuity_policies (
  policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse,
  allowed_capabilities, decided_by, decided_at, valid_from, is_current
) VALUES (
  'graduate-account-continuity', 'approved', true, false,
  '["portal_sign_in","profile_self_service","survey_participation","event_participation"]'::jsonb,
  '10000000-0000-4000-8000-00000000000c', now(), now() - interval '1 day', true
);

-- Graduate A: dedicated auth user + student profile; program P1 in department D1.
INSERT INTO auth.users(id) VALUES ('10000000-0000-4000-8000-0000000000fa')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_profiles(id, user_id) VALUES
  ('20000000-0000-4000-8000-0000000000fa', '10000000-0000-4000-8000-0000000000fa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES
  ('a0200000-0000-4000-8000-00000000000a',
   '20000000-0000-4000-8000-0000000000fa',
   'registrar_approved_decision', 'REG-R02-A', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', '{"r02":"a"}',
   repeat('a', 64));

INSERT INTO remediation_ids VALUES
  ('record_a', public.create_graduate_record_from_official_decision('a0200000-0000-4000-8000-00000000000a'));

-- Consents for A matching the events and survey contracts.
INSERT INTO public.graduate_consents (
  id, graduate_record_id, purpose_code, notice_version, consent_state,
  affirmative_action_at
) VALUES
  ('c0200000-0000-4000-8000-0000000000a1',
   (SELECT id FROM remediation_ids WHERE key = 'record_a'),
   'events', 'v1', 'granted', now()),
  ('c0200000-0000-4000-8000-0000000000b1',
   (SELECT id FROM remediation_ids WHERE key = 'record_a'),
   'employment_quality', 'v1', 'granted', now());

-- Survey with one required single_choice and one optional free_text.
INSERT INTO public.graduate_surveys (
  id, purpose_code, title, state, minimum_report_cell_size
) VALUES
  ('b0200000-0000-4000-8000-000000000001', 'employment_quality', 'R02 Survey', 'active', 3);

INSERT INTO public.graduate_survey_versions (
  id, survey_id, version, notice_version, questions, published_at
) VALUES
  ('d0200000-0000-4000-8000-000000000001',
   'b0200000-0000-4000-8000-000000000001', 1, 'v1',
   '[
     {"key":"q1","kind":"single_choice","required":true,"options":["yes","no"]},
     {"key":"q2","kind":"free_text","required":false,"maxLength":10}
   ]'::jsonb,
   now());

-- Events:
--   d2_only_event: published, future, audience D2 only -> A must be denied.
--   unpublished_d1_event: draft, audience D1 -> A must be denied.
INSERT INTO public.graduate_events (
  id, title, event_type, purpose_code, notice_version, starts_at, ends_at,
  audience_scope, state
) VALUES
  ('e0200000-0000-4000-8000-0000000000d2',
   'D2-only event', 'career', 'events', 'v1',
   now() + interval '1 day', now() + interval '2 days',
   '{"department_ids":["30000000-0000-4000-8000-000000000002"]}'::jsonb,
   'published'),
  ('e0200000-0000-4000-8000-0000000000d1',
   'Unpublished D1 event', 'career', 'events', 'v1',
   now() + interval '1 day', now() + interval '2 days',
   '{"department_ids":["30000000-0000-4000-8000-000000000001"]}'::jsonb,
   'draft');

-- =====================================================================
-- H-02: direct event registration must enforce audience boundary.
-- =====================================================================
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM remediation_ids WHERE key = 'record_a');
  v_consent uuid := 'c0200000-0000-4000-8000-0000000000a1';
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-0000000000fa', 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.graduate_event_registrations;

  -- EVENT_CROSS_AUDIENCE_DENY
  BEGIN
    PERFORM public.graduate_register_for_event(
      'e0200000-0000-4000-8000-0000000000d2', v_record_a, v_consent);
    RAISE EXCEPTION 'H02 cross-audience event registration must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_EVENT_AUDIENCE_DENIED%' THEN RAISE; END IF;
  END;

  -- EVENT_UNPUBLISHED_DENY
  BEGIN
    PERFORM public.graduate_register_for_event(
      'e0200000-0000-4000-8000-0000000000d1', v_record_a, v_consent);
    RAISE EXCEPTION 'H02 unpublished event registration must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_EVENT_NOT_OPEN%' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.graduate_event_registrations) <> v_count THEN
    RAISE EXCEPTION 'H02 denials mutated graduate_event_registrations';
  END IF;
END;
$$;

-- =====================================================================
-- M-04: survey submission must validate answers server-side.
-- =====================================================================
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM remediation_ids WHERE key = 'record_a');
  v_version uuid := 'd0200000-0000-4000-8000-000000000001';
  v_consent uuid := 'c0200000-0000-4000-8000-0000000000b1';
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-0000000000fa', 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.graduate_survey_responses;

  -- SURVEY_UNKNOWN_KEY_DENY
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      v_version, v_record_a, v_consent,
      '{"q1":"yes","q3":"unexpected"}'::jsonb);
    RAISE EXCEPTION 'M04 unknown question key must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_SURVEY_UNKNOWN_KEY%' THEN RAISE; END IF;
  END;

  -- SURVEY_WRONG_TYPE_DENY
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      v_version, v_record_a, v_consent,
      '{"q1":123}'::jsonb);
    RAISE EXCEPTION 'M04 wrong answer type must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_SURVEY_WRONG_TYPE%' THEN RAISE; END IF;
  END;

  -- SURVEY_REQUIRED_MISSING_DENY
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      v_version, v_record_a, v_consent,
      '{"q2":"ok"}'::jsonb);
    RAISE EXCEPTION 'M04 missing required answer must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_SURVEY_REQUIRED_MISSING%' THEN RAISE; END IF;
  END;

  -- Invalid option is also rejected.
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      v_version, v_record_a, v_consent,
      '{"q1":"maybe"}'::jsonb);
    RAISE EXCEPTION 'M04 answer outside allowed options must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_SURVEY_INVALID_OPTION%' THEN RAISE; END IF;
  END;

  -- Free text exceeding maxLength is rejected.
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      v_version, v_record_a, v_consent,
      '{"q1":"yes","q2":"this is too long"}'::jsonb);
    RAISE EXCEPTION 'M04 free text exceeding maxLength must be denied';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_SURVEY_FREE_TEXT_TOO_LONG%' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.graduate_survey_responses) <> v_count THEN
    RAISE EXCEPTION 'M04 denials mutated graduate_survey_responses';
  END IF;

  -- Positive path: valid answers accepted exactly once.
  PERFORM public.graduate_submit_survey_response(
    v_version, v_record_a, v_consent,
    '{"q1":"yes","q2":"ok"}'::jsonb);
END;
$$;

-- =====================================================================
-- M-05: ambiguous approved records -> fail closed, no self mutation possible.
-- =====================================================================
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM remediation_ids WHERE key = 'record_a');
  v_record_a2 uuid;
  v_ctx jsonb;
BEGIN
  -- Create a second approved record for the SAME auth user (graduate A).
  INSERT INTO public.student_profiles(id, user_id) VALUES
    ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000fa')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.graduate_official_decisions (
    id, student_profile_id, source_kind, source_reference, decision_state,
    approved_at, approved_by, effective_graduation_date, program_id,
    department_id, academic_snapshot, source_payload_sha256
  ) VALUES
    ('a0200000-0000-4000-8000-0000000000a2',
     '20000000-0000-4000-8000-0000000000a2',
     'registrar_approved_decision', 'REG-R02-A2', 'approved', now(),
     '10000000-0000-4000-8000-00000000000c', '2026-06-30',
     '40000000-0000-4000-8000-000000000002',
     '30000000-0000-4000-8000-000000000002', '{"r02":"a2"}',
     repeat('b', 64));

  v_record_a2 := public.create_graduate_record_from_official_decision('a0200000-0000-4000-8000-0000000000a2');

  -- Sanity: two approved records exist for the same user.
  IF (SELECT count(*) FROM public.graduate_records r
      JOIN public.student_profiles sp ON sp.id = r.student_profile_id
      WHERE sp.user_id = '10000000-0000-4000-8000-0000000000fa'
        AND r.record_state = 'approved') <> 2 THEN
    RAISE EXCEPTION 'M05 precondition failed: expected two approved records';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-0000000000fa', 'role', 'authenticated')::text, true);

  v_ctx := public.graduate_affairs_resolve_self_context('profile_self_service');

  -- SELF_CONTEXT_TWO_APPROVED_DENY
  IF (v_ctx->>'owns_graduate_record')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'M05 ambiguous records must not own_graduate_record: %', v_ctx;
  END IF;
  IF v_ctx->>'graduate_record_id' IS NOT NULL THEN
    RAISE EXCEPTION 'M05 ambiguous records must not return graduate_record_id: %', v_ctx;
  END IF;
  IF v_ctx->>'graduate_record_state' IS DISTINCT FROM 'absent' THEN
    RAISE EXCEPTION 'M05 ambiguous records must report absent state: %', v_ctx;
  END IF;
  IF (v_ctx->>'continuity_allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'M05 ambiguous records must deny continuity: %', v_ctx;
  END IF;

  -- With no graduate_record_id returned, the self-service surface has no
  -- actionable record; the UI cannot reach any self-mutation RPC.
  IF v_ctx->>'graduate_record_id' IS NOT NULL THEN
    RAISE EXCEPTION 'M05 ambiguous records must not expose actionable record id: %', v_ctx;
  END IF;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'ga-independent-security-audit-remediation-02 pg-verify: PASS';
END;
$$;
