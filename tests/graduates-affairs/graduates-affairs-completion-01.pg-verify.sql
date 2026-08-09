\set ON_ERROR_STOP on

-- Executable draft verification for GRADUATES-AFFAIRS-MVP-COMPLETION-01.
-- Review chain: graduates-affairs-foundation-01.pg-setup.sql
-- -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
-- -> GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql -> this file.

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES (
  '21212121-2121-4212-8212-212121212121',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'registrar_approved_decision', 'REG-2026-002', 'approved', now(),
  '33333333-3333-4333-8333-333333333333', '2026-07-01',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '55555555-5555-4555-8555-555555555555', '{"freeze":"approved"}',
  repeat('c', 64)
);

SELECT public.create_graduate_record_from_official_decision('21212121-2121-4212-8212-212121212121');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.graduate_records WHERE record_state = 'approved') <> 1 THEN
    RAISE EXCEPTION 'official graduate record not created exactly once';
  END IF;
END;
$$;

-- Contact points: usable, revoked, and unverified fixtures.
INSERT INTO public.graduate_contact_points (
  id, graduate_record_id, channel_type, protected_value, purpose_code, verified_at
) SELECT 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', id, 'email', 'protected-1', 'career_followup', now()
FROM public.graduate_records;

INSERT INTO public.graduate_contact_points (
  id, graduate_record_id, channel_type, protected_value, purpose_code, verified_at, revoked_at
) SELECT 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', id, 'phone', 'protected-2', 'career_followup', now(), now()
FROM public.graduate_records;

INSERT INTO public.graduate_contact_points (
  id, graduate_record_id, channel_type, protected_value, purpose_code
) SELECT 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', id, 'email', 'protected-3', 'career_followup'
FROM public.graduate_records;

-- Consents: one active, one withdrawn.
INSERT INTO public.graduate_consents (
  id, graduate_record_id, purpose_code, notice_version, consent_state, affirmative_action_at
) SELECT 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', id, 'career_followup', 'v1', 'granted', now()
FROM public.graduate_records;

INSERT INTO public.graduate_consents (
  id, graduate_record_id, purpose_code, notice_version, consent_state,
  affirmative_action_at, withdrawn_at
) SELECT 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', id, 'communications', 'v1', 'withdrawn', now(), now()
FROM public.graduate_records;

-- Follow-ups: single active assignment, guarded transitions, terminal states.
INSERT INTO public.graduate_followups (
  id, graduate_record_id, assignee_user_id, purpose_code
) SELECT 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', id,
         '33333333-3333-4333-8333-333333333333', 'career_followup'
FROM public.graduate_records;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.graduate_followups (graduate_record_id, assignee_user_id, purpose_code)
    SELECT id, '33333333-3333-4333-8333-333333333333', 'career_followup'
    FROM public.graduate_records;
    RAISE EXCEPTION 'expected single active follow-up rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%graduate_followups_one_active_per_graduate%' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE public.graduate_followups SET state = 'in_progress'
WHERE id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_followups SET state = 'open'
    WHERE id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
    RAISE EXCEPTION 'expected backward transition rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_INVALID_TRANSITION%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.graduate_followups SET state = 'completed'
    WHERE id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
    RAISE EXCEPTION 'expected completion outcome rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_COMPLETION_OUTCOME_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE public.graduate_followups SET state = 'completed', outcome = 'contacted and advised'
WHERE id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_followups SET state = 'open'
    WHERE id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
    RAISE EXCEPTION 'expected terminal follow-up rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_INVALID_TRANSITION%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.graduate_followups
    WHERE id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
    RAISE EXCEPTION 'expected follow-up append-only rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO public.graduate_followups (
  id, graduate_record_id, assignee_user_id, purpose_code
) SELECT 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', id,
         '33333333-3333-4333-8333-333333333333', 'career_followup'
FROM public.graduate_records;

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_followups SET purpose_code = 'events'
    WHERE id = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
    RAISE EXCEPTION 'expected follow-up identity rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_IDENTITY_IMMUTABLE%' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE public.graduate_followups SET state = 'in_progress'
WHERE id = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';

-- Communication log: consent + usable contact point required, append-only.
INSERT INTO public.graduate_communication_events (
  id, graduate_record_id, contact_point_id, consent_id, purpose_code,
  notice_version, channel, template_code, sent_by
) SELECT 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', id,
         'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
         'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'career_followup',
         'v1', 'email', 'career-check-in-v1',
         '33333333-3333-4333-8333-333333333333'
FROM public.graduate_records;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.graduate_communication_events (
      graduate_record_id, contact_point_id, consent_id, purpose_code,
      notice_version, channel, template_code, sent_by
    ) SELECT id, 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
             'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', 'communications',
             'v1', 'email', 'newsletter-v1',
             '33333333-3333-4333-8333-333333333333'
    FROM public.graduate_records;
    RAISE EXCEPTION 'expected withdrawn consent rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_COMMUNICATION_CONSENT_REQUIRED%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.graduate_communication_events (
      graduate_record_id, contact_point_id, consent_id, purpose_code,
      notice_version, channel, template_code, sent_by
    ) SELECT id, 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
             'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'career_followup',
             'v1', 'phone', 'career-check-in-v1',
             '33333333-3333-4333-8333-333333333333'
    FROM public.graduate_records;
    RAISE EXCEPTION 'expected revoked contact point rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_CONTACT_POINT_NOT_USABLE%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.graduate_communication_events (
      graduate_record_id, contact_point_id, consent_id, purpose_code,
      notice_version, channel, template_code, sent_by
    ) SELECT id, 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3',
             'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'career_followup',
             'v1', 'email', 'career-check-in-v1',
             '33333333-3333-4333-8333-333333333333'
    FROM public.graduate_records;
    RAISE EXCEPTION 'expected unverified contact point rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_CONTACT_POINT_NOT_USABLE%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.graduate_communication_events SET template_code = 'changed'
    WHERE id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
    RAISE EXCEPTION 'expected communication append-only rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
END;
$$;

-- D-13 account continuity: undecided denies; approval needs provenance;
-- decided rows are immutable; evaluation stays fail-closed.
INSERT INTO public.graduate_account_continuity_policies (policy_code)
VALUES ('graduate-account-continuity');

DO $$
BEGIN
  IF public.evaluate_graduate_account_continuity('graduate-account-continuity', 'portal_sign_in', now()) THEN
    RAISE EXCEPTION 'undecided policy must deny every capability';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_account_continuity_policies SET policy_state = 'approved'
    WHERE policy_code = 'graduate-account-continuity';
    RAISE EXCEPTION 'expected provenance rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_ACCOUNT_POLICY_PROVENANCE_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE public.graduate_account_continuity_policies
SET policy_state = 'approved',
    decided_by = '33333333-3333-4333-8333-333333333333',
    decided_at = now(),
    allowed_capabilities = '["portal_sign_in"]'::jsonb,
    allow_portal_sign_in = true,
    valid_from = now() - interval '1 day',
    expires_at = now() + interval '1 day'
WHERE policy_code = 'graduate-account-continuity'
  AND is_current;

DO $$
BEGIN
  IF NOT public.evaluate_graduate_account_continuity('graduate-account-continuity', 'portal_sign_in', now()) THEN
    RAISE EXCEPTION 'approved in-force policy must allow listed capability';
  END IF;
  IF public.evaluate_graduate_account_continuity('graduate-account-continuity', 'survey_participation', now()) THEN
    RAISE EXCEPTION 'unlisted capability must be denied';
  END IF;
  IF public.evaluate_graduate_account_continuity('graduate-account-continuity', 'university_email_reuse', now()) THEN
    RAISE EXCEPTION 'sensitive capability without its flag must be denied';
  END IF;
  IF public.evaluate_graduate_account_continuity('graduate-account-continuity', 'portal_sign_in', NULL) THEN
    RAISE EXCEPTION 'null evaluation timestamp must be denied';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE public.graduate_account_continuity_policies
    SET expires_at = now() + interval '30 days'
    WHERE policy_code = 'graduate-account-continuity'
      AND is_current;
    RAISE EXCEPTION 'expected decided policy immutability rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_ACCOUNT_POLICY_DECIDED_IMMUTABLE%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.graduate_account_continuity_policies
    WHERE policy_code = 'graduate-account-continuity'
      AND is_current;
    RAISE EXCEPTION 'expected policy append-only rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
END;
$$;

-- R8: supersession creates a new current version; old decided row stays
-- immutable and auditable; evaluator resolves only is_current.
DO $$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
  v_current_count integer;
BEGIN
  SELECT id INTO v_old_id
  FROM public.graduate_account_continuity_policies
  WHERE policy_code = 'graduate-account-continuity' AND is_current;

  v_new_id := public.graduate_supersede_account_continuity_policy(
    'graduate-account-continuity',
    'approved',
    true,
    false,
    '["portal_sign_in","survey_participation"]'::jsonb,
    now() - interval '1 hour',
    now() + interval '30 days',
    '33333333-3333-4333-8333-333333333333',
    now()
  );

  IF v_new_id IS NULL OR v_new_id = v_old_id THEN
    RAISE EXCEPTION 'supersession must insert a distinct current version';
  END IF;
  SELECT count(*) INTO v_current_count
  FROM public.graduate_account_continuity_policies
  WHERE policy_code = 'graduate-account-continuity' AND is_current;
  IF v_current_count <> 1 THEN
    RAISE EXCEPTION 'exactly one current version required, got %', v_current_count;
  END IF;
  IF (SELECT is_current FROM public.graduate_account_continuity_policies WHERE id = v_old_id) THEN
    RAISE EXCEPTION 'superseded version must not remain current';
  END IF;
  IF (SELECT supersedes_policy_id FROM public.graduate_account_continuity_policies WHERE id = v_new_id)
     IS DISTINCT FROM v_old_id THEN
    RAISE EXCEPTION 'new version must reference superseded id';
  END IF;
  IF NOT public.evaluate_graduate_account_continuity(
       'graduate-account-continuity', 'survey_participation', now()) THEN
    RAISE EXCEPTION 'evaluator must resolve the new current capabilities';
  END IF;
  -- Old decided facts remain immutable after demotion.
  BEGIN
    UPDATE public.graduate_account_continuity_policies
    SET allow_portal_sign_in = false
    WHERE id = v_old_id;
    RAISE EXCEPTION 'expected superseded decided row immutability rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_ACCOUNT_POLICY_DECIDED_IMMUTABLE%' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO public.graduate_account_continuity_policies (
  policy_code, policy_state, allow_portal_sign_in, allowed_capabilities,
  valid_from, expires_at, decided_by, decided_at
) VALUES (
  'policy-expired', 'approved', true, '["portal_sign_in"]'::jsonb,
  now() - interval '30 days', now() - interval '1 day',
  '33333333-3333-4333-8333-333333333333', now() - interval '31 days'
);

INSERT INTO public.graduate_account_continuity_policies (policy_code, policy_state, decided_by, decided_at)
VALUES ('policy-rejected', 'rejected', '33333333-3333-4333-8333-333333333333', now());

DO $$
BEGIN
  IF public.evaluate_graduate_account_continuity('policy-expired', 'portal_sign_in', now()) THEN
    RAISE EXCEPTION 'expired policy must deny';
  END IF;
  IF public.evaluate_graduate_account_continuity('policy-rejected', 'portal_sign_in', now()) THEN
    RAISE EXCEPTION 'rejected policy must deny';
  END IF;
  IF public.evaluate_graduate_account_continuity('policy-missing', 'portal_sign_in', now()) THEN
    RAISE EXCEPTION 'missing policy must deny';
  END IF;
END;
$$;

-- Aggregate employment report: suppression boundary, per-cell suppression,
-- metric correctness, default threshold, and no client EXECUTE privilege.
DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026, 3);
  IF NOT v_row.suppressed OR v_row.population IS NOT NULL THEN
    RAISE EXCEPTION 'empty cohort must be suppressed';
  END IF;
END;
$$;

INSERT INTO public.graduate_employment_events (
  id, graduate_record_id, employment_status, specialization_relationship, verification_state
) SELECT 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', id, 'employed', 'directly_related', 'verified'
FROM public.graduate_records;

INSERT INTO public.graduate_employment_events (
  id, graduate_record_id, employment_status, specialization_relationship, verification_state
) SELECT 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', id, 'seeking_work', 'not_assessed', 'graduate_reported'
FROM public.graduate_records;

DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026, 3);
  IF NOT v_row.suppressed OR v_row.population IS NOT NULL THEN
    RAISE EXCEPTION 'cohort below threshold must be suppressed';
  END IF;
END;
$$;

INSERT INTO public.graduate_employment_events (
  id, graduate_record_id, employment_status, specialization_relationship, verification_state
) SELECT 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3', id, 'self_employed', 'partially_related', 'verified'
FROM public.graduate_records;

-- Cohort at threshold with sub-cells below it: population is returned while
-- every smaller cell (employed/related/verified = 2 < 3) is NULL-suppressed.
DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026, 3);
  IF v_row.suppressed OR v_row.population <> 3 THEN
    RAISE EXCEPTION 'cohort at threshold must return its population: %', v_row;
  END IF;
  IF v_row.employed IS NOT NULL OR v_row.specialization_related IS NOT NULL
     OR v_row.verified IS NOT NULL THEN
    RAISE EXCEPTION 'sub-threshold cells must be suppressed individually: %', v_row;
  END IF;
END;
$$;

-- A fourth current event lifts every cell to the threshold: fully
-- non-suppressed success case (4/3/3/3).
INSERT INTO public.graduate_employment_events (
  id, graduate_record_id, employment_status, specialization_relationship, verification_state
) SELECT 'b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5', id, 'employed', 'directly_related', 'verified'
FROM public.graduate_records;

DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026, 3);
  IF v_row.suppressed
     OR v_row.population <> 4 OR v_row.employed <> 3
     OR v_row.specialization_related <> 3 OR v_row.verified <> 3 THEN
    RAISE EXCEPTION 'aggregate report metrics incorrect: %', v_row;
  END IF;
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026);
  IF NOT v_row.suppressed OR v_row.population IS NOT NULL THEN
    RAISE EXCEPTION 'default threshold of 5 must suppress a 4-row cohort';
  END IF;
END;
$$;

-- Superseded events never enter the aggregate.
UPDATE public.graduate_employment_events
SET employment_status = 'not_disclosed'
WHERE id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';

INSERT INTO public.graduate_employment_events (
  id, graduate_record_id, employment_status, specialization_relationship,
  verification_state, supersedes_event_id
) SELECT 'b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4', id, 'continuing_education', 'not_assessed',
         'graduate_reported', 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'
FROM public.graduate_records;

DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026, 3);
  IF v_row.suppressed OR v_row.population <> 4 THEN
    RAISE EXCEPTION 'superseded events must not be counted: %', v_row;
  END IF;
  IF v_row.employed IS NOT NULL OR v_row.specialization_related IS NOT NULL
     OR v_row.verified IS NOT NULL THEN
    RAISE EXCEPTION 'post-supersession sub-threshold cells must be suppressed: %', v_row;
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.graduate_followups', 'SELECT')
     OR has_table_privilege('authenticated', 'public.graduate_communication_events', 'INSERT')
     OR has_table_privilege('anon', 'public.graduate_account_continuity_policies', 'SELECT')
     OR has_function_privilege('authenticated', 'public.graduate_aggregate_employment_report(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.evaluate_graduate_account_continuity(text,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.evaluate_graduate_account_continuity(text,text,timestamptz)', 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('graduate_followups','graduate_communication_events','graduate_account_continuity_policies')
     )
     OR EXISTS (
       SELECT 1 FROM pg_class
       WHERE relnamespace = 'public'::regnamespace
         AND relname IN ('graduate_followups','graduate_communication_events','graduate_account_continuity_policies')
         AND relkind = 'r' AND NOT relrowsecurity
     ) THEN
    RAISE EXCEPTION 'completion default-deny RLS/ACL contract failed';
  END IF;
END;
$$;

-- Communication requires a current (approved) graduate record; after the
-- official decision is revoked the record leaves the report population too.
UPDATE public.graduate_official_decisions SET decision_state = 'revoked'
WHERE id = '21212121-2121-4212-8212-212121212121';

DO $$
DECLARE
  v_row record;
BEGIN
  BEGIN
    INSERT INTO public.graduate_communication_events (
      graduate_record_id, contact_point_id, consent_id, purpose_code,
      notice_version, channel, template_code, sent_by
    ) SELECT id, 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
             'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'career_followup',
             'v1', 'email', 'career-check-in-v1',
             '33333333-3333-4333-8333-333333333333'
    FROM public.graduate_records;
    RAISE EXCEPTION 'expected non-current record rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_NOT_CURRENT%' THEN RAISE; END IF;
  END;
  SELECT * INTO v_row
  FROM public.graduate_aggregate_employment_report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2026, 3);
  IF NOT v_row.suppressed OR v_row.population IS NOT NULL THEN
    RAISE EXCEPTION 'revoked records must leave the report population';
  END IF;
END;
$$;
