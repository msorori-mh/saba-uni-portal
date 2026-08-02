-- Post-repair package assertions (disposable).
DO $$
DECLARE
  k_marker text := 'TEST_ONLY_B1_FIXTURE_13';
  v_n int;
  v_status text;
  v_active int;
  v_completed int;
  v_events int;
  v_evidence int;
BEGIN
  SELECT count(*) INTO v_n FROM public.student_requests
   WHERE internal_notes = k_marker;
  IF v_n IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'VERIFY_REQUESTS_NOT_19:%', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
   WHERE r.internal_notes = k_marker AND s.status = 'active';
  IF v_n IS DISTINCT FROM 19 THEN
    RAISE EXCEPTION 'VERIFY_ACTIVE_NOT_19:%', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_requests r
     WHERE r.internal_notes = k_marker
       AND (SELECT count(*) FROM public.student_request_workflow_steps s
             WHERE s.student_request_id = r.id AND s.status = 'active') <> 1
  ) THEN
    RAISE EXCEPTION 'VERIFY_NOT_ONE_ACTIVE_PER_REQUEST';
  END IF;

  SELECT status INTO v_status FROM public.student_requests
   WHERE id = 'f1300000-0000-4000-8000-000000000015';
  IF v_status IS DISTINCT FROM 'in_review' THEN
    RAISE EXCEPTION 'VERIFY_F15_STATUS:%', v_status;
  END IF;

  SELECT
      count(*) FILTER (WHERE status='completed'),
      count(*) FILTER (WHERE status='active')
    INTO v_completed, v_active
    FROM public.student_request_workflow_steps
   WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
  IF v_completed IS DISTINCT FROM 6 OR v_active IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VERIFY_F15_DIST completed=% active=%', v_completed, v_active;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps
     WHERE id = 'f1300001-0000-4000-8000-000015000007' AND status = 'active' AND step_key = 'archive'
  ) THEN
    RAISE EXCEPTION 'VERIFY_F15_ARCHIVE_NOT_ACTIVE';
  END IF;

  SELECT count(*) INTO v_events FROM public.student_request_workflow_events
   WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
  IF v_events < 1 THEN
    RAISE EXCEPTION 'VERIFY_EVENT_LOST';
  END IF;

  SELECT count(*) INTO v_evidence FROM public.b1_fixture_15_reissue_44_evidence
   WHERE request_id = 'f1300000-0000-4000-8000-000000000015';
  IF v_evidence < 1 THEN
    RAISE EXCEPTION 'VERIFY_EVIDENCE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_types
     WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
       AND student_visible IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'VERIFY_VISIBILITY_REGRESSED';
  END IF;

  IF (SELECT student_visible FROM public.request_types WHERE code='enrollment_certificate') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_EC_VISIBILITY_CHANGED';
  END IF;
END $$;

SELECT 'VERIFY_B1_44_OK' AS status;
