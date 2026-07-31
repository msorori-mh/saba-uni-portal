-- ============================================================================
-- PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-DESIGN-13
-- FORWARD-ONLY TEST_ONLY FIXTURE PACKAGE  ***NOT APPLIED***
--
-- Location is deliberate: this file lives in docs/migration-drafts/ and MUST
-- NOT be moved into supabase/migrations/ without a separate explicit
-- production apply authorization.
--
-- PURPOSE
--   Create exactly 19 TEST_ONLY B1 fixture requests, one per currently
--   BLOCKED negative-matrix target step, so that every one of the 22 blocked
--   cases has a genuinely ACTIVE step to authorize against.
--
-- HARD BOUNDARIES ENFORCED BELOW
--   * one explicit transaction; every precondition runs before the first write
--   * production migration head precondition = 20260731203030
--   * no Auth writes, no Storage writes, no GRANT/RLS/role changes
--   * no student_visible change, no enrollment_certificate touch
--   * no academic effect rows, no notifications, no workflow RPC execution
--   * no terminal/completed fixture requests
--   * fails closed on ANY drift in workflow config, principals, or identifiers
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '120s';
SET LOCAL idle_in_transaction_session_timeout = '120s';

-- The B1 runtime guard trigger (guard_b1_runtime_mutation_boundary) rejects
-- non-RPC writes to runtime step rows unless this transaction-local GUC is set.
-- This is the documented initialization channel, NOT a privilege bypass.
SELECT set_config('b1.atomic_init', '1', true);

DO $fixture$
DECLARE
  -- ---- pinned production identifiers (verified read-only 2026-07-31) ------
  k_head            CONSTANT text := '20260731203030';
  k_student_profile CONSTANT uuid := 'b1e20002-0000-4000-8000-000000000002'; -- TEST_ONLY_B1_0002
  k_dept_it         CONSTANT uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8'; -- source
  k_dept_cs         CONSTANT uuid := '11111111-1111-4111-8111-111111111111'; -- target
  k_dept_cis        CONSTANT uuid := '22222222-2222-4222-8222-222222222222'; -- unrelated

  -- resolved active direct assignees (request_processing_assignments, is_active)
  k_sa_spec         CONSTANT uuid := 'c8a94548-4782-4252-86f9-23559d3b95bd';
  k_sa_mgr          CONSTANT uuid := 'aac0e62d-4e8b-4440-b649-caa388d34837';
  k_registrar       CONSTANT uuid := '4c261c1c-97fb-42da-a544-e8a59853ebe3';
  k_dean            CONSTANT uuid := 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0';
  k_finance         CONSTANT uuid := '79783c0f-8d95-4110-8239-0ac504d63a24';
  k_library         CONSTANT uuid := 'e7a93314-bb06-4525-b412-5315198c668a';
  k_labs            CONSTANT uuid := '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a';
  k_archive         CONSTANT uuid := 'aec1303e-de6a-4580-94cf-7205c17b5535';
  k_head_it         CONSTANT uuid := 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e';
  k_head_cs         CONSTANT uuid := '97acbe02-c59c-409c-8d51-7d4ef72e6db7';
  k_head_cis        CONSTANT uuid := 'f602b62c-194b-4591-8e9c-956e5cbb347d';

  k_marker          CONSTANT text := 'TEST_ONLY_B1_FIXTURE_13';

  v_n               integer;
  v_txt             text;
  r                 record;
  v_req_id          uuid;
  v_wf_id           uuid;
  v_step            record;
  v_rows            integer;
  v_created_req     integer := 0;
  v_created_steps   integer := 0;
BEGIN
  -- ======================================================================
  -- P0 — migration head precondition (exact)
  -- ======================================================================
  SELECT version INTO v_txt
    FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1;
  IF v_txt IS DISTINCT FROM k_head THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: migration head % <> %', v_txt, k_head;
  END IF;

  -- ======================================================================
  -- P1 — protected state must be untouched
  -- ======================================================================
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE request_type = 'enrollment_certificate';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: enrollment_certificate requests = % (expected 4)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.enrollment_certificate_document_details;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: certificate document_details = % (expected 2)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.official_documents;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: official_documents = % (expected 2)', v_n;
  END IF;

  -- five B1 services active AND hidden; certificate active AND visible
  SELECT count(*) INTO v_n FROM public.request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer',
                  'final_chance','file_withdrawal')
     AND is_active = true AND student_visible = false;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: five B1 services not all active+hidden (got %)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.request_types
   WHERE code = 'enrollment_certificate' AND is_active = true AND student_visible = true;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: enrollment_certificate visibility drift';
  END IF;

  -- ======================================================================
  -- P2 — fixture student precondition
  -- ======================================================================
  PERFORM 1 FROM public.student_profiles sp
   WHERE sp.id = k_student_profile
     AND sp.academic_number = 'TEST_ONLY_B1_0002'
     AND sp.status = 'active'
     AND sp.user_id IS NOT NULL
     AND sp.department_id = k_dept_it;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: fixture student drifted (TEST_ONLY_B1_0002)';
  END IF;

  -- ======================================================================
  -- P3 — workflow configuration preconditions (exact step counts per service)
  -- ======================================================================
  FOR r IN
    SELECT * FROM (VALUES
      ('enrollment_suspension', 3),
      ('excused_absence',       3),
      ('department_transfer',   6),
      ('final_chance',          5),
      ('file_withdrawal',       7)
    ) AS x(code, steps)
  LOOP
    SELECT count(*) INTO v_n
      FROM public.request_types rt
      JOIN public.request_type_workflows w
        ON w.request_type_id = rt.id AND w.is_active AND w.status = 'active'
      JOIN public.request_type_workflow_steps s ON s.workflow_id = w.id
     WHERE rt.code = r.code;
    IF v_n <> r.steps THEN
      RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % has % configured steps (expected %)',
        r.code, v_n, r.steps;
    END IF;

    SELECT count(*) INTO v_n
      FROM public.request_types rt
      JOIN public.request_type_workflows w
        ON w.request_type_id = rt.id AND w.is_active AND w.status = 'active'
     WHERE rt.code = r.code;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % has % active workflows (expected exactly 1)',
        r.code, v_n;
    END IF;
  END LOOP;

  -- every configured step must be specific_user + exactly_one_direct_assignee
  SELECT count(*) INTO v_n
    FROM public.request_types rt
    JOIN public.request_type_workflows w
      ON w.request_type_id = rt.id AND w.is_active AND w.status = 'active'
    JOIN public.request_type_workflow_steps s ON s.workflow_id = w.id
   WHERE rt.code IN ('enrollment_suspension','excused_absence','department_transfer',
                     'final_chance','file_withdrawal')
     AND (s.assignment_strategy <> 'specific_user'
       OR coalesce(s.config->>'authorization','') <> 'exactly_one_direct_assignee');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % configured steps drifted from exactly_one_direct_assignee', v_n;
  END IF;

  -- ======================================================================
  -- P4 — principal preconditions: exactly one active assignment per (unit, role[, dept])
  -- ======================================================================
  FOR r IN
    SELECT * FROM (VALUES
      ('student_affairs','student_affairs_specialist', NULL::uuid, k_sa_spec),
      ('student_affairs','student_affairs_manager',    NULL,       k_sa_mgr),
      ('registrar',      'registrar_general',          NULL,       k_registrar),
      ('dean',           'dean',                       NULL,       k_dean),
      ('finance',        'revenue_finance_officer',    NULL,       k_finance),
      ('library',        'library_officer',            NULL,       k_library),
      ('labs',           'labs_manager',               NULL,       k_labs),
      ('archive',        'archive_officer',            NULL,       k_archive),
      ('department',     'department_head',            k_dept_it,  k_head_it),
      ('department',     'department_head',            k_dept_cs,  k_head_cs),
      ('department',     'department_head',            k_dept_cis, k_head_cis)
    ) AS x(unit_code, role_code, dept_id, expected_user)
  LOOP
    SELECT count(*) INTO v_n
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id
      JOIN public.request_processing_roles pr ON pr.id = a.role_id
      LEFT JOIN public.staff_profiles sp ON sp.id = a.staff_profile_id
      LEFT JOIN public.faculty_profiles fp ON fp.id = a.faculty_profile_id
      LEFT JOIN public.position_assignments pa ON pa.id = a.position_assignment_id
     WHERE a.is_active = true
       AND u.code = r.unit_code
       AND pr.code = r.role_code
       AND a.department_id IS NOT DISTINCT FROM r.dept_id
       AND coalesce(a.user_id, sp.user_id, fp.user_id, pa.user_id) = r.expected_user;
    IF v_n <> 1 THEN
      RAISE EXCEPTION
        'FIXTURE13_PRECONDITION_FAIL: principal drift for %/% dept=% (matching active assignments = %)',
        r.unit_code, r.role_code, coalesce(r.dept_id::text,'-'), v_n;
    END IF;
  END LOOP;

  -- ======================================================================
  -- P5 — fixture identifiers must NOT already exist
  -- ======================================================================
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE id >= 'f1300000-0000-4000-8000-000000000000'::uuid
     AND id <= 'f1300000-0000-4000-8000-999999999999'::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % fixture request ids already present', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE request_number LIKE 'SR-20260801-13%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % fixture request numbers already present', v_n;
  END IF;

  -- ======================================================================
  -- WRITES BEGIN HERE — 19 fixture requests, each parked on ONE active step
  -- Spec: (ordinal, service, active_step_order)
  -- ======================================================================
  FOR r IN
    SELECT * FROM (VALUES
      ( 1,'department_transfer'  ,2),
      ( 2,'department_transfer'  ,3),
      ( 3,'department_transfer'  ,4),
      ( 4,'department_transfer'  ,5),
      ( 5,'department_transfer'  ,6),
      ( 6,'enrollment_suspension',2),
      ( 7,'enrollment_suspension',3),
      ( 8,'excused_absence'      ,2),
      ( 9,'excused_absence'      ,3),
      (10,'file_withdrawal'      ,2),
      (11,'file_withdrawal'      ,3),
      (12,'file_withdrawal'      ,4),
      (13,'file_withdrawal'      ,5),
      (14,'file_withdrawal'      ,6),
      (15,'file_withdrawal'      ,7),
      (16,'final_chance'         ,2),
      (17,'final_chance'         ,3),
      (18,'final_chance'         ,4),
      (19,'final_chance'         ,5)
    ) AS x(ord, service, active_order)
  LOOP
    v_req_id := ('f1300000-0000-4000-8000-' || lpad(r.ord::text, 12, '0'))::uuid;

    SELECT w.id INTO v_wf_id
      FROM public.request_types rt
      JOIN public.request_type_workflows w
        ON w.request_type_id = rt.id AND w.is_active AND w.status = 'active'
     WHERE rt.code = r.service;
    IF v_wf_id IS NULL THEN
      RAISE EXCEPTION 'FIXTURE13_FAIL: no active workflow for %', r.service;
    END IF;

    INSERT INTO public.student_requests (
      id, student_profile_id, request_type, title, description, status,
      submitted_at, request_number, current_step_index, form_data, internal_notes
    ) VALUES (
      v_req_id,
      k_student_profile,
      r.service,
      k_marker || ' — ' || r.service || ' @ step ' || r.active_order,
      k_marker,
      'in_review',
      now(),
      'SR-20260801-13' || lpad(r.ord::text, 6, '0'),
      r.active_order,
      jsonb_build_object(
        'test_only_marker', k_marker,
        'source_department_id', k_dept_it::text,
        'target_department_id', CASE WHEN r.service = 'department_transfer'
                                     THEN k_dept_cs::text ELSE NULL END
      ),
      k_marker
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'FIXTURE13_FAIL: request insert affected % rows (expected 1)', v_rows;
    END IF;
    v_created_req := v_created_req + 1;

    -- runtime steps: orders < active_order = completed (fixture initialization,
    -- no decision, no actor, no academic effect); active_order = active;
    -- orders > active_order = pending.
    FOR v_step IN
      SELECT s.*,
             CASE
               WHEN s.step_order < r.active_order THEN 'completed'
               WHEN s.step_order = r.active_order THEN 'active'
               ELSE 'pending'
             END AS runtime_status,
             CASE
               WHEN u.code = 'student_affairs' AND pr.code = 'student_affairs_specialist' THEN k_sa_spec
               WHEN u.code = 'student_affairs' AND pr.code = 'student_affairs_manager'    THEN k_sa_mgr
               WHEN u.code = 'registrar'                                                  THEN k_registrar
               WHEN u.code = 'dean'                                                       THEN k_dean
               WHEN u.code = 'finance'                                                    THEN k_finance
               WHEN u.code = 'library'                                                    THEN k_library
               WHEN u.code = 'labs'                                                       THEN k_labs
               WHEN u.code = 'archive'                                                    THEN k_archive
               WHEN u.code = 'department'
                    AND s.config->>'department_scope' = 'target_department'               THEN k_head_cs
               WHEN u.code = 'department'                                                 THEN k_head_it
             END AS assignee
        FROM public.request_type_workflow_steps s
        LEFT JOIN public.request_processing_units u ON u.id = s.processing_unit_id
        LEFT JOIN public.request_processing_roles pr ON pr.id = s.processing_role_id
       WHERE s.workflow_id = v_wf_id
       ORDER BY s.step_order
    LOOP
      IF v_step.assignee IS NULL THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: no mapped principal for %/% step %',
          r.service, v_step.step_key, v_step.step_order;
      END IF;

      INSERT INTO public.student_request_workflow_steps (
        id, student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar,
        step_order, processing_unit_id, processing_role_id, assigned_user_id,
        status, entered_at, completed_at, metadata
      ) VALUES (
        gen_random_uuid(), v_req_id, v_wf_id, v_step.id, v_step.step_key, v_step.step_name_ar,
        v_step.step_order, v_step.processing_unit_id, v_step.processing_role_id, v_step.assignee,
        v_step.runtime_status,
        CASE WHEN v_step.runtime_status IN ('completed','active') THEN now() END,
        CASE WHEN v_step.runtime_status = 'completed' THEN now() END,
        jsonb_build_object('test_only_marker', k_marker, 'fixture_initialized', true)
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: step insert affected % rows (expected 1)', v_rows;
      END IF;
      v_created_steps := v_created_steps + 1;
    END LOOP;
  END LOOP;

  -- ======================================================================
  -- POST-WRITE EXACT-COUNT ASSERTIONS
  -- ======================================================================
  IF v_created_req <> 19 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: created % requests (expected 19)', v_created_req;
  END IF;
  -- 5*6 (transfer) + 2*3 + 2*3 + 6*7 + 4*5 = 30+6+6+42+20 = 104
  IF v_created_steps <> 104 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: created % runtime steps (expected 104)', v_created_steps;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_requests req
    JOIN public.student_request_workflow_steps w ON w.student_request_id = req.id
   WHERE req.internal_notes = k_marker AND w.status = 'active';
  IF v_n <> 19 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % active fixture steps (expected exactly 19)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE internal_notes = k_marker AND status <> 'in_review';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % fixture requests are not in_review', v_n;
  END IF;

  -- no fixture may be terminal, and no academic effect may have appeared
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE internal_notes = k_marker AND status IN ('completed','approved','rejected','cancelled');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % terminal fixture requests created', v_n;
  END IF;

  -- protected state must still match the pre-write reading
  SELECT count(*) INTO v_n FROM public.student_requests WHERE request_type = 'enrollment_certificate';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: enrollment_certificate requests changed to %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer',
                  'final_chance','file_withdrawal')
     AND student_visible = false;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: B1 service visibility changed';
  END IF;

  RAISE NOTICE 'FIXTURE13_OK: 19 requests / 104 runtime steps / 19 active steps';
END
$fixture$;

COMMIT;

-- ============================================================================
-- NOT APPLIED. Requires a separate explicit production apply authorization.
-- ============================================================================
