-- PORTAL_REFORM_P1_STUDENT_SERVICES_SOURCE_CLOSURE_02
-- P1-04 — DECISION: REPLACE the legacy proportional grade redistribution.
--
-- Legacy behaviour (apply_grade_appeal_on_approval): on status='approved' the
-- trigger silently rewrote EVERY coursework component of the enrollment,
-- proportionally scaled to approved_total_score. That is rejected because:
--   * it fabricates coursework component values nobody decided,
--   * it fires on a status transition rather than on the authorized registrar
--     step, so it has no actor binding and no before/after audit,
--   * component-level coursework appeals belong to P2, not to the formal
--     final-result appeal modelled in P1.
--
-- Replacement: an explicit, actor-bound, idempotent, audited final-result
-- application performed at the `registrar_apply_result` step.
-- FORWARD-ONLY. IDEMPOTENT. NO HISTORICAL DATA IS REWRITTEN.

BEGIN;

DROP TRIGGER IF EXISTS trg_apply_grade_appeal_on_approval ON public.student_requests;

CREATE OR REPLACE FUNCTION public.apply_grade_appeal_on_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Retired by P1-04. Final-result changes are applied explicitly through
  -- public.p1_apply_final_result_decision() at the registrar step.
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.apply_grade_appeal_on_approval() IS
  'RETIRED (P1-04). No-op kept for forward-only compatibility; use p1_apply_final_result_decision().';

CREATE OR REPLACE FUNCTION public.p1_apply_final_result_decision(
  p_request      uuid,
  p_final_result numeric,
  p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_details public.grade_appeal_details%ROWTYPE;
  v_actor   uuid := auth.uid();
  v_max     numeric;
  v_prev    numeric;
BEGIN
  PERFORM public.p1_assert_step_actor(p_request, 'registrar_apply_result', v_actor);

  SELECT * INTO v_details
  FROM public.grade_appeal_details
  WHERE request_id = p_request
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_DETAILS_MISSING' USING ERRCODE = 'check_violation';
  END IF;

  IF v_details.result_change_applied_at IS NOT NULL THEN
    -- Idempotent: a second call never re-applies a decision.
    RETURN jsonb_build_object('applied', false, 'reason', 'ALREADY_APPLIED');
  END IF;

  SELECT r.total, r.max_total INTO v_prev, v_max
  FROM public.p1_enrollment_result(v_details.student_enrollment_id) r;

  IF v_max IS NULL OR v_max <= 0 THEN
    RAISE EXCEPTION 'FINAL_RESULT_APPEAL_NO_PUBLISHED_RESULT' USING ERRCODE = 'check_violation';
  END IF;
  IF p_final_result IS NULL OR p_final_result < 0 OR p_final_result > v_max THEN
    RAISE EXCEPTION 'FINAL_RESULT_OUT_OF_RANGE' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.grade_appeal_details
     SET previous_final_result    = v_prev,
         approved_final_result    = p_final_result,
         result_change_applied_at = now(),
         result_change_applied_by = v_actor,
         notes = COALESCE(p_note, notes)
   WHERE id = v_details.id;

  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, new_values)
  VALUES (
    'grade_appeal_details', v_details.id, 'apply_final_result', v_actor,
    jsonb_build_object(
      'request_id', p_request,
      'student_enrollment_id', v_details.student_enrollment_id,
      'previous_final_result', v_prev,
      'approved_final_result', p_final_result,
      'max_total', v_max
    )
  );

  RETURN jsonb_build_object(
    'applied', true,
    'previous_final_result', v_prev,
    'approved_final_result', p_final_result
  );
END $$;

REVOKE ALL ON FUNCTION public.p1_apply_final_result_decision(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_apply_final_result_decision(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p1_apply_final_result_decision(uuid, numeric, text) TO service_role;

COMMIT;
