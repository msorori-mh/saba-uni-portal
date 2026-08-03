-- ============================================================================
-- PORTAL-B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44
-- Forward-only repair after source/production head 20260802225131.
-- Remediation-49: fail-closed on the exact authoritative seven-step contract.
--
-- Purpose: restore TEST_ONLY Fixture 15 (SR-20260801-13000015 /
-- f1300000-0000-4000-8000-000000000015) from the documented consumed archive
-- state back to the authoritative Fixture-13 seed state with exactly one
-- active runtime step (archive), so the fixture contract returns to 19/19.
--
-- Authoritative seven-step contract sources:
--   * Fixture-13 package migration 20260801021541
--   * tests/b1-authoritative-positive-fixture-matrix-19/MANIFEST.json (case 15)
--   * tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json
--     pin SR-20260801-13000015|archive (+ predecessor_set)
--   * applied file_withdrawal_free_workflow (b1_16 free service workflows)
--
-- Scope (fail-closed):
--   * Only Fixture 15 request + its archive-step completion fields
--   * Does NOT rewrite unit/role/action/assignee/workflow bindings
--   * Preserves immutable workflow-event audit rows (does NOT delete/rewrite)
--   * Captures incident evidence into a dedicated TEST_ONLY evidence table
--   * Does NOT touch the other 18 fixtures, Auth, Storage, enrollment_certificate,
--     request_types.student_visible / is_active, or authorization artifacts
--
-- Boundary: uses transaction-local b1.atomic_init (same documented channel as
-- Fixture-13 seed / Stage-3 cleanup). Not a privilege bypass.
-- ============================================================================

SELECT set_config('b1.atomic_init', '1', true);

CREATE TABLE IF NOT EXISTS public.b1_fixture_15_reissue_44_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  request_number text NOT NULL,
  request_status text,
  request_completed_at timestamptz,
  archive_step_id uuid,
  archive_step_status text,
  archive_step_decision text,
  archive_step_completed_by uuid,
  archive_step_completed_at timestamptz,
  archive_step_comment text,
  event_id uuid,
  event_type text,
  event_actor_user_id uuid,
  event_created_at timestamptz,
  event_payload jsonb,
  event_message_ar text,
  evidence jsonb NOT NULL,
  marker text NOT NULL DEFAULT 'TEST_ONLY_B1_FIXTURE_15_REISSUE_44'
);

COMMENT ON TABLE public.b1_fixture_15_reissue_44_evidence IS
  'TEST_ONLY incident evidence for Fixture-15 reissue-44. Append-only capture; not a substitute for workflow_events.';

REVOKE ALL ON TABLE public.b1_fixture_15_reissue_44_evidence FROM PUBLIC;
REVOKE ALL ON TABLE public.b1_fixture_15_reissue_44_evidence FROM anon, authenticated;
ALTER TABLE public.b1_fixture_15_reissue_44_evidence ENABLE ROW LEVEL SECURITY;

DO $b1_44_fixture_15_reissue$
DECLARE
  k_req_id        constant uuid := 'f1300000-0000-4000-8000-000000000015';
  k_step7_id      constant uuid := 'f1300001-0000-4000-8000-000015000007';
  k_req_number    constant text := 'SR-20260801-13000015';
  k_marker        constant text := 'TEST_ONLY_B1_FIXTURE_13';
  k_archive_actor constant uuid := 'aec1303e-de6a-4580-94cf-7205c17b5535';
  k_evidence_mark constant text := 'TEST_ONLY_B1_FIXTURE_15_REISSUE_44';

  v_req           public.student_requests%ROWTYPE;
  v_step7         public.student_request_workflow_steps%ROWTYPE;
  v_event         public.student_request_workflow_events%ROWTYPE;
  v_n             integer;
  v_completed     integer;
  v_active        integer;
  v_events        integer;
  v_restored      boolean := false;
  v_consumed      boolean := false;
  v_rows          integer;
  v_wf_id         uuid;
  v_wf_count      integer;
  v_exp           record;
  v_step          public.student_request_workflow_steps%ROWTYPE;
  v_unit_code     text;
  v_role_code     text;
  v_action        text;
  v_principal     uuid;
  v_cfg_id        uuid;
  v_identity_n    integer;
  v_pred_bad      integer;
BEGIN
  -- ------------------------------------------------------------------
  -- Load Fixture 15 identity (exact UUID + request number + marker).
  -- ------------------------------------------------------------------
  SELECT * INTO v_req
    FROM public.student_requests r
   WHERE r.id = k_req_id
     AND r.request_number = k_req_number
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_REQUEST_NOT_FOUND',
      DETAIL = k_req_number;
  END IF;

  IF v_req.request_type IS DISTINCT FROM 'file_withdrawal' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_SERVICE_MISMATCH',
      DETAIL = coalesce(v_req.request_type, '<null>');
  END IF;

  IF v_req.internal_notes IS DISTINCT FROM k_marker
     AND coalesce(v_req.form_data->>'test_only_marker', '') IS DISTINCT FROM k_marker THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_MARKER_MISMATCH';
  END IF;

  -- Lock all seven runtime rows in deterministic step_order before any
  -- evidence insert or mutation.
  PERFORM 1
    FROM public.student_request_workflow_steps s
   WHERE s.student_request_id = k_req_id
   ORDER BY s.step_order, s.id
   FOR UPDATE;

  -- Duplicate runtime row / order / key detection before count gate.
  IF EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = k_req_id
     GROUP BY s.step_order HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = k_req_id
     GROUP BY s.step_key HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = k_req_id
     GROUP BY s.id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_DUPLICATE_STEP';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
   WHERE s.student_request_id = k_req_id;
  IF v_n IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_STEP_COUNT_MISMATCH',
      DETAIL = format('expected=7 actual=%s', v_n);
  END IF;

  -- Resolve exactly one active file_withdrawal workflow (config identity).
  SELECT count(*), (array_agg(w.id ORDER BY w.id))[1]
    INTO v_wf_count, v_wf_id
    FROM public.request_type_workflows w
    JOIN public.request_types rt ON rt.id = w.request_type_id
   WHERE rt.code = 'file_withdrawal'
     AND w.is_active IS TRUE;

  IF v_wf_count IS DISTINCT FROM 1 OR v_wf_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_WORKFLOW_MISMATCH',
      DETAIL = format('active_file_withdrawal_workflows=%s', coalesce(v_wf_count, 0));
  END IF;

  -- ------------------------------------------------------------------
  -- Exact authoritative seven-step contract (bindings never rewritten).
  -- ------------------------------------------------------------------
  FOR v_exp IN
    SELECT * FROM (VALUES
      (1, 'f1300001-0000-4000-8000-000015000001'::uuid, 'student_affairs_intake',
       'student_affairs', 'student_affairs_specialist', 'review',
       'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid),
      (2, 'f1300001-0000-4000-8000-000015000002'::uuid, 'library_clearance',
       'library', 'library_officer', 'clear',
       'e7a93314-bb06-4525-b412-5315198c668a'::uuid),
      (3, 'f1300001-0000-4000-8000-000015000003'::uuid, 'labs_clearance',
       'labs', 'labs_manager', 'clear',
       '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid),
      (4, 'f1300001-0000-4000-8000-000015000004'::uuid, 'activities_clearance',
       'student_affairs', 'student_affairs_manager', 'clear',
       'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid),
      (5, 'f1300001-0000-4000-8000-000015000005'::uuid, 'finance_clearance',
       'finance', 'revenue_finance_officer', 'clear',
       '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid),
      (6, 'f1300001-0000-4000-8000-000015000006'::uuid, 'registrar_apply',
       'registrar', 'registrar_general', 'apply_decision',
       '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid),
      (7, 'f1300001-0000-4000-8000-000015000007'::uuid, 'archive',
       'archive', 'archive_officer', 'archive',
       'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid)
    ) AS e(step_order, step_id, step_key, unit_code, role_code, action_type, principal_user_id)
  LOOP
    SELECT * INTO v_step
      FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = k_req_id
       AND s.step_order = v_exp.step_order;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_STEP_CONTRACT_MISMATCH',
        DETAIL = format('missing_step_order=%s', v_exp.step_order);
    END IF;

    IF v_step.id IS DISTINCT FROM v_exp.step_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_STEP_UUID_MISMATCH',
        DETAIL = format('order=%s expected=%s actual=%s',
          v_exp.step_order, v_exp.step_id, v_step.id);
    END IF;

    IF v_step.student_request_id IS DISTINCT FROM k_req_id
       OR v_step.step_key IS DISTINCT FROM v_exp.step_key
       OR v_step.step_order IS DISTINCT FROM v_exp.step_order THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_STEP_CONTRACT_MISMATCH',
        DETAIL = format('order=%s key=%s', v_exp.step_order, v_step.step_key);
    END IF;

    IF v_step.workflow_id IS DISTINCT FROM v_wf_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_WORKFLOW_MISMATCH',
        DETAIL = format('order=%s workflow_id=%s', v_exp.step_order, v_step.workflow_id);
    END IF;

    SELECT ws.id INTO v_cfg_id
      FROM public.request_type_workflow_steps ws
     WHERE ws.workflow_id = v_wf_id
       AND ws.step_key = v_exp.step_key
       AND ws.step_order = v_exp.step_order
       AND ws.action_type = v_exp.action_type;

    IF v_cfg_id IS NULL OR v_step.workflow_step_id IS DISTINCT FROM v_cfg_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_WORKFLOW_MISMATCH',
        DETAIL = format('order=%s cfg=%s actual=%s',
          v_exp.step_order, v_cfg_id, v_step.workflow_step_id);
    END IF;

    SELECT u.code INTO v_unit_code
      FROM public.request_processing_units u
     WHERE u.id = v_step.processing_unit_id;
    IF v_unit_code IS DISTINCT FROM v_exp.unit_code THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_UNIT_MISMATCH',
        DETAIL = format('order=%s expected=%s actual=%s',
          v_exp.step_order, v_exp.unit_code, v_unit_code);
    END IF;

    SELECT rr.code INTO v_role_code
      FROM public.request_processing_roles rr
     WHERE rr.id = v_step.processing_role_id;
    IF v_role_code IS DISTINCT FROM v_exp.role_code THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_ROLE_MISMATCH',
        DETAIL = format('order=%s expected=%s actual=%s',
          v_exp.step_order, v_exp.role_code, v_role_code);
    END IF;

    v_action := coalesce(v_step.metadata->>'action_type', '');
    IF v_action IS DISTINCT FROM v_exp.action_type THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_ACTION_MISMATCH',
        DETAIL = format('order=%s expected=%s actual=%s',
          v_exp.step_order, v_exp.action_type, v_action);
    END IF;

    v_identity_n := num_nonnulls(
      v_step.assigned_user_id,
      v_step.assigned_staff_profile_id,
      v_step.assigned_faculty_profile_id,
      v_step.assigned_position_assignment_id
    );
    IF v_identity_n IS DISTINCT FROM 1
       OR v_step.assigned_staff_profile_id IS NULL
       OR v_step.assigned_user_id IS NOT NULL
       OR v_step.assigned_faculty_profile_id IS NOT NULL
       OR v_step.assigned_position_assignment_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_IDENTITY_NOT_SINGULAR',
        DETAIL = format('order=%s identity_n=%s', v_exp.step_order, v_identity_n);
    END IF;

    SELECT sp.user_id INTO v_principal
      FROM public.staff_profiles sp
     WHERE sp.id = v_step.assigned_staff_profile_id;
    IF v_principal IS DISTINCT FROM v_exp.principal_user_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_ASSIGNEE_MISMATCH',
        DETAIL = format('order=%s expected=%s actual=%s',
          v_exp.step_order, v_exp.principal_user_id, v_principal);
    END IF;
  END LOOP;

  SELECT * INTO v_step7
    FROM public.student_request_workflow_steps s
   WHERE s.id = k_step7_id
     AND s.student_request_id = k_req_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_ARCHIVE_STEP_NOT_FOUND';
  END IF;

  SELECT
      count(*) FILTER (WHERE s.status = 'completed'),
      count(*) FILTER (WHERE s.status = 'active')
    INTO v_completed, v_active
    FROM public.student_request_workflow_steps s
   WHERE s.student_request_id = k_req_id;

  SELECT count(*) INTO v_events
    FROM public.student_request_workflow_events e
   WHERE e.student_request_id = k_req_id;

  -- Authoritative restored shape (idempotent success path) — full contract.
  v_restored := (
    v_req.status = 'in_review'
    AND v_req.completed_at IS NULL
    AND coalesce(v_req.current_step_index, 0) = 7
    AND v_completed = 6
    AND v_active = 1
    AND v_step7.status = 'active'
    AND v_step7.completed_at IS NULL
    AND v_step7.completed_by IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps s
       WHERE s.student_request_id = k_req_id
         AND s.step_order BETWEEN 1 AND 6
         AND s.status IS DISTINCT FROM 'completed'
    )
    AND EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps s
       WHERE s.id = k_step7_id AND s.status = 'active'
    )
  );

  -- Documented consumed shape from the production incident — full contract.
  -- completed_at must be present; status=completed with NULL completed_at is
  -- malformed and must never be treated as authoritative consumed prestate.
  v_consumed := (
    v_req.status = 'completed'
    AND v_req.completed_at IS NOT NULL
    AND v_completed = 7
    AND v_active = 0
    AND v_step7.status = 'completed'
    AND v_step7.completed_by IS NOT DISTINCT FROM k_archive_actor
    AND v_events = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps s
       WHERE s.student_request_id = k_req_id
         AND s.status IS DISTINCT FROM 'completed'
    )
  );

  IF v_restored THEN
    -- Idempotent replay: already restored. Prove predecessor completion again.
    SELECT count(*) INTO v_pred_bad
      FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = k_req_id
       AND s.step_order BETWEEN 1 AND 6
       AND (s.status IS DISTINCT FROM 'completed' OR s.completed_at IS NULL);
    IF v_pred_bad IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_PREDECESSOR_STATE_MISMATCH',
        DETAIL = format('restored_incomplete_predecessors=%s', v_pred_bad);
    END IF;
    NULL;
  ELSIF (
    v_req.status = 'completed'
    AND v_req.completed_at IS NULL
    AND v_completed = 7
    AND v_active = 0
    AND v_step7.status = 'completed'
    AND v_step7.completed_by IS NOT DISTINCT FROM k_archive_actor
    AND v_events = 1
  ) THEN
    -- Fail closed before evidence insert / request mutation / archive mutation.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_CONSUMED_REQUEST_COMPLETED_AT_MISSING',
      DETAIL = 'status=completed completed_at=<null>';
  ELSIF NOT v_consumed THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_UNEXPECTED_PRESTATE',
      DETAIL = format(
        'status=%s completed_at=%s completed_steps=%s active_steps=%s step7=%s events=%s',
        v_req.status,
        coalesce(v_req.completed_at::text, '<null>'),
        v_completed, v_active, v_step7.status, v_events
      );
  ELSE
    -- Consumed predecessor/completion: all seven exact steps completed.
    SELECT count(*) INTO v_pred_bad
      FROM public.student_request_workflow_steps s
     WHERE s.student_request_id = k_req_id
       AND (s.status IS DISTINCT FROM 'completed' OR s.completed_at IS NULL);
    IF v_pred_bad IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_PREDECESSOR_STATE_MISMATCH',
        DETAIL = format('consumed_incomplete=%s', v_pred_bad);
    END IF;

    -- Strict consumed-event contract (attributable archive RPC evidence).
    SELECT * INTO v_event
      FROM public.student_request_workflow_events e
     WHERE e.student_request_id = k_req_id
     ORDER BY e.created_at, e.id
     LIMIT 1;

    IF v_event.id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_EVENT_MISSING';
    END IF;

    IF v_event.event_type IS DISTINCT FROM 'archived' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_EVENT_TYPE_MISMATCH',
        DETAIL = coalesce(v_event.event_type, '<null>');
    END IF;

    IF v_event.actor_user_id IS DISTINCT FROM k_archive_actor THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_EVENT_ACTOR_MISMATCH',
        DETAIL = coalesce(v_event.actor_user_id::text, '<null>');
    END IF;

    IF v_event.workflow_step_runtime_id IS DISTINCT FROM k_step7_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_EVENT_STEP_MISMATCH';
    END IF;

    IF coalesce(v_event.payload->>'action', '') IS DISTINCT FROM 'archive' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_EVENT_ACTION_MISMATCH',
        DETAIL = coalesce(v_event.payload->>'action', '<null>');
    END IF;

    -- No duplicate events for Fixture 15.
    IF v_events IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_DUPLICATE_STEP',
        DETAIL = format('events=%s', v_events);
    END IF;

    -- Preserve read-only incident evidence BEFORE mutating Fixture 15.
    INSERT INTO public.b1_fixture_15_reissue_44_evidence (
      request_id, request_number, request_status, request_completed_at,
      archive_step_id, archive_step_status, archive_step_decision,
      archive_step_completed_by, archive_step_completed_at, archive_step_comment,
      event_id, event_type, event_actor_user_id, event_created_at,
      event_payload, event_message_ar, evidence, marker
    ) VALUES (
      v_req.id, v_req.request_number, v_req.status, v_req.completed_at,
      v_step7.id, v_step7.status, v_step7.decision,
      v_step7.completed_by, v_step7.completed_at, v_step7.comment,
      v_event.id, v_event.event_type, v_event.actor_user_id, v_event.created_at,
      v_event.payload, v_event.message_ar,
      jsonb_build_object(
        'mission', 'PORTAL-B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44',
        'rpc_path', 'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
        'configured_action', 'archive',
        'processing_role', 'archive_officer',
        'processing_unit', 'archive',
        'request_id', v_req.id,
        'request_number', v_req.request_number,
        'archive_step_id', v_step7.id,
        'event_id', v_event.id,
        'event_actor_user_id', v_event.actor_user_id,
        'event_created_at', v_event.created_at,
        'step_completed_by', v_step7.completed_by,
        'step_completed_at', v_step7.completed_at,
        'seven_step_contract', 'enforced',
        'note', 'Immutable workflow_events row retained; Fixture 15 runtime restored only.'
      ),
      k_evidence_mark
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_EVIDENCE_INSERT_FAILED';
    END IF;

    -- Restore only request terminal fields + archive completion fields.
    -- Do not rewrite bindings or repair drift silently.
    UPDATE public.student_requests r
       SET status = 'in_review',
           completed_at = NULL,
           current_step_index = 7,
           updated_at = now()
     WHERE r.id = k_req_id
       AND r.status = 'completed';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_REQUEST_RESTORE_COUNT_MISMATCH',
        DETAIL = format('expected=1 actual=%s', v_rows);
    END IF;

    UPDATE public.student_request_workflow_steps s
       SET status = 'active',
           decision = NULL,
           completed_by = NULL,
           completed_at = NULL,
           comment = NULL,
           entered_at = coalesce(s.entered_at, now()),
           updated_at = now()
     WHERE s.id = k_step7_id
       AND s.status = 'completed'
       AND s.step_key = 'archive'
       AND s.step_order = 7
       AND s.processing_unit_id IS NOT NULL
       AND s.processing_role_id IS NOT NULL
       AND s.assigned_staff_profile_id IS NOT NULL
       AND s.assigned_user_id IS NULL
       AND s.assigned_faculty_profile_id IS NULL
       AND s.assigned_position_assignment_id IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_STEP_RESTORE_COUNT_MISMATCH',
        DETAIL = format('expected=1 actual=%s', v_rows);
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- Postconditions: exact seven-step restored contract + package 19/19.
  -- ------------------------------------------------------------------
  SELECT * INTO v_req FROM public.student_requests WHERE id = k_req_id;
  SELECT * INTO v_step7 FROM public.student_request_workflow_steps WHERE id = k_step7_id;

  IF v_req.status IS DISTINCT FROM 'in_review'
     OR v_req.completed_at IS NOT NULL
     OR coalesce(v_req.current_step_index, 0) IS DISTINCT FROM 7
     OR v_step7.status IS DISTINCT FROM 'active'
     OR v_step7.completed_at IS NOT NULL
     OR v_step7.completed_by IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_POSTCHECK_FAILED';
  END IF;

  -- Re-prove the full seven-step authoritative bindings after restore.
  FOR v_exp IN
    SELECT * FROM (VALUES
      (1, 'f1300001-0000-4000-8000-000015000001'::uuid, 'student_affairs_intake',
       'student_affairs', 'student_affairs_specialist', 'review',
       'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid, 'completed'::text),
      (2, 'f1300001-0000-4000-8000-000015000002'::uuid, 'library_clearance',
       'library', 'library_officer', 'clear',
       'e7a93314-bb06-4525-b412-5315198c668a'::uuid, 'completed'),
      (3, 'f1300001-0000-4000-8000-000015000003'::uuid, 'labs_clearance',
       'labs', 'labs_manager', 'clear',
       '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid, 'completed'),
      (4, 'f1300001-0000-4000-8000-000015000004'::uuid, 'activities_clearance',
       'student_affairs', 'student_affairs_manager', 'clear',
       'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid, 'completed'),
      (5, 'f1300001-0000-4000-8000-000015000005'::uuid, 'finance_clearance',
       'finance', 'revenue_finance_officer', 'clear',
       '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid, 'completed'),
      (6, 'f1300001-0000-4000-8000-000015000006'::uuid, 'registrar_apply',
       'registrar', 'registrar_general', 'apply_decision',
       '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid, 'completed'),
      (7, 'f1300001-0000-4000-8000-000015000007'::uuid, 'archive',
       'archive', 'archive_officer', 'archive',
       'aec1303e-de6a-4580-94cf-7205c17b5535'::uuid, 'active')
    ) AS e(step_order, step_id, step_key, unit_code, role_code, action_type, principal_user_id, expected_status)
  LOOP
    SELECT * INTO v_step
      FROM public.student_request_workflow_steps s
     WHERE s.id = v_exp.step_id
       AND s.student_request_id = k_req_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_STEP_CONTRACT_MISMATCH',
        DETAIL = format('postcheck_missing_order=%s', v_exp.step_order);
    END IF;

    SELECT u.code INTO v_unit_code
      FROM public.request_processing_units u WHERE u.id = v_step.processing_unit_id;
    SELECT rr.code INTO v_role_code
      FROM public.request_processing_roles rr WHERE rr.id = v_step.processing_role_id;
    SELECT sp.user_id INTO v_principal
      FROM public.staff_profiles sp WHERE sp.id = v_step.assigned_staff_profile_id;
    SELECT ws.id INTO v_cfg_id
      FROM public.request_type_workflow_steps ws
     WHERE ws.workflow_id = v_wf_id
       AND ws.step_key = v_exp.step_key
       AND ws.step_order = v_exp.step_order
       AND ws.action_type = v_exp.action_type;

    -- Exact postcondition for every restored step: UUID, key/order, workflow
    -- identities, unit/role/action, singular assignee, and expected status.
    IF v_step.id IS DISTINCT FROM v_exp.step_id
       OR v_step.step_key IS DISTINCT FROM v_exp.step_key
       OR v_step.step_order IS DISTINCT FROM v_exp.step_order
       OR v_step.status IS DISTINCT FROM v_exp.expected_status
       OR v_unit_code IS DISTINCT FROM v_exp.unit_code
       OR v_role_code IS DISTINCT FROM v_exp.role_code
       OR coalesce(v_step.metadata->>'action_type','') IS DISTINCT FROM v_exp.action_type
       OR v_principal IS DISTINCT FROM v_exp.principal_user_id
       OR v_step.workflow_id IS DISTINCT FROM v_wf_id
       OR v_cfg_id IS NULL
       OR v_step.workflow_step_id IS DISTINCT FROM v_cfg_id
       OR v_step.assigned_staff_profile_id IS NULL
       OR v_step.assigned_user_id IS NOT NULL
       OR v_step.assigned_faculty_profile_id IS NOT NULL
       OR v_step.assigned_position_assignment_id IS NOT NULL
       OR num_nonnulls(
            v_step.assigned_user_id, v_step.assigned_staff_profile_id,
            v_step.assigned_faculty_profile_id, v_step.assigned_position_assignment_id
          ) IS DISTINCT FROM 1
       OR (v_exp.expected_status = 'active'
           AND (v_step.completed_at IS NOT NULL OR v_step.completed_by IS NOT NULL
                OR v_step.decision IS NOT NULL))
       OR (v_exp.expected_status = 'completed' AND v_step.completed_at IS NULL) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_FIXTURE_15_STEP_CONTRACT_MISMATCH',
        DETAIL = format('postcheck_order=%s status=%s cfg=%s',
          v_exp.step_order, v_step.status, v_cfg_id);
    END IF;
  END LOOP;

  SELECT
      count(*) FILTER (WHERE s.status = 'completed'),
      count(*) FILTER (WHERE s.status = 'active')
    INTO v_completed, v_active
    FROM public.student_request_workflow_steps s
   WHERE s.student_request_id = k_req_id;

  IF v_completed IS DISTINCT FROM 6 OR v_active IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_STEP_DISTRIBUTION_FAILED',
      DETAIL = format('completed=%s active=%s', v_completed, v_active);
  END IF;

  SELECT count(*) INTO v_events
    FROM public.student_request_workflow_events e
   WHERE e.student_request_id = k_req_id;
  IF v_events < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_EVENT_EVIDENCE_LOST';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_requests r
   WHERE r.internal_notes = k_marker
      OR coalesce(r.form_data->>'test_only_marker', '') = k_marker;
  IF v_n IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_PACKAGE_COUNT_MISMATCH',
      DETAIL = format('expected=19 actual=%s', v_n);
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
   WHERE (r.internal_notes = k_marker
          OR coalesce(r.form_data->>'test_only_marker', '') = k_marker)
     AND s.status = 'active';
  IF v_n IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_ACTIVE_STEP_TOTAL_MISMATCH',
      DETAIL = format('expected=19 actual=%s', v_n);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.student_requests r
     WHERE (r.internal_notes = k_marker
            OR coalesce(r.form_data->>'test_only_marker', '') = k_marker)
       AND (
         SELECT count(*) FROM public.student_request_workflow_steps s
          WHERE s.student_request_id = r.id AND s.status = 'active'
       ) IS DISTINCT FROM 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_ACTIVE_STEP_PER_REQUEST_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_types rt
     WHERE rt.code IN (
       'enrollment_suspension','excused_absence','department_transfer',
       'final_chance','file_withdrawal'
     )
       AND rt.student_visible IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_SERVICE_VISIBILITY_REGRESSED';
  END IF;
END
$b1_44_fixture_15_reissue$;
