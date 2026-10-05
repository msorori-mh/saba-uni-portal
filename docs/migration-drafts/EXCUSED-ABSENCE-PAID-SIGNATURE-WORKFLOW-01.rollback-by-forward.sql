-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- =====================================================================
-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — ROLLBACK BY FORWARD
--
-- Review artifact only; needs its own explicit authorization.
--
-- Re-activates the retired free cycle (`excused_absence_free_workflow`, its
-- highest version) and retires `excused_absence_external_payment_workflow`,
-- through the same columns the publish path uses. Nothing is deleted:
--   * the new workflow definition, its runtime-contract pins, the fee-decision
--     table, the seven functions and the eleven EAWF01 patches all STAY. They
--     are inert once no request runs on the new cycle (every new branch is
--     guarded by the new workflow code);
--   * no request, runtime step, event or detail row is written.
--
-- FAIL CLOSED: refuses to run while ANY request has runtime steps on the new
-- cycle (those requests could no longer be resubmitted after a return, and
-- must finish on the cycle they started on). In that case do not roll back
-- the workflow; fix forward instead.
-- IDEMPOTENT: when the free cycle is already the active one, nothing changes.
-- =====================================================================

BEGIN;

DO $rollback$
DECLARE
  v_type_id uuid;
  v_count integer;
  v_new public.request_type_workflows%ROWTYPE;
  v_free public.request_type_workflows%ROWTYPE;
BEGIN
  SELECT count(*), (array_agg(rt.id))[1] INTO v_count, v_type_id
  FROM public.request_types rt WHERE rt.code = 'excused_absence';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:%', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id AND w.code = 'excused_absence_external_payment_workflow';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_TARGET_WORKFLOW_MUST_EXIST_ONCE:%', v_count;
  END IF;
  SELECT w.* INTO v_new FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id AND w.code = 'excused_absence_external_payment_workflow'
  FOR UPDATE;

  SELECT w.* INTO v_free FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id AND w.code = 'excused_absence_free_workflow'
  ORDER BY w.version DESC LIMIT 1
  FOR UPDATE;
  IF v_free.id IS NULL OR v_free.version IS DISTINCT FROM v_new.version - 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_PREVIOUS_FREE_VERSION_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflows w
  WHERE w.request_type_id = v_type_id AND w.status = 'active' AND w.is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE:%', v_count;
  END IF;

  -- already rolled back
  IF v_free.status = 'active' AND v_free.is_active AND v_new.status = 'retired' AND NOT v_new.is_active THEN
    RAISE NOTICE 'EXCUSED_ABSENCE_WF01_ROLLBACK: nothing to do';
    RETURN;
  END IF;
  IF NOT (v_new.status = 'active' AND v_new.is_active AND v_free.status = 'retired' AND NOT v_free.is_active) THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_UNEXPECTED_WORKFLOW_STATE';
  END IF;

  SELECT count(DISTINCT s.student_request_id) INTO v_count
  FROM public.student_request_workflow_steps s WHERE s.workflow_id = v_new.id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_CYCLE:%', v_count;
  END IF;

  UPDATE public.request_type_workflows
     SET status = 'retired', is_active = false, updated_at = now()
   WHERE id = v_new.id;
  UPDATE public.request_type_workflows
     SET status = 'active', is_active = true, updated_at = now()
   WHERE id = v_free.id;

  INSERT INTO public.request_type_workflow_change_log (
    request_type_id, workflow_id, version, change_kind, change_note, snapshot, changed_by
  ) VALUES (
    v_type_id, v_free.id, v_free.version, 'workflow_rolled_back',
    'تراجع عن EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01: إعادة تفعيل الدورة المجانية السابقة.',
    jsonb_build_object(
      'package', 'EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01',
      'reactivated_workflow_id', v_free.id,
      'retired_workflow_id', v_new.id,
      'retired_workflow_code', v_new.code),
    NULL);

  IF (SELECT count(*) FROM public.request_type_workflows w
      WHERE w.request_type_id = v_type_id AND w.status = 'active' AND w.is_active = true
        AND w.id = v_free.id) <> 1 THEN
    RAISE EXCEPTION 'EXCUSED_ABSENCE_WF01_ROLLBACK_POSTCONDITION_FAILED';
  END IF;
END;
$rollback$;

COMMIT;
