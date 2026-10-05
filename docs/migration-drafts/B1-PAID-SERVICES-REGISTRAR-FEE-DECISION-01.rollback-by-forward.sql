-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — ROLLBACK BY FORWARD (own authorization).
-- Per service: retires the fee-decision version and re-activates the previous one
-- through the publish-path columns. Deletes nothing: the new definitions, pins,
-- table, functions and the two B1PFD01 patches stay (inert without the new
-- versions). NOTE: the previous version is the one whose default "no fee" branch
-- leaves every request stuck at registrar_apply — roll back only to undo this
-- package, then fix forward. FAIL CLOSED: a service with any request on its new
-- version is refused. IDEMPOTENT: an already rolled-back service is left alone.

BEGIN;

DO $rollback$
DECLARE
  v_svc text;
  v_new public.request_type_workflows%ROWTYPE;
  v_prev public.request_type_workflows%ROWTYPE;
  v_count integer;
BEGIN
  FOREACH v_svc IN ARRAY ARRAY['department_transfer', 'final_chance'] LOOP
    SELECT count(*) INTO v_count
    FROM public.request_type_workflows w JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = v_svc AND w.code = v_svc || '_external_payment_workflow'
      AND EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                  WHERE s.workflow_id = w.id AND s.step_key = 'registrar_fee_decision');
    IF v_count <> 1 THEN RAISE EXCEPTION 'B1_PFD01_ROLLBACK_FEE_DECISION_VERSION_MUST_EXIST_ONCE:%:%', v_svc, v_count; END IF;
    SELECT w.* INTO v_new
    FROM public.request_type_workflows w JOIN public.request_types rt ON rt.id = w.request_type_id
    WHERE rt.code = v_svc AND w.code = v_svc || '_external_payment_workflow'
      AND EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                  WHERE s.workflow_id = w.id AND s.step_key = 'registrar_fee_decision')
    FOR UPDATE OF w;
    SELECT w.* INTO v_prev FROM public.request_type_workflows w
    WHERE w.request_type_id = v_new.request_type_id AND w.code = v_new.code AND w.version = v_new.version - 1
    FOR UPDATE;
    IF v_prev.id IS NULL THEN RAISE EXCEPTION 'B1_PFD01_ROLLBACK_PREVIOUS_VERSION_NOT_FOUND:%', v_svc; END IF;
    IF (SELECT count(*) FROM public.request_type_workflows w
        WHERE w.request_type_id = v_new.request_type_id AND w.status = 'active' AND w.is_active) <> 1 THEN
      RAISE EXCEPTION 'B1_PFD01_ROLLBACK_ACTIVE_WORKFLOW_MUST_RESOLVE_EXACTLY_ONCE:%', v_svc;
    END IF;

    CONTINUE WHEN v_prev.status = 'active' AND v_prev.is_active AND v_new.status = 'retired' AND NOT v_new.is_active;
    IF NOT (v_new.status = 'active' AND v_new.is_active AND v_prev.status = 'retired' AND NOT v_prev.is_active) THEN
      RAISE EXCEPTION 'B1_PFD01_ROLLBACK_UNEXPECTED_WORKFLOW_STATE:%', v_svc;
    END IF;
    SELECT count(DISTINCT s.student_request_id) INTO v_count
    FROM public.student_request_workflow_steps s WHERE s.workflow_id = v_new.id;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'B1_PFD01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_VERSION:%:%', v_svc, v_count;
    END IF;

    UPDATE public.request_type_workflows SET status = 'retired', is_active = false, updated_at = now() WHERE id = v_new.id;
    UPDATE public.request_type_workflows SET status = 'active', is_active = true, updated_at = now() WHERE id = v_prev.id;
    INSERT INTO public.request_type_workflow_change_log
      (request_type_id, workflow_id, version, change_kind, change_note, snapshot, changed_by)
    VALUES (v_new.request_type_id, v_prev.id, v_prev.version, 'workflow_rolled_back',
      'تراجع عن B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01: إعادة تفعيل الإصدار السابق.',
      jsonb_build_object('package', 'B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01',
        'reactivated_workflow_id', v_prev.id, 'retired_workflow_id', v_new.id), NULL);
    IF (SELECT count(*) FROM public.request_type_workflows w
        WHERE w.request_type_id = v_new.request_type_id AND w.status = 'active' AND w.is_active AND w.id = v_prev.id) <> 1 THEN
      RAISE EXCEPTION 'B1_PFD01_ROLLBACK_POSTCONDITION_FAILED:%', v_svc;
    END IF;
  END LOOP;
END;
$rollback$;

COMMIT;
