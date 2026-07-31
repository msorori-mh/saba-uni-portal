-- ============================================================================
-- PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-DESIGN-13
-- MATCHING FORWARD-ONLY CLEANUP SCRIPT  ***NOT APPLIED***
--
-- Removes ONLY the fixtures created by
--   docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql
-- Targeting is by pinned fixture id range AND the fixture marker; nothing else
-- can ever be matched by this script.
--
-- FORBIDDEN AND ABSENT HERE: any delete outside the fixture id range, any
-- Auth/Storage delete, any student_profiles delete, any evidence or legacy
-- record, any visibility change, any migration-history edit.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '120s';
SELECT set_config('b1.atomic_init', '1', true);

DO $cleanup$
DECLARE
  k_marker CONSTANT text := 'TEST_ONLY_B1_FIXTURE_13';
  k_lo     CONSTANT uuid := 'f1300000-0000-4000-8000-000000000000';
  k_hi     CONSTANT uuid := 'f1300000-0000-4000-8000-999999999999';
  v_ids    uuid[];
  v_n      integer;
  v_rows   integer;
BEGIN
  SELECT array_agg(id) INTO v_ids
    FROM public.student_requests
   WHERE id BETWEEN k_lo AND k_hi
     AND internal_notes = k_marker
     AND request_number LIKE 'SR-20260801-13%';

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'CLEANUP13_PRECONDITION_FAIL: no fixture requests found — nothing to clean';
  END IF;
  IF array_length(v_ids, 1) <> 19 THEN
    RAISE EXCEPTION 'CLEANUP13_PRECONDITION_FAIL: matched % fixture requests (expected 19)',
      array_length(v_ids, 1);
  END IF;

  -- refuse to clean up if a fixture was advanced to a terminal state
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE id = ANY(v_ids) AND status <> 'in_review';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CLEANUP13_PRECONDITION_FAIL: % fixtures left in_review boundary — inspect before cleanup', v_n;
  END IF;

  -- FK-safe order: leaves first, request row last.
  DELETE FROM public.student_request_status_history WHERE student_request_id = ANY(v_ids);
  DELETE FROM public.student_request_comments       WHERE student_request_id = ANY(v_ids);
  DELETE FROM public.student_request_attachments    WHERE student_request_id = ANY(v_ids);
  DELETE FROM public.student_request_workflow_steps WHERE student_request_id = ANY(v_ids);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 104 THEN
    RAISE EXCEPTION 'CLEANUP13_FAIL: deleted % runtime steps (expected 104)', v_rows;
  END IF;

  DELETE FROM public.student_requests WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 19 THEN
    RAISE EXCEPTION 'CLEANUP13_FAIL: deleted % requests (expected 19)', v_rows;
  END IF;

  -- residue check
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE id BETWEEN k_lo AND k_hi OR internal_notes = k_marker;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CLEANUP13_POSTFAIL: % fixture rows remain', v_n;
  END IF;

  -- protected state untouched
  SELECT count(*) INTO v_n FROM public.student_requests WHERE request_type = 'enrollment_certificate';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CLEANUP13_POSTFAIL: enrollment_certificate requests changed to %', v_n;
  END IF;

  RAISE NOTICE 'CLEANUP13_OK: 19 requests / 104 runtime steps removed';
END
$cleanup$;

COMMIT;

-- ============================================================================
-- NOT APPLIED. Requires a separate explicit production apply authorization.
-- ============================================================================
