-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- TEST_ONLY E2E fixture package for LOCAL / production-later rehearsal.
-- DRY RUN BY DEFAULT. DO NOT EXECUTE AGAINST PRODUCTION from this package.
-- Marker: TEST_ONLY_COUNCILS_C0_C9_E2E_01
--
-- Dry-run control (session GUC; default true):
--   SELECT set_config('councils.pkg_dry_run', 'true', false);
--   SELECT set_config('councils.pkg_dry_run', 'false', false);  -- execute handoff only
--
-- Actors covered:
--   chair, secretary, members, viewer, responsible actor
-- Journey: schedule → intake/topic → agenda → open → attendance/quorum →
--   vote → minutes → decision/follow-up → archive → notifications/reports (C9)

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_dry_run boolean := coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false';
  v_marker constant text := 'TEST_ONLY_COUNCILS_C0_C9_E2E_01';
  v_council_id uuid := 'c0c90000-0000-4000-8000-000000000001';
  v_meeting_id uuid := 'c0c90000-0000-4000-8000-000000000010';
  v_topic_id uuid := 'c0c90000-0000-4000-8000-000000000020';
  v_agenda_id uuid := 'c0c90000-0000-4000-8000-000000000030';
  v_decision_id uuid := 'c0c90000-0000-4000-8000-000000000040';
  v_chair uuid := 'c0c90000-0000-4000-8000-000000000101';
  v_secretary uuid := 'c0c90000-0000-4000-8000-000000000102';
  v_member_a uuid := 'c0c90000-0000-4000-8000-000000000103';
  v_member_b uuid := 'c0c90000-0000-4000-8000-000000000104';
  v_viewer uuid := 'c0c90000-0000-4000-8000-000000000105';
  v_responsible uuid := 'c0c90000-0000-4000-8000-000000000106';
  v_sentinel_council uuid := 'c0c90000-0000-4000-8000-ffffffffffff';
BEGIN
  IF to_regclass('public.academic_councils') IS NULL THEN
    RAISE EXCEPTION 'HOLD: academic_councils missing — apply C0-C9 chain in disposable PG17 before fixture';
  END IF;

  RAISE NOTICE 'FIXTURE_MARKER: %', v_marker;
  RAISE NOTICE 'FIXTURE_ACTORS: chair=% secretary=% member_a=% member_b=% viewer=% responsible=%',
    v_chair, v_secretary, v_member_a, v_member_b, v_viewer, v_responsible;
  RAISE NOTICE 'FIXTURE_IDS: council=% meeting=% topic=% agenda=% decision=% sentinel_preserve=%',
    v_council_id, v_meeting_id, v_topic_id, v_agenda_id, v_decision_id, v_sentinel_council;

  IF v_dry_run THEN
    RAISE NOTICE 'DRY RUN: would seed TEST_ONLY council/memberships/meeting/topic/agenda/decision journey C0-C9';
    RAISE NOTICE 'DRY RUN: would exercise chair/secretary/member/viewer/responsible positive matrix';
    RAISE NOTICE 'DRY RUN: would exercise negative denials for non-members and wrong roles';
    RAISE NOTICE 'COUNCILS_TESTONLY_E2E_FIXTURE_DRY_RUN_COMPLETE';
    RETURN;
  END IF;

  IF current_setting('councils.test_only_execute', true) IS DISTINCT FROM 'I_ACKNOWLEDGE_TEST_ONLY' THEN
    RAISE EXCEPTION 'HOLD: execute mode requires SET councils.test_only_execute = ''I_ACKNOWLEDGE_TEST_ONLY'' (local only)';
  END IF;

  RAISE NOTICE 'EXECUTE: operator must use disposable harness tests — inline seed left to PG17 rehearsal test driver';
  RAISE NOTICE 'COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_HANDOFF';
END $$;

SELECT 'COUNCILS_TESTONLY_E2E_FIXTURE_DRY_RUN_COMPLETE' AS fixture_status
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') <> 'false'
UNION ALL
SELECT 'COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_HANDOFF' AS fixture_status
WHERE coalesce(nullif(current_setting('councils.pkg_dry_run', true), ''), 'true') = 'false';
