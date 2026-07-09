-- STUDENT-REQUEST-WORKFLOW-RUNTIME-01
-- Runtime workflow step generator on student request submit.
--
-- Requires:
--   20260710140000_student_request_types_rpc_rls.sql
--   20260710150000_student_request_types_rls_submit_bypass_fix.sql
--   20260710170000_student_request_admin_workflow_schema.sql
--   20260710180000_student_request_actor_rpc_rls.sql
--
-- Adds:
--   get_active_workflow_for_request_type(uuid)
--   initialize_student_request_workflow(uuid)
-- Replaces submit_student_request(uuid) to invoke initializer after submit.
--
-- Does NOT modify legacy student_service_request_* tables or workflow_schema JSON.
-- No seed, no workflow config data, no notifications.

-- =============================================================================
-- 1. get_active_workflow_for_request_type (internal helper)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_active_workflow_for_request_type(
  p_request_type_id uuid
)
RETURNS public.request_type_workflows
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.*
  FROM public.request_type_workflows w
  WHERE w.request_type_id = p_request_type_id
    AND w.is_active = true
    AND w.status = 'active'
  ORDER BY w.version DESC, w.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_active_workflow_for_request_type(uuid) IS
  'Returns the active workflow definition for a request type, if any. '
  'Picks highest version when multiple rows match. Internal helper.';

-- =============================================================================
-- 2. initialize_student_request_workflow
-- =============================================================================

CREATE OR REPLACE FUNCTION public.initialize_student_request_workflow(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.student_requests%ROWTYPE;
  v_type public.request_types%ROWTYPE;
  v_workflow public.request_type_workflows%ROWTYPE;
  v_step public.request_type_workflow_steps%ROWTYPE;
  v_first_step_id uuid;
  v_steps_created integer := 0;
  v_existing_count integer;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_req
  FROM public.student_requests sr
  WHERE sr.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  -- Callable from submit_student_request (student owner) or privileged staff path.
  IF NOT public.is_owner_of_request(v_uid, p_request_id)
     AND NOT public.is_current_user_registrar()
     AND NOT public.is_current_user_admin_actor() THEN
    RAISE EXCEPTION 'غير مصرح بتهيئة workflow لهذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_existing_count
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id;

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'initialized', false,
      'reason', 'already_initialized',
      'existing_steps', v_existing_count
    );
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = v_req.request_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'initialized', false,
      'reason', 'no_active_workflow',
      'detail', 'request_type_not_found'
    );
  END IF;

  SELECT * INTO v_workflow
  FROM public.get_active_workflow_for_request_type(v_type.id);

  IF v_workflow.id IS NULL THEN
    RETURN jsonb_build_object(
      'initialized', false,
      'reason', 'no_active_workflow'
    );
  END IF;

  FOR v_step IN
    SELECT *
    FROM public.request_type_workflow_steps rtws
    WHERE rtws.workflow_id = v_workflow.id
    ORDER BY rtws.step_order ASC
  LOOP
    INSERT INTO public.student_request_workflow_steps (
      student_request_id,
      workflow_id,
      workflow_step_id,
      step_key,
      step_name_ar,
      step_order,
      processing_unit_id,
      processing_role_id,
      status,
      entered_at,
      metadata
    )
    VALUES (
      p_request_id,
      v_workflow.id,
      v_step.id,
      v_step.step_key,
      v_step.step_name_ar,
      v_step.step_order,
      v_step.processing_unit_id,
      v_step.processing_role_id,
      CASE WHEN v_step.step_order = (
        SELECT min(rtws2.step_order)
        FROM public.request_type_workflow_steps rtws2
        WHERE rtws2.workflow_id = v_workflow.id
      ) THEN 'active' ELSE 'pending' END,
      CASE WHEN v_step.step_order = (
        SELECT min(rtws2.step_order)
        FROM public.request_type_workflow_steps rtws2
        WHERE rtws2.workflow_id = v_workflow.id
      ) THEN now() ELSE NULL END,
      jsonb_build_object(
        'assignment_strategy', v_step.assignment_strategy,
        'action_type', v_step.action_type,
        'visible_to_student', v_step.visible_to_student,
        'can_return_to_student', v_step.can_return_to_student,
        'can_reject', v_step.can_reject,
        'can_skip', v_step.can_skip,
        'config', COALESCE(v_step.config, '{}'::jsonb)
      )
    );

    v_steps_created := v_steps_created + 1;
  END LOOP;

  IF v_steps_created = 0 THEN
    RETURN jsonb_build_object(
      'initialized', false,
      'reason', 'no_active_workflow',
      'detail', 'workflow_has_no_steps',
      'workflow_id', v_workflow.id
    );
  END IF;

  SELECT s.id
  INTO v_first_step_id
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id
    AND s.status = 'active'
  ORDER BY s.step_order ASC
  LIMIT 1;

  INSERT INTO public.student_request_workflow_events (
    student_request_id,
    workflow_step_runtime_id,
    event_type,
    actor_user_id,
    message_ar,
    payload,
    visible_to_student
  )
  VALUES (
    p_request_id,
    NULL,
    'submitted',
    v_uid,
    'تم إرسال الطلب',
    jsonb_build_object(
      'workflow_id', v_workflow.id,
      'workflow_code', v_workflow.code,
      'workflow_version', v_workflow.version
    ),
    true
  );

  IF v_first_step_id IS NOT NULL THEN
    INSERT INTO public.student_request_workflow_events (
      student_request_id,
      workflow_step_runtime_id,
      event_type,
      actor_user_id,
      actor_unit_id,
      actor_role_id,
      message_ar,
      payload,
      visible_to_student
    )
    SELECT
      p_request_id,
      s.id,
      'step_entered',
      v_uid,
      s.processing_unit_id,
      s.processing_role_id,
      'دخول الخطوة: ' || s.step_name_ar,
      jsonb_build_object(
        'step_key', s.step_key,
        'step_order', s.step_order
      ),
      COALESCE((s.metadata ->> 'visible_to_student')::boolean, true)
    FROM public.student_request_workflow_steps s
    WHERE s.id = v_first_step_id;
  END IF;

  -- Request status remains 'submitted' after submit_student_request.
  -- status_on_enter / in_review transition deferred to a later cutover phase.

  RETURN jsonb_build_object(
    'initialized', true,
    'workflow_id', v_workflow.id,
    'workflow_code', v_workflow.code,
    'workflow_version', v_workflow.version,
    'steps_created', v_steps_created,
    'active_step_id', v_first_step_id
  );
END;
$$;

COMMENT ON FUNCTION public.initialize_student_request_workflow(uuid) IS
  'Creates student_request_workflow_steps from active request_type_workflow config. '
  'Idempotent: skips if runtime steps already exist. No-op when no active workflow. '
  'Does not touch legacy student_service_request_steps.';

-- =============================================================================
-- 3. submit_student_request — invoke runtime generator after submit
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_student_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_req public.student_requests%ROWTYPE;
  v_type public.request_types%ROWTYPE;
  v_init_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req
  FROM public.student_requests sr
  WHERE sr.id = p_request_id
    AND sr.student_profile_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود أو لا تملك صلاحية الوصول إليه'
      USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('draft', 'returned', 'returned_for_completion') THEN
    RAISE EXCEPTION 'لا يمكن إرسال هذا الطلب في حالته الحالية'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = v_req.request_type;

  IF NOT FOUND OR v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  -- TODO(STUDENT-REQUEST-ATTACHMENTS-01): enforce required_documents when schema validation exists.

  PERFORM set_config('student_request.submit_via_rpc', '1', true);

  UPDATE public.student_requests
  SET
    status = 'submitted',
    submitted_at = COALESCE(submitted_at, now()),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  -- New admin-configurable workflow runtime (no-op when no active workflow config).
  -- Legacy student_service_request_steps / workflow_schema JSON unchanged.
  v_init_result := public.initialize_student_request_workflow(p_request_id);

  -- Submit succeeds even when initialized=false (no_active_workflow / already_initialized).
  -- Structural errors inside initialize_student_request_workflow still raise.

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.submit_student_request(uuid) IS
  'Submits a student request with eligibility re-check and submit_via_rpc bypass flag. '
  'After submit, calls initialize_student_request_workflow when active config exists. '
  'Legacy workflow tables are not modified in this RPC.';

-- =============================================================================
-- 4. Grants — explicit REVOKE from anon/authenticated (default privileges)
-- =============================================================================

REVOKE ALL ON FUNCTION public.get_active_workflow_for_request_type(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.initialize_student_request_workflow(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_student_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid)
  TO authenticated;

-- =============================================================================
-- 5. RLS — no new policies
-- =============================================================================
-- student_request_workflow_steps/events remain RLS-enabled without permissive policies.
-- Writes occur via SECURITY DEFINER functions above.
