-- =====================================================================
-- B1 STAGE 3 — TEST_ONLY LIMITED CLEANUP (FORWARD-ONLY MIGRATION SOURCE)
-- Mission: B1_STAGE3_PREPARE_FORWARD_ONLY_CLEANUP_MIGRATION_SOURCE_ONLY-128
--
-- STATUS: **NOT_APPLIED**. Source-only artifact for independent review.
--         Applying it requires a separate, explicit owner approval.
--         It intentionally lives under docs/migration-drafts/ so no runner
--         can pick it up from supabase/migrations/.
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
--   The migration runner executes this file inside a single transaction, so
--   BEGIN/COMMIT are intentionally omitted. Any RAISE EXCEPTION below aborts
--   the whole migration and leaves the database byte-identical (fail-fast).
--   If executed manually instead, wrap it in BEGIN; ... COMMIT; explicitly.
--
-- SCOPE (unchanged from package 125)
--   * explicit ID lists only — no LIKE mass delete, no TRUNCATE, no cascade
--   * excludes all evidence requests, SR-20260727-695EC35B,
--     SR-20260727-F67CF366, protected legacy records,
--     TEST_ONLY_B1_0002, TEST_ONLY_B1_0003 and all non-TEST_ONLY data
--   * touches NO storage object, NO auth account
--   * changes NO request_types.student_visible
--   * touches NO enrollment_certificate data
--   * performs NO DDL
--
-- Sources: docs/B1-STAGE3-CLEANUP-DRY-RUN-SQL-125.sql
--          docs/B1-STAGE3-CLEANUP-EXECUTION-PREFLIGHT-125.md
--          docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md
--          docs/B1-STAGE3-CLEANUP-RISK-RESOLUTION-124.md
-- =====================================================================

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

CREATE TEMP TABLE hold_request_number(n text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO hold_request_number(n) VALUES
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
-- 1. PRECONDITIONS — abort on any mismatch (R4 drift guard)
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  IF current_setting('vars.storage_export_ack', true) IS NULL THEN
    NULL; -- psql \set variant is inlined below; kept for server-side runs
  END IF;

  SELECT count(*) INTO n FROM cand_request;
  IF n <> 37 THEN RAISE EXCEPTION 'PRECHECK_CANDIDATE_COUNT % <> 37', n; END IF;

  SELECT count(*) INTO n FROM student_requests r JOIN cand_request c ON c.id = r.id;
  IF n <> 37 THEN RAISE EXCEPTION 'PRECHECK_CANDIDATES_MISSING_IN_DB %', n; END IF;

  SELECT count(*) INTO n
  FROM student_requests r
  JOIN cand_request c ON c.id = r.id
  JOIN student_profiles p ON p.id = r.student_profile_id
  WHERE p.academic_number LIKE 'TEST_ONLY\_B1\_%';
  IF n <> 37 THEN RAISE EXCEPTION 'PRECHECK_NON_TEST_ONLY_IN_CANDIDATES (matched %)', n; END IF;

  SELECT count(*) INTO n
  FROM student_requests r JOIN cand_request c ON c.id = r.id
  WHERE r.request_number IN (SELECT n FROM hold_request_number);
  IF n <> 0 THEN RAISE EXCEPTION 'PRECHECK_HOLD_INTERSECTION %', n; END IF;

  -- no open/in-flight request may be deleted
  SELECT count(*) INTO n
  FROM student_requests r JOIN cand_request c ON c.id = r.id
  WHERE r.status NOT IN ('draft','completed','cancelled');
  IF n <> 0 THEN RAISE EXCEPTION 'PRECHECK_OPEN_REQUEST_IN_CANDIDATES %', n; END IF;

  -- drift guard: nothing changed since the 125 snapshot
  SELECT count(*) INTO n
  FROM student_requests r JOIN cand_request c ON c.id = r.id
  WHERE r.updated_at > timestamptz '2026-07-31 04:00:00+00';
  IF n <> 0 THEN RAISE EXCEPTION 'PRECHECK_ID_DRIFT_DETECTED %', n; END IF;

  -- expected child volumes (fail closed if the shape moved)
  SELECT count(*) INTO n FROM student_request_attachment_uploads a JOIN cand_request c ON c.id = a.student_request_id;
  IF n <> 20 THEN RAISE EXCEPTION 'PRECHECK_ATTACHMENTS % <> 20', n; END IF;
  SELECT count(*) INTO n FROM student_request_workflow_steps s JOIN cand_request c ON c.id = s.student_request_id;
  IF n <> 135 THEN RAISE EXCEPTION 'PRECHECK_STEPS % <> 135', n; END IF;
  SELECT count(*) INTO n FROM student_request_workflow_events e JOIN cand_request c ON c.id = e.student_request_id;
  IF n <> 157 THEN RAISE EXCEPTION 'PRECHECK_EVENTS % <> 157', n; END IF;

  -- evidence + HOLD present before we touch anything
  SELECT count(*) INTO n FROM student_requests WHERE request_number IN (SELECT n FROM hold_request_number);
  IF n < 8 THEN RAISE EXCEPTION 'PRECHECK_EVIDENCE_MISSING %', n; END IF;

  -- visibility invariants
  SELECT count(*) INTO n FROM request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
     AND student_visible IS DISTINCT FROM false;
  IF n <> 0 THEN RAISE EXCEPTION 'PRECHECK_B1_VISIBILITY_UNEXPECTED %', n; END IF;
  SELECT count(*) INTO n FROM request_types WHERE code = 'enrollment_certificate' AND student_visible = true;
  IF n <> 1 THEN RAISE EXCEPTION 'PRECHECK_ENROLLMENT_CERTIFICATE_VISIBILITY'; END IF;

  -- migration head
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20260730175527' THEN
    RAISE EXCEPTION 'PRECHECK_MIGRATION_HEAD_MOVED';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. ORDERED DELETES (children first; no cascade relied upon)
-- ---------------------------------------------------------------------

-- 2.1 attachment METADATA rows (20). Storage objects are NOT deleted here.
DELETE FROM student_request_attachment_uploads a
 USING cand_request c WHERE a.student_request_id = c.id;

-- 2.2 effect rows (RESTRICT parents of student_requests)
DELETE FROM student_excused_absences e
 USING cand_request c WHERE e.absence_excuse_request_id = c.id;      -- 1
DELETE FROM student_extra_chances e
 USING cand_request c WHERE e.request_id = c.id;                     -- 1
DELETE FROM file_withdrawal_details d
 USING cand_request c WHERE d.request_id = c.id;                     -- 10

-- 2.3 remaining service detail rows
DELETE FROM absence_excuse_details d        USING cand_request c WHERE d.request_id = c.id;  -- 6
DELETE FROM enrollment_suspension_details d USING cand_request c WHERE d.request_id = c.id;  -- 6
DELETE FROM extra_chance_details d          USING cand_request c WHERE d.request_id = c.id;  -- 9
DELETE FROM transfer_request_details d      USING cand_request c WHERE d.request_id = c.id;  -- 6

-- 2.4 workflow runtime
DELETE FROM student_request_workflow_events e USING cand_request c WHERE e.student_request_id = c.id; -- 157
DELETE FROM student_request_workflow_steps  s USING cand_request c WHERE s.student_request_id = c.id; -- 135

-- 2.5 idempotency cache (NO ACTION on request_id and student_profile_id)
DELETE FROM b1_draft_mutation_idempotency i
 WHERE i.student_profile_id IN (
   '7020e51d-19e3-4acb-9597-5145b65d117e',
   'b1e20002-0000-4000-8000-000000000002',
   '65f55997-6fd0-40d0-9235-70ac65afeac2'
 );                                                                   -- 53

-- 2.6 the requests themselves (explicit ID list)
DELETE FROM student_requests r USING cand_request c WHERE r.id = c.id; -- 37

-- 2.7 TEST_ONLY_B1_0001 fixture rows, then the profile (explicit IDs only)
DELETE FROM student_academic_status WHERE id = 'f864d89a-0017-4051-b627-61e587e946af';
DELETE FROM student_enrollments     WHERE id = 'fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b';
DELETE FROM student_profiles        WHERE id = '7020e51d-19e3-4acb-9597-5145b65d117e';

-- 2.8 auth account 2e3ca4d6-603c-4f06-a23e-462bf92fcfd3
--     NOT deleted here. Use the approved account-removal path in a separate step.

-- ---------------------------------------------------------------------
-- 3. POSTCONDITIONS — COMMIT only if every check passes
-- ---------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  -- candidates gone
  SELECT count(*) INTO n FROM student_requests r JOIN cand_request c ON c.id = r.id;
  IF n <> 0 THEN RAISE EXCEPTION 'POSTCHECK_CANDIDATES_REMAIN %', n; END IF;

  -- evidence + HOLD intact (8 B1 records)
  SELECT count(*) INTO n FROM student_requests
   WHERE request_number IN ('SR-20260727-78427CC5','SR-20260727-50BEDCE2','SR-20260727-88D885F0',
                            'SR-20260727-40E3E66B','SR-20260727-42393846','SR-20260727-3C550070',
                            'SR-20260727-695EC35B','SR-20260727-F67CF366');
  IF n <> 8 THEN RAISE EXCEPTION 'POSTCHECK_EVIDENCE_LOST %', n; END IF;

  -- fail-closed evidence still in_review, F67CF366 still submitted
  IF (SELECT status::text FROM student_requests WHERE request_number = 'SR-20260727-3C550070') <> 'in_review'
  THEN RAISE EXCEPTION 'POSTCHECK_FAILCLOSED_STATUS_CHANGED'; END IF;
  IF (SELECT status::text FROM student_requests WHERE request_number = 'SR-20260727-F67CF366') <> 'submitted'
  THEN RAISE EXCEPTION 'POSTCHECK_HOLD_STATUS_CHANGED'; END IF;

  -- protected legacy records intact
  SELECT count(*) INTO n FROM student_requests
   WHERE request_number IN ('SR-20260713-2DE64041','SR-20260715-FEDCB3E1','SR-20260716-26BAD4C8');
  IF n <> 3 THEN RAISE EXCEPTION 'POSTCHECK_LEGACY_REQUESTS_LOST %', n; END IF;

  -- evidence effect rows intact
  SELECT count(*) INTO n FROM student_excused_absences
   WHERE id IN ('2a61d3f0-2139-4b99-9ab4-52cf6954cfd0','33ed9e39-2f29-4bfb-8633-0fd203a1c2ba');
  IF n <> 2 THEN RAISE EXCEPTION 'POSTCHECK_EXCUSED_EFFECT_LOST %', n; END IF;
  SELECT count(*) INTO n FROM student_extra_chances
   WHERE id = 'f8d8b87a-623f-4bc0-a612-c8403d9d597b';
  IF n <> 1 THEN RAISE EXCEPTION 'POSTCHECK_EXTRA_CHANCE_EFFECT_LOST'; END IF;

  -- protected TEST_ONLY profiles intact
  SELECT count(*) INTO n FROM student_profiles
   WHERE id IN ('b1e20002-0000-4000-8000-000000000002','65f55997-6fd0-40d0-9235-70ac65afeac2');
  IF n <> 2 THEN RAISE EXCEPTION 'POSTCHECK_PROTECTED_PROFILE_LOST %', n; END IF;
  SELECT count(*) INTO n FROM student_academic_status
   WHERE student_profile_id IN ('b1e20002-0000-4000-8000-000000000002','65f55997-6fd0-40d0-9235-70ac65afeac2');
  IF n <> 4 THEN RAISE EXCEPTION 'POSTCHECK_PROTECTED_ACADEMIC_STATUS % <> 4', n; END IF;

  -- real / non-TEST_ONLY data untouched
  SELECT count(*) INTO n FROM student_profiles WHERE academic_number LIKE 'TEST_ONLY\_B1\_%';
  IF n <> 2 THEN RAISE EXCEPTION 'POSTCHECK_TEST_ONLY_PROFILE_COUNT % <> 2', n; END IF;
  SELECT count(*) INTO n FROM student_profiles;
  IF n <> 848 THEN RAISE EXCEPTION 'POSTCHECK_TOTAL_PROFILES % <> 848', n; END IF;
  SELECT count(*) INTO n FROM student_requests;
  IF n <> 33 THEN RAISE EXCEPTION 'POSTCHECK_TOTAL_REQUESTS % <> 33', n; END IF;
  SELECT count(*) INTO n FROM student_request_workflow_steps;
  IF n <> 56 THEN RAISE EXCEPTION 'POSTCHECK_TOTAL_STEPS % <> 56', n; END IF;
  SELECT count(*) INTO n FROM student_request_workflow_events;
  IF n <> 83 THEN RAISE EXCEPTION 'POSTCHECK_TOTAL_EVENTS % <> 83', n; END IF;
  SELECT count(*) INTO n FROM student_request_attachment_uploads;
  IF n <> 8 THEN RAISE EXCEPTION 'POSTCHECK_TOTAL_ATTACHMENTS % <> 8', n; END IF;
  SELECT count(*) INTO n FROM student_academic_status;
  IF n <> 850 THEN RAISE EXCEPTION 'POSTCHECK_TOTAL_ACADEMIC_STATUS % <> 850', n; END IF;

  -- visibility unchanged
  SELECT count(*) INTO n FROM request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
     AND student_visible IS DISTINCT FROM false;
  IF n <> 0 THEN RAISE EXCEPTION 'POSTCHECK_B1_VISIBILITY_CHANGED'; END IF;
  IF (SELECT student_visible FROM request_types WHERE code = 'enrollment_certificate') IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'POSTCHECK_ENROLLMENT_CERTIFICATE_VISIBILITY_CHANGED'; END IF;

  -- enrollment_certificate data untouched
  SELECT count(*) INTO n FROM enrollment_certificate_document_details;
  RAISE NOTICE 'enrollment_certificate_document_details rows: % (must equal pre-run baseline)', n;

  RAISE NOTICE 'ALL POSTCONDITIONS PASSED';
END $$;

-- =====================================================================
-- END. NOT_APPLIED. No apply, no deploy, no publish, no visibility change.
-- =====================================================================
