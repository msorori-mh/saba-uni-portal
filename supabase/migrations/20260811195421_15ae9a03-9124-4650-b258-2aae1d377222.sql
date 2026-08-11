-- ---------- automatic version lifecycle stamping ----------
CREATE OR REPLACE FUNCTION public.tg_stamp_workflow_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.is_active = true
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.is_active IS DISTINCT FROM true) THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
    NEW.superseded_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active' AND OLD.is_active = true
     AND (NEW.status IS DISTINCT FROM 'active' OR NEW.is_active IS DISTINCT FROM true) THEN
    NEW.superseded_at := COALESCE(NEW.superseded_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_workflow_version_lifecycle ON public.request_type_workflows;
CREATE TRIGGER trg_stamp_workflow_version_lifecycle
  BEFORE INSERT OR UPDATE ON public.request_type_workflows
  FOR EACH ROW EXECUTE FUNCTION public.tg_stamp_workflow_version_lifecycle();

-- ---------- admin service definition reader ----------
CREATE OR REPLACE FUNCTION public.admin_get_service_definition(p_request_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_can_admin_save_request_workflow();

  SELECT jsonb_build_object(
    'request_type', (
      SELECT to_jsonb(rt) FROM public.request_types rt WHERE rt.id = p_request_type_id
    ),
    'eligibility_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', er.id,
               'rule_code', er.rule_code,
               'params', er.params,
               'message_ar', er.message_ar,
               'is_active', er.is_active,
               'sort_order', er.sort_order
             ) ORDER BY er.sort_order, er.created_at)
      FROM public.request_type_eligibility_rules er
      WHERE er.request_type_id = p_request_type_id
    ), '[]'::jsonb),
    'rule_catalog', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order)
      FROM public.request_eligibility_rule_catalog c
      WHERE c.is_active = true
    ), '[]'::jsonb),
    'action_catalog', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.sort_order)
      FROM public.request_workflow_action_catalog a
      WHERE a.is_active = true
    ), '[]'::jsonb),
    'workflow_versions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', w.id,
               'code', w.code,
               'name_ar', w.name_ar,
               'version', w.version,
               'status', w.status,
               'is_active', w.is_active,
               'published_at', w.published_at,
               'superseded_at', w.superseded_at,
               'change_note', w.change_note,
               'pinned_requests', (
                 SELECT count(*) FROM public.student_requests sr WHERE sr.workflow_id = w.id
               )
             ) ORDER BY w.version DESC)
      FROM public.request_type_workflows w
      WHERE w.request_type_id = p_request_type_id
    ), '[]'::jsonb),
    'step_actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'workflow_id', s.workflow_id,
               'step_key', s.step_key,
               'step_name_ar', s.step_name_ar,
               'step_order', s.step_order,
               'action_code', s.action_code
             ) ORDER BY s.step_order)
      FROM public.request_type_workflow_steps s
      JOIN public.request_type_workflows w ON w.id = s.workflow_id
      WHERE w.request_type_id = p_request_type_id
    ), '[]'::jsonb),
    'change_log', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', l.id,
               'change_kind', l.change_kind,
               'change_note', l.change_note,
               'version', l.version,
               'created_at', l.created_at
             ) ORDER BY l.created_at DESC)
      FROM (
        SELECT * FROM public.request_type_workflow_change_log
        WHERE request_type_id = p_request_type_id
        ORDER BY created_at DESC
        LIMIT 50
      ) l
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_service_definition(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_service_definition(uuid) TO authenticated, service_role;

-- ---------- admin eligibility rules writer ----------
CREATE OR REPLACE FUNCTION public.admin_save_request_type_eligibility_rules(
  p_request_type_id uuid,
  p_rules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_item jsonb;
BEGIN
  PERFORM public.assert_can_admin_save_request_workflow();

  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'ELIGIBILITY_RULES_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rules)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.request_eligibility_rule_catalog c
      WHERE c.code = v_item->>'rule_code' AND c.is_active = true
    ) THEN
      RAISE EXCEPTION 'UNKNOWN_ELIGIBILITY_RULE_CODE: %', v_item->>'rule_code' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_item->>'message_ar', '') = '' THEN
      RAISE EXCEPTION 'ELIGIBILITY_RULE_MESSAGE_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.request_type_eligibility_rules
  WHERE request_type_id = p_request_type_id
    AND rule_code NOT IN (
      SELECT x->>'rule_code' FROM jsonb_array_elements(p_rules) x
    );

  INSERT INTO public.request_type_eligibility_rules
    (request_type_id, rule_code, params, message_ar, is_active, sort_order, created_by)
  SELECT p_request_type_id,
         x->>'rule_code',
         COALESCE(x->'params', '{}'::jsonb),
         x->>'message_ar',
         COALESCE((x->>'is_active')::boolean, true),
         COALESCE((x->>'sort_order')::integer, 0),
         auth.uid()
  FROM jsonb_array_elements(p_rules) x
  ON CONFLICT (request_type_id, rule_code) DO UPDATE
    SET params = EXCLUDED.params,
        message_ar = EXCLUDED.message_ar,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();

  SELECT count(*) INTO v_count
  FROM public.request_type_eligibility_rules
  WHERE request_type_id = p_request_type_id;

  INSERT INTO public.request_type_workflow_change_log
    (request_type_id, change_kind, change_note, snapshot, changed_by)
  VALUES (p_request_type_id, 'eligibility_rules_saved',
          'تحديث قواعد الأهلية', jsonb_build_object('rules', p_rules), auth.uid());

  RETURN jsonb_build_object('success', true, 'rules_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_request_type_eligibility_rules(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_request_type_eligibility_rules(uuid, jsonb) TO authenticated, service_role;

-- ---------- admin step action binding ----------
CREATE OR REPLACE FUNCTION public.admin_set_request_workflow_step_actions(
  p_workflow_id uuid,
  p_step_actions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_type_id uuid;
  v_type_code text;
  v_item jsonb;
  v_updated integer := 0;
BEGIN
  PERFORM public.assert_can_admin_save_request_workflow();

  SELECT w.request_type_id, rt.code
  INTO v_request_type_id, v_type_code
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE w.id = p_workflow_id;

  IF v_request_type_id IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_step_actions, '[]'::jsonb))
  LOOP
    IF v_item->>'action_code' IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.request_workflow_action_catalog a
        WHERE a.code = v_item->>'action_code'
          AND a.is_active = true
          AND (a.restricted_request_type_code IS NULL
               OR a.restricted_request_type_code = v_type_code)
      ) THEN
        RAISE EXCEPTION 'ACTION_CODE_NOT_ALLOWED_FOR_SERVICE: %', v_item->>'action_code'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    UPDATE public.request_type_workflow_steps s
    SET action_code = NULLIF(v_item->>'action_code', ''),
        updated_at = now()
    WHERE s.workflow_id = p_workflow_id
      AND s.step_key = v_item->>'step_key';

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  INSERT INTO public.request_type_workflow_change_log
    (request_type_id, workflow_id, change_kind, change_note, snapshot, changed_by)
  VALUES (v_request_type_id, p_workflow_id, 'step_actions_saved',
          'ربط خطوات دورة الإجراءات بإجراءات الكتالوج',
          jsonb_build_object('step_actions', p_step_actions), auth.uid());

  RETURN jsonb_build_object('success', true, 'updated_steps', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_request_workflow_step_actions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_request_workflow_step_actions(uuid, jsonb) TO authenticated, service_role;

-- ---------- configured action effect dispatcher ----------
CREATE OR REPLACE FUNCTION public.apply_configured_action_effect(
  p_request_id uuid,
  p_action_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_fn text;
  v_restricted text;
  v_request_type text;
  v_canonical text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  -- Same execution guard as the existing academic-effect path: effects may
  -- only run inside the approved atomic step-action service.
  IF current_setting('b1.atomic_action', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT a.kind, a.effect_function, a.restricted_request_type_code
  INTO v_kind, v_fn, v_restricted
  FROM public.request_workflow_action_catalog a
  WHERE a.code = p_action_code AND a.is_active = true;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_ACTION_CODE: %', p_action_code USING ERRCODE = '22023';
  END IF;

  IF v_kind <> 'effect' OR v_fn IS NULL THEN
    RETURN; -- neutral / document actions carry no academic effect here
  END IF;

  SELECT sr.request_type INTO v_request_type
  FROM public.student_requests sr WHERE sr.id = p_request_id;

  IF v_request_type IS NULL THEN
    RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND';
  END IF;

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type END;

  IF v_restricted IS NOT NULL AND v_restricted <> v_canonical THEN
    RAISE EXCEPTION 'ACTION_CODE_NOT_ALLOWED_FOR_REQUEST' USING ERRCODE = '42501';
  END IF;

  CASE v_fn
    WHEN 'apply_b1_enrollment_suspension_effect' THEN
      PERFORM public.apply_b1_enrollment_suspension_effect(p_request_id);
    WHEN 'apply_b1_excused_absence_effect' THEN
      PERFORM public.apply_b1_excused_absence_effect(p_request_id);
    WHEN 'apply_b1_department_transfer_effect' THEN
      PERFORM public.apply_b1_department_transfer_effect(p_request_id);
    WHEN 'apply_b1_final_chance_effect' THEN
      PERFORM public.apply_b1_final_chance_effect(p_request_id);
    WHEN 'apply_b1_file_withdrawal_effect' THEN
      PERFORM public.apply_b1_file_withdrawal_effect(p_request_id);
    ELSE
      RAISE EXCEPTION 'EFFECT_FUNCTION_NOT_WHITELISTED: %', v_fn USING ERRCODE = '42501';
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_configured_action_effect(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_configured_action_effect(uuid, text) TO authenticated, service_role;