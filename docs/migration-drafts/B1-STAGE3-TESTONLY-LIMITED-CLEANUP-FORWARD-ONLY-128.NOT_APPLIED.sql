-- =====================================================================
-- B1 STAGE 3 — TEST_ONLY LIMITED CLEANUP (FORWARD-ONLY MIGRATION SOURCE)
-- Mission: B1_STAGE3_PREPARE_FORWARD_ONLY_CLEANUP_MIGRATION_SOURCE_ONLY-128
-- Remediation: PORTAL-B1-STAGE3-CLEANUP-MIGRATION-D1-D2-SOURCE-REMEDIATION-134
--
-- STATUS: **NOT_APPLIED**. Source-only artifact for independent review.
--         Applying it requires a separate, explicit owner approval.
--         It intentionally lives under docs/migration-drafts/ so no runner
--         can pick it up from supabase/migrations/.
--
-- REMEDIATION SUMMARY (mission 134, no scope change)
--   D1 — PL/pgSQL ambiguity fixed. No block declares a variable named `n`
--        any more; every local is `v_*`, every table has an explicit alias
--        and every column reference is qualified (e.g. `h.n`).
--   D2 — every one of the 15 DELETE statements is now immediately followed
--        by its own GET DIAGNOSTICS ROW_COUNT assertion with the exact
--        expected count. No aggregation of two deletes under one assertion.
--   D3 — the enrollment_certificate postcondition is now a hard assertion
--        (was RAISE NOTICE) and the dead `vars.storage_export_ack` stub is
--        removed.
--   Predicates, ID lists, delete order and scope are UNCHANGED.
--
-- WHY A MIGRATION IS REQUIRED
--   Direct DML failed twice:
--     1) mission 126 — guard_b1_runtime_mutation_boundary() raised
--        42501 B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED (missing b1.atomic_init).
--     2) mission 127 — with the approved transaction-local GUC set, the
--        sandbox_exec role hit "permission denied for table
--        student_request_attachment_uploads": it is SELECT-only and also
--        cannot read supabase_migrations.
--   The migration channel is the only privileged write path available, so the
--   approved package-125 transaction is carried here verbatim.
--
-- TRANSACTION NOTE
--   This file now carries ONE explicit BEGIN and ONE explicit COMMIT (the
--   COMMIT is the last statement, after every assertion). If it is ever
--   promoted into supabase/migrations/, the runner's own wrapper makes the
--   explicit BEGIN/COMMIT redundant and they must be removed at that time.
--   Any RAISE EXCEPTION below aborts the whole transaction and leaves the
--   database byte-identical (fail-fast, no savepoint, no exception handler).
--
-- SCOPE (unchanged from package 125)
--   * explicit ID lists only — no LIKE mass delete, no TRUNCATE, no cascade
--   * excludes all evidence requests, SR-20260727-695EC35B,
--     SR-20260727-F67CF366, protected legacy records,
--     TEST_ONLY_B1_0002, TEST_ONLY_B1_0003 and all non-TEST_ONLY data
--   * touches NO storage object, NO auth account
--   * changes NO request_types.student_visible
--   * touches NO enrollment_certificate data
--   * performs NO DDL other than the two ON COMMIT DROP temp tables
--
-- EXPECTED DELETED ROWS: 444 across 15 statements (see the table in
--   docs/B1-STAGE3-CLEANUP-MIGRATION-D1-D2-SOURCE-REMEDIATION-134-REPORT.md;
--   the "433" formerly printed in export-132 MANIFEST.md was an arithmetic slip
--   in that manifest's total line only; it was corrected to 444 by
--   reconciliation 135 and the 15 per-table counts were always identical and
--   correct. Authoritative total: 444).
--
-- Sources: docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql
--          docs/B1-STAGE3-CLEANUP-EXECUTION-PREFLIGHT-125.md
--          docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md
--          docs/B1-STAGE3-CLEANUP-RISK-RESOLUTION-124.md
--          docs/B1-STAGE3-FORWARD-ONLY-CLEANUP-FINAL-APPLY-PREFLIGHT-133-REPORT.md
-- =====================================================================

BEGIN;

-- Owner-approved (mission 127) transaction-local boundary flag required by
-- guard_b1_runtime_mutation_boundary(). Transaction-local: is_local = true.
SELECT set_config('b1.atomic_init', '1', true);

CREATE TEMP TABLE cand_request(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO cand_request(id) VALUES
  ('30482047-e7e4-4e5a-accd-5a9a097d9e14'), -- SR-20260727-0106E11C
  ('f2a8e4bb-b305-4dc9-8ec7-570a2c35c993'), -- SR-20260727-058FD839
  ('47e6eefe-7ff4-48a0-9c50-bf10af63a99a'), -- SR-20260727-0917B700
  ('acdbcc84-c54b-413a-bea0-ec9b88eeda44'), -- SR-20260727-15BF8956
  ('dea68f8a-9fa8-4525-9685-745212604ec7'), -- SR-20260727-1A2EAC5E
  ('96eec10e-5552-40b6-9a40-61011a68e798'), -- SR-20260727-1D4022A1
  ('70ea684d-fe11-4505-8d94-73f035770b39'), -- SR-20260727-216510DF
  ('fda9e39c-ab82-44e2-aef6-0b422d401e0e'), -- SR-20260727-34806E2D
  ('24b7ba1f-04c9-44c1-a188-52f74ef908bb'), -- SR-20260727-3FB77E5F
  ('0f7f11f3-1cdd-492e-a971-5d4479c7e155'), -- SR-20260727-3FD03446
  ('7df02398-bf56-4c75-b63b-f5ec20e39360'), -- SR-20260727-407AE418
  ('e3cc0366-b6fc-4d64-8c01-541030f83b00'), -- SR-20260727-44334F5D
  ('85d7068a-8443-4a96-b3bb-b7c658616820'), -- SR-20260727-4532F769
  ('ade49963-0a68-4c87-a24b-5e067c1be7fd'), -- SR-20260727-491F8309
  ('b093dc3d-9fc8-4b16-a0e6-0b767f597d71'), -- SR-20260727-5710AFB4
  ('09dabe40-1eb5-432e-b42d-0d05bfe2518e'), -- SR-20260727-5F154B51
  ('de9e6c7f-eaec-4d32-9e8c-7ce168d542c5'), -- SR-20260727-6FC487C8
  ('27e5d06b-c1c6-45d6-b96d-cbf89e18e697'), -- SR-20260727-72610DE6
  ('421429ec-f165-4e07-bc3b-278268ec4f33'), -- SR-20260727-7341CD80
  ('c876eb00-4677-4b7b-ba8f-d8a15392f0df'), -- SR-20260727-754812CE
  ('4cf1fda2-0218-4403-a676-a6697b08aa34'), -- SR-20260727-7CE38765
  ('53710937-4a69-4fc6-96b1-c2727c551c6e'), -- SR-20260727-80B5739A
  ('e8f72662-5dd6-45d2-9bab-555c39f7a136'), -- SR-20260727-8CE10383
  ('bf38217e-9edb-4527-bde2-dc30e56a9f47'), -- SR-20260727-96245A20
  ('24f1c63a-f14e-4595-882b-b6ba4bf52dd4'), -- SR-20260727-97BD982D
  ('4953f79c-fcf1-4119-8ef3-a0c6c240534f'), -- SR-20260727-9F00443A
  ('54b96b02-872d-4c8e-b326-98e3e4986afa'), -- SR-20260727-A2C3678F
  ('c3acb770-2a89-441a-93cd-d0ff882a3e4b'), -- SR-20260727-A99E2634
  ('d3f5be81-0760-459b-8d30-a3377ab33aa1'), -- SR-20260727-ADD5838A
  ('37093986-4030-499f-9377-9301f3403a2f'), -- SR-20260727-CB3833D1
  ('9e97eeac-640b-4778-ba72-3463c1c438d3'), -- SR-20260727-E0DB6A55
  ('0277c36b-462f-410c-830b-6960a01dd163'), -- SR-20260727-E388053F
  ('6c4ca023-11d4-41e9-91ce-55d353795909'), -- SR-20260727-E46C7742
  ('30b5af9e-533a-428d-a166-43eeebc03d82'), -- SR-20260727-F08CEC55
  ('2b9107e5-548f-4154-8c63-a7c453ff22c8'), -- SR-20260727-FE7796D9
  ('40ccc66a-d638-4c49-8ac6-ac771caea131'), -- SR-20260727-03DDF561 (0002 child)
  ('7fce2743-1940-488d-b434-aba98967985d'); -- SR-20260727-85E124BE (0002 child)

-- Column deliberately named request_number (was `n`) — see D1.
CREATE TEMP TABLE hold_request_number(request_number text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO hold_request_number(request_number) VALUES
  ('SR-20260727-78427CC5'),('SR-20260727-50BEDCE2'),('SR-20260727-88D885F0'),
  ('SR-20260727-40E3E66B'),('SR-20260727-42393846'),('SR-20260727-3C550070'),
  ('SR-20260727-695EC35B'),('SR-20260727-F67CF366'),
  ('SR-20260713-2DE64041'),('SR-20260715-FEDCB3E1'),('SR-20260716-26BAD4C8');

-- TEST_ONLY_B1_0001 fixture identifiers (the only profile removed)
-- profile            7020e51d-19e3-4acb-9597-5145b65d117e
-- academic status    f864d89a-0017-4051-b627-61e587e946af
-- enrollment         fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b
-- auth user          2e3ca4d6-603c-4f06-a23e-462bf92fcfd3  (NOT deleted here)

-- ---------------------------------------------------------------------
-- 1. PRECONDITIONS — abort before any DELETE on any mismatch (R4 drift guard)
-- ---------------------------------------------------------------------
DO $precheck$
DECLARE
  v_actual_count integer;
  v_head_version text;
BEGIN
  SELECT count(*) INTO v_actual_count FROM cand_request AS c;
  IF v_actual_count <> 37 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_CANDIDATE_COUNT',
      DETAIL = format('expected=37 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN cand_request AS c ON c.id = r.id;
  IF v_actual_count <> 37 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_CANDIDATES_MISSING_IN_DB',
      DETAIL = format('expected=37 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN cand_request AS c ON c.id = r.id
  JOIN student_profiles AS p ON p.id = r.student_profile_id
  WHERE p.academic_number LIKE 'TEST\_ONLY\_B1\_%';
  IF v_actual_count <> 37 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_NON_TEST_ONLY_IN_CANDIDATES',
      DETAIL = format('expected=37 actual=%s', v_actual_count);
  END IF;

  -- no protected / evidence / legacy record may be inside the candidate list
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN cand_request AS c ON c.id = r.id
  JOIN hold_request_number AS h ON h.request_number = r.request_number;
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_HOLD_INTERSECTION',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  -- enrollment_certificate must never intersect the candidate list
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN cand_request AS c ON c.id = r.id
  WHERE r.request_type::text = 'enrollment_certificate';
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_ENROLLMENT_CERTIFICATE_INTERSECTION',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  -- no open/in-flight request may be deleted
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN cand_request AS c ON c.id = r.id
  WHERE r.status::text NOT IN ('draft','completed','cancelled');
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_OPEN_REQUEST_IN_CANDIDATES',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  -- drift guard: nothing changed since the 125/131/133 snapshots
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN cand_request AS c ON c.id = r.id
  WHERE r.updated_at > timestamptz '2026-07-31 04:00:00+00';
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_ID_DRIFT_DETECTED',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  -- expected child / detail / effect volumes (fail closed if the shape moved)
  SELECT count(*) INTO v_actual_count
  FROM student_request_attachment_uploads AS a
  JOIN cand_request AS c ON c.id = a.student_request_id;
  IF v_actual_count <> 20 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_ATTACHMENTS',
      DETAIL = format('expected=20 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_request_workflow_steps AS s
  JOIN cand_request AS c ON c.id = s.student_request_id;
  IF v_actual_count <> 135 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_STEPS',
      DETAIL = format('expected=135 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_request_workflow_events AS e
  JOIN cand_request AS c ON c.id = e.student_request_id;
  IF v_actual_count <> 157 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EVENTS',
      DETAIL = format('expected=157 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM b1_draft_mutation_idempotency AS i
  WHERE i.student_profile_id IN (
    '7020e51d-19e3-4acb-9597-5145b65d117e',
    'b1e20002-0000-4000-8000-000000000002',
    '65f55997-6fd0-40d0-9235-70ac65afeac2');
  IF v_actual_count <> 53 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_IDEMPOTENCY',
      DETAIL = format('expected=53 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_excused_absences AS e
  JOIN cand_request AS c ON c.id = e.absence_excuse_request_id;
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EXCUSED_EFFECT',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_extra_chances AS e
  JOIN cand_request AS c ON c.id = e.request_id;
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EXTRA_CHANCE_EFFECT',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM file_withdrawal_details AS d JOIN cand_request AS c ON c.id = d.request_id;
  IF v_actual_count <> 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FILE_WITHDRAWAL_DETAILS',
      DETAIL = format('expected=10 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM absence_excuse_details AS d JOIN cand_request AS c ON c.id = d.request_id;
  IF v_actual_count <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_ABSENCE_EXCUSE_DETAILS',
      DETAIL = format('expected=6 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM enrollment_suspension_details AS d JOIN cand_request AS c ON c.id = d.request_id;
  IF v_actual_count <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_ENROLLMENT_SUSPENSION_DETAILS',
      DETAIL = format('expected=6 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM extra_chance_details AS d JOIN cand_request AS c ON c.id = d.request_id;
  IF v_actual_count <> 9 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EXTRA_CHANCE_DETAILS',
      DETAIL = format('expected=9 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM transfer_request_details AS d JOIN cand_request AS c ON c.id = d.request_id;
  IF v_actual_count <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TRANSFER_REQUEST_DETAILS',
      DETAIL = format('expected=6 actual=%s', v_actual_count);
  END IF;

  -- fixture rows exist exactly once each
  SELECT count(*) INTO v_actual_count
  FROM student_profiles AS p WHERE p.id = '7020e51d-19e3-4acb-9597-5145b65d117e';
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FIXTURE_PROFILE',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_academic_status AS s WHERE s.id = 'f864d89a-0017-4051-b627-61e587e946af';
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FIXTURE_ACADEMIC_STATUS',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_enrollments AS e WHERE e.id = 'fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b';
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FIXTURE_ENROLLMENT',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  -- the fixture profile must own NOTHING outside the targeted rows
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  WHERE r.student_profile_id = '7020e51d-19e3-4acb-9597-5145b65d117e'
    AND NOT EXISTS (SELECT 1 FROM cand_request AS c WHERE c.id = r.id);
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FIXTURE_EXTRA_REQUESTS',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_academic_status AS s
  WHERE s.student_profile_id = '7020e51d-19e3-4acb-9597-5145b65d117e'
    AND s.id <> 'f864d89a-0017-4051-b627-61e587e946af';
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FIXTURE_EXTRA_ACADEMIC_STATUS',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM student_enrollments AS e
  WHERE e.student_profile_id = '7020e51d-19e3-4acb-9597-5145b65d117e'
    AND e.id <> 'fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b';
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_FIXTURE_EXTRA_ENROLLMENTS',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  SELECT count(*) INTO v_actual_count
  FROM official_documents AS o
  WHERE o.student_profile_id = '7020e51d-19e3-4acb-9597-5145b65d117e'
     OR EXISTS (SELECT 1 FROM cand_request AS c WHERE c.id = o.student_request_id);
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_OFFICIAL_DOCUMENT_REFERENCE',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  -- evidence + HOLD + protected legacy present before we touch anything
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN hold_request_number AS h ON h.request_number = r.request_number;
  IF v_actual_count <> 11 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EVIDENCE_MISSING',
      DETAIL = format('expected=11 actual=%s', v_actual_count);
  END IF;

  -- whole-table baselines (pre-delete)
  SELECT count(*) INTO v_actual_count FROM student_requests AS r;
  IF v_actual_count <> 70 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TOTAL_REQUESTS',
      DETAIL = format('expected=70 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_request_workflow_steps AS s;
  IF v_actual_count <> 191 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TOTAL_STEPS',
      DETAIL = format('expected=191 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_request_workflow_events AS e;
  IF v_actual_count <> 240 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TOTAL_EVENTS',
      DETAIL = format('expected=240 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_request_attachment_uploads AS a;
  IF v_actual_count <> 28 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TOTAL_ATTACHMENTS',
      DETAIL = format('expected=28 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_profiles AS p;
  IF v_actual_count <> 849 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TOTAL_PROFILES',
      DETAIL = format('expected=849 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_academic_status AS s;
  IF v_actual_count <> 851 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_TOTAL_ACADEMIC_STATUS',
      DETAIL = format('expected=851 actual=%s', v_actual_count);
  END IF;

  -- protected enrollment_certificate baseline (pre-delete)
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r WHERE r.request_type::text = 'enrollment_certificate';
  IF v_actual_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EC_REQUESTS',
      DETAIL = format('expected=4 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM enrollment_certificate_document_details AS d;
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EC_DOCUMENT_DETAILS',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM official_documents AS o;
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_EC_OFFICIAL_DOCUMENTS',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  IF (SELECT max(o.updated_at) FROM official_documents AS o)
     IS DISTINCT FROM timestamptz '2026-07-16 04:44:29.338193+00' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_EC_LATEST_TIMESTAMP_MOVED';
  END IF;

  -- visibility invariants
  SELECT count(*) INTO v_actual_count
  FROM request_types AS t
  WHERE t.code IN ('enrollment_suspension','excused_absence','department_transfer',
                   'final_chance','file_withdrawal')
    AND t.student_visible IS DISTINCT FROM false;
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_B1_VISIBILITY_UNEXPECTED',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count
  FROM request_types AS t
  WHERE t.code = 'enrollment_certificate' AND t.student_visible = true;
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'PRECHECK_ENROLLMENT_CERTIFICATE_VISIBILITY',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  -- migration head
  SELECT max(m.version) INTO v_head_version
  FROM supabase_migrations.schema_migrations AS m;
  IF v_head_version IS DISTINCT FROM '20260730175527' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRECHECK_MIGRATION_HEAD_MOVED',
      DETAIL = format('expected=20260730175527 actual=%s', coalesce(v_head_version,'<null>'));
  END IF;

  RAISE NOTICE 'ALL PRECONDITIONS PASSED';
END
$precheck$;

-- ---------------------------------------------------------------------
-- 2. ORDERED DELETES (children first; no cascade relied upon)
--    15 statements, each followed immediately by its own exact-count
--    assertion. Total expected deleted rows: 444.
--    Order rationale:
--      D01      attachment metadata (leaf child of request)
--      D02–D04  effect rows that are RESTRICT parents of student_requests
--      D05–D08  per-service detail rows (children of request)
--      D09–D10  workflow events before steps (events reference steps)
--      D11      idempotency cache (NO ACTION FK on request + profile)
--      D12      the requests themselves (all children now gone)
--      D13–D15  fixture academic status, enrollment, then the profile last
-- ---------------------------------------------------------------------
DO $cleanup$
DECLARE
  v_deleted_count integer;
BEGIN
  -- D01 — attachment METADATA rows. Storage objects are NOT deleted here.
  DELETE FROM student_request_attachment_uploads AS a
   USING cand_request AS c WHERE a.student_request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 20 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'ATTACHMENT_UPLOADS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 20, v_deleted_count);
  END IF;

  -- D02 — excused absence effect rows
  DELETE FROM student_excused_absences AS e
   USING cand_request AS c WHERE e.absence_excuse_request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'EXCUSED_ABSENCES_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 1, v_deleted_count);
  END IF;

  -- D03 — extra chance effect rows
  DELETE FROM student_extra_chances AS e
   USING cand_request AS c WHERE e.request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'EXTRA_CHANCES_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 1, v_deleted_count);
  END IF;

  -- D04 — file withdrawal details
  DELETE FROM file_withdrawal_details AS d
   USING cand_request AS c WHERE d.request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FILE_WITHDRAWAL_DETAILS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 10, v_deleted_count);
  END IF;

  -- D05 — absence excuse details
  DELETE FROM absence_excuse_details AS d
   USING cand_request AS c WHERE d.request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'ABSENCE_EXCUSE_DETAILS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 6, v_deleted_count);
  END IF;

  -- D06 — enrollment suspension details
  DELETE FROM enrollment_suspension_details AS d
   USING cand_request AS c WHERE d.request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'ENROLLMENT_SUSPENSION_DETAILS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 6, v_deleted_count);
  END IF;

  -- D07 — extra chance details
  DELETE FROM extra_chance_details AS d
   USING cand_request AS c WHERE d.request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 9 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'EXTRA_CHANCE_DETAILS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 9, v_deleted_count);
  END IF;

  -- D08 — department transfer details
  DELETE FROM transfer_request_details AS d
   USING cand_request AS c WHERE d.request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'TRANSFER_REQUEST_DETAILS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 6, v_deleted_count);
  END IF;

  -- D09 — workflow events (before steps)
  DELETE FROM student_request_workflow_events AS e
   USING cand_request AS c WHERE e.student_request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 157 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_EVENTS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 157, v_deleted_count);
  END IF;

  -- D10 — workflow steps
  DELETE FROM student_request_workflow_steps AS s
   USING cand_request AS c WHERE s.student_request_id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 135 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_STEPS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 135, v_deleted_count);
  END IF;

  -- D11 — idempotency cache for the three fixture profiles
  DELETE FROM b1_draft_mutation_idempotency AS i
   WHERE i.student_profile_id IN (
     '7020e51d-19e3-4acb-9597-5145b65d117e',
     'b1e20002-0000-4000-8000-000000000002',
     '65f55997-6fd0-40d0-9235-70ac65afeac2');
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 53 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'IDEMPOTENCY_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 53, v_deleted_count);
  END IF;

  -- D12 — the requests themselves (explicit ID list)
  DELETE FROM student_requests AS r
   USING cand_request AS c WHERE r.id = c.id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 37 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'STUDENT_REQUESTS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 37, v_deleted_count);
  END IF;

  -- D13 — TEST_ONLY_B1_0001 academic status (single literal UUID)
  DELETE FROM student_academic_status AS s
   WHERE s.id = 'f864d89a-0017-4051-b627-61e587e946af';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FIXTURE_ACADEMIC_STATUS_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 1, v_deleted_count);
  END IF;

  -- D14 — TEST_ONLY_B1_0001 enrollment (single literal UUID)
  DELETE FROM student_enrollments AS e
   WHERE e.id = 'fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FIXTURE_ENROLLMENT_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 1, v_deleted_count);
  END IF;

  -- D15 — TEST_ONLY_B1_0001 profile (last; single literal UUID)
  DELETE FROM student_profiles AS p
   WHERE p.id = '7020e51d-19e3-4acb-9597-5145b65d117e';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'FIXTURE_PROFILE_DELETE_COUNT_MISMATCH',
      DETAIL = format('expected=%s actual=%s', 1, v_deleted_count);
  END IF;

  RAISE NOTICE 'ALL 15 PER-DELETE ASSERTIONS PASSED (444 rows)';
END
$cleanup$;

-- 2.16 auth account 2e3ca4d6-603c-4f06-a23e-462bf92fcfd3
--      NOT deleted here. Use the approved account-removal path in a separate
--      step. No storage object is deleted here either.

-- ---------------------------------------------------------------------
-- 3. POSTCONDITIONS — COMMIT only if every check passes
-- ---------------------------------------------------------------------
DO $postcheck$
DECLARE
  v_actual_count integer;
BEGIN
  -- candidates gone
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r JOIN cand_request AS c ON c.id = r.id;
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_CANDIDATES_REMAIN',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;

  -- evidence + HOLD + protected legacy intact (11 records)
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r
  JOIN hold_request_number AS h ON h.request_number = r.request_number;
  IF v_actual_count <> 11 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_EVIDENCE_LOST',
      DETAIL = format('expected=11 actual=%s', v_actual_count);
  END IF;

  -- fail-closed evidence still in_review, F67CF366 still submitted
  IF (SELECT r.status::text FROM student_requests AS r
       WHERE r.request_number = 'SR-20260727-3C550070') <> 'in_review' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'POSTCHECK_FAILCLOSED_STATUS_CHANGED';
  END IF;
  IF (SELECT r.status::text FROM student_requests AS r
       WHERE r.request_number = 'SR-20260727-F67CF366') <> 'submitted' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'POSTCHECK_HOLD_STATUS_CHANGED';
  END IF;

  -- evidence effect rows intact
  SELECT count(*) INTO v_actual_count
  FROM student_excused_absences AS e
  WHERE e.id IN ('2a61d3f0-2139-4b99-9ab4-52cf6954cfd0',
                 '33ed9e39-2f29-4bfb-8633-0fd203a1c2ba');
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_EXCUSED_EFFECT_LOST',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count
  FROM student_extra_chances AS e WHERE e.id = 'f8d8b87a-623f-4bc0-a612-c8403d9d597b';
  IF v_actual_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_EXTRA_CHANCE_EFFECT_LOST',
      DETAIL = format('expected=1 actual=%s', v_actual_count);
  END IF;

  -- protected TEST_ONLY profiles intact
  SELECT count(*) INTO v_actual_count
  FROM student_profiles AS p
  WHERE p.id IN ('b1e20002-0000-4000-8000-000000000002',
                 '65f55997-6fd0-40d0-9235-70ac65afeac2');
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_PROTECTED_PROFILE_LOST',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count
  FROM student_academic_status AS s
  WHERE s.student_profile_id IN ('b1e20002-0000-4000-8000-000000000002',
                                 '65f55997-6fd0-40d0-9235-70ac65afeac2');
  IF v_actual_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_PROTECTED_ACADEMIC_STATUS',
      DETAIL = format('expected=4 actual=%s', v_actual_count);
  END IF;

  -- real / non-TEST_ONLY data untouched — exact expected remaining totals
  SELECT count(*) INTO v_actual_count
  FROM student_profiles AS p WHERE p.academic_number LIKE 'TEST\_ONLY\_B1\_%';
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TEST_ONLY_PROFILE_COUNT',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_profiles AS p;
  IF v_actual_count <> 848 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_PROFILES',
      DETAIL = format('expected=848 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_requests AS r;
  IF v_actual_count <> 33 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_REQUESTS',
      DETAIL = format('expected=33 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_request_workflow_steps AS s;
  IF v_actual_count <> 56 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_STEPS',
      DETAIL = format('expected=56 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_request_workflow_events AS e;
  IF v_actual_count <> 83 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_EVENTS',
      DETAIL = format('expected=83 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_request_attachment_uploads AS a;
  IF v_actual_count <> 8 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_ATTACHMENTS',
      DETAIL = format('expected=8 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM b1_draft_mutation_idempotency AS i;
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_IDEMPOTENCY',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM student_academic_status AS s;
  IF v_actual_count <> 850 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_TOTAL_ACADEMIC_STATUS',
      DETAIL = format('expected=850 actual=%s', v_actual_count);
  END IF;

  -- visibility unchanged
  SELECT count(*) INTO v_actual_count
  FROM request_types AS t
  WHERE t.code IN ('enrollment_suspension','excused_absence','department_transfer',
                   'final_chance','file_withdrawal')
    AND t.student_visible IS DISTINCT FROM false;
  IF v_actual_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_B1_VISIBILITY_CHANGED',
      DETAIL = format('expected=0 actual=%s', v_actual_count);
  END IF;
  IF (SELECT t.student_visible FROM request_types AS t
       WHERE t.code = 'enrollment_certificate') IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'POSTCHECK_ENROLLMENT_CERTIFICATE_VISIBILITY_CHANGED';
  END IF;

  -- enrollment_certificate data untouched (hard assertions, D3 fix)
  SELECT count(*) INTO v_actual_count
  FROM student_requests AS r WHERE r.request_type::text = 'enrollment_certificate';
  IF v_actual_count <> 4 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_EC_REQUESTS',
      DETAIL = format('expected=4 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM enrollment_certificate_document_details AS d;
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_EC_DOCUMENT_DETAILS',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  SELECT count(*) INTO v_actual_count FROM official_documents AS o;
  IF v_actual_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'POSTCHECK_EC_OFFICIAL_DOCUMENTS',
      DETAIL = format('expected=2 actual=%s', v_actual_count);
  END IF;
  IF (SELECT max(o.updated_at) FROM official_documents AS o)
     IS DISTINCT FROM timestamptz '2026-07-16 04:44:29.338193+00' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'POSTCHECK_EC_LATEST_TIMESTAMP_CHANGED';
  END IF;

  RAISE NOTICE 'ALL POSTCONDITIONS PASSED';
END
$postcheck$;

COMMIT;

-- =====================================================================
-- END. NOT_APPLIED. No apply, no deploy, no publish, no visibility change.
-- =====================================================================
