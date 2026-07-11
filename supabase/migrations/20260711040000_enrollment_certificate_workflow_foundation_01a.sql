-- STUDENT-REQUEST-ENROLLMENT-CERTIFICATE-WORKFLOW-FOUNDATION-01A
-- Configurable workflow save RPC (non-destructive versioning), fee assessment
-- schema, fee/payment RPCs with student notifications.
--
-- Requires:
--   20260710170000_student_request_admin_workflow_schema.sql
--   20260710180000_student_request_actor_rpc_rls.sql
--   20260711020000_student_requests_p1_foundations.sql
--
-- No seed, no production apply from this task.

-- =============================================================================
-- 1. Extend action_type CHECK on request_type_workflow_steps
-- =============================================================================

ALTER TABLE public.request_type_workflow_steps
  DROP CONSTRAINT IF EXISTS request_type_workflow_steps_action_type_chk;

ALTER TABLE public.request_type_workflow_steps
  ADD CONSTRAINT request_type_workflow_steps_action_type_chk
  CHECK (action_type IN (
    'review',
    'approve',
    'reject',
    'comment',
    'return_to_student',
    'request_attachment',
    'request_payment',
    'assess_fee',
    'confirm_payment',
    'sign',
    'archive',
    'issue_document',
    'complete'
  ));

-- =============================================================================
-- 2. Extend action_result CHECK on request_type_workflow_transitions
-- =============================================================================

ALTER TABLE public.request_type_workflow_transitions
  DROP CONSTRAINT IF EXISTS request_type_workflow_transitions_action_result_chk;

ALTER TABLE public.request_type_workflow_transitions
  ADD CONSTRAINT request_type_workflow_transitions_action_result_chk
  CHECK (action_result IN (
    'submit',
    'approve',
    'reject',
    'return',
    'request_attachment',
    'request_payment',
    'fee_not_required',
    'payment_required',
    'payment_confirmed',
    'signed',
    'issued',
    'archived',
    'skip',
    'complete',
    'cancel'
  ));

-- =============================================================================
-- 3. student_request_fee_assessments — payment status + reference
-- =============================================================================

ALTER TABLE public.student_request_fee_assessments
  ADD COLUMN IF NOT EXISTS payment_reference text;

COMMENT ON COLUMN public.student_request_fee_assessments.payment_reference IS
  'External payment/receipt reference on confirmation. hafiza_reference kept for legacy alias.';

UPDATE public.student_request_fee_assessments
SET payment_reference = hafiza_reference
WHERE payment_reference IS NULL
  AND hafiza_reference IS NOT NULL;

UPDATE public.student_request_fee_assessments
SET payment_status = 'pending_payment'
WHERE payment_status = 'pending';

ALTER TABLE public.student_request_fee_assessments
  DROP CONSTRAINT IF EXISTS student_request_fee_assessments_payment_status_chk;

ALTER TABLE public.student_request_fee_assessments
  ADD CONSTRAINT student_request_fee_assessments_payment_status_chk
  CHECK (payment_status IN (
    'not_required',
    'pending_payment',
    'paid',
    'waived',
    'cancelled'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_sr_fee_assessments_one_active_per_request
  ON public.student_request_fee_assessments(request_id)
  WHERE payment_status <> 'cancelled';

-- At most one active workflow per request type (non-destructive versioning).
CREATE UNIQUE INDEX IF NOT EXISTS idx_request_type_workflows_one_active_per_type
  ON public.request_type_workflows (request_type_id)
  WHERE is_active = true;

-- =============================================================================
-- 4. assert_can_admin_save_request_workflow (internal)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_can_admin_save_request_workflow()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs']::text[]
  ) THEN
    RAISE EXCEPTION 'غير مصرح بحفظ إعدادات workflow'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- =============================================================================
-- 5. admin_save_request_workflow_config
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_save_request_workflow_config(
  p_request_type_id uuid,
  p_workflow jsonb,
  p_steps jsonb,
  p_transitions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_step_orders integer[] := ARRAY[]::integer;
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
BEGIN
  PERFORM public.assert_can_admin_save_request_workflow();

  -- Serialize saves per request type (activation uniqueness + versioning).
  PERFORM pg_advisory_xact_lock(
    hashtext('request_type_workflows:' || p_request_type_id::text)
  );

  IF p_request_type_id IS NULL THEN
    RAISE EXCEPTION 'معرّف نوع الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.id = p_request_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RAISE EXCEPTION 'يجب تعريف خطوة واحدة على الأقل'
      USING ERRCODE = '22023';
  END IF;

  IF p_workflow IS NULL OR jsonb_typeof(p_workflow) <> 'object' THEN
    RAISE EXCEPTION 'بيانات workflow غير صالحة'
      USING ERRCODE = '22023';
  END IF;

  v_status := COALESCE(NULLIF(btrim(p_workflow ->> 'status'), ''), 'draft');
  IF v_status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'حالة workflow غير صالحة: %', v_status
      USING ERRCODE = '22023';
  END IF;

  v_is_active := COALESCE((p_workflow ->> 'is_active')::boolean, v_status = 'active');
  IF v_is_active THEN
    v_status := 'active';
  END IF;
  IF v_status = 'active' THEN
    v_is_active := true;
  END IF;

  v_code := COALESCE(NULLIF(btrim(p_workflow ->> 'code'), ''), v_type.code || '_workflow');
  v_name_ar := COALESCE(NULLIF(btrim(p_workflow ->> 'name_ar'), ''), 'دورة حياة — ' || v_type.name_ar);

  -- NOTE: p_workflow.id is intentionally ignored for mutation. Existing
  -- draft/active/retired workflows are never rewritten in place (no DELETE of
  -- steps/transitions). A new version is created when the payload differs.

  FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps)
  LOOP
    v_step_key := NULLIF(btrim(v_step ->> 'step_key'), '');
    v_step_order := (v_step ->> 'step_order')::integer;

    IF v_step_key IS NULL THEN
      RAISE EXCEPTION 'step_key مطلوب لكل خطوة'
        USING ERRCODE = '22023';
    END IF;

    IF v_step_key = ANY(v_step_keys) THEN
      RAISE EXCEPTION 'step_key مكرر: %', v_step_key
        USING ERRCODE = '22023';
    END IF;

    IF v_step_order IS NULL OR v_step_order < 1 THEN
      RAISE EXCEPTION 'step_order غير صالح للخطوة %', v_step_key
        USING ERRCODE = '22023';
    END IF;

    IF v_step_order = ANY(v_step_orders) THEN
      RAISE EXCEPTION 'step_order مكرر: %', v_step_order
        USING ERRCODE = '22023';
    END IF;

    v_unit_id := NULLIF(v_step ->> 'processing_unit_id', '')::uuid;
    v_role_id := NULLIF(v_step ->> 'processing_role_id', '')::uuid;

    IF v_unit_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.request_processing_units u WHERE u.id = v_unit_id
    ) THEN
      RAISE EXCEPTION 'processing_unit_id غير موجود: %', v_unit_id
        USING ERRCODE = '22023';
    END IF;

    IF v_role_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.request_processing_roles r WHERE r.id = v_role_id
    ) THEN
      RAISE EXCEPTION 'processing_role_id غير موجود: %', v_role_id
        USING ERRCODE = '22023';
    END IF;

    IF v_role_id IS NOT NULL AND v_unit_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.request_processing_roles r
      WHERE r.id = v_role_id
        AND r.unit_id = v_unit_id
    ) THEN
      RAISE EXCEPTION 'processing_role_id لا ينتمي إلى processing_unit_id'
        USING ERRCODE = '22023';
    END IF;

    v_step_keys := array_append(v_step_keys, v_step_key);
    v_step_orders := array_append(v_step_orders, v_step_order);
    v_steps_count := v_steps_count + 1;
  END LOOP;

  IF p_transitions IS NOT NULL AND jsonb_typeof(p_transitions) = 'array' THEN
    FOR v_transition IN SELECT value FROM jsonb_array_elements(p_transitions)
    LOOP
      v_from_key := NULLIF(btrim(v_transition ->> 'from_step_key'), '');
      v_to_key := NULLIF(btrim(v_transition ->> 'to_step_key'), '');

      IF v_from_key IS NOT NULL AND NOT (v_from_key = ANY(v_step_keys)) THEN
        RAISE EXCEPTION 'انتقال من خطوة غير موجودة: %', v_from_key
          USING ERRCODE = '22023';
      END IF;

      IF v_to_key IS NOT NULL AND NOT (v_to_key = ANY(v_step_keys)) THEN
        RAISE EXCEPTION 'انتقال إلى خطوة غير موجودة: %', v_to_key
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  v_payload_fp := jsonb_build_object(
    'steps', (
      SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.ord), '[]'::jsonb)
      FROM (
        SELECT
          (value ->> 'step_order')::integer AS ord,
          jsonb_build_object(
            'step_key', NULLIF(btrim(value ->> 'step_key'), ''),
            'step_order', (value ->> 'step_order')::integer,
            'action_type', COALESCE(NULLIF(btrim(value ->> 'action_type'), ''), 'review'),
            'processing_unit_id', NULLIF(btrim(value ->> 'processing_unit_id'), ''),
            'processing_role_id', NULLIF(btrim(value ->> 'processing_role_id'), '')
          ) AS obj
        FROM jsonb_array_elements(p_steps)
      ) x
    ),
    'transitions', (
      SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.fk, x.tk, x.ar), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(NULLIF(btrim(value ->> 'from_step_key'), ''), '') AS fk,
          COALESCE(NULLIF(btrim(value ->> 'to_step_key'), ''), '') AS tk,
          COALESCE(NULLIF(btrim(value ->> 'action_result'), ''), 'approve') AS ar,
          jsonb_build_object(
            'from_step_key', NULLIF(btrim(value ->> 'from_step_key'), ''),
            'to_step_key', NULLIF(btrim(value ->> 'to_step_key'), ''),
            'action_result', COALESCE(NULLIF(btrim(value ->> 'action_result'), ''), 'approve'),
            'is_default', COALESCE((value ->> 'is_default')::boolean, false)
          ) AS obj
        FROM jsonb_array_elements(COALESCE(p_transitions, '[]'::jsonb))
      ) x
    )
  );

  SELECT w.id, w.version
  INTO v_latest_draft_id, v_latest_draft_version
  FROM public.request_type_workflows w
  WHERE w.request_type_id = p_request_type_id
    AND w.code = v_code
    AND w.status = 'draft'
  ORDER BY w.version DESC
  LIMIT 1
  FOR UPDATE;

  IF v_latest_draft_id IS NOT NULL THEN
    v_existing_fp := jsonb_build_object(
      'steps', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'step_key', s.step_key,
            'step_order', s.step_order,
            'action_type', s.action_type,
            'processing_unit_id', s.processing_unit_id::text,
            'processing_role_id', s.processing_role_id::text
          )
          ORDER BY s.step_order
        ), '[]'::jsonb)
        FROM public.request_type_workflow_steps s
        WHERE s.workflow_id = v_latest_draft_id
      ),
      'transitions', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'from_step_key', fs.step_key,
            'to_step_key', ts.step_key,
            'action_result', t.action_result,
            'is_default', t.is_default
          )
          ORDER BY COALESCE(fs.step_key, ''), COALESCE(ts.step_key, ''), t.action_result
        ), '[]'::jsonb)
        FROM public.request_type_workflow_transitions t
        LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
        LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
        WHERE t.workflow_id = v_latest_draft_id
      )
    );

    IF v_existing_fp = v_payload_fp THEN
      v_workflow_id := v_latest_draft_id;
      v_version := v_latest_draft_version;
      v_reused_existing := true;

      UPDATE public.request_type_workflows
      SET
        name_ar = v_name_ar,
        name_en = COALESCE(NULLIF(btrim(p_workflow ->> 'name_en'), ''), name_en),
        description_ar = COALESCE(NULLIF(btrim(p_workflow ->> 'description_ar'), ''), description_ar),
        updated_at = now()
      WHERE id = v_workflow_id;
    END IF;
  END IF;

  IF NOT v_reused_existing THEN
    SELECT COALESCE(max(w.version), 0) + 1
    INTO v_version
    FROM public.request_type_workflows w
    WHERE w.request_type_id = p_request_type_id
      AND w.code = v_code;

    INSERT INTO public.request_type_workflows (
      request_type_id,
      code,
      name_ar,
      name_en,
      description_ar,
      version,
      status,
      is_active,
      created_by
    )
    VALUES (
      p_request_type_id,
      v_code,
      v_name_ar,
      NULLIF(btrim(p_workflow ->> 'name_en'), ''),
      NULLIF(btrim(p_workflow ->> 'description_ar'), ''),
      v_version,
      'draft',
      false,
      v_uid
    )
    RETURNING id INTO v_workflow_id;

    FOR v_step IN
      SELECT value FROM jsonb_array_elements(p_steps)
      ORDER BY (value ->> 'step_order')::integer
    LOOP
      INSERT INTO public.request_type_workflow_steps (
        workflow_id,
        step_key,
        step_name_ar,
        step_order,
        processing_unit_id,
        processing_role_id,
        action_type,
        is_required,
        can_return_to_student,
        can_reject,
        can_skip,
        notify_on_enter,
        notify_on_complete,
        visible_to_student,
        requires_payment,
        produces_document
      )
      VALUES (
        v_workflow_id,
        v_step ->> 'step_key',
        COALESCE(NULLIF(btrim(v_step ->> 'step_name_ar'), ''), v_step ->> 'step_key'),
        (v_step ->> 'step_order')::integer,
        NULLIF(v_step ->> 'processing_unit_id', '')::uuid,
        NULLIF(v_step ->> 'processing_role_id', '')::uuid,
        COALESCE(NULLIF(v_step ->> 'action_type', ''), 'review'),
        COALESCE((v_step ->> 'is_required')::boolean, true),
        COALESCE((v_step ->> 'can_return_to_student')::boolean, true),
        COALESCE((v_step ->> 'can_reject')::boolean, true),
        COALESCE((v_step ->> 'can_skip')::boolean, false),
        COALESCE((v_step ->> 'notify_on_enter')::boolean, true),
        COALESCE((v_step ->> 'notify_on_complete')::boolean, true),
        COALESCE((v_step ->> 'visible_to_student')::boolean, true),
        COALESCE((v_step ->> 'action_type', '') IN ('request_payment', 'assess_fee'), false),
        COALESCE((v_step ->> 'action_type', '') = 'issue_document', false)
      )
      RETURNING id INTO v_step_id;

      v_step_ids := v_step_ids || jsonb_build_object(v_step ->> 'step_key', v_step_id);
    END LOOP;

    IF p_transitions IS NOT NULL AND jsonb_typeof(p_transitions) = 'array' THEN
      FOR v_transition IN SELECT value FROM jsonb_array_elements(p_transitions)
      LOOP
        v_from_key := NULLIF(btrim(v_transition ->> 'from_step_key'), '');
        v_to_key := NULLIF(btrim(v_transition ->> 'to_step_key'), '');
        v_from_id := CASE WHEN v_from_key IS NULL THEN NULL ELSE (v_step_ids ->> v_from_key)::uuid END;
        v_to_id := CASE WHEN v_to_key IS NULL THEN NULL ELSE (v_step_ids ->> v_to_key)::uuid END;

        INSERT INTO public.request_type_workflow_transitions (
          workflow_id,
          from_step_id,
          to_step_id,
          action_result,
          label_ar,
          is_default
        )
        VALUES (
          v_workflow_id,
          v_from_id,
          v_to_id,
          COALESCE(NULLIF(btrim(v_transition ->> 'action_result'), ''), 'approve'),
          NULLIF(btrim(v_transition ->> 'label_ar'), ''),
          COALESCE((v_transition ->> 'is_default')::boolean, false)
        );
      END LOOP;
    END IF;
  END IF;

  IF v_is_active OR v_status = 'active' THEN
    UPDATE public.request_type_workflows
    SET
      status = 'retired',
      is_active = false,
      updated_at = now()
    WHERE request_type_id = p_request_type_id
      AND id <> v_workflow_id
      AND is_active = true;

    UPDATE public.request_type_workflows
    SET
      status = 'active',
      is_active = true,
      updated_at = now()
    WHERE id = v_workflow_id;

    v_final_status := 'active';
    v_final_active := true;
  ELSE
    v_final_status := 'draft';
    v_final_active := false;
  END IF;

  PERFORM public.log_audit(
    'request_type_workflow'::text,
    v_workflow_id::uuid,
    CASE
      WHEN v_final_active THEN 'workflow_config_activated'::text
      ELSE 'workflow_config_saved'::text
    END,
    NULL::jsonb,
    jsonb_build_object(
      'request_type_id', p_request_type_id,
      'request_type_code', v_type.code,
      'workflow_code', v_code,
      'version', v_version,
      'steps_count', v_steps_count,
      'status', v_final_status,
      'is_active', v_final_active,
      'reused_existing_draft', v_reused_existing
    )::jsonb,
    CASE
      WHEN v_reused_existing THEN 'Idempotent workflow save — reused identical draft'::text
      ELSE 'Non-destructive workflow version save'::text
    END,
    v_uid::uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'workflow_id', v_workflow_id,
    'request_type_id', p_request_type_id,
    'steps_count', v_steps_count,
    'status', v_final_status,
    'is_active', v_final_active,
    'version', v_version,
    'reused_existing_draft', v_reused_existing
  );
END;
$$;

COMMENT ON FUNCTION public.admin_save_request_workflow_config(uuid, jsonb, jsonb, jsonb) IS
  'Non-destructive versioning: never mutates steps/transitions of an existing '
  'workflow. Creates a new version when payload differs; idempotent for identical '
  'latest draft. On activate, retires previous active (unique one-active index).';

-- =============================================================================
-- 6. Internal: apply workflow transition by action_result
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_student_request_workflow_transition(
  p_request_id uuid,
  p_from_runtime_step_id uuid,
  p_action_result text,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_next_runtime_step_id uuid;
BEGIN
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_from_runtime_step_id
    AND s.student_request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'خطوة runtime غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = p_action_result
  ORDER BY t.is_default DESC, t.created_at
  LIMIT 1;

  IF v_transition.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد انتقال للنتيجة: %', p_action_result
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.student_request_workflow_steps
  SET
    status = 'completed',
    decision = 'completed',
    completed_by = p_actor_user_id,
    completed_at = now(),
    updated_at = now()
  WHERE id = v_step.id;

  IF v_transition.to_step_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_next_runtime_step_id
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id
    AND s.workflow_step_id = v_transition.to_step_id
  LIMIT 1;

  IF v_next_runtime_step_id IS NOT NULL THEN
    UPDATE public.student_request_workflow_steps
    SET status = 'active', entered_at = now(), updated_at = now()
    WHERE id = v_next_runtime_step_id;

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
      v_next_runtime_step_id,
      'step_entered',
      p_actor_user_id,
      'دخول خطوة جديدة',
      jsonb_build_object(
        'from_step_id', v_step.id,
        'transition_id', v_transition.id,
        'action_result', p_action_result
      ),
      false
    );
  END IF;

  RETURN v_next_runtime_step_id;
END;
$$;

-- =============================================================================
-- 7. assert_can_assess_student_request_fee
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_can_assess_student_request_fee()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF public.is_current_user_admin_actor() THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.current_user_processing_assignments() a
    WHERE a.role_code = 'student_affairs_manager'
  ) OR public.has_any_role(auth.uid(), ARRAY['student_affairs_manager']::text[]) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'غير مصرح بتقييم الرسوم'
    USING ERRCODE = '42501';
END;
$$;

-- =============================================================================
-- 8. assert_can_confirm_student_request_fee_payment
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_can_confirm_student_request_fee_payment()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF public.is_current_user_admin_actor() THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.current_user_processing_assignments() a
    WHERE a.role_code = 'revenue_finance_officer'
  ) OR public.has_any_role(auth.uid(), ARRAY['revenue_finance_officer']::text[]) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'غير مصرح بتأكيد الدفع'
    USING ERRCODE = '42501';
END;
$$;

-- =============================================================================
-- 9. assess_student_request_fee
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assess_student_request_fee(
  p_request_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount numeric(12, 2);
  v_runtime_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assessment_id uuid;
  v_payment_status text;
  v_action_result text;
  v_next_step_id uuid;
  v_visible boolean := false;
  v_event_type text;
  v_user_id uuid;
BEGIN
  PERFORM public.assert_can_assess_student_request_fee();

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  v_amount := COALESCE(p_amount, 0);
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون >= 0'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى هذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_runtime_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id
    AND s.status = 'active'
  ORDER BY s.step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد خطوة نشطة'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_runtime_step.workflow_step_id;

  IF v_config.action_type IS DISTINCT FROM 'assess_fee' THEN
    RAISE EXCEPTION 'الخطوة الحالية ليست تقييم رسوم'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_request_fee_assessments fa
    WHERE fa.request_id = p_request_id
      AND fa.payment_status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'يوجد تقييم رسوم نشط لهذا الطلب'
      USING ERRCODE = '23505';
  END IF;

  IF v_amount = 0 THEN
    v_payment_status := 'not_required';
    v_action_result := 'fee_not_required';
    v_visible := false;
    v_event_type := 'completed';
  ELSE
    v_payment_status := 'pending_payment';
    v_action_result := 'payment_required';
    v_visible := true;
    v_event_type := 'payment_requested';
  END IF;

  INSERT INTO public.student_request_fee_assessments (
    request_id,
    amount,
    currency,
    assessed_by,
    assessed_at,
    payment_status,
    notes
  )
  VALUES (
    p_request_id,
    v_amount,
    'YER',
    v_uid,
    now(),
    v_payment_status,
    p_notes
  )
  RETURNING id INTO v_assessment_id;

  v_next_step_id := public.apply_student_request_workflow_transition(
    p_request_id,
    v_runtime_step.id,
    v_action_result,
    v_uid
  );

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
  VALUES (
    p_request_id,
    v_runtime_step.id,
    v_event_type,
    v_uid,
    v_runtime_step.processing_unit_id,
    v_runtime_step.processing_role_id,
    CASE
      WHEN v_amount = 0 THEN 'لا رسوم مطلوبة'
      ELSE 'تم تحديد رسوم بقيمة ' || v_amount::text || ' YER'
    END,
    jsonb_build_object(
      'assessment_id', v_assessment_id,
      'amount', v_amount,
      'currency', 'YER',
      'payment_status', v_payment_status,
      'action_result', v_action_result
    ),
    v_visible
  );

  -- Payment notification only when amount > 0 (never for fee_not_required).
  IF v_amount > 0 THEN
    SELECT sp.user_id INTO v_user_id
    FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = p_request_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_user_id,
        'طلب دفع رسوم',
        'تم تحديد رسوم بقيمة ' || v_amount::text || ' YER لطلبك. يرجى إتمام السداد.',
        'request',
        'student_request',
        p_request_id
      );
    END IF;
  END IF;

  PERFORM public.log_audit(
    'student_request_fee_assessment'::text,
    v_assessment_id::uuid,
    'fee_assessed'::text,
    NULL::jsonb,
    jsonb_build_object(
      'request_id', p_request_id,
      'amount', v_amount,
      'payment_status', v_payment_status
    )::jsonb,
    'Fee assessed for student request'::text,
    v_uid::uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'assessment_id', v_assessment_id,
    'amount', v_amount,
    'payment_status', v_payment_status,
    'action_result', v_action_result,
    'next_step_id', v_next_step_id,
    'notify_student', v_amount > 0
  );
END;
$$;

COMMENT ON FUNCTION public.assess_student_request_fee(uuid, numeric, text) IS
  'Assesses fee for active assess_fee step. amount=0 skips payment; amount>0 pending_payment.';

-- =============================================================================
-- 10. confirm_student_request_fee_payment
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_student_request_fee_payment(
  p_request_id uuid,
  p_payment_reference text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_runtime_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assessment public.student_request_fee_assessments%ROWTYPE;
  v_next_step_id uuid;
  v_ref text;
  v_user_id uuid;
BEGIN
  PERFORM public.assert_can_confirm_student_request_fee_payment();

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  v_ref := NULLIF(btrim(p_payment_reference), '');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'مرجع الدفع مطلوب'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى هذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  SELECT fa.* INTO v_assessment
  FROM public.student_request_fee_assessments fa
  WHERE fa.request_id = p_request_id
    AND fa.payment_status = 'pending_payment'
  ORDER BY fa.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يوجد تقييم رسوم بانتظار الدفع'
      USING ERRCODE = '42501';
  END IF;

  IF v_assessment.payment_confirmed_at IS NOT NULL OR v_assessment.payment_status = 'paid' THEN
    RAISE EXCEPTION 'تم تأكيد الدفع مسبقاً'
      USING ERRCODE = '23505';
  END IF;

  SELECT s.* INTO v_runtime_step
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id
    AND s.status = 'active'
  ORDER BY s.step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد خطوة نشطة'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_runtime_step.workflow_step_id;

  IF v_config.action_type IS DISTINCT FROM 'confirm_payment' THEN
    RAISE EXCEPTION 'الخطوة الحالية ليست تأكيد دفع'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_request_fee_assessments
  SET
    payment_status = 'paid',
    payment_confirmed_by = v_uid,
    payment_confirmed_at = now(),
    payment_reference = v_ref,
    hafiza_reference = COALESCE(hafiza_reference, v_ref),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = v_assessment.id;

  v_next_step_id := public.apply_student_request_workflow_transition(
    p_request_id,
    v_runtime_step.id,
    'payment_confirmed',
    v_uid
  );

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
  VALUES (
    p_request_id,
    v_runtime_step.id,
    'completed',
    v_uid,
    v_runtime_step.processing_unit_id,
    v_runtime_step.processing_role_id,
    'تم تأكيد سداد الرسوم',
    jsonb_build_object(
      'assessment_id', v_assessment.id,
      'payment_reference', v_ref,
      'amount', v_assessment.amount,
      'action_result', 'payment_confirmed'
    ),
    true
  );

  SELECT sp.user_id INTO v_user_id
  FROM public.student_requests sr
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  WHERE sr.id = p_request_id;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_user_id,
      'تأكيد سداد الرسوم',
      'تم تأكيد سداد رسوم طلبك بمبلغ ' || v_assessment.amount::text || ' YER (مرجع: ' || v_ref || ').',
      'request',
      'student_request',
      p_request_id
    );
  END IF;

  PERFORM public.log_audit(
    'student_request_fee_assessment'::text,
    v_assessment.id::uuid,
    'fee_payment_confirmed'::text,
    jsonb_build_object('payment_status', 'pending_payment')::jsonb,
    jsonb_build_object(
      'payment_status', 'paid',
      'payment_reference', v_ref,
      'request_id', p_request_id
    )::jsonb,
    'Fee payment confirmed for student request'::text,
    v_uid::uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'assessment_id', v_assessment.id,
    'payment_status', 'paid',
    'payment_reference', v_ref,
    'next_step_id', v_next_step_id,
    'notify_student', true
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) IS
  'Confirms off-portal payment for pending_payment assessment on confirm_payment step.';

-- =============================================================================
-- 11. Grants — authenticated only; no anon/public
-- =============================================================================

REVOKE ALL ON FUNCTION public.assert_can_admin_save_request_workflow() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_request_workflow_config(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_student_request_workflow_transition(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_can_assess_student_request_fee() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_can_confirm_student_request_fee_payment() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assess_student_request_fee(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_save_request_workflow_config(uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assess_student_request_fee(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_student_request_fee_payment(uuid, text, text) TO authenticated;
