DO $seq22_remediation$
DECLARE
  v_student uuid := '51b9c5e9-8538-4f70-baaa-d254118535c3';
  v_type    text := 'absence_excuse';
  v_keep    uuid;
  v_targets uuid[];
  v_n       integer;
  v_draft   integer;
  v_cancel  integer;
  v_enabled char;
  r         record;
BEGIN
  LOCK TABLE public.student_requests IN ACCESS EXCLUSIVE MODE;

  -- Re-assert inertness under lock (excluding form_data, authorized as inert)
  SELECT count(*) INTO v_n
  FROM public.student_requests sr
  WHERE sr.student_profile_id = v_student
    AND sr.request_type = v_type
    AND sr.status = 'draft';
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'SEQ22_REMEDIATION_ABORT_UNEXPECTED_DRAFT_COUNT:%', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_requests sr
    WHERE sr.student_profile_id = v_student AND sr.request_type = v_type AND sr.status = 'draft'
      AND (
        sr.submitted_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.student_request_workflow_steps x WHERE x.student_request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.student_service_request_steps x WHERE x.request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.student_request_workflow_events x WHERE x.student_request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.absence_excuse_details x WHERE x.request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.student_request_attachments x WHERE x.request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.student_request_attachment_uploads x WHERE x.student_request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.official_documents x WHERE x.student_request_id = sr.id)
        OR EXISTS (SELECT 1 FROM public.student_request_fee_assessments x WHERE x.request_id = sr.id)
      )
  ) THEN
    RAISE EXCEPTION 'HOLD_FIRST_DELIVERY_PRODUCTION_SEQ22_LEGACY_DRAFT_NOT_INERT';
  END IF;

  -- Keep oldest by created_at ASC, id ASC
  SELECT sr.id INTO v_keep
  FROM public.student_requests sr
  WHERE sr.student_profile_id = v_student AND sr.request_type = v_type AND sr.status = 'draft'
  ORDER BY sr.created_at ASC, sr.id ASC
  LIMIT 1;

  SELECT array_agg(sr.id ORDER BY sr.created_at, sr.id) INTO v_targets
  FROM public.student_requests sr
  WHERE sr.student_profile_id = v_student AND sr.request_type = v_type AND sr.status = 'draft'
    AND sr.id <> v_keep;

  IF array_length(v_targets, 1) <> 9 THEN
    RAISE EXCEPTION 'SEQ22_REMEDIATION_ABORT_TARGET_COUNT:%', coalesce(array_length(v_targets,1), 0);
  END IF;

  -- Disable only the protection trigger (no auth.uid() in this session)
  ALTER TABLE public.student_requests DISABLE TRIGGER trg_sr_protect;

  UPDATE public.student_requests sr
     SET status = 'cancelled',
         cancelled_at = COALESCE(sr.cancelled_at, now())
   WHERE sr.id = ANY(v_targets)
     AND sr.status = 'draft';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'SEQ22_REMEDIATION_ABORT_UPDATED_ROWS:%', v_n;
  END IF;

  ALTER TABLE public.student_requests ENABLE TRIGGER trg_sr_protect;

  -- Explicit remediation audit entry per cancelled record
  FOR r IN SELECT sr.id, sr.request_number FROM public.student_requests sr WHERE sr.id = ANY(v_targets) LOOP
    INSERT INTO public.audit_logs(entity_type, entity_id, action_type, old_values, new_values, notes)
    VALUES ('student_request', r.id, 'request_cancelled',
            jsonb_build_object('status','draft'),
            jsonb_build_object('status','cancelled','request_number', r.request_number,
                               'keep_request_id', v_keep),
            'SEQ22_LEGACY_DUPLICATE_DRAFT_REMEDIATION');
  END LOOP;

  -- Post-checks inside the same transaction
  SELECT count(*) FILTER (WHERE status='draft'),
         count(*) FILTER (WHERE status='cancelled')
    INTO v_draft, v_cancel
  FROM public.student_requests
  WHERE student_profile_id = v_student AND request_type = v_type;
  IF v_draft <> 1 OR v_cancel < 9 THEN
    RAISE EXCEPTION 'SEQ22_REMEDIATION_POSTCHECK_FAILED draft=% cancelled=%', v_draft, v_cancel;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT student_profile_id, request_type FROM public.student_requests
      WHERE status = 'draft' GROUP BY 1,2 HAVING count(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'SEQ22_REMEDIATION_POSTCHECK_DUPLICATE_GROUPS_REMAIN';
  END IF;

  SELECT tgenabled INTO v_enabled FROM pg_trigger
   WHERE tgrelid='public.student_requests'::regclass AND tgname='trg_sr_protect';
  IF v_enabled <> 'O' THEN
    RAISE EXCEPTION 'SEQ22_REMEDIATION_PROTECT_TRIGGER_NOT_ENABLED:%', v_enabled;
  END IF;
END
$seq22_remediation$;