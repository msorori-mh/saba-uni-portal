-- ============================================================================
-- PORTAL-B1-FIXTURE-15-FORWARD-ONLY-REISSUE-44
-- Forward-only repair after source/production head 20260802225131.
--
-- Purpose: restore TEST_ONLY Fixture 15 (SR-20260801-13000015 /
-- f1300000-0000-4000-8000-000000000015) from the documented consumed archive
-- state back to the authoritative Fixture-13 seed state with exactly one
-- active runtime step (archive), so the fixture contract returns to 19/19.
--
-- Scope (fail-closed):
--   * Only Fixture 15 request + its step-7 completion fields
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

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
   WHERE s.student_request_id = k_req_id;
  IF v_n IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_STEP_COUNT_MISMATCH',
      DETAIL = format('expected=7 actual=%s', v_n);
  END IF;

  SELECT * INTO v_step7
    FROM public.student_request_workflow_steps s
   WHERE s.id = k_step7_id
     AND s.student_request_id = k_req_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_ARCHIVE_STEP_NOT_FOUND';
  END IF;

  IF v_step7.step_key IS DISTINCT FROM 'archive'
     OR v_step7.step_order IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_ARCHIVE_STEP_CONTRACT_MISMATCH';
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

  -- Authoritative restored shape (idempotent success path).
  v_restored := (
    v_req.status = 'in_review'
    AND v_req.completed_at IS NULL
    AND coalesce(v_req.current_step_index, 0) = 7
    AND v_completed = 6
    AND v_active = 1
    AND v_step7.status = 'active'
    AND v_step7.completed_at IS NULL
    AND v_step7.completed_by IS NULL
  );

  -- Documented consumed shape from the production incident.
  v_consumed := (
    v_req.status = 'completed'
    AND v_completed = 7
    AND v_active = 0
    AND v_step7.status = 'completed'
    AND v_events = 1
  );

  IF v_restored THEN
    -- Idempotent replay: already restored. Do not mutate. Still enforce package postchecks.
    NULL;
  ELSIF NOT v_consumed THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_FIXTURE_15_UNEXPECTED_PRESTATE',
      DETAIL = format(
        'status=%s completed_steps=%s active_steps=%s step7=%s events=%s',
        v_req.status, v_completed, v_active, v_step7.status, v_events
      );
  ELSE
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

    -- Preserve read-only incident evidence BEFORE mutating Fixture 15.
    -- Does not delete or rewrite workflow_events / audit_logs.
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

    -- Restore request to authoritative Fixture seed status.
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

    -- Restore archive step to active; keep assignee / unit / role / metadata.
    -- Do not delete the archived workflow event.
    UPDATE public.student_request_workflow_steps s
       SET status = 'active',
           decision = NULL,
           completed_by = NULL,
           completed_at = NULL,
           comment = NULL,
           entered_at = coalesce(s.entered_at, now()),
           updated_at = now()
     WHERE s.id = k_step7_id
       AND s.status = 'completed';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'B1_44_STEP_RESTORE_COUNT_MISMATCH',
        DETAIL = format('expected=1 actual=%s', v_rows);
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- Postconditions: Fixture 15 restored + package 19/19 contract.
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

  -- Event evidence must still exist (never deleted by this repair).
  SELECT count(*) INTO v_events
    FROM public.student_request_workflow_events e
   WHERE e.student_request_id = k_req_id;
  IF v_events < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'B1_44_EVENT_EVIDENCE_LOST';
  END IF;

  -- Full TEST_ONLY fixture package: 19 requests / 19 active steps / 1 each.
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

  -- Visibility / certificate surfaces must remain untouched by this migration
  -- (no UPDATE against those relations above; assert five stay hidden if present).
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
