-- fix allowed action types (clear is a first-class engine action)
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
    ('review','approve','clear','assess_fee','confirm_payment','sign','archive','apply_decision','issue_document') LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: نوع إجراء غير صالح في الخطوة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  LEFT JOIN public.request_workflow_action_catalog a ON a.code = s.action_code
  WHERE s.workflow_id = p_workflow_id AND s.action_code IS NOT NULL
    AND (a.code IS NULL OR NOT a.is_active
      OR (a.restricted_request_type_code IS NOT NULL AND a.restricted_request_type_code <> v_type_code)
      OR (a.action_type IS NOT NULL AND a.action_type IS DISTINCT FROM s.action_type)) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: إجراء غير مسموح لهذه الخدمة في الخطوة (%)', v_bad.step_key; END IF;

  SELECT t.action_result AS step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = p_workflow_id AND t.to_step_id IS NOT NULL
    AND (ts.id IS NULL OR ts.workflow_id <> p_workflow_id) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: انتقال إلى خطوة غير موجودة (%)', v_bad.step_key; END IF;

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

  SELECT t.action_result AS step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id
    AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                    WHERE c.code = t.condition_schema ->> 'code' AND c.is_active) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: شرط انتقال غير مسموح (%)', v_bad.step_key; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result, t.priority
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id AND NOT t.is_default
      AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
    GROUP BY 1,2,3 HAVING count(*) > 1
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: تعارض في أولويات التفرّع'; END IF;

  SELECT fs.step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
  JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = p_workflow_id
    AND t.action_result NOT IN ('reject','return','cancel')
    AND ts.step_order <= fs.step_order LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: دورة غير منتهية في المسار عند الخطوة (%)', v_bad.step_key; END IF;

  SELECT count(*) INTO v_start_count FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NULL AND t.to_step_id IS NOT NULL;
  IF v_start_count <> 1 THEN RAISE EXCEPTION 'PUBLISH_INVALID: يجب تعريف نقطة بداية واحدة للمسار'; END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NOT NULL AND t.to_step_id IS NULL;
  IF v_count = 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: لا توجد نهاية معرّفة للمسار'; END IF;

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

  SELECT e.rule_code AS step_key INTO v_bad
  FROM public.request_type_eligibility_rules e
  JOIN public.request_type_workflows w ON w.request_type_id = e.request_type_id
  LEFT JOIN public.request_eligibility_rule_catalog c ON c.code = e.rule_code
  WHERE w.id = p_workflow_id AND e.is_active AND (c.code IS NULL OR NOT c.is_active) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: شرط أهلية غير مسموح (%)', v_bad.step_key; END IF;

  RETURN jsonb_build_object('valid', true, 'workflow_id', p_workflow_id, 'request_type_code', v_type_code);
END;
$function$;

-- persist action_code / priority / safe condition, and gate activation on the validator
CREATE OR REPLACE FUNCTION public.admin_save_request_workflow_config(p_request_type_id uuid, p_workflow jsonb, p_steps jsonb, p_transitions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_type public.request_types%ROWTYPE;
  v_workflow_id uuid;
  v_status text;
  v_is_active boolean;
  v_code text;
  v_name_ar text;
  v_version integer;
  v_step jsonb;
  v_transition jsonb;
  v_step_id uuid;
  v_step_key text;
  v_step_order integer;
  v_step_keys text[] := ARRAY[]::text[];
  v_step_ids jsonb := '{}'::jsonb;
  v_step_orders integer[] := ARRAY[]::integer[];
  v_from_key text;
  v_to_key text;
  v_from_id uuid;
  v_to_id uuid;
  v_unit_id uuid;
  v_role_id uuid;
  v_steps_count integer := 0;
  v_payload_fp jsonb;
  v_existing_fp jsonb;
  v_latest_draft_id uuid;
  v_latest_draft_version integer;
  v_reused_existing boolean := false;
  v_final_status text;
  v_final_active boolean;
  v_action_code text;
  v_condition jsonb;
BEGIN
  PERFORM public.assert_can_admin_save_request_workflow();
  PERFORM pg_advisory_xact_lock(hashtext('request_type_workflows:' || p_request_type_id::text));

  IF p_request_type_id IS NULL THEN RAISE EXCEPTION 'معرّف نوع الطلب مطلوب' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_type FROM public.request_types rt WHERE rt.id = p_request_type_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'نوع الطلب غير موجود' USING ERRCODE = 'P0002'; END IF;

  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RAISE EXCEPTION 'يجب تعريف خطوة واحدة على الأقل' USING ERRCODE = '22023';
  END IF;

  IF p_workflow IS NULL OR jsonb_typeof(p_workflow) <> 'object' THEN
    RAISE EXCEPTION 'بيانات workflow غير صالحة' USING ERRCODE = '22023';
  END IF;

  v_status := COALESCE(NULLIF(btrim(p_workflow ->> 'status'), ''), 'draft');
  IF v_status NOT IN ('draft','active') THEN
    RAISE EXCEPTION 'حالة workflow غير صالحة: %', v_status USING ERRCODE = '22023';
  END IF;

  v_is_active := COALESCE((p_workflow ->> 'is_active')::boolean, v_status = 'active');
  IF v_is_active THEN v_status := 'active'; END IF;
  IF v_status = 'active' THEN v_is_active := true; END IF;

  IF v_is_active OR v_status = 'active' THEN
    PERFORM public.assert_can_activate_request_workflow();
  END IF;

  v_code := COALESCE(NULLIF(btrim(p_workflow ->> 'code'), ''), v_type.code || '_workflow');
  v_name_ar := COALESCE(NULLIF(btrim(p_workflow ->> 'name_ar'), ''), 'دورة حياة — ' || v_type.name_ar);

  FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
    v_step_key := NULLIF(btrim(v_step ->> 'step_key'), '');
    v_step_order := (v_step ->> 'step_order')::integer;
    IF v_step_key IS NULL THEN RAISE EXCEPTION 'step_key مطلوب لكل خطوة' USING ERRCODE = '22023'; END IF;
    IF v_step_key = ANY(v_step_keys) THEN RAISE EXCEPTION 'step_key مكرر: %', v_step_key USING ERRCODE = '22023'; END IF;
    IF v_step_order IS NULL OR v_step_order < 1 THEN RAISE EXCEPTION 'step_order غير صالح للخطوة %', v_step_key USING ERRCODE = '22023'; END IF;
    IF v_step_order = ANY(v_step_orders) THEN RAISE EXCEPTION 'step_order مكرر: %', v_step_order USING ERRCODE = '22023'; END IF;
    v_unit_id := NULLIF(v_step ->> 'processing_unit_id', '')::uuid;
    v_role_id := NULLIF(v_step ->> 'processing_role_id', '')::uuid;
    IF v_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.request_processing_units u WHERE u.id = v_unit_id) THEN
      RAISE EXCEPTION 'processing_unit_id غير موجود: %', v_unit_id USING ERRCODE = '22023';
    END IF;
    IF v_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.request_processing_roles r WHERE r.id = v_role_id) THEN
      RAISE EXCEPTION 'processing_role_id غير موجود: %', v_role_id USING ERRCODE = '22023';
    END IF;
    IF v_role_id IS NOT NULL AND v_unit_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.request_processing_roles r WHERE r.id = v_role_id AND r.unit_id = v_unit_id
    ) THEN
      RAISE EXCEPTION 'processing_role_id لا ينتمي إلى processing_unit_id' USING ERRCODE = '22023';
    END IF;
    v_action_code := NULLIF(btrim(v_step ->> 'action_code'), '');
    IF v_action_code IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.request_workflow_action_catalog a
      WHERE a.code = v_action_code AND a.is_active
        AND (a.restricted_request_type_code IS NULL OR a.restricted_request_type_code = v_type.code)
    ) THEN
      RAISE EXCEPTION 'إجراء غير مسموح لهذه الخدمة: %', v_action_code USING ERRCODE = '22023';
    END IF;
    v_step_keys := array_append(v_step_keys, v_step_key);
    v_step_orders := array_append(v_step_orders, v_step_order);
    v_steps_count := v_steps_count + 1;
  END LOOP;

  IF p_transitions IS NOT NULL AND jsonb_typeof(p_transitions) = 'array' THEN
    FOR v_transition IN SELECT value FROM jsonb_array_elements(p_transitions) LOOP
      v_from_key := NULLIF(btrim(v_transition ->> 'from_step_key'), '');
      v_to_key := NULLIF(btrim(v_transition ->> 'to_step_key'), '');
      IF v_from_key IS NOT NULL AND NOT (v_from_key = ANY(v_step_keys)) THEN
        RAISE EXCEPTION 'انتقال من خطوة غير موجودة: %', v_from_key USING ERRCODE = '22023';
      END IF;
      IF v_to_key IS NOT NULL AND NOT (v_to_key = ANY(v_step_keys)) THEN
        RAISE EXCEPTION 'انتقال إلى خطوة غير موجودة: %', v_to_key USING ERRCODE = '22023';
      END IF;
      v_condition := COALESCE(v_transition -> 'condition_config', v_transition -> 'condition_schema', '{}'::jsonb);
      IF v_condition <> '{}'::jsonb AND NOT EXISTS (
        SELECT 1 FROM public.request_workflow_transition_condition_catalog c
        WHERE c.code = v_condition ->> 'code' AND c.is_active
      ) THEN
        RAISE EXCEPTION 'شرط انتقال غير مسموح: %', COALESCE(v_condition ->> 'code','') USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  v_payload_fp := jsonb_build_object(
    'workflow', jsonb_build_object(
      'code', v_code,
      'name_ar', v_name_ar,
      'name_en', COALESCE(NULLIF(btrim(p_workflow ->> 'name_en'), ''), ''),
      'description_ar', COALESCE(NULLIF(btrim(p_workflow ->> 'description_ar'), ''), '')
    ),
    'steps', (
      SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.ord), '[]'::jsonb) FROM (
        SELECT (value ->> 'step_order')::integer AS ord,
          jsonb_build_object(
            'step_key', NULLIF(btrim(value ->> 'step_key'), ''),
            'step_name_ar', COALESCE(NULLIF(btrim(value ->> 'step_name_ar'), ''), NULLIF(btrim(value ->> 'step_key'), '')),
            'step_order', (value ->> 'step_order')::integer,
            'processing_unit_id', NULLIF(btrim(value ->> 'processing_unit_id'), ''),
            'processing_role_id', NULLIF(btrim(value ->> 'processing_role_id'), ''),
            'action_type', COALESCE(NULLIF(btrim(value ->> 'action_type'), ''), 'review'),
            'action_code', NULLIF(btrim(value ->> 'action_code'), ''),
            'is_required', COALESCE((value ->> 'is_required')::boolean, true),
            'visible_to_student', COALESCE((value ->> 'visible_to_student')::boolean, true),
            'notify_on_enter', COALESCE((value ->> 'notify_on_enter')::boolean, true),
            'notify_on_complete', COALESCE((value ->> 'notify_on_complete')::boolean, true),
            'can_return_to_student', COALESCE((value ->> 'can_return_to_student')::boolean, true),
            'can_reject', COALESCE((value ->> 'can_reject')::boolean, true),
            'can_skip', COALESCE((value ->> 'can_skip')::boolean, false),
            'requires_payment', COALESCE((value ->> 'requires_payment')::boolean,
              COALESCE(NULLIF(btrim(value ->> 'action_type'), ''), 'review') IN ('request_payment','assess_fee')),
            'produces_document', COALESCE((value ->> 'produces_document')::boolean,
              COALESCE(NULLIF(btrim(value ->> 'action_type'), ''), 'review') = 'issue_document'),
            'assignment_strategy', COALESCE(NULLIF(btrim(value ->> 'assignment_strategy'), ''), 'role_pool')
          ) AS obj
        FROM jsonb_array_elements(p_steps)
      ) x
    ),
    'transitions', (
      SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.fk, x.tk, x.ar), '[]'::jsonb) FROM (
        SELECT
          COALESCE(NULLIF(btrim(value ->> 'from_step_key'), ''), '') AS fk,
          COALESCE(NULLIF(btrim(value ->> 'to_step_key'), ''), '') AS tk,
          COALESCE(NULLIF(btrim(value ->> 'action_result'), ''), 'approve') AS ar,
          jsonb_build_object(
            'from_step_key', NULLIF(btrim(value ->> 'from_step_key'), ''),
            'to_step_key', NULLIF(btrim(value ->> 'to_step_key'), ''),
            'action_result', COALESCE(NULLIF(btrim(value ->> 'action_result'), ''), 'approve'),
            'label_ar', NULLIF(btrim(value ->> 'label_ar'), ''),
            'is_default', COALESCE((value ->> 'is_default')::boolean, false),
            'priority', COALESCE((value ->> 'priority')::integer, 0),
            'condition_config', COALESCE(value -> 'condition_config', value -> 'condition_schema', '{}'::jsonb)
          ) AS obj
        FROM jsonb_array_elements(COALESCE(p_transitions, '[]'::jsonb))
      ) x
    )
  );

  SELECT w.id, w.version INTO v_latest_draft_id, v_latest_draft_version
  FROM public.request_type_workflows w
  WHERE w.request_type_id = p_request_type_id AND w.code = v_code AND w.status = 'draft'
  ORDER BY w.version DESC LIMIT 1 FOR UPDATE;

  IF v_latest_draft_id IS NOT NULL THEN
    v_existing_fp := jsonb_build_object(
      'workflow', (SELECT jsonb_build_object('code', w.code, 'name_ar', w.name_ar,
        'name_en', COALESCE(w.name_en, ''), 'description_ar', COALESCE(w.description_ar, ''))
        FROM public.request_type_workflows w WHERE w.id = v_latest_draft_id),
      'steps', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'step_key', s.step_key, 'step_name_ar', s.step_name_ar, 'step_order', s.step_order,
          'processing_unit_id', s.processing_unit_id::text, 'processing_role_id', s.processing_role_id::text,
          'action_type', s.action_type, 'action_code', s.action_code, 'is_required', s.is_required,
          'visible_to_student', s.visible_to_student, 'notify_on_enter', s.notify_on_enter,
          'notify_on_complete', s.notify_on_complete, 'can_return_to_student', s.can_return_to_student,
          'can_reject', s.can_reject, 'can_skip', s.can_skip,
          'requires_payment', s.requires_payment, 'produces_document', s.produces_document,
          'assignment_strategy', s.assignment_strategy) ORDER BY s.step_order), '[]'::jsonb)
        FROM public.request_type_workflow_steps s WHERE s.workflow_id = v_latest_draft_id),
      'transitions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'from_step_key', fs.step_key, 'to_step_key', ts.step_key,
          'action_result', t.action_result, 'label_ar', NULLIF(btrim(t.label_ar), ''),
          'is_default', t.is_default, 'priority', t.priority,
          'condition_config', COALESCE(t.condition_schema, '{}'::jsonb))
          ORDER BY COALESCE(fs.step_key, ''), COALESCE(ts.step_key, ''), t.action_result), '[]'::jsonb)
        FROM public.request_type_workflow_transitions t
        LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
        LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
        WHERE t.workflow_id = v_latest_draft_id)
    );
    IF v_existing_fp = v_payload_fp THEN
      v_workflow_id := v_latest_draft_id;
      v_version := v_latest_draft_version;
      v_reused_existing := true;
    END IF;
  END IF;

  IF NOT v_reused_existing THEN
    SELECT COALESCE(max(w.version), 0) + 1 INTO v_version
    FROM public.request_type_workflows w
    WHERE w.request_type_id = p_request_type_id AND w.code = v_code;

    INSERT INTO public.request_type_workflows (request_type_id, code, name_ar, name_en,
      description_ar, version, status, is_active, created_by)
    VALUES (p_request_type_id, v_code, v_name_ar,
      NULLIF(btrim(p_workflow ->> 'name_en'), ''),
      NULLIF(btrim(p_workflow ->> 'description_ar'), ''),
      v_version, 'draft', false, v_uid)
    RETURNING id INTO v_workflow_id;

    FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps)
      ORDER BY (value ->> 'step_order')::integer LOOP
      INSERT INTO public.request_type_workflow_steps (
        workflow_id, step_key, step_name_ar, step_order, processing_unit_id, processing_role_id,
        assignment_strategy, action_type, action_code, is_required, can_return_to_student, can_reject, can_skip,
        notify_on_enter, notify_on_complete, visible_to_student, requires_payment, produces_document
      ) VALUES (
        v_workflow_id, v_step ->> 'step_key',
        COALESCE(NULLIF(btrim(v_step ->> 'step_name_ar'), ''), v_step ->> 'step_key'),
        (v_step ->> 'step_order')::integer,
        NULLIF(v_step ->> 'processing_unit_id', '')::uuid,
        NULLIF(v_step ->> 'processing_role_id', '')::uuid,
        COALESCE(NULLIF(btrim(v_step ->> 'assignment_strategy'), ''), 'role_pool'),
        COALESCE(NULLIF(v_step ->> 'action_type', ''), 'review'),
        NULLIF(btrim(v_step ->> 'action_code'), ''),
        COALESCE((v_step ->> 'is_required')::boolean, true),
        COALESCE((v_step ->> 'can_return_to_student')::boolean, true),
        COALESCE((v_step ->> 'can_reject')::boolean, true),
        COALESCE((v_step ->> 'can_skip')::boolean, false),
        COALESCE((v_step ->> 'notify_on_enter')::boolean, true),
        COALESCE((v_step ->> 'notify_on_complete')::boolean, true),
        COALESCE((v_step ->> 'visible_to_student')::boolean, true),
        COALESCE((v_step ->> 'requires_payment')::boolean,
          COALESCE(NULLIF(v_step ->> 'action_type', ''), 'review') IN ('request_payment','assess_fee')),
        COALESCE((v_step ->> 'produces_document')::boolean,
          COALESCE(NULLIF(v_step ->> 'action_type', ''), 'review') = 'issue_document')
      ) RETURNING id INTO v_step_id;
      v_step_ids := v_step_ids || jsonb_build_object(v_step ->> 'step_key', v_step_id);
    END LOOP;

    IF p_transitions IS NOT NULL AND jsonb_typeof(p_transitions) = 'array' THEN
      FOR v_transition IN SELECT value FROM jsonb_array_elements(p_transitions) LOOP
        v_from_key := NULLIF(btrim(v_transition ->> 'from_step_key'), '');
        v_to_key := NULLIF(btrim(v_transition ->> 'to_step_key'), '');
        v_from_id := CASE WHEN v_from_key IS NULL THEN NULL ELSE (v_step_ids ->> v_from_key)::uuid END;
        v_to_id := CASE WHEN v_to_key IS NULL THEN NULL ELSE (v_step_ids ->> v_to_key)::uuid END;
        INSERT INTO public.request_type_workflow_transitions (
          workflow_id, from_step_id, to_step_id, action_result, label_ar, condition_schema, is_default, priority
        ) VALUES (
          v_workflow_id, v_from_id, v_to_id,
          COALESCE(NULLIF(btrim(v_transition ->> 'action_result'), ''), 'approve'),
          NULLIF(btrim(v_transition ->> 'label_ar'), ''),
          COALESCE(v_transition -> 'condition_config', v_transition -> 'condition_schema', '{}'::jsonb),
          COALESCE((v_transition ->> 'is_default')::boolean, false),
          COALESCE((v_transition ->> 'priority')::integer, 0)
        );
      END LOOP;
    END IF;
  END IF;

  IF v_is_active OR v_status = 'active' THEN
    PERFORM public.validate_request_workflow_publish(v_workflow_id);
    UPDATE public.request_type_workflows SET status = 'retired', is_active = false, updated_at = now()
    WHERE request_type_id = p_request_type_id AND id <> v_workflow_id AND is_active = true;
    UPDATE public.request_type_workflows SET status = 'active', is_active = true, updated_at = now()
    WHERE id = v_workflow_id;
    v_final_status := 'active'; v_final_active := true;
  ELSE
    v_final_status := 'draft'; v_final_active := false;
  END IF;

  PERFORM public.log_audit(
    'request_type_workflow'::text, v_workflow_id::uuid,
    CASE WHEN v_final_active THEN 'workflow_config_activated'::text ELSE 'workflow_config_saved'::text END,
    NULL::jsonb,
    jsonb_build_object('request_type_id', p_request_type_id, 'request_type_code', v_type.code,
      'workflow_code', v_code, 'version', v_version, 'steps_count', v_steps_count,
      'status', v_final_status, 'is_active', v_final_active, 'reused_existing_draft', v_reused_existing)::jsonb,
    CASE WHEN v_reused_existing THEN 'Idempotent workflow save — reused identical draft'::text
      ELSE 'Non-destructive workflow version save'::text END,
    v_uid::uuid
  );

  RETURN jsonb_build_object('success', true, 'workflow_id', v_workflow_id,
    'request_type_id', p_request_type_id, 'steps_count', v_steps_count,
    'status', v_final_status, 'is_active', v_final_active, 'version', v_version,
    'reused_existing_draft', v_reused_existing);
END;
$function$;