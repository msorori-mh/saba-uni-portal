CREATE OR REPLACE FUNCTION public.evaluate_request_eligibility_rules(
  p_request_type_code text,
  p_context jsonb
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reasons text[] := ARRAY[]::text[];
  r RECORD;
  v_ok boolean;
BEGIN
  FOR r IN
    SELECT er.rule_code, er.params, er.message_ar
    FROM public.request_type_eligibility_rules er
    JOIN public.request_types rt ON rt.id = er.request_type_id
    JOIN public.request_eligibility_rule_catalog c ON c.code = er.rule_code
    WHERE rt.code = p_request_type_code
      AND er.is_active = true
      AND c.is_active = true
    ORDER BY er.sort_order, er.created_at
  LOOP
    v_ok := true;

    CASE r.rule_code
      WHEN 'STUDENT_STUDY_STATUS_IN' THEN
        v_ok := COALESCE(p_context->>'student_study_status', '') IN (
          SELECT jsonb_array_elements_text(COALESCE(r.params->'values', '[]'::jsonb))
        );

      WHEN 'MAX_CONSECUTIVE_SUSPENSION_YEARS' THEN
        v_ok := COALESCE((p_context->>'consecutive_suspension_years_count')::integer, 0)
                < COALESCE((r.params->>'max')::integer, 2147483647);

      WHEN 'MAX_SUSPENSION_SEMESTERS' THEN
        v_ok := COALESCE((p_context->>'previous_suspension_semesters_count')::integer, 0)
                < COALESCE((r.params->>'max')::integer, 2147483647);

      WHEN 'NOT_TRANSFERRED_CURRENT_YEAR' THEN
        v_ok := NOT COALESCE((p_context->>'transferred_current_year')::boolean, false);

      ELSE
        -- Unknown rule code: fail closed, never silently pass.
        v_ok := false;
    END CASE;

    IF NOT v_ok THEN
      v_reasons := array_append(v_reasons, r.message_ar);
    END IF;
  END LOOP;

  RETURN v_reasons;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_request_eligibility_rules(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_request_eligibility_rules(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_student_request_basic_eligibility(
  p_student_profile_id uuid,
  p_request_type_code text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx jsonb;
  v_profile_status text;
  v_audience text;
  v_is_eligible boolean := true;
  v_reasons text[] := ARRAY[]::text[];
  v_rule_reasons text[];
BEGIN
  PERFORM public.assert_can_read_student_eligibility_context(p_student_profile_id);

  v_ctx := public.get_student_request_eligibility_context(p_student_profile_id);
  v_profile_status := v_ctx->>'profile_status';

  SELECT rt.request_audience
  INTO v_audience
  FROM public.request_types rt
  WHERE rt.code = p_request_type_code
    AND rt.is_active = true;

  IF v_audience IS NULL THEN
    RETURN jsonb_build_object(
      'request_type_code', p_request_type_code,
      'student_profile_id', p_student_profile_id,
      'is_eligible', false,
      'reasons', to_jsonb(ARRAY['نوع الطلب غير معروف أو غير مفعّل.']::text[]),
      'context', v_ctx,
      'foundation_phase', 'P1'
    );
  END IF;

  IF NOT public.student_request_type_is_eligible(v_profile_status, v_audience) THEN
    v_is_eligible := false;
    v_reasons := array_append(v_reasons, 'نوع الطلب غير متاح لحالة الطالب (جمهور/حالة profile).');
  END IF;

  v_rule_reasons := public.evaluate_request_eligibility_rules(p_request_type_code, v_ctx);

  IF array_length(v_rule_reasons, 1) IS NOT NULL THEN
    v_is_eligible := false;
    v_reasons := v_reasons || v_rule_reasons;
  END IF;

  IF array_length(v_reasons, 1) IS NULL THEN
    v_reasons := ARRAY[]::text[];
  END IF;

  RETURN jsonb_build_object(
    'request_type_code', p_request_type_code,
    'student_profile_id', p_student_profile_id,
    'is_eligible', v_is_eligible,
    'reasons', to_jsonb(v_reasons),
    'context', v_ctx,
    'foundation_phase', 'P1',
    'engine', 'configured_rules'
  );
END;
$$;