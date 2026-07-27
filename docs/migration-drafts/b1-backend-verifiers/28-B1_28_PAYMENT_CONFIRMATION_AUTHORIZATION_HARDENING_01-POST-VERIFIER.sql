-- READ ONLY
-- Post-verifier for B1 order 28 (PAYMENT_CONFIRMATION_AUTHORIZATION_HARDENING_01)
BEGIN;
DO $$
DECLARE v_src text; v_acl text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.confirm_student_request_fee_payment(uuid,text,text)'::regprocedure;
  IF v_src IS NULL THEN RAISE EXCEPTION 'POSTVERIFY_FAIL: function missing'; END IF;

  -- Central contract reuse (no duplicated authorization logic).
  IF v_src NOT LIKE '%can_current_user_act_on_step(v_runtime_step.id, ''confirm_payment'')%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: B1 path does not delegate to can_current_user_act_on_step';
  END IF;

  -- B1 bypass removal: admin actor may only appear inside the legacy branch.
  IF v_src NOT LIKE '%IF NOT v_is_b1 THEN%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: B1/legacy branch separation missing';
  END IF;
  IF (length(v_src) - length(replace(v_src, 'is_current_user_admin_actor', ''))) / length('is_current_user_admin_actor') <> 1 THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: admin actor reference count must be exactly 1 (legacy branch only)';
  END IF;
  IF v_src LIKE '%has_any_role%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: broad-role fallback still present';
  END IF;
  IF v_src NOT LIKE '%B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: B1 authorization error code missing';
  END IF;
  IF v_src NOT LIKE '%B1_PREDECESSOR_INCOMPLETE%'
     OR v_src NOT LIKE '%B1_TRANSITION_MUST_RESOLVE_ONCE%'
     OR v_src NOT LIKE '%B1_ACTIVE_STEP_INVARIANT_FAILED%'
     OR v_src NOT LIKE '%idempotent_replay%'
     OR v_src NOT LIKE '%B1_REQUEST_STATUS_NOT_ACTIONABLE%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: required B1 guard missing';
  END IF;

  -- Legacy contract untouched.
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.assert_can_confirm_student_request_fee_payment()'::regprocedure;
  IF v_src IS NULL OR v_src NOT LIKE '%is_current_user_admin_actor%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: legacy assert helper changed unexpectedly';
  END IF;

  -- ACL: no anon / PUBLIC execute.
  SELECT array_to_string(coalesce(proacl,'{}')::text[], ',') INTO v_acl FROM pg_proc
   WHERE oid = 'public.confirm_student_request_fee_payment(uuid,text,text)'::regprocedure;
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%=X/%postgres,=X%' OR v_acl LIKE '%,=X%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: anon/PUBLIC execute present';
  END IF;
  IF v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: expected grants missing';
  END IF;

  IF (SELECT prosecdef FROM pg_proc
      WHERE oid = 'public.confirm_student_request_fee_payment(uuid,text,text)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: function must remain SECURITY DEFINER';
  END IF;
END $$;
ROLLBACK;
