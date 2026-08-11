-- E. Publish-time validator + C. action_code / priority binding -------------

CREATE OR REPLACE FUNCTION public.validate_request_workflow_publish(p_workflow_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type_code text; v_bad record; v_count integer; v_start_count integer;
BEGIN
  SELECT rt.code INTO v_type_code
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE w.id = p_workflow_id;
  IF v_type_code IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflow_steps s WHERE s.workflow_id = p_workflow_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: لا توجد خطوات في هذا الإصدار'; END IF;

  -- step contract: unit, role, role-in-unit, action type
  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id AND s.processing_unit_id IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: خطوة بلا وحدة معالجة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id AND s.processing_role_id IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: خطوة بلا دور معالجة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  LEFT JOIN public.request_processing_roles r ON r.id = s.processing_role_id
  WHERE s.workflow_id = p_workflow_id AND (r.id IS NULL OR r.unit_id IS DISTINCT FROM s.processing_unit_id) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: الدور لا ينتمي إلى الوحدة في الخطوة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id AND COALESCE(s.action_type,'') NOT IN
    ('review','approve','assess_fee','confirm_payment','sign','archive','apply_decision','issue_document') LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: نوع إجراء غير صالح في الخطوة (%)', v_bad.step_key; END IF;

  -- action_code contract
  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  LEFT JOIN public.request_workflow_action_catalog a ON a.code = s.action_code
  WHERE s.workflow_id = p_workflow_id AND s.action_code IS NOT NULL
    AND (a.code IS NULL OR NOT a.is_active
      OR (a.restricted_request_type_code IS NOT NULL AND a.restricted_request_type_code <> v_type_code)
      OR (a.action_type IS NOT NULL AND a.action_type IS DISTINCT FROM s.action_type)) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: إجراء غير مسموح لهذه الخدمة في الخطوة (%)', v_bad.step_key; END IF;

  -- transitions: target belongs to the same workflow
  SELECT t.action_result AS step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = p_workflow_id AND t.to_step_id IS NOT NULL
    AND (ts.id IS NULL OR ts.workflow_id <> p_workflow_id) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: انتقال إلى خطوة غير موجودة (%)', v_bad.step_key; END IF;

  -- exactly-one default per (from_step, action_result)
  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id
      AND (t.is_default OR COALESCE(t.condition_schema,'{}'::jsonb) = '{}'::jsonb)
    GROUP BY 1,2 HAVING count(*) > 1
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: مسار افتراضي مكرر لنفس الخطوة والنتيجة'; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id
    GROUP BY 1,2
    HAVING count(*) FILTER (WHERE t.is_default OR COALESCE(t.condition_schema,'{}'::jsonb) = '{}'::jsonb) = 0
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: يوجد تفرّع بلا مسار افتراضي'; END IF;

  -- conditions must come from the safe catalog
  SELECT t.action_result AS step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id
    AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                    WHERE c.code = t.condition_schema ->> 'code' AND c.is_active) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: شرط انتقال غير مسموح (%)', v_bad.step_key; END IF;

  -- conflicting priorities among conditional transitions
  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result, t.priority
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id AND NOT t.is_default
      AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
    GROUP BY 1,2,3 HAVING count(*) > 1
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: تعارض في أولويات التفرّع'; END IF;

  -- forward-only progress for advancing results (prevents infinite cycles)
  SELECT fs.step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
  JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = p_workflow_id
    AND t.action_result NOT IN ('reject','return','cancel')
    AND ts.step_order <= fs.step_order LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: دورة غير منتهية في المسار عند الخطوة (%)', v_bad.step_key; END IF;

  -- entry point
  SELECT count(*) INTO v_start_count FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NULL AND t.to_step_id IS NOT NULL;
  IF v_start_count <> 1 THEN RAISE EXCEPTION 'PUBLISH_INVALID: يجب تعريف نقطة بداية واحدة للمسار'; END IF;

  -- terminal transition
  SELECT count(*) INTO v_count FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NOT NULL AND t.to_step_id IS NULL;
  IF v_count = 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: لا توجد نهاية معرّفة للمسار'; END IF;

  -- reachability
  SELECT count(*) INTO v_count FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id
    AND s.id NOT IN (
      WITH RECURSIVE reach AS (
        SELECT t.to_step_id AS id FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NULL AND t.to_step_id IS NOT NULL
        UNION
        SELECT t.to_step_id FROM public.request_type_workflow_transitions t
        JOIN reach r ON r.id = t.from_step_id
        WHERE t.workflow_id = p_workflow_id AND t.to_step_id IS NOT NULL
      ) SELECT id FROM reach
    );
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: توجد خطوة غير قابلة للوصول (%)', v_count; END IF;

  -- eligibility predicates must come from the catalog and be active
  SELECT e.rule_code AS step_key INTO v_bad
  FROM public.request_type_eligibility_rules e
  JOIN public.request_type_workflows w ON w.request_type_id = e.request_type_id
  LEFT JOIN public.request_eligibility_rule_catalog c ON c.code = e.rule_code
  WHERE w.id = p_workflow_id AND e.is_active AND (c.code IS NULL OR NOT c.is_active) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: شرط أهلية غير مسموح (%)', v_bad.step_key; END IF;

  RETURN jsonb_build_object('valid', true, 'workflow_id', p_workflow_id, 'request_type_code', v_type_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_request_workflow_publish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_request_workflow_publish(uuid) TO authenticated, service_role;