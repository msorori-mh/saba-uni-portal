\set ON_ERROR_STOP on

-- Executable draft verification for GRADUATES-AFFAIRS-AUTHORIZATION-04.
-- Review chain: graduates-affairs-authorization-04.pg-setup.sql
-- -> GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql
-- -> GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql
-- -> GRADUATES-AFFAIRS-AUTHORIZATION-04.sql -> this file.
--
-- Actor simulation: RPC-level cases run as superuser with transaction-local
-- request.jwt.claims (the RPCs re-check capabilities via auth.uid(); ACL
-- EXECUTE privileges are asserted separately). RLS cases run under
-- SET ROLE authenticated. Like the sibling verifiers this script relies on
-- the CI leg's fresh database and does not wrap itself in a transaction.
--
-- Fixture ids (see pg-setup for users/roles):
--   record A = graduateA, program P1, department D1, cohort 2026
--   record B = graduateB, program P2, department D2, cohort 2026
--   decisions d0000000-...-a/b, survey 91000000-...-1 (+version 92000000-...-1),
--   event 93000000-...-1, opportunities 94000000-...-1(all)/2(p2)/3(empty),
--   employer 95000000-...-1, employment events 96000000-...-1..5.

-- =====================================================================
-- A. Superuser fixtures: approved decisions -> records, engagement data.
-- =====================================================================

CREATE TEMP TABLE verify_ids (key text PRIMARY KEY, id uuid NOT NULL);

INSERT INTO public.graduate_official_decisions (
  id, student_profile_id, source_kind, source_reference, decision_state,
  approved_at, approved_by, effective_graduation_date, program_id,
  department_id, academic_snapshot, source_payload_sha256
) VALUES
  ('d0000000-0000-4000-8000-00000000000a',
   '20000000-0000-4000-8000-00000000000a',
   'registrar_approved_decision', 'REG-2026-A', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', '{"freeze":"approved"}',
   repeat('a', 64)),
  ('d0000000-0000-4000-8000-00000000000b',
   '20000000-0000-4000-8000-00000000000b',
   'registrar_approved_decision', 'REG-2026-B', 'approved', now(),
   '10000000-0000-4000-8000-00000000000c', '2026-06-30',
   '40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', '{"freeze":"approved"}',
   repeat('b', 64));

INSERT INTO verify_ids VALUES
  ('record_a', public.create_graduate_record_from_official_decision('d0000000-0000-4000-8000-00000000000a')),
  ('record_b', public.create_graduate_record_from_official_decision('d0000000-0000-4000-8000-00000000000b'));

DO $$
BEGIN
  IF (SELECT count(*) FROM public.graduate_records WHERE record_state = 'approved') <> 2 THEN
    RAISE EXCEPTION 'expected exactly two approved graduate records';
  END IF;
END;
$$;

INSERT INTO public.graduate_surveys (id, purpose_code, title, state)
VALUES ('91000000-0000-4000-8000-000000000001', 'employment_quality', 'Employment quality 2026', 'active');

INSERT INTO public.graduate_survey_versions (id, survey_id, version, notice_version, questions, published_at)
VALUES ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
        1, 'v1', '[]'::jsonb, now());

INSERT INTO public.graduate_events (
  id, title, event_type, purpose_code, notice_version, starts_at, ends_at, audience_scope, state
) VALUES (
  '93000000-0000-4000-8000-000000000001', 'Career fair 2026', 'career', 'events', 'v1',
  now() + interval '1 day', now() + interval '2 days', '{"all_graduates": true}'::jsonb, 'published'
);

INSERT INTO public.graduate_employers (id, legal_name, normalized_name)
VALUES ('95000000-0000-4000-8000-000000000001', 'Fixture Employer LLC', 'fixture employer llc');

INSERT INTO public.graduate_opportunities (
  id, employer_id, opportunity_type, title, description, audience_scope, state
) VALUES
  ('94000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
   'job', 'All-graduates job', 'open to every graduate', '{"all_graduates": true}'::jsonb, 'draft'),
  ('94000000-0000-4000-8000-000000000002', NULL,
   'internship', 'P2-only internship', 'program P2 audience', '{"program_ids": ["40000000-0000-4000-8000-000000000002"]}'::jsonb, 'draft'),
  ('94000000-0000-4000-8000-000000000003', NULL,
   'training', 'Empty-audience training', 'matches nobody', '{}'::jsonb, 'draft');

-- opp-all and opp-p2 are published directly as fixture data; opp-empty stays
-- draft for the RPC moderation chain test.
UPDATE public.graduate_opportunities
SET state = 'published', published_at = now(), moderated_by = '10000000-0000-4000-8000-00000000000c'
WHERE id IN ('94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002');

-- Cohort fixtures for record A (P1/2026): 3 employed verified directly
-- related, 2 seeking work unverified. A sixth event is self-reported later.
INSERT INTO public.graduate_employment_events (
  id, graduate_record_id, employment_status, specialization_relationship, verification_state
)
SELECT ('96000000-0000-4000-8000-00000000000' || s.n)::uuid, v.id, s.status, s.rel, s.ver
FROM verify_ids v
JOIN (VALUES
  ('1', 'employed'::public.graduate_employment_status, 'directly_related'::public.graduate_specialization_relationship, 'verified'),
  ('2', 'employed', 'directly_related', 'verified'),
  ('3', 'employed', 'directly_related', 'verified'),
  ('4', 'seeking_work', 'not_assessed', 'graduate_reported'),
  ('5', 'seeking_work', 'not_assessed', 'graduate_reported')
) AS s(n, status, rel, ver) ON v.key = 'record_a';

-- =====================================================================
-- B. Graduate A self-service positives.
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_version integer;
  v_consent uuid;
  v_response uuid;
  v_registration uuid;
  v_contact uuid;
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);

  -- Profile upsert: insert with expected version 0, then versioned update,
  -- then a stale-version conflict and an invalid channel.
  v_version := public.graduate_update_own_profile(v_record_a, 'Grad A', 'email', 'career summary', 'private', 0);
  IF v_version <> 1 THEN RAISE EXCEPTION 'profile insert must return version 1'; END IF;
  v_version := public.graduate_update_own_profile(v_record_a, 'Grad A', 'none', NULL, 'graduates_affairs', 1);
  IF v_version <> 2 THEN RAISE EXCEPTION 'profile update must return version 2'; END IF;
  BEGIN
    PERFORM public.graduate_update_own_profile(v_record_a, 'Grad A', 'email', NULL, 'private', 1);
    RAISE EXCEPTION 'expected version conflict';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_PROFILE_VERSION_CONFLICT%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_update_own_profile(v_record_a, 'Grad A', 'sms', NULL, 'private', 2);
    RAISE EXCEPTION 'expected invalid channel rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_PROFILE_INVALID_CHANNEL%' THEN RAISE; END IF;
  END;

  -- Consent grant + withdraw lifecycle.
  v_consent := public.graduate_grant_consent(v_record_a, 'employment_quality', 'v1');
  INSERT INTO verify_ids VALUES ('consent_survey_a', v_consent);
  v_consent := public.graduate_grant_consent(v_record_a, 'events', 'v1');
  INSERT INTO verify_ids VALUES ('consent_event_a', v_consent);
  v_consent := public.graduate_grant_consent(v_record_a, 'career_followup', 'v1');
  PERFORM public.graduate_withdraw_consent(v_consent);
  IF (SELECT c.consent_state FROM public.graduate_consents c WHERE c.id = v_consent) <> 'withdrawn'
     OR (SELECT c.withdrawn_at FROM public.graduate_consents c WHERE c.id = v_consent) IS NULL THEN
    RAISE EXCEPTION 'consent withdrawal did not persist';
  END IF;
  BEGIN
    PERFORM public.graduate_grant_consent(v_record_a, '  ', 'v1');
    RAISE EXCEPTION 'expected empty purpose rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_CONSENT_INVALID_INPUT%' THEN RAISE; END IF;
  END;

  -- Contact point add + metadata-only listing.
  v_contact := public.graduate_add_contact_point(v_record_a, 'email', 'a@example.test', 'career_followup');
  INSERT INTO verify_ids VALUES ('contact_a', v_contact);
  SELECT count(*) INTO v_count FROM public.graduate_my_contact_points(v_record_a);
  IF v_count <> 1 THEN RAISE EXCEPTION 'expected exactly one contact point metadata row'; END IF;
  IF (SELECT t.is_verified FROM public.graduate_my_contact_points(v_record_a) t) THEN
    RAISE EXCEPTION 'self-added contact point must start unverified';
  END IF;
  BEGIN
    PERFORM public.graduate_add_contact_point(v_record_a, 'fax', '123', 'career_followup');
    RAISE EXCEPTION 'expected invalid contact channel rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_CONTACT_POINT_INVALID_INPUT%' THEN RAISE; END IF;
  END;

  -- Employment self-report (seeking_work keeps the cohort employed cell at 3).
  PERFORM public.graduate_report_employment(
    v_record_a, 'seeking_work', 'Self Reported Employer', 'Technician', 'not_assessed',
    date '2026-08-01', NULL);

  -- Survey submit with the matching consent; duplicate rejected; withdraw.
  v_response := public.graduate_submit_survey_response(
    '92000000-0000-4000-8000-000000000001', v_record_a,
    (SELECT id FROM verify_ids WHERE key = 'consent_survey_a'), '{"q1": "yes"}'::jsonb);
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      '92000000-0000-4000-8000-000000000001', v_record_a,
      (SELECT id FROM verify_ids WHERE key = 'consent_survey_a'), '{}'::jsonb);
    RAISE EXCEPTION 'expected duplicate survey response rejection';
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> '23505' THEN RAISE; END IF;
  END;
  PERFORM public.graduate_withdraw_survey_response(v_response);

  -- Event registration with matching consent; then cancel.
  v_registration := public.graduate_register_for_event(
    '93000000-0000-4000-8000-000000000001', v_record_a,
    (SELECT id FROM verify_ids WHERE key = 'consent_event_a'));
  PERFORM public.graduate_cancel_event_registration(v_registration);
END;
$$;

-- =====================================================================
-- C. Graduate A negatives: B's record is unreachable; staff-only RPCs deny.
-- =====================================================================

DO $$
DECLARE
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_profiles bigint;
  v_consents bigint;
  v_contacts bigint;
  v_responses bigint;
  v_events bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_profiles FROM public.graduate_profiles;
  SELECT count(*) INTO v_consents FROM public.graduate_consents;
  SELECT count(*) INTO v_contacts FROM public.graduate_contact_points;
  SELECT count(*) INTO v_responses FROM public.graduate_survey_responses;
  SELECT count(*) INTO v_events FROM public.graduate_domain_events;

  BEGIN
    PERFORM public.graduate_update_own_profile(v_record_b, 'Hijack', 'email', NULL, 'private', 0);
    RAISE EXCEPTION 'expected cross-record profile denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_grant_consent(v_record_b, 'employment_quality', 'v1');
    RAISE EXCEPTION 'expected cross-record consent denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_add_contact_point(v_record_b, 'email', 'b@example.test', 'career_followup');
    RAISE EXCEPTION 'expected cross-record contact point denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_submit_survey_response(
      '92000000-0000-4000-8000-000000000001', v_record_b,
      (SELECT id FROM verify_ids WHERE key = 'consent_survey_a'), '{}'::jsonb);
    RAISE EXCEPTION 'expected cross-record survey denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_cohort_employment_report(
      '40000000-0000-4000-8000-000000000001', 2026, 3);
    RAISE EXCEPTION 'expected non-staff cohort report denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_search_records();
    RAISE EXCEPTION 'expected non-staff search denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.graduate_profiles) <> v_profiles
     OR (SELECT count(*) FROM public.graduate_consents) <> v_consents
     OR (SELECT count(*) FROM public.graduate_contact_points) <> v_contacts
     OR (SELECT count(*) FROM public.graduate_survey_responses) <> v_responses
     OR (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'denied self-service calls mutated state';
  END IF;
END;
$$;

-- =====================================================================
-- D. Anonymous, unrelated user, wrong-unit staff, inactive and expired
--    assignments: every staff capability denies with zero mutation.
-- =====================================================================

DO $$
DECLARE
  v_actor text;
  v_actors text[] := ARRAY[
    '',                                            -- anonymous (auth.uid() NULL)
    '10000000-0000-4000-8000-00000000000f',        -- unrelatedUserU
    '10000000-0000-4000-8000-00000000000e',        -- unrelatedStaffU (student_affairs)
    '10000000-0000-4000-8000-000000000001',        -- inactiveStaffU (is_active false)
    '10000000-0000-4000-8000-000000000002'         -- expiredStaffU (ends_at past)
  ];
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_expected text;
  v_events bigint;
BEGIN
  FOREACH v_actor IN ARRAY v_actors LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN v_actor = '' THEN ''
           ELSE json_build_object('sub', v_actor, 'role', 'authenticated')::text END, true);
    v_expected := CASE WHEN v_actor = '' THEN 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED'
                       ELSE 'GRADUATE_AFFAIRS_ACCESS_DENIED' END;
    SELECT count(*) INTO v_events FROM public.graduate_domain_events;

    BEGIN
      PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
      RAISE EXCEPTION 'expected file read denial for %', COALESCE(NULLIF(v_actor, ''), 'anonymous');
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%' || v_expected || '%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_search_records();
      RAISE EXCEPTION 'expected search denial';
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%' || v_expected || '%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_moderate_opportunity(
        '94000000-0000-4000-8000-000000000001', 'archived');
      RAISE EXCEPTION 'expected moderation denial';
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%' || v_expected || '%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_set_employer_verification(
        '95000000-0000-4000-8000-000000000001', 'in_review');
      RAISE EXCEPTION 'expected employer verification denial';
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%' || v_expected || '%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_create_followup(
        v_record_a, '10000000-0000-4000-8000-00000000000d', 'career_followup');
      RAISE EXCEPTION 'expected followup create denial';
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%' || v_expected || '%' THEN RAISE; END IF;
    END;

    IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
      RAISE EXCEPTION 'denied staff calls wrote audit events for %', v_actor;
    END IF;
  END LOOP;
END;
$$;

-- =====================================================================
-- E. Specialist: D1 scope works, D2 is denied, employer verification chain,
--    cohort report scoping. (Runs before any follow-up exists on record B.)
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_count integer;
  v_row record;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);

  -- In-scope read and scoped search.
  PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
  SELECT count(*) INTO v_count FROM public.graduate_affairs_search_records();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'specialist default search must return only the D1 record, got %', v_count;
  END IF;
  IF (SELECT s.id FROM public.graduate_affairs_search_records() s) <> v_record_a THEN
    RAISE EXCEPTION 'specialist search returned an out-of-scope record';
  END IF;

  -- Out-of-scope denials on record B / department D2.
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_b);
    RAISE EXCEPTION 'expected specialist D2 file denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_search_records('30000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'expected specialist D2 search rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_OUT_OF_SCOPE%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_create_followup(v_record_b, '10000000-0000-4000-8000-00000000000c', 'career_followup');
    RAISE EXCEPTION 'expected specialist D2 followup create denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  -- MVP manager-only: specialist must be denied moderation and verification.
  BEGIN
    PERFORM public.graduate_affairs_set_employer_verification('95000000-0000-4000-8000-000000000001', 'in_review');
    RAISE EXCEPTION 'expected specialist employer verification denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_moderate_opportunity(
      '94000000-0000-4000-8000-000000000001', 'archived');
    RAISE EXCEPTION 'expected specialist opportunity moderation denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  IF (SELECT verification_state FROM public.graduate_employers
      WHERE id = '95000000-0000-4000-8000-000000000001') <> 'unverified' THEN
    RAISE EXCEPTION 'specialist denial mutated employer verification';
  END IF;

  -- Cohort report: P1 in scope returns a row; P2 out of scope denies.
  SELECT * INTO v_row FROM public.graduate_affairs_cohort_employment_report(
    '40000000-0000-4000-8000-000000000001', 2026, 3);
  IF v_row.suppressed OR v_row.population <> 6 OR v_row.employed <> 3
     OR v_row.specialization_related <> 3 OR v_row.verified <> 3 THEN
    RAISE EXCEPTION 'specialist cohort report incorrect: %', v_row;
  END IF;
  BEGIN
    PERFORM public.graduate_affairs_cohort_employment_report(
      '40000000-0000-4000-8000-000000000002', 2026, 3);
    RAISE EXCEPTION 'expected specialist out-of-scope cohort denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_OUT_OF_SCOPE%' THEN RAISE; END IF;
  END;
END;
$$;

-- =====================================================================
-- F. Manager: college scope, follow-up creation, moderation chain, report.
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_file jsonb;
  v_count integer;
  v_followup uuid;
  v_row record;
  v_followups bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);

  -- Graduate file: metadata projections only, never protected columns/values.
  v_file := public.graduate_affairs_get_graduate_file(v_record_a);
  IF v_file IS NULL OR (v_file->'record'->>'id')::uuid <> v_record_a THEN
    RAISE EXCEPTION 'manager graduate file missing record identity';
  END IF;
  IF v_file::text LIKE '%protected_value%' OR v_file::text LIKE '%notes_protected%'
     OR v_file::text LIKE '%a@example.test%' THEN
    RAISE EXCEPTION 'graduate file leaks protected contact/notes content';
  END IF;

  -- College-scope search: both departments, and a D2-filtered search.
  SELECT count(*) INTO v_count FROM public.graduate_affairs_search_records();
  IF v_count <> 2 THEN RAISE EXCEPTION 'manager search must span departments, got %', v_count; END IF;
  SELECT count(*) INTO v_count
  FROM public.graduate_affairs_search_records('30000000-0000-4000-8000-000000000002');
  IF v_count <> 1 THEN RAISE EXCEPTION 'manager D2 search must return record B only'; END IF;

  -- Follow-up creation: manager assigns the specialist (record A).
  v_followup := public.graduate_affairs_create_followup(
    v_record_a, '10000000-0000-4000-8000-00000000000d', 'career_followup', now() + interval '7 days');
  INSERT INTO verify_ids VALUES ('followup_a', v_followup);

  -- Assignee must be active graduates-affairs staff.
  SELECT count(*) INTO v_followups FROM public.graduate_followups;
  BEGIN
    PERFORM public.graduate_affairs_create_followup(v_record_b, '10000000-0000-4000-8000-00000000000f', 'career_followup');
    RAISE EXCEPTION 'expected assignee-not-staff rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_ASSIGNEE_NOT_STAFF%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.graduate_followups) <> v_followups THEN
    RAISE EXCEPTION 'rejected followup create mutated state';
  END IF;

  -- One active follow-up per record (foundation partial unique index).
  BEGIN
    PERFORM public.graduate_affairs_create_followup(v_record_a, '10000000-0000-4000-8000-00000000000c', 'career_followup');
    RAISE EXCEPTION 'expected single-active-followup rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%graduate_followups_one_active_per_graduate%' THEN RAISE; END IF;
  END;

  -- Direct-assignment fixture for record B (specialist has no D2 scope).
  v_followup := public.graduate_affairs_create_followup(
    v_record_b, '10000000-0000-4000-8000-00000000000d', 'career_followup');
  INSERT INTO verify_ids VALUES ('followup_b', v_followup);

  -- Opportunity moderation chain on the empty-audience draft.
  -- Manager employer verification chain: unverified -> in_review -> verified.
  PERFORM public.graduate_affairs_set_employer_verification('95000000-0000-4000-8000-000000000001', 'in_review');
  PERFORM public.graduate_affairs_set_employer_verification('95000000-0000-4000-8000-000000000001', 'verified');
  IF (SELECT verification_state FROM public.graduate_employers
      WHERE id = '95000000-0000-4000-8000-000000000001') <> 'verified' THEN
    RAISE EXCEPTION 'manager employer verification failed';
  END IF;
  BEGIN
    PERFORM public.graduate_affairs_set_employer_verification('95000000-0000-4000-8000-000000000001', 'rejected');
    RAISE EXCEPTION 'expected invalid employer transition rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_EMPLOYER_INVALID_TRANSITION%' THEN RAISE; END IF;
  END;

  PERFORM public.graduate_affairs_moderate_opportunity('94000000-0000-4000-8000-000000000003', 'in_review');
  PERFORM public.graduate_affairs_moderate_opportunity('94000000-0000-4000-8000-000000000003', 'published');
  SELECT * INTO v_row FROM public.graduate_opportunities WHERE id = '94000000-0000-4000-8000-000000000003';
  IF v_row.state <> 'published' OR v_row.published_at IS NULL
     OR v_row.moderated_by <> '10000000-0000-4000-8000-00000000000c' THEN
    RAISE EXCEPTION 'moderation provenance not recorded: %', v_row;
  END IF;
  BEGIN
    PERFORM public.graduate_affairs_moderate_opportunity('94000000-0000-4000-8000-000000000003', 'draft');
    RAISE EXCEPTION 'expected invalid opportunity transition rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_OPPORTUNITY_INVALID_TRANSITION%' THEN RAISE; END IF;
  END;

  -- Cohort report as manager returns the aggregate row.
  SELECT * INTO v_row FROM public.graduate_affairs_cohort_employment_report(
    '40000000-0000-4000-8000-000000000001', 2026, 3);
  IF v_row.suppressed OR v_row.population <> 6 OR v_row.employed <> 3
     OR v_row.specialization_related <> 3 OR v_row.verified <> 3 THEN
    RAISE EXCEPTION 'manager cohort report incorrect: %', v_row;
  END IF;
END;
$$;

-- =====================================================================
-- G. Follow-up transitions: assignee chain, non-assignee denial, and the
--    direct-assignee read path on the out-of-scope record B.
-- =====================================================================

DO $$
DECLARE
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_followup_a uuid := (SELECT id FROM verify_ids WHERE key = 'followup_a');
  v_file jsonb;
BEGIN
  -- Assignee (specialist): open -> in_progress.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  PERFORM public.graduate_affairs_transition_followup(v_followup_a, 'in_progress', NULL, now() + interval '3 days');

  -- Non-assignee, non-manager staff cannot transition.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000e', 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup_a, 'completed', 'done');
    RAISE EXCEPTION 'expected non-assignee transition denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;

  -- Direct assignee reads the out-of-scope record B file.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  v_file := public.graduate_affairs_get_graduate_file(v_record_b);
  IF (v_file->'record'->>'id')::uuid <> v_record_b THEN
    RAISE EXCEPTION 'direct assignee must read the assigned record file';
  END IF;

  -- Assignee completes with an outcome (foundation trigger requires it).
  PERFORM public.graduate_affairs_transition_followup(v_followup_a, 'completed', 'contacted and advised');
  IF (SELECT f.state FROM public.graduate_followups f WHERE f.id = v_followup_a) <> 'completed' THEN
    RAISE EXCEPTION 'follow-up completion did not persist';
  END IF;
END;
$$;

-- =====================================================================
-- H. Visibility lists after moderation + employer verification.
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_count integer;
  v_name text;
BEGIN
  -- Graduate A: only the all-graduates opportunity; verified employer named.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.graduate_list_visible_opportunities(v_record_a);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'A must see exactly the all-graduates opportunity, got %', v_count;
  END IF;
  SELECT t.employer_name INTO v_name
  FROM public.graduate_list_visible_opportunities(v_record_a) t
  WHERE t.id = '94000000-0000-4000-8000-000000000001';
  IF v_name IS DISTINCT FROM 'Fixture Employer LLC' THEN
    RAISE EXCEPTION 'verified employer name must be disclosed, got %', v_name;
  END IF;
  SELECT count(*) INTO v_count FROM public.graduate_list_visible_events(v_record_a);
  IF v_count <> 1 THEN RAISE EXCEPTION 'A must see exactly one event, got %', v_count; END IF;

  -- Graduate B: all-graduates plus the P2-scoped opportunity, never '{}'.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.graduate_list_visible_opportunities(v_record_b);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'B must see all-graduates and P2 opportunities, got %', v_count;
  END IF;
END;
$$;

-- =====================================================================
-- I. RLS + ACL under the real role: policies are the boundary.
-- =====================================================================

GRANT SELECT ON TABLE verify_ids TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, false);

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_count integer;
BEGIN
  -- Self SELECT policies expose own rows.
  SELECT count(*) INTO v_count FROM public.graduate_consents;
  IF v_count < 2 THEN RAISE EXCEPTION 'self consents not visible through policy'; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_profiles;
  IF v_count <> 1 THEN RAISE EXCEPTION 'self profile not visible through policy'; END IF;

  -- Policy-less tables stay default-deny (zero rows, not an error).
  SELECT count(*) INTO v_count FROM public.graduate_records;
  IF v_count <> 0 THEN RAISE EXCEPTION 'graduate_records must stay default-deny'; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_contact_points;
  IF v_count <> 0 THEN RAISE EXCEPTION 'graduate_contact_points must stay default-deny'; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_followups;
  IF v_count <> 0 THEN RAISE EXCEPTION 'graduate_followups must stay default-deny'; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_domain_events;
  IF v_count <> 0 THEN RAISE EXCEPTION 'graduate_domain_events must stay default-deny'; END IF;

  -- No INSERT policy on graduate_profiles: the RPC is the only write path.
  BEGIN
    INSERT INTO public.graduate_profiles (graduate_record_id) VALUES (v_record_a);
    RAISE EXCEPTION 'expected RLS insert denial';
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> '42501' THEN RAISE; END IF;
  END;

  -- No UPDATE policy: direct UPDATE touches zero rows.
  UPDATE public.graduate_profiles SET career_summary = 'tampered' WHERE graduate_record_id = v_record_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'direct UPDATE must affect zero rows'; END IF;

  -- Audience policies: exactly the all-graduates opportunity and the event.
  SELECT count(*) INTO v_count FROM public.graduate_opportunities;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'opportunity policy must expose exactly one row to A, got %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.graduate_events;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'event policy must expose exactly one row to A, got %', v_count;
  END IF;

  -- RPC EXECUTE smoke under the real role.
  SELECT count(*) INTO v_count FROM public.graduate_my_contact_points(v_record_a);
  IF v_count <> 1 THEN RAISE EXCEPTION 'authenticated RPC smoke failed'; END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- =====================================================================
-- J. Approved-gate regression (PR273 REMEDIATION-06): graduate-facing list
--    RPC visibility must equal direct RLS visibility across every lifecycle
--    transition. A corrected/revoked record must see NOTHING through either
--    path, immediately.
-- =====================================================================

-- J1. Baseline parity for the approved record A: both paths expose exactly
--     the audience-matching published rows, each exactly once.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, false);

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_rpc integer;
  v_rls integer;
  v_distinct integer;
BEGIN
  SELECT count(*) INTO v_rpc FROM public.graduate_list_visible_opportunities(v_record_a);
  SELECT count(*) INTO v_rls FROM public.graduate_opportunities;
  SELECT count(DISTINCT t.id) INTO v_distinct FROM public.graduate_list_visible_opportunities(v_record_a) t;
  IF v_rpc <> 1 OR v_rls <> 1 OR v_distinct <> 1 THEN
    RAISE EXCEPTION 'baseline opportunity parity broken: rpc=% rls=% distinct=%', v_rpc, v_rls, v_distinct;
  END IF;
  SELECT count(*) INTO v_rpc FROM public.graduate_list_visible_events(v_record_a);
  SELECT count(*) INTO v_rls FROM public.graduate_events;
  SELECT count(DISTINCT t.id) INTO v_distinct FROM public.graduate_list_visible_events(v_record_a) t;
  IF v_rpc <> 1 OR v_rls <> 1 OR v_distinct <> 1 THEN
    RAISE EXCEPTION 'baseline event parity broken: rpc=% rls=% distinct=%', v_rpc, v_rls, v_distinct;
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- J2. Negative-visibility fixtures (superuser): draft, malformed-audience,
--     empty-array-audience and wrong-department published engagements.
INSERT INTO public.graduate_opportunities (
  id, opportunity_type, title, description, audience_scope, state
) VALUES
  ('94000000-0000-4000-8000-000000000011', 'job', 'Draft job', 'never visible',
   '{"all_graduates": true}'::jsonb, 'draft'),
  ('94000000-0000-4000-8000-000000000012', 'job', 'Malformed-audience job', 'never visible',
   '"not-an-object"'::jsonb, 'draft'),
  ('94000000-0000-4000-8000-000000000013', 'job', 'Empty-array job', 'never visible',
   '{"program_ids": []}'::jsonb, 'draft'),
  ('94000000-0000-4000-8000-000000000014', 'job', 'D2-only job', 'never visible to A',
   '{"department_ids": ["30000000-0000-4000-8000-000000000002"]}'::jsonb, 'draft');
UPDATE public.graduate_opportunities
SET state = 'published', published_at = now(), moderated_by = '10000000-0000-4000-8000-00000000000c'
WHERE id IN ('94000000-0000-4000-8000-000000000012',
             '94000000-0000-4000-8000-000000000013',
             '94000000-0000-4000-8000-000000000014');

INSERT INTO public.graduate_events (
  id, title, event_type, purpose_code, notice_version, starts_at, ends_at, audience_scope, state
) VALUES
  ('93000000-0000-4000-8000-000000000011', 'Draft event', 'career', 'events', 'v1',
   now() + interval '1 day', now() + interval '2 days', '{"all_graduates": true}'::jsonb, 'draft'),
  ('93000000-0000-4000-8000-000000000012', 'Malformed event', 'career', 'events', 'v1',
   now() + interval '1 day', now() + interval '2 days', '42'::jsonb, 'published');

-- J3. The approved record A must see none of J2's rows on either path.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, false);

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_rpc integer;
  v_rls integer;
BEGIN
  SELECT count(*) INTO v_rpc FROM public.graduate_list_visible_opportunities(v_record_a);
  SELECT count(*) INTO v_rls FROM public.graduate_opportunities;
  IF v_rpc <> 1 OR v_rls <> 1 THEN
    RAISE EXCEPTION 'draft/malformed/empty/wrong-department opportunities leaked: rpc=% rls=%', v_rpc, v_rls;
  END IF;
  SELECT count(*) INTO v_rpc FROM public.graduate_list_visible_events(v_record_a);
  SELECT count(*) INTO v_rls FROM public.graduate_events;
  IF v_rpc <> 1 OR v_rls <> 1 THEN
    RAISE EXCEPTION 'draft/malformed events leaked: rpc=% rls=%', v_rpc, v_rls;
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- J4. approved -> corrected (record A): immediate invisibility on both
--     paths while a published audience-matching row still exists;
--     corrected -> approved is explicitly denied with zero mutation.
DO $$
BEGIN
  UPDATE public.graduate_official_decisions
  SET decision_state = 'corrected'
  WHERE id = 'd0000000-0000-4000-8000-00000000000a';
  IF (SELECT r.record_state FROM public.graduate_records r
      JOIN verify_ids v ON v.key = 'record_a' AND v.id = r.id) <> 'corrected' THEN
    RAISE EXCEPTION 'correction did not propagate to record A';
  END IF;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, false);

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_count integer;
BEGIN
  -- RPC path must fail closed for a non-approved self record. On the
  -- unfixed draft this PERFORM returns the still-published all-graduates
  -- opportunity instead of raising: the visibility bypass.
  BEGIN
    PERFORM public.graduate_list_visible_opportunities(v_record_a);
    RAISE EXCEPTION 'VISIBILITY BYPASS: opportunity list RPC still serves a corrected record';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_NOT_CURRENT%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_list_visible_events(v_record_a);
    RAISE EXCEPTION 'VISIBILITY BYPASS: event list RPC still serves a corrected record';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_NOT_CURRENT%' THEN RAISE; END IF;
  END;
  -- Direct RLS path: the corrected record sees zero rows.
  SELECT count(*) INTO v_count FROM public.graduate_opportunities;
  IF v_count <> 0 THEN RAISE EXCEPTION 'corrected record sees opportunities via RLS: %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_events;
  IF v_count <> 0 THEN RAISE EXCEPTION 'corrected record sees events via RLS: %', v_count; END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

DO $$
DECLARE
  v_events bigint := (SELECT count(*) FROM public.graduate_domain_events);
BEGIN
  BEGIN
    UPDATE public.graduate_official_decisions
    SET decision_state = 'approved'
    WHERE id = 'd0000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'expected corrected->approved transition denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%INVALID_OFFICIAL_GRADUATION_DECISION_TRANSITION%' THEN RAISE; END IF;
  END;
  IF (SELECT d.decision_state FROM public.graduate_official_decisions d
      WHERE d.id = 'd0000000-0000-4000-8000-00000000000a') <> 'corrected' THEN
    RAISE EXCEPTION 'rejected corrected->approved transition mutated the decision';
  END IF;
  IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'rejected corrected->approved transition mutated domain events';
  END IF;
END;
$$;

-- J5. approved -> unpublished (record B is still approved): closing the
--     all-graduates opportunity and cancelling the event must remove
--     visibility immediately on both paths; B keeps exactly its in-audience
--     rows (the P2 opportunity and the D2-department opportunity).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  PERFORM public.graduate_affairs_moderate_opportunity('94000000-0000-4000-8000-000000000001', 'closed');
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
UPDATE public.graduate_events
SET state = 'cancelled'
WHERE id = '93000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '10000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, false);

DO $$
DECLARE
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_rpc integer;
  v_rls integer;
  v_distinct integer;
BEGIN
  -- B (department D2) keeps exactly its two in-audience rows: the P2
  -- opportunity and the D2-department opportunity from J2. The closed
  -- all-graduates opportunity must be gone from both paths.
  SELECT count(*) INTO v_rpc FROM public.graduate_list_visible_opportunities(v_record_b);
  SELECT count(*) INTO v_rls FROM public.graduate_opportunities;
  SELECT count(DISTINCT t.id) INTO v_distinct FROM public.graduate_list_visible_opportunities(v_record_b) t;
  IF v_rpc <> 2 OR v_rls <> 2 OR v_distinct <> 2 THEN
    RAISE EXCEPTION 'post-close parity broken for B: rpc=% rls=% distinct=%',
      v_rpc, v_rls, v_distinct;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graduate_list_visible_opportunities(v_record_b) t
    WHERE t.id = '94000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'closed opportunity still returned by the list RPC';
  END IF;
  SELECT count(*) INTO v_rpc FROM public.graduate_list_visible_events(v_record_b);
  SELECT count(*) INTO v_rls FROM public.graduate_events;
  IF v_rpc <> 0 OR v_rls <> 0 THEN
    RAISE EXCEPTION 'cancelled event still visible: rpc=% rls=%', v_rpc, v_rls;
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- J6. approved -> revoked (record B): same invisibility; revoked -> approved
--     explicitly denied with zero mutation.
DO $$
BEGIN
  UPDATE public.graduate_official_decisions
  SET decision_state = 'revoked'
  WHERE id = 'd0000000-0000-4000-8000-00000000000b';
  IF (SELECT r.record_state FROM public.graduate_records r
      JOIN verify_ids v ON v.key = 'record_b' AND v.id = r.id) <> 'revoked' THEN
    RAISE EXCEPTION 'revocation did not propagate to record B';
  END IF;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '10000000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, false);

DO $$
DECLARE
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_count integer;
BEGIN
  BEGIN
    PERFORM public.graduate_list_visible_opportunities(v_record_b);
    RAISE EXCEPTION 'VISIBILITY BYPASS: opportunity list RPC still serves a revoked record';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_NOT_CURRENT%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_list_visible_events(v_record_b);
    RAISE EXCEPTION 'VISIBILITY BYPASS: event list RPC still serves a revoked record';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_RECORD_NOT_CURRENT%' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_count FROM public.graduate_opportunities;
  IF v_count <> 0 THEN RAISE EXCEPTION 'revoked record sees opportunities via RLS: %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_events;
  IF v_count <> 0 THEN RAISE EXCEPTION 'revoked record sees events via RLS: %', v_count; END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

DO $$
DECLARE
  v_events bigint := (SELECT count(*) FROM public.graduate_domain_events);
BEGIN
  BEGIN
    UPDATE public.graduate_official_decisions
    SET decision_state = 'approved'
    WHERE id = 'd0000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'expected revoked->approved transition denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%INVALID_OFFICIAL_GRADUATION_DECISION_TRANSITION%' THEN RAISE; END IF;
  END;
  IF (SELECT d.decision_state FROM public.graduate_official_decisions d
      WHERE d.id = 'd0000000-0000-4000-8000-00000000000b') <> 'revoked' THEN
    RAISE EXCEPTION 'rejected revoked->approved transition mutated the decision';
  END IF;
  IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'rejected revoked->approved transition mutated domain events';
  END IF;
END;
$$;

-- J7. Privileged-role analogues (registrar/dean/admin): the domain never
--     consults app_role, so these are exactly unassigned authenticated users.
--     Every staff RPC and every graduate-facing list RPC must deny them.
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_user text;
  v_opps bigint := (SELECT count(*) FROM public.graduate_opportunities);
  v_events bigint := (SELECT count(*) FROM public.graduate_domain_events);
BEGIN
  FOREACH v_user IN ARRAY ARRAY[
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005'
  ] LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    BEGIN
      PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
      RAISE EXCEPTION 'privileged-role analogue % read a graduate file', v_user;
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_search_records();
      RAISE EXCEPTION 'privileged-role analogue % searched records', v_user;
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_moderate_opportunity(
        '94000000-0000-4000-8000-000000000002', 'closed');
      RAISE EXCEPTION 'privileged-role analogue % moderated an opportunity', v_user;
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_affairs_cohort_employment_report(
        '40000000-0000-4000-8000-000000000001', 2026, 3);
      RAISE EXCEPTION 'privileged-role analogue % read a cohort report', v_user;
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.graduate_list_visible_opportunities(v_record_a);
      RAISE EXCEPTION 'privileged-role analogue % listed opportunities', v_user;
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  IF (SELECT count(*) FROM public.graduate_opportunities) <> v_opps
     OR (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'privileged-role analogue denials mutated state';
  END IF;
END;
$$;

-- =====================================================================
-- K. Privilege, policy-count, audit and append-only assertions (superuser).
-- =====================================================================

DO $$
DECLARE
    v_rpcs text[] := ARRAY[
    'graduate_update_own_profile(uuid,text,text,text,text,integer)',
    'graduate_grant_consent(uuid,text,text)',
    'graduate_withdraw_consent(uuid)',
    'graduate_add_contact_point(uuid,text,text,text)',
    'graduate_revoke_contact_point(uuid)',
    'graduate_my_contact_points(uuid)',
    'graduate_report_employment(uuid,graduate_employment_status,text,text,graduate_specialization_relationship,date,date)',
    'graduate_submit_survey_response(uuid,uuid,uuid,jsonb)',
    'graduate_withdraw_survey_response(uuid)',
    'graduate_register_for_event(uuid,uuid,uuid)',
    'graduate_cancel_event_registration(uuid)',
    'graduate_list_visible_opportunities(uuid)',
    'graduate_list_visible_events(uuid)',
    'graduate_affairs_get_graduate_file(uuid)',
    'graduate_affairs_search_records(uuid,uuid,integer,integer)',
    'graduate_affairs_create_followup(uuid,uuid,text,timestamp with time zone)',
    'graduate_affairs_transition_followup(uuid,graduate_followup_state,text,timestamp with time zone)',
    'graduate_affairs_moderate_opportunity(uuid,graduate_opportunity_state)',
    'graduate_affairs_set_employer_verification(uuid,text)',
    'graduate_affairs_cohort_employment_report(uuid,integer,integer)',
    'graduate_affairs_resolve_self_context(text)',
    'graduate_affairs_resolve_staff_record_access(uuid)'
  ];
  v_helpers text[] := ARRAY[
    'graduate_affairs_audit(text,text,uuid,text,jsonb)',
    'graduate_affairs_resolve_authorized_staff_profile_id(uuid,text)',
    'graduate_affairs_resolve_caller_authorized_staff_profile_id(text)',
    'graduate_affairs_lock_authorized_staff_profile_id(uuid,text)',
    'graduate_affairs_lock_caller_authorized_staff_profile(text)',
    'graduate_affairs_is_manager()',
    'graduate_affairs_is_specialist()',
    'graduate_affairs_specialist_department_ids()',
    'graduate_affairs_can_access_record(uuid)',
    'graduate_require_approved_record_locked(uuid)',
    'graduate_affairs_user_is_active_staff(uuid)',
    'graduate_affairs_user_specialist_department_ids(uuid)',
    'graduate_is_self(uuid)'
  ];
  v_policy_helpers text[] := ARRAY[
    'graduate_is_current_self(uuid)',
    'graduate_audience_matches(jsonb,uuid,uuid)',
    'graduate_self_matches_audience(jsonb)'
  ];
  v_sig text;
  v_cols text;
BEGIN
  FOREACH v_sig IN ARRAY v_rpcs LOOP
    IF NOT has_function_privilege('authenticated', 'public.' || v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated must EXECUTE %', v_sig;
    END IF;
    IF has_function_privilege('anon', 'public.' || v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon must not EXECUTE %', v_sig;
    END IF;
  END LOOP;
  FOREACH v_sig IN ARRAY v_helpers LOOP
    IF has_function_privilege('authenticated', 'public.' || v_sig, 'EXECUTE')
       OR has_function_privilege('anon', 'public.' || v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'internal helper must not be executable: %', v_sig;
    END IF;
  END LOOP;
  -- Policy expressions run with the querying user's privileges, so the two
  -- helpers referenced by policies must be executable by authenticated only.
  FOREACH v_sig IN ARRAY v_policy_helpers LOOP
    IF NOT has_function_privilege('authenticated', 'public.' || v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'policy helper must be executable by authenticated: %', v_sig;
    END IF;
    IF has_function_privilege('anon', 'public.' || v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'policy helper must not be executable by anon: %', v_sig;
    END IF;
  END LOOP;

  -- Exactly the seven policies of this bundle exist on graduate_* tables.
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename LIKE 'graduate\_%') <> 7 THEN
    RAISE EXCEPTION 'expected exactly seven graduate_* policies';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('graduate_records','graduate_contact_points','graduate_official_decisions',
                        'graduate_employers','graduate_surveys','graduate_survey_versions',
                        'graduate_domain_events','graduate_followups','graduate_communication_events',
                        'graduate_account_continuity_policies')
  ) THEN
    RAISE EXCEPTION 'protected tables must stay policy-less';
  END IF;

  -- my_contact_points projection never includes the protected value column.
  SELECT string_agg(p.parameter_name, ',' ORDER BY p.ordinal_position) INTO v_cols
  FROM information_schema.parameters p
  WHERE p.specific_schema = 'public'
    AND p.specific_name ~ '^graduate_my_contact_points'
    AND p.parameter_mode IN ('OUT','TABLE');
  IF v_cols IS NULL OR v_cols LIKE '%protected_value%' THEN
    RAISE EXCEPTION 'contact point projection contract broken: %', v_cols;
  END IF;
END;
$$;

DO $$
DECLARE
  v_event_types text[] := ARRAY[
    'graduate_profile_self_updated',
    'graduate_consent_granted',
    'graduate_consent_withdrawn',
    'graduate_contact_point_added',
    'graduate_employment_self_reported',
    'graduate_survey_response_submitted',
    'graduate_survey_response_withdrawn',
    'graduate_event_registration_created',
    'graduate_event_registration_cancelled',
    'graduate_file_staff_read',
    'graduate_records_search',
    'graduate_followup_created',
    'graduate_followup_transitioned',
    'graduate_opportunity_moderated',
    'graduate_employer_verification_changed',
    'graduate_cohort_report_read'
  ];
  v_type text;
BEGIN
  FOREACH v_type IN ARRAY v_event_types LOOP
    IF NOT EXISTS (SELECT 1 FROM public.graduate_domain_events e WHERE e.event_type = v_type) THEN
      RAISE EXCEPTION 'missing audit event type %', v_type;
    END IF;
  END LOOP;

  -- Audit payloads never carry PII values written during this run.
  IF EXISTS (
    SELECT 1 FROM public.graduate_domain_events e
    WHERE e.payload::text LIKE '%a@example.test%'
       OR e.payload::text LIKE '%Grad A%'
       OR e.payload::text LIKE '%Self Reported Employer%'
  ) THEN
    RAISE EXCEPTION 'audit payload contains PII values';
  END IF;

  -- Domain events remain append-only.
  BEGIN
    UPDATE public.graduate_domain_events SET purpose_code = 'tampered';
    RAISE EXCEPTION 'expected append-only rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.graduate_domain_events;
    RAISE EXCEPTION 'expected append-only delete rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATES_AFFAIRS_APPEND_ONLY_RECORD%' THEN RAISE; END IF;
  END;
END;
$$;

-- =====================================================================
-- R. Multimodel remediation matrix (R1-R7 / R12)
-- =====================================================================

DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_scope uuid[];
  v_events integer;
  v_followup uuid;
  v_count integer;
BEGIN
  -- Cancel any active follow-ups so R1/R2 measure department scope alone
  -- (earlier sections create a direct-assignment fixture on record B).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  FOR v_followup IN
    SELECT id FROM public.graduate_followups WHERE state IN ('open','in_progress')
  LOOP
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'cancelled');
  END LOOP;

  -- R1: disjoint specialist scopes (d=D1, 6=D2); no union leak.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  SELECT array_agg(d ORDER BY d) INTO v_scope
  FROM public.graduate_affairs_specialist_department_ids() d;
  IF v_scope IS DISTINCT FROM ARRAY['30000000-0000-4000-8000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'R1 specialistU scope leaked: %', v_scope;
  END IF;
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_b);
    RAISE EXCEPTION 'R1 expected D1 specialist denied on D2 file';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_search_records('30000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'R1 expected D1 specialist D2 search denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_OUT_OF_SCOPE%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_create_followup(
      v_record_b, '10000000-0000-4000-8000-00000000000c', 'career_followup');
    RAISE EXCEPTION 'R1 expected D1 specialist D2 followup denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_cohort_employment_report(
      '40000000-0000-4000-8000-000000000002', 2026, 3);
    RAISE EXCEPTION 'R1 expected D1 specialist D2 cohort denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_OUT_OF_SCOPE%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000006', 'role', 'authenticated')::text, true);
  SELECT array_agg(d ORDER BY d) INTO v_scope
  FROM public.graduate_affairs_specialist_department_ids() d;
  IF v_scope IS DISTINCT FROM ARRAY['30000000-0000-4000-8000-000000000002'::uuid] THEN
    RAISE EXCEPTION 'R1 specialist2U scope incorrect: %', v_scope;
  END IF;
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
    RAISE EXCEPTION 'R1 expected D2 specialist denied on D1 file';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  -- R2: suspended staff profile loses specialist capability.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-000000000007', 'role', 'authenticated')::text, true);
  IF public.graduate_affairs_is_specialist() THEN
    RAISE EXCEPTION 'R2 suspended profile still specialist';
  END IF;
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
    RAISE EXCEPTION 'R2 expected suspended specialist file denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;

  -- R4: same-department specialist assign positive; cross-department negative;
  -- inactive/expired assignee negative; manager cross-scope positive.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_events FROM public.graduate_domain_events;
  BEGIN
    PERFORM public.graduate_affairs_create_followup(
      v_record_a, '10000000-0000-4000-8000-000000000006', 'cross_scope');
    RAISE EXCEPTION 'R4 expected cross-scope specialist assignee denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_create_followup(
      v_record_a, '10000000-0000-4000-8000-000000000001', 'inactive_assignee');
    RAISE EXCEPTION 'R4 expected inactive assignee denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_ASSIGNEE_NOT_STAFF%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_create_followup(
      v_record_a, '10000000-0000-4000-8000-000000000002', 'expired_assignee');
    RAISE EXCEPTION 'R4 expected expired assignee denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_ASSIGNEE_NOT_STAFF%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'R4 denial mutated audit events';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graduate_followups
    WHERE graduate_record_id = v_record_a AND purpose_code IN ('cross_scope','inactive_assignee','expired_assignee')
  ) THEN
    RAISE EXCEPTION 'R4 denial inserted follow-up rows';
  END IF;
END;
$$;

-- Manager cross-scope assign + R3 revocation + R7 self-read after correction
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_record_b uuid := (SELECT id FROM verify_ids WHERE key = 'record_b');
  v_followup uuid;
  v_events integer;
  v_count integer;
BEGIN
  -- Ensure record B has no active follow-up, then manager assigns D1 specialist cross-scope.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);

  -- Cancel any active follow-up on B created earlier in the harness.
  FOR v_followup IN
    SELECT id FROM public.graduate_followups
    WHERE graduate_record_id = v_record_b AND state IN ('open','in_progress')
  LOOP
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'cancelled');
  END LOOP;

  v_followup := public.graduate_affairs_create_followup(
    v_record_b, '10000000-0000-4000-8000-00000000000d', 'manager_cross_scope');
  IF v_followup IS NULL THEN
    RAISE EXCEPTION 'R4 manager cross-scope assign failed';
  END IF;

  -- Specialist assignee can access out-of-scope record via direct assignment
  -- while still active.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
  PERFORM public.graduate_affairs_get_graduate_file(v_record_b);

  -- R3: revoke specialist assignment -> lose follow-up read/transition; row kept.
  UPDATE public.request_processing_assignments
  SET is_active = false
  WHERE id = '80000000-0000-4000-8000-000000000002';

  SELECT count(*) INTO v_events FROM public.graduate_domain_events;
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_b);
    RAISE EXCEPTION 'R3 expected revoked assignee file denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_transition_followup(v_followup, 'in_progress');
    RAISE EXCEPTION 'R3 expected revoked assignee transition denial';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_FOLLOWUP_NOT_ASSIGNEE%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.graduate_domain_events) <> v_events THEN
    RAISE EXCEPTION 'R3 denial mutated audit events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graduate_followups WHERE id = v_followup AND state = 'open') THEN
    RAISE EXCEPTION 'R3 follow-up row must remain for audit';
  END IF;

  -- Restore specialist assignment for later sections / cleanliness.
  UPDATE public.request_processing_assignments
  SET is_active = true
  WHERE id = '80000000-0000-4000-8000-000000000002';

  -- Manager may still cancel the retained follow-up.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
  PERFORM public.graduate_affairs_transition_followup(v_followup, 'cancelled');
END;
$$;

-- R7: after section J corrected record A, GA-private self reads must be empty.
DO $$
DECLARE
  v_record_a uuid := (SELECT id FROM verify_ids WHERE key = 'record_a');
  v_count integer;
BEGIN
  IF (SELECT record_state FROM public.graduate_records WHERE id = v_record_a) <> 'corrected' THEN
    RAISE EXCEPTION 'R7 precondition: record A must already be corrected by section J';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
  SET ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.graduate_profiles WHERE graduate_record_id = v_record_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'R7 profile still visible after correction: %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_consents WHERE graduate_record_id = v_record_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'R7 consents still visible after correction: %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_employment_events WHERE graduate_record_id = v_record_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'R7 employment_events still visible after correction'; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_survey_responses WHERE graduate_record_id = v_record_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'R7 survey_responses still visible after correction'; END IF;
  SELECT count(*) INTO v_count FROM public.graduate_event_registrations WHERE graduate_record_id = v_record_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'R7 event_registrations still visible after correction'; END IF;
  RESET ROLE;

  BEGIN
    PERFORM public.graduate_my_contact_points(v_record_a);
    RAISE EXCEPTION 'R7 expected my_contact_points denial after correction';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record_a);
    RAISE EXCEPTION 'R7 expected self get_graduate_file denial after correction';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%GRADUATE_AFFAIRS_ACCESS_DENIED%' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'graduates-affairs-authorization-04 pg-verify: PASS';
END;
$$;
