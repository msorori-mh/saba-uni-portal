-- READ ONLY
-- Preflight for B1 order 28 (PAYMENT_CONFIRMATION_AUTHORIZATION_HARDENING_01)
BEGIN;
DO $$
DECLARE v_src text;
BEGIN
  IF to_regprocedure('public.confirm_student_request_fee_payment(uuid,text,text)') IS NULL
     OR to_regprocedure('public.can_current_user_act_on_step(uuid,text)') IS NULL
     OR to_regprocedure('public.current_user_has_exact_processing_binding(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_b1_stored_request_type(text)') IS NULL
     OR to_regprocedure('public.is_owner_of_request(uuid,uuid)') IS NULL
     OR to_regprocedure('public.apply_student_request_workflow_transition(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: order 28 function prerequisite missing';
  END IF;

  -- The pre-state MUST still contain the bypasses this migration removes.
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.confirm_student_request_fee_payment(uuid,text,text)'::regprocedure;
  IF v_src NOT LIKE '%is_current_user_admin_actor%' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: unexpected pre-state (admin bypass already absent) - re-baseline before apply';
  END IF;

  -- can_current_user_act_on_step must already accept confirm_payment.
  IF NOT public.is_valid_actor_request_action('confirm_payment') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: confirm_payment is not a valid actor action';
  END IF;
  IF NOT public.workflow_action_result_matches('confirm_payment','payment_confirmed') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: confirm_payment does not map to payment_confirmed';
  END IF;

  -- No in-flight B1 payment step may be mid-confirmation.
  IF EXISTS (
    SELECT 1 FROM public.student_request_fee_assessments fa
    JOIN public.student_requests r ON r.id = fa.request_id
    WHERE fa.payment_status = 'pending_payment'
      AND public.is_b1_stored_request_type(r.request_type)
      AND fa.payment_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: inconsistent B1 fee assessment state';
  END IF;
END $$;
ROLLBACK;
