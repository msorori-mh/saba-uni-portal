-- Case evaluators (superuser). Mutations are intended to be rolled back by the caller.
CREATE OR REPLACE FUNCTION public.b1_case_unauthorized_atomic() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_before text := public.b1_sim_fp();
  v_after text;
  v_sqlstate text;
  v_msg text;
  v_verdict text;
  v_detail text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  BEGIN
    PERFORM public.act_on_b1_student_request_step_atomic(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'review', NULL, '{}'::jsonb
    );
    v_verdict := 'HOLD'; v_detail := 'RPC_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_sqlstate = '42501' AND v_msg LIKE '%B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED%' THEN
      v_verdict := 'PASS'; v_detail := v_sqlstate || '/' || v_msg;
    ELSE
      v_verdict := 'HOLD'; v_detail := v_sqlstate || '/' || v_msg;
    END IF;
  END;
  v_after := public.b1_sim_fp();
  IF v_after IS DISTINCT FROM v_before THEN
    v_verdict := 'HOLD'; v_detail := v_detail || '|MUTATION_INSIDE_TX';
  END IF;
  RETURN v_verdict || '|' || v_detail;
END;
$$;

CREATE OR REPLACE FUNCTION public.b1_case_illegal_action() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_before text := public.b1_sim_fp();
  v_after text;
  v_sqlstate text;
  v_msg text;
  v_verdict text;
  v_detail text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  BEGIN
    PERFORM public.act_on_b1_student_request_step_atomic(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'approve', NULL, '{}'::jsonb
    );
    v_verdict := 'HOLD'; v_detail := 'RPC_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_sqlstate = '42501' AND v_msg LIKE '%B1_ACTION_TYPE_MISMATCH%' THEN
      v_verdict := 'PASS'; v_detail := v_sqlstate || '/' || v_msg;
    ELSE
      v_verdict := 'HOLD'; v_detail := v_sqlstate || '/' || v_msg;
    END IF;
  END;
  v_after := public.b1_sim_fp();
  IF v_after IS DISTINCT FROM v_before THEN
    v_verdict := 'HOLD'; v_detail := v_detail || '|MUTATION_INSIDE_TX';
  END IF;
  RETURN v_verdict || '|' || v_detail;
END;
$$;

CREATE OR REPLACE FUNCTION public.b1_case_payment_step() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_before text := public.b1_sim_fp();
  v_after text;
  v_sqlstate text;
  v_msg text;
  v_verdict text;
  v_detail text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  BEGIN
    PERFORM public.record_external_university_payment_confirmation(
      'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'TEST_ONLY_NEGATIVE_MATRIX'
    );
    v_verdict := 'HOLD'; v_detail := 'RPC_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_sqlstate = '42501' AND v_msg LIKE '%DIRECT_PAYMENT_ASSIGNEE_REQUIRED%' THEN
      v_verdict := 'PASS'; v_detail := v_sqlstate || '/' || v_msg;
    ELSE
      v_verdict := 'HOLD'; v_detail := v_sqlstate || '/' || v_msg;
    END IF;
  END;
  v_after := public.b1_sim_fp();
  IF v_after IS DISTINCT FROM v_before THEN
    v_verdict := 'HOLD'; v_detail := v_detail || '|MUTATION_INSIDE_TX';
  END IF;
  RETURN v_verdict || '|' || v_detail;
END;
$$;

CREATE OR REPLACE FUNCTION public.b1_case_payment_request_uuid() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_sqlstate text;
  v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  BEGIN
    PERFORM public.record_external_university_payment_confirmation(
      '22222222-2222-2222-2222-222222222222'::uuid, 'TEST_ONLY_NEGATIVE_MATRIX'
    );
    RETURN 'HOLD|RPC_ALLOWED_UNEXPECTED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF v_sqlstate = 'P0002' AND v_msg LIKE '%PAYMENT_CONFIRMATION_STEP_NOT_FOUND%' THEN
      RETURN 'PASS|expected_infra_shape:' || v_sqlstate;
    END IF;
    RETURN 'HOLD|' || v_sqlstate || '/' || v_msg;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.b1_case_unknown_42501() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  BEGIN
    RAISE EXCEPTION 'permission denied for table student_requests' USING ERRCODE = '42501';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'HOLD|' || SQLSTATE || '/' || SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.b1_case_unauthorized_atomic() TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_case_illegal_action() TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_case_payment_step() TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_case_payment_request_uuid() TO b1_matrix_operator;
GRANT EXECUTE ON FUNCTION public.b1_case_unknown_42501() TO b1_matrix_operator;
