CREATE OR REPLACE FUNCTION public.get_available_request_types_for_current_student()
 RETURNS TABLE(id uuid, code text, name_ar text, description_ar text, request_audience text, ineligible_display_mode text, requires_attachment boolean, sort_order integer, is_eligible boolean, is_disabled boolean, disabled_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_profile_status text;
  v_ineligible_msg text := public.student_request_ineligible_status_message();
  v_ctx jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  IF v_profile_status NOT IN ('active', 'graduated') THEN
    RETURN QUERY
    SELECT
      rt.id,
      rt.code,
      rt.name_ar,
      rt.description_ar,
      rt.request_audience,
      rt.ineligible_display_mode,
      rt.requires_attachment,
      rt.sort_order,
      false AS is_eligible,
      true AS is_disabled,
      v_ineligible_msg AS disabled_reason
    FROM public.request_types rt
    WHERE rt.is_active = true
      AND rt.student_visible = true
    ORDER BY rt.sort_order, rt.name_ar;
    RETURN;
  END IF;

  v_ctx := public.get_student_request_eligibility_context(v_profile_id);

  IF v_profile_status = 'active' THEN
    RETURN QUERY
    SELECT * FROM (
      SELECT
        rt.id,
        rt.code,
        rt.name_ar,
        rt.description_ar,
        rt.request_audience,
        rt.ineligible_display_mode,
        rt.requires_attachment,
        rt.sort_order,
        (COALESCE(array_length(e.reasons, 1), 0) = 0) AS is_eligible,
        (COALESCE(array_length(e.reasons, 1), 0) > 0) AS is_disabled,
        CASE
          WHEN COALESCE(array_length(e.reasons, 1), 0) > 0
            THEN array_to_string(e.reasons, ' | ')
          ELSE NULL
        END::text AS disabled_reason
      FROM public.request_types rt
      CROSS JOIN LATERAL (
        SELECT public.evaluate_request_eligibility_rules(rt.code, v_ctx) AS reasons
      ) e
      WHERE rt.is_active = true
        AND rt.student_visible = true
        AND rt.request_audience IN ('active_student', 'both')

      UNION ALL

      SELECT
        rt.id,
        rt.code,
        rt.name_ar,
        rt.description_ar,
        rt.request_audience,
        rt.ineligible_display_mode,
        rt.requires_attachment,
        rt.sort_order,
        false AS is_eligible,
        true AS is_disabled,
        'هذا الطلب متاح للخريجين فقط.'::text AS disabled_reason
      FROM public.request_types rt
      WHERE rt.is_active = true
        AND rt.student_visible = true
        AND rt.request_audience = 'graduate'
        AND rt.ineligible_display_mode = 'disabled'
    ) q
    ORDER BY q.sort_order, q.name_ar;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    rt.id,
    rt.code,
    rt.name_ar,
    rt.description_ar,
    rt.request_audience,
    rt.ineligible_display_mode,
    rt.requires_attachment,
    rt.sort_order,
    (COALESCE(array_length(e.reasons, 1), 0) = 0) AS is_eligible,
    (COALESCE(array_length(e.reasons, 1), 0) > 0) AS is_disabled,
    CASE
      WHEN COALESCE(array_length(e.reasons, 1), 0) > 0
        THEN array_to_string(e.reasons, ' | ')
      ELSE NULL
    END::text AS disabled_reason
  FROM public.request_types rt
  CROSS JOIN LATERAL (
    SELECT public.evaluate_request_eligibility_rules(rt.code, v_ctx) AS reasons
  ) e
  WHERE rt.is_active = true
    AND rt.student_visible = true
    AND rt.request_audience IN ('graduate', 'both')
  ORDER BY rt.sort_order, rt.name_ar;
END;
$function$;