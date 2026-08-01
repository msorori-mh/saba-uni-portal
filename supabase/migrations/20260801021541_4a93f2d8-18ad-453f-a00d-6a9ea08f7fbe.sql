-- ============================================================================
-- PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE
-- REMEDIATION 15 — runtime-assignee identity contract compliant
-- AUTHORIZED PRODUCTION APPLY (mission PORTAL-B1-...-PRODUCTION-APPLY-21)
-- Source: docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql
-- Only change vs the reviewed draft: the explicit BEGIN;/COMMIT; wrapper is
-- omitted because the migration runner already wraps this in one transaction.
-- ============================================================================

SET LOCAL statement_timeout = '120s';
SET LOCAL idle_in_transaction_session_timeout = '120s';

-- The B1 runtime guard trigger (guard_b1_runtime_mutation_boundary) rejects
-- non-RPC writes to runtime step rows unless this transaction-local GUC is set.
-- This is the documented initialization channel, NOT a privilege bypass.
SELECT set_config('b1.atomic_init', '1', true);

DO $fixture$
DECLARE
  k_head            CONSTANT text := '20260731203030';
  k_student_profile CONSTANT uuid := 'b1e20002-0000-4000-8000-000000000002';
  k_dept_it         CONSTANT uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  k_dept_cs         CONSTANT uuid := '11111111-1111-4111-8111-111111111111';
  k_dept_cis        CONSTANT uuid := '22222222-2222-4222-8222-222222222222';
  k_prog_it         CONSTANT uuid := '97638001-87cd-4df0-abe9-63c829504072';
  k_prog_cs         CONSTANT uuid := '8df96335-4197-4e33-85ca-a970608f6a63';

  k_u_sa_spec       CONSTANT uuid := 'c8a94548-4782-4252-86f9-23559d3b95bd';
  k_u_sa_mgr        CONSTANT uuid := 'aac0e62d-4e8b-4440-b649-caa388d34837';
  k_u_registrar     CONSTANT uuid := '4c261c1c-97fb-42da-a544-e8a59853ebe3';
  k_u_dean          CONSTANT uuid := 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0';
  k_u_finance       CONSTANT uuid := '79783c0f-8d95-4110-8239-0ac504d63a24';
  k_u_library       CONSTANT uuid := 'e7a93314-bb06-4525-b412-5315198c668a';
  k_u_labs          CONSTANT uuid := '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a';
  k_u_archive       CONSTANT uuid := 'aec1303e-de6a-4580-94cf-7205c17b5535';
  k_u_head_it       CONSTANT uuid := 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e';
  k_u_head_cs       CONSTANT uuid := '97acbe02-c59c-409c-8d51-7d4ef72e6db7';
  k_u_head_cis      CONSTANT uuid := 'f602b62c-194b-4591-8e9c-956e5cbb347d';

  k_marker          CONSTANT text := 'TEST_ONLY_B1_FIXTURE_13';

  v_n               integer;
  v_txt             text;
  r                 record;
  v_req_id          uuid;
  v_detail_id       uuid;
  v_wf_id           uuid;
  v_step            record;
  v_step_id         uuid;
  v_rows            integer;
  v_created_req     integer := 0;
  v_created_steps   integer := 0;
  v_created_details integer := 0;
  v_dept_scope      uuid;
  v_assignment      public.request_processing_assignments%ROWTYPE;
  v_eff_user        uuid;
  v_expected_user   uuid;
BEGIN
  -- P0 — migration head precondition (exact)
  SELECT version INTO v_txt
    FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1;
  IF v_txt IS DISTINCT FROM k_head THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: migration head % <> %', v_txt, k_head;
  END IF;

  -- P1 — protected state must be untouched
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

  -- P2 — fixture student precondition
  PERFORM 1 FROM public.student_profiles sp
   WHERE sp.id = k_student_profile
     AND sp.academic_number = 'TEST_ONLY_B1_0002'
     AND sp.status = 'active'
     AND sp.user_id IS NOT NULL
     AND sp.department_id = k_dept_it
     AND sp.program_id = k_prog_it;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: fixture student drifted (TEST_ONLY_B1_0002)';
  END IF;

  PERFORM 1 FROM public.programs WHERE id = k_prog_it AND department_id = k_dept_it;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: source program is not in the IT department';
  END IF;
  PERFORM 1 FROM public.programs WHERE id = k_prog_cs AND department_id = k_dept_cs;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: target program is not in the CS department';
  END IF;
  IF k_dept_cis IN (k_dept_it, k_dept_cs) THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: unrelated department collides with source/target';
  END IF;

  -- P3 — workflow configuration preconditions (exact step counts per service)
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

  -- P4 — principal preconditions
  FOR r IN
    SELECT * FROM (VALUES
      ('student_affairs','student_affairs_specialist', NULL::uuid, k_u_sa_spec,   'staff_profile'),
      ('student_affairs','student_affairs_manager',    NULL,       k_u_sa_mgr,    'staff_profile'),
      ('registrar',      'registrar_general',          NULL,       k_u_registrar, 'staff_profile'),
      ('dean',           'dean',                       NULL,       k_u_dean,      'faculty_profile'),
      ('finance',        'revenue_finance_officer',    NULL,       k_u_finance,   'staff_profile'),
      ('library',        'library_officer',            NULL,       k_u_library,   'staff_profile'),
      ('labs',           'labs_manager',               NULL,       k_u_labs,      'staff_profile'),
      ('archive',        'archive_officer',            NULL,       k_u_archive,   'staff_profile'),
      ('department',     'department_head',            k_dept_it,  k_u_head_it,   'position_assignment'),
      ('department',     'department_head',            k_dept_cs,  k_u_head_cs,   'position_assignment'),
      ('department',     'department_head',            k_dept_cis, k_u_head_cis,  'position_assignment')
    ) AS x(unit_code, role_code, dept_id, expected_user, expected_kind)
  LOOP
    SELECT count(*) INTO v_n
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id
      JOIN public.request_processing_roles pr ON pr.id = a.role_id
     WHERE a.is_active = true
       AND u.code = r.unit_code
       AND pr.code = r.role_code
       AND (a.starts_at IS NULL OR a.starts_at <= now())
       AND (a.ends_at IS NULL OR a.ends_at > now())
       AND a.department_id IS NOT DISTINCT FROM r.dept_id
       AND public.is_valid_b1_direct_assignment(a.id, r.dept_id, false);
    IF v_n <> 1 THEN
      RAISE EXCEPTION
        'FIXTURE13_PRECONDITION_FAIL: principal drift for %/% dept=% (effective assignments = %)',
        r.unit_code, r.role_code, coalesce(r.dept_id::text,'-'), v_n;
    END IF;

    SELECT a.* INTO v_assignment
      FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id
      JOIN public.request_processing_roles pr ON pr.id = a.role_id
     WHERE a.is_active = true
       AND u.code = r.unit_code
       AND pr.code = r.role_code
       AND (a.starts_at IS NULL OR a.starts_at <= now())
       AND (a.ends_at IS NULL OR a.ends_at > now())
       AND a.department_id IS NOT DISTINCT FROM r.dept_id
       AND public.is_valid_b1_direct_assignment(a.id, r.dept_id, false);

    IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
                    v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
      RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: identity not singular for %/%',
        r.unit_code, r.role_code;
    END IF;
    IF v_assignment.assignment_type IS DISTINCT FROM r.expected_kind THEN
      RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: identity kind drift for %/% (% <> %)',
        r.unit_code, r.role_code, v_assignment.assignment_type, r.expected_kind;
    END IF;

    IF r.dept_id IS NOT NULL AND (v_assignment.assignment_type <> 'position_assignment'
        OR v_assignment.position_assignment_id IS NULL
        OR v_assignment.department_id IS DISTINCT FROM r.dept_id) THEN
      RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: department-scoped assignment contract drift for dept %',
        r.dept_id;
    END IF;

    SELECT coalesce(v_assignment.user_id, sp.user_id, fp.user_id, pa.user_id) INTO v_eff_user
      FROM (SELECT 1) z
      LEFT JOIN public.staff_profiles sp
        ON sp.id = v_assignment.staff_profile_id AND sp.status = 'active'
      LEFT JOIN public.faculty_profiles fp
        ON fp.id = v_assignment.faculty_profile_id AND fp.status = 'active'
      LEFT JOIN public.position_assignments pa
        ON pa.id = v_assignment.position_assignment_id AND pa.is_active = true;
    IF v_eff_user IS DISTINCT FROM r.expected_user THEN
      RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: effective actor drift for %/% dept=% (% <> %)',
        r.unit_code, r.role_code, coalesce(r.dept_id::text,'-'), v_eff_user, r.expected_user;
    END IF;
  END LOOP;

  -- P5 — deterministic fixture identifiers must NOT already exist
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE id BETWEEN 'f1300000-0000-4000-8000-000000000000'::uuid
                AND 'f1300000-0000-4000-8000-999999999999'::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % fixture request ids already present', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE request_number LIKE 'SR-20260801-13%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % fixture request numbers already present', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.student_request_workflow_steps
   WHERE id BETWEEN 'f1300001-0000-4000-8000-000000000000'::uuid
                AND 'f1300001-0000-4000-8000-999999999999'::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % deterministic runtime step ids already present', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.transfer_request_details
   WHERE id BETWEEN 'f1300002-0000-4000-8000-000000000000'::uuid
                AND 'f1300002-0000-4000-8000-999999999999'::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_PRECONDITION_FAIL: % fixture transfer detail ids already present', v_n;
  END IF;

  -- WRITES BEGIN HERE
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
      jsonb_build_object('test_only_marker', k_marker),
      k_marker
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'FIXTURE13_FAIL: request insert affected % rows (expected 1)', v_rows;
    END IF;
    v_created_req := v_created_req + 1;

    IF r.service = 'department_transfer' THEN
      v_detail_id := ('f1300002-0000-4000-8000-' || lpad(r.ord::text, 12, '0'))::uuid;

      SELECT count(*) INTO v_n FROM public.transfer_request_details d
       WHERE d.request_id = v_req_id OR d.id = v_detail_id;
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: transfer detail collision for ordinal %', r.ord;
      END IF;

      INSERT INTO public.transfer_request_details (
        id, request_id, current_department_id, current_program_id,
        requested_department_id, requested_program_id, transfer_reason, notes
      ) VALUES (
        v_detail_id, v_req_id, k_dept_it, k_prog_it,
        k_dept_cs, k_prog_cs, k_marker || ' — IT to CS scope fixture', k_marker
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: transfer detail insert affected % rows (expected 1)', v_rows;
      END IF;
      v_created_details := v_created_details + 1;
    END IF;

    FOR v_step IN
      SELECT s.*, u.code AS unit_code, pr.code AS role_code,
             CASE
               WHEN s.step_order < r.active_order THEN 'completed'
               WHEN s.step_order = r.active_order THEN 'active'
               ELSE 'pending'
             END AS runtime_status
        FROM public.request_type_workflow_steps s
        LEFT JOIN public.request_processing_units u ON u.id = s.processing_unit_id
        LEFT JOIN public.request_processing_roles pr ON pr.id = s.processing_role_id
       WHERE s.workflow_id = v_wf_id
       ORDER BY s.step_order
    LOOP
      v_dept_scope := NULL;
      IF r.service = 'department_transfer'
         AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
        SELECT CASE v_step.step_key
                 WHEN 'source_department_head_approval' THEN d.current_department_id
                 ELSE d.requested_department_id
               END
          INTO v_dept_scope
          FROM public.transfer_request_details d
         WHERE d.request_id = v_req_id;
        IF v_dept_scope IS NULL THEN
          RAISE EXCEPTION 'FIXTURE13_FAIL: transfer department scope missing for %/%',
            r.ord, v_step.step_key;
        END IF;
      END IF;

      SELECT count(*) INTO v_n
        FROM public.request_processing_assignments a
       WHERE a.unit_id = v_step.processing_unit_id
         AND a.role_id = v_step.processing_role_id
         AND a.is_active = true
         AND (a.starts_at IS NULL OR a.starts_at <= now())
         AND (a.ends_at IS NULL OR a.ends_at > now())
         AND (v_dept_scope IS NULL OR a.department_id = v_dept_scope)
         AND public.is_valid_b1_direct_assignment(a.id, v_dept_scope, false)
         AND (v_dept_scope IS NULL OR (
           a.assignment_type = 'position_assignment'
           AND a.position_assignment_id IS NOT NULL
           AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: effective assignment for %/% resolved % rows (expected 1)',
          r.service, v_step.step_key, v_n;
      END IF;

      SELECT a.* INTO v_assignment
        FROM public.request_processing_assignments a
       WHERE a.unit_id = v_step.processing_unit_id
         AND a.role_id = v_step.processing_role_id
         AND a.is_active = true
         AND (a.starts_at IS NULL OR a.starts_at <= now())
         AND (a.ends_at IS NULL OR a.ends_at > now())
         AND (v_dept_scope IS NULL OR a.department_id = v_dept_scope)
         AND public.is_valid_b1_direct_assignment(a.id, v_dept_scope, false)
         AND (v_dept_scope IS NULL OR (
           a.assignment_type = 'position_assignment'
           AND a.position_assignment_id IS NOT NULL
           AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

      IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
                      v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: assignment identity not singular for %/%',
          r.service, v_step.step_key;
      END IF;

      IF v_dept_scope IS NOT NULL AND v_assignment.position_assignment_id IS NULL THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: department head step % is not a position assignment',
          v_step.step_key;
      END IF;

      v_expected_user := CASE
        WHEN v_dept_scope = k_dept_it THEN k_u_head_it
        WHEN v_dept_scope = k_dept_cs THEN k_u_head_cs
        ELSE NULL END;
      IF v_expected_user IS NOT NULL THEN
        SELECT pa.user_id INTO v_eff_user FROM public.position_assignments pa
         WHERE pa.id = v_assignment.position_assignment_id;
        IF v_eff_user IS DISTINCT FROM v_expected_user THEN
          RAISE EXCEPTION 'FIXTURE13_FAIL: department head actor drift for % (% <> %)',
            v_step.step_key, v_eff_user, v_expected_user;
        END IF;
      END IF;

      v_step_id := ('f1300001-0000-4000-8000-'
                    || lpad(r.ord::text, 6, '0')
                    || lpad(v_step.step_order::text, 6, '0'))::uuid;

      INSERT INTO public.student_request_workflow_steps (
        id, student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar,
        step_order, processing_unit_id, processing_role_id,
        assigned_user_id, assigned_staff_profile_id,
        assigned_faculty_profile_id, assigned_position_assignment_id,
        status, entered_at, completed_at, metadata
      ) VALUES (
        v_step_id, v_req_id, v_wf_id, v_step.id, v_step.step_key, v_step.step_name_ar,
        v_step.step_order, v_step.processing_unit_id, v_step.processing_role_id,
        v_assignment.user_id,
        v_assignment.staff_profile_id,
        v_assignment.faculty_profile_id,
        v_assignment.position_assignment_id,
        v_step.runtime_status,
        CASE WHEN v_step.runtime_status IN ('completed','active') THEN now() END,
        CASE WHEN v_step.runtime_status = 'completed' THEN now() END,
        jsonb_build_object(
          'test_only_marker', k_marker,
          'fixture_initialized', true,
          'action_type', v_step.action_type,
          'direct_assignment_id', v_assignment.id
        )
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FIXTURE13_FAIL: step insert affected % rows (expected 1)', v_rows;
      END IF;
      v_created_steps := v_created_steps + 1;
    END LOOP;

    SELECT count(*) INTO v_n FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = v_req_id AND s.status = 'active';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FIXTURE13_FAIL: request % has % active steps (expected 1)', r.ord, v_n;
    END IF;
  END LOOP;

  -- POST-WRITE EXACT-COUNT ASSERTIONS
  IF v_created_req <> 19 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: created % requests (expected 19)', v_created_req;
  END IF;
  IF v_created_steps <> 104 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: created % runtime steps (expected 104)', v_created_steps;
  END IF;
  IF v_created_details <> 5 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: created % transfer detail rows (expected 5)', v_created_details;
  END IF;

  SELECT count(DISTINCT s.id) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests req ON req.id = s.student_request_id
   WHERE req.internal_notes = k_marker;
  IF v_n <> 104 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % distinct fixture step ids (expected 104)', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests req ON req.id = s.student_request_id
   WHERE req.internal_notes = k_marker
     AND s.id NOT BETWEEN 'f1300001-0000-4000-8000-000000000000'::uuid
                      AND 'f1300001-0000-4000-8000-999999999999'::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % fixture steps outside the deterministic id space', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests req ON req.id = s.student_request_id
   WHERE req.internal_notes = k_marker
     AND (num_nonnulls(s.assigned_user_id, s.assigned_staff_profile_id,
                       s.assigned_faculty_profile_id, s.assigned_position_assignment_id) <> 1
       OR (s.metadata ->> 'direct_assignment_id') IS NULL);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % fixture steps violate the singular-identity/provenance contract', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests req ON req.id = s.student_request_id
    JOIN public.request_processing_assignments a
      ON a.id = (s.metadata ->> 'direct_assignment_id')::uuid
   WHERE req.internal_notes = k_marker
     AND (s.assigned_user_id IS DISTINCT FROM a.user_id
       OR s.assigned_staff_profile_id IS DISTINCT FROM a.staff_profile_id
       OR s.assigned_faculty_profile_id IS DISTINCT FROM a.faculty_profile_id
       OR s.assigned_position_assignment_id IS DISTINCT FROM a.position_assignment_id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % fixture steps drifted from their pinned assignment identity', v_n;
  END IF;

  FOR v_step IN
    SELECT s.id FROM public.student_request_workflow_steps s
    JOIN public.student_requests req ON req.id = s.student_request_id
    WHERE req.internal_notes = k_marker AND s.status = 'active'
  LOOP
    PERFORM public.assert_b1_runtime_step_assignee_effective(v_step.id);
  END LOOP;

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

  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE internal_notes = k_marker AND status IN ('completed','approved','rejected','cancelled');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % terminal fixture requests created', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.transfer_request_details d
    JOIN public.student_requests req ON req.id = d.request_id
   WHERE req.internal_notes = k_marker
     AND (d.current_department_id <> k_dept_it OR d.requested_department_id <> k_dept_cs);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: % transfer detail rows drifted from IT->CS scope', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.transfer_request_details d
    JOIN public.student_requests req ON req.id = d.request_id
   WHERE req.internal_notes = k_marker
     AND k_dept_cis IN (d.current_department_id, d.requested_department_id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FIXTURE13_POSTFAIL: CIS stored as transfer scope in % rows', v_n;
  END IF;

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

  RAISE NOTICE 'FIXTURE13_OK: 19 requests / 104 runtime steps / 19 active / 5 transfer details';
END
$fixture$;