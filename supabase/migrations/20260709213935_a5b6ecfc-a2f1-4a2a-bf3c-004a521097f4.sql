-- STUDENT-REQUEST-ACTOR-RPC-RLS-01
-- Helper functions and SECURITY DEFINER RPCs for actor-based student request
-- workflow access and processing.

CREATE OR REPLACE FUNCTION public.current_user_app_roles()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role::text
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_user_app_roles() IS
  'Returns app_role values for the authenticated user only.';

CREATE OR REPLACE FUNCTION public.current_user_processing_assignments()
RETURNS TABLE (
  assignment_id uuid,
  unit_id uuid,
  unit_code text,
  unit_name_ar text,
  role_id uuid,
  role_code text,
  role_name_ar text,
  assignment_type text,
  is_managerial boolean,
  department_id uuid,
  portal_scope text,
  is_academic_unit boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rpa.id AS assignment_id,
    rpu.id AS unit_id,
    rpu.code AS unit_code,
    rpu.name_ar AS unit_name_ar,
    rpr.id AS role_id,
    rpr.code AS role_code,
    rpr.name_ar AS role_name_ar,
    rpa.assignment_type,
    COALESCE(rpr.is_managerial, false) AS is_managerial,
    rpa.department_id,
    rpu.portal_scope,
    rpu.is_academic_unit
  FROM public.request_processing_assignments rpa
  JOIN public.request_processing_units rpu ON rpu.id = rpa.unit_id
  LEFT JOIN public.request_processing_roles rpr ON rpr.id = rpa.role_id
  LEFT JOIN public.staff_profiles sp ON sp.id = rpa.staff_profile_id
  LEFT JOIN public.faculty_profiles fp ON fp.id = rpa.faculty_profile_id
  LEFT JOIN public.position_assignments pa ON pa.id = rpa.position_assignment_id
  WHERE rpa.is_active = true
    AND rpu.is_active = true
    AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
    AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
    AND (
      rpa.user_id = auth.uid()
      OR sp.user_id = auth.uid()
      OR fp.user_id = auth.uid()
      OR pa.user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.current_user_processing_assignments() IS
  'Active processing unit/role assignments resolved for auth.uid() via user_id, staff_profile, faculty_profile, or position_assignment links.';

CREATE OR REPLACE FUNCTION public.is_current_user_registrar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_role(auth.uid(), ARRAY['registrar', 'admin', 'system_admin'])
    OR EXISTS (
      SELECT 1
      FROM public.current_user_processing_assignments() a
      WHERE a.unit_code = 'registrar'
         OR a.role_code = 'registrar_general'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']);
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_department_head_for_student(
  p_student_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_profiles sp
    WHERE sp.id = p_student_profile_id
      AND sp.department_id IS NOT NULL
      AND (
        public.is_department_head_of(auth.uid(), sp.department_id)
        OR EXISTS (
          SELECT 1
          FROM public.position_assignments pa
          JOIN public.organizational_positions op ON op.id = pa.position_id
          JOIN public.faculty_profiles fp ON fp.user_id = pa.user_id
          WHERE pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
            AND fp.department_id = sp.department_id
            AND op.code IN ('department_head')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_current_user_department_head_for_student(uuid) IS
  'True when auth.uid() is department head for the student department.';

CREATE OR REPLACE FUNCTION public.is_current_user_dean_for_student(
  p_student_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_role(auth.uid(), ARRAY['dean'])
    OR EXISTS (
      SELECT 1
      FROM public.position_assignments pa
      JOIN public.organizational_positions op ON op.id = pa.position_id
      WHERE pa.user_id = auth.uid()
        AND pa.is_active = true
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
        AND op.code = 'dean'
    );
$$;

COMMENT ON FUNCTION public.is_current_user_dean_for_student(uuid) IS
  'True when auth.uid() holds the college dean position.';

CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(
  p_step_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_student_profile_id uuid;
  v_strategy text;
  v_is_managerial boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_current_user_registrar() OR public.is_current_user_admin_actor() THEN
    RETURN true;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT sr.student_profile_id INTO v_student_profile_id
  FROM public.student_requests sr
  WHERE sr.id = v_step.student_request_id;

  IF v_step.assigned_user_id = v_uid THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.current_user_processing_assignments() a
    WHERE a.unit_id IS NOT DISTINCT FROM v_step.processing_unit_id
      AND (
        v_step.processing_role_id IS NULL
        OR a.role_id IS NOT DISTINCT FROM v_step.processing_role_id
      )
      AND (
        a.is_managerial = true
        OR v_step.assigned_user_id IS NULL
        OR v_step.assigned_user_id = v_uid
      )
  ) THEN
    RETURN true;
  END IF;

  SELECT rtws.assignment_strategy
  INTO v_strategy
  FROM public.request_type_workflow_steps rtws
  WHERE rtws.id = v_step.workflow_step_id;

  v_strategy := COALESCE(v_strategy, v_step.metadata ->> 'assignment_strategy');

  IF v_strategy IN ('requester_department_head', 'department_position') THEN
    RETURN public.is_current_user_department_head_for_student(v_student_profile_id);
  END IF;

  IF v_strategy IN ('dean', 'college_position') THEN
    RETURN public.is_current_user_dean_for_student(v_student_profile_id);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_access_request(
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_request_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_owner_of_request(v_uid, p_request_id) THEN
    RETURN true;
  END IF;

  IF public.is_current_user_registrar() OR public.is_current_user_admin_actor() THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = p_request_id
      AND public.user_matches_workflow_runtime_step(s.id)
  ) THEN
    RETURN true;
  END IF;

  IF public.can_access_student_service_request(v_uid, p_request_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action(p_action text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_action IN (
    'approve',
    'reject',
    'return',
    'comment',
    'request_attachment',
    'request_payment',
    'archive',
    'issue_document',
    'complete',
    'skip'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(
  p_step_id uuid,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_student_profile_id uuid;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_valid_actor_request_action(p_action) THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT sr.student_profile_id INTO v_student_profile_id
  FROM public.student_requests sr
  WHERE sr.id = v_step.student_request_id;

  IF public.is_owner_of_request(v_uid, v_step.student_request_id) THEN
    RETURN false;
  END IF;

  IF v_step.status NOT IN ('active', 'pending') THEN
    IF p_action = 'comment' AND v_step.status = 'completed' THEN
      RETURN public.user_matches_workflow_runtime_step(p_step_id);
    END IF;
    IF p_action = 'skip' AND public.is_current_user_admin_actor() THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF p_action = 'skip' THEN
    IF public.is_current_user_admin_actor() THEN
      RETURN true;
    END IF;
    SELECT c.* INTO v_config
    FROM public.request_type_workflow_steps c
    WHERE c.id = v_step.workflow_step_id;
    IF COALESCE(v_config.can_skip, false) THEN
      RETURN public.user_matches_workflow_runtime_step(p_step_id);
    END IF;
    RETURN false;
  END IF;

  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN
    RETURN false;
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;

  IF p_action = 'reject' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_reject, true) THEN
    RETURN false;
  END IF;

  IF p_action = 'return' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_return_to_student, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_request_actor_inbox(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  workflow_step_runtime_id uuid,
  student_request_id uuid,
  request_type_code text,
  request_type_name_ar text,
  student_id uuid,
  student_name text,
  department_id uuid,
  department_name_ar text,
  step_key text,
  step_name_ar text,
  step_status text,
  processing_unit_id uuid,
  processing_unit_name_ar text,
  processing_role_id uuid,
  processing_role_name_ar text,
  submitted_at timestamptz,
  is_actionable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_safe_limit integer;
  v_safe_offset integer;
  v_status_filter text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  v_safe_limit := GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
  v_safe_offset := GREATEST(COALESCE(p_offset, 0), 0);

  IF p_filters ? 'status' THEN
    SELECT array_agg(x::text)
    INTO v_status_filter
    FROM jsonb_array_elements_text(p_filters -> 'status') AS x;
  ELSE
    v_status_filter := ARRAY['pending', 'active'];
  END IF;

  RETURN QUERY
  SELECT
    s.id AS workflow_step_runtime_id,
    sr.id AS student_request_id,
    sr.request_type AS request_type_code,
    rt.name_ar AS request_type_name_ar,
    sp.id AS student_id,
    sp.full_name_ar AS student_name,
    sp.department_id,
    d.name_ar AS department_name_ar,
    s.step_key,
    s.step_name_ar,
    s.status AS step_status,
    s.processing_unit_id,
    rpu.name_ar AS processing_unit_name_ar,
    s.processing_role_id,
    rpr.name_ar AS processing_role_name_ar,
    sr.submitted_at,
    (
      s.status = 'active'
      AND public.can_current_user_act_on_step(s.id, 'approve')
    ) AS is_actionable
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests sr ON sr.id = s.student_request_id
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  LEFT JOIN public.departments d ON d.id = sp.department_id
  LEFT JOIN public.request_processing_units rpu ON rpu.id = s.processing_unit_id
  LEFT JOIN public.request_processing_roles rpr ON rpr.id = s.processing_role_id
  LEFT JOIN public.request_type_workflow_steps rtws ON rtws.id = s.workflow_step_id
  WHERE s.status = ANY(v_status_filter)
    AND (
      public.is_current_user_registrar()
      OR public.is_current_user_admin_actor()
      OR public.user_matches_workflow_runtime_step(s.id)
    )
    AND (
      NOT (p_filters ? 'processing_unit_code')
      OR rpu.code = p_filters ->> 'processing_unit_code'
    )
    AND (
      NOT (p_filters ? 'request_type_code')
      OR sr.request_type = p_filters ->> 'request_type_code'
    )
    AND (
      NOT (p_filters ? 'department_id')
      OR sp.department_id::text = p_filters ->> 'department_id'
    )
    AND (
      NOT (p_filters ? 'search')
      OR sr.request_number ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.full_name_ar ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.academic_number ILIKE '%' || (p_filters ->> 'search') || '%'
    )
  ORDER BY COALESCE(sr.submitted_at, s.created_at) DESC, s.step_order ASC
  LIMIT v_safe_limit
  OFFSET v_safe_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_request_detail_for_actor(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بعرض هذا الطلب'
      USING ERRCODE = '42501';
  END IF;

  v_is_owner := public.is_owner_of_request(v_uid, p_request_id);

  SELECT jsonb_build_object(
    'request', jsonb_build_object(
      'id', sr.id,
      'request_number', sr.request_number,
      'request_type', sr.request_type,
      'request_type_name_ar', rt.name_ar,
      'title', sr.title,
      'status', sr.status,
      'form_data', CASE WHEN v_is_owner THEN sr.form_data ELSE COALESCE(sr.form_data, '{}'::jsonb) END,
      'student_notes', sr.student_notes,
      'submitted_at', sr.submitted_at,
      'created_at', sr.created_at,
      'updated_at', sr.updated_at,
      'current_step_index', sr.current_step_index,
      'current_role_key', sr.current_role_key
    ),
    'student', jsonb_build_object(
      'id', sp.id,
      'full_name_ar', sp.full_name_ar,
      'academic_number', sp.academic_number,
      'department_id', sp.department_id,
      'department_name_ar', d.name_ar,
      'status', sp.status
    ),
    'workflow_steps', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'step_key', s.step_key,
          'step_name_ar', s.step_name_ar,
          'step_order', s.step_order,
          'status', s.status,
          'decision', s.decision,
          'comment', s.comment,
          'processing_unit_name_ar', rpu.name_ar,
          'processing_role_name_ar', rpr.name_ar,
          'entered_at', s.entered_at,
          'completed_at', s.completed_at,
          'is_actionable', (
            s.status = 'active'
            AND public.can_current_user_act_on_step(s.id, 'approve')
          )
        )
        ORDER BY s.step_order
      )
      FROM public.student_request_workflow_steps s
      LEFT JOIN public.request_processing_units rpu ON rpu.id = s.processing_unit_id
      LEFT JOIN public.request_processing_roles rpr ON rpr.id = s.processing_role_id
      WHERE s.student_request_id = sr.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'event_type', e.event_type,
          'message_ar', e.message_ar,
          'payload', e.payload,
          'created_at', e.created_at,
          'visible_to_student', e.visible_to_student
        )
        ORDER BY e.created_at
      )
      FROM public.student_request_workflow_events e
      WHERE e.student_request_id = sr.id
        AND (
          NOT v_is_owner
          OR e.visible_to_student = true
        )
    ), '[]'::jsonb),
    'attachments', '[]'::jsonb
  )
  INTO v_result
  FROM public.student_requests sr
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  LEFT JOIN public.departments d ON d.id = sp.department_id
  WHERE sr.id = p_request_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'الطلب غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_student_request_detail_for_actor(uuid) IS
  'Returns request detail for authorized actors. Attachments deferred.';

CREATE OR REPLACE FUNCTION public.act_on_student_request_step(
  p_step_id uuid,
  p_action text,
  p_comment text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_action_result text;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_event_type text;
  v_visible_to_student boolean := false;
  v_new_step_status text;
  v_new_request_status text;
  v_decision text;
  v_next_runtime_step_id uuid;
  v_actor_unit_id uuid;
  v_actor_role_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_current_user_act_on_step(p_step_id, p_action) THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ هذا الإجراء على هذه الخطوة'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخطوة غير موجودة'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT c.* INTO v_config
  FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;

  IF p_action IN ('reject', 'return') AND COALESCE(btrim(p_comment), '') = '' THEN
    RAISE EXCEPTION 'التعليق مطلوب لهذا الإجراء'
      USING ERRCODE = '22023';
  END IF;

  v_action_result := CASE p_action
    WHEN 'approve' THEN 'approve'
    WHEN 'reject' THEN 'reject'
    WHEN 'return' THEN 'return'
    WHEN 'request_attachment' THEN 'request_attachment'
    WHEN 'request_payment' THEN 'request_payment'
    WHEN 'skip' THEN 'skip'
    WHEN 'complete' THEN 'complete'
    WHEN 'archive' THEN 'complete'
    WHEN 'issue_document' THEN 'complete'
    ELSE NULL
  END;

  v_event_type := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'comment' THEN 'commented'
    WHEN 'request_attachment' THEN 'attachment_requested'
    WHEN 'request_payment' THEN 'payment_requested'
    WHEN 'archive' THEN 'archived'
    WHEN 'issue_document' THEN 'document_issued'
    WHEN 'complete' THEN 'completed'
    WHEN 'skip' THEN 'approved'
    ELSE 'commented'
  END;

  v_visible_to_student := p_action IN (
    'approve', 'reject', 'return', 'request_attachment',
    'request_payment', 'complete', 'issue_document'
  );

  v_decision := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'skip' THEN 'skipped'
    WHEN 'complete' THEN 'completed'
    WHEN 'issue_document' THEN 'completed'
    ELSE NULL
  END;

  IF p_action = 'comment' THEN
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
      v_step.student_request_id,
      v_step.id,
      v_event_type,
      v_uid,
      v_step.processing_unit_id,
      v_step.processing_role_id,
      p_comment,
      COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('action', p_action),
      false
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', p_action,
      'step_id', p_step_id,
      'terminal', false
    );
  END IF;

  v_new_step_status := CASE p_action
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'skip' THEN 'skipped'
    ELSE 'completed'
  END;

  UPDATE public.student_request_workflow_steps
  SET
    status = v_new_step_status,
    decision = v_decision,
    comment = p_comment,
    completed_by = v_uid,
    completed_at = now(),
    updated_at = now()
  WHERE id = v_step.id;

  SELECT a.unit_id, a.role_id
  INTO v_actor_unit_id, v_actor_role_id
  FROM public.current_user_processing_assignments() a
  WHERE a.unit_id IS NOT DISTINCT FROM v_step.processing_unit_id
  LIMIT 1;

  v_actor_unit_id := COALESCE(v_actor_unit_id, v_step.processing_unit_id);
  v_actor_role_id := COALESCE(v_actor_role_id, v_step.processing_role_id);

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
    v_step.student_request_id,
    v_step.id,
    v_event_type,
    v_uid,
    v_actor_unit_id,
    v_actor_role_id,
    p_comment,
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'action', p_action,
      'previous_status', v_step.status,
      'new_step_status', v_new_step_status
    ),
    v_visible_to_student
  );

  IF v_step.workflow_id IS NOT NULL AND v_action_result IS NOT NULL THEN
    SELECT t.* INTO v_transition
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = v_step.workflow_id
      AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
      AND t.action_result = v_action_result
    ORDER BY t.is_default DESC, t.created_at
    LIMIT 1;
  END IF;

  v_next_runtime_step_id := NULL;
  v_new_request_status := NULL;

  IF v_transition.id IS NOT NULL AND v_transition.to_step_id IS NOT NULL THEN
    SELECT s.id INTO v_next_runtime_step_id
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_step.student_request_id
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
        actor_unit_id,
        actor_role_id,
        message_ar,
        payload,
        visible_to_student
      )
      VALUES (
        v_step.student_request_id,
        v_next_runtime_step_id,
        'step_entered',
        v_uid,
        NULL,
        NULL,
        'دخول خطوة جديدة',
        jsonb_build_object('from_step_id', v_step.id, 'transition_id', v_transition.id),
        false
      );

      v_new_request_status := COALESCE(v_config.status_on_complete, 'in_review');
    END IF;
  ELSIF v_transition.id IS NOT NULL AND v_transition.to_step_id IS NULL THEN
    v_new_request_status := CASE v_action_result
      WHEN 'reject' THEN 'rejected'
      WHEN 'return' THEN 'returned_for_completion'
      WHEN 'complete' THEN 'completed'
      WHEN 'cancel' THEN 'cancelled'
      ELSE 'completed'
    END;
  ELSE
    v_new_request_status := CASE p_action
      WHEN 'reject' THEN 'rejected'
      WHEN 'return' THEN 'returned_for_completion'
      WHEN 'complete' THEN 'completed'
      WHEN 'approve' THEN COALESCE(v_config.status_on_complete, 'in_review')
      ELSE NULL
    END;
  END IF;

  IF v_new_request_status IS NOT NULL THEN
    UPDATE public.student_requests
    SET
      status = v_new_request_status,
      updated_at = now(),
      completed_at = CASE
        WHEN v_new_request_status IN ('completed', 'approved', 'rejected', 'cancelled')
        THEN now()
        ELSE completed_at
      END
    WHERE id = v_step.student_request_id;
  END IF;

  IF p_action = 'skip' AND public.is_current_user_admin_actor() THEN
    PERFORM public.log_audit(
      'student_request_workflow_step',
      v_step.id,
      'workflow_step_skipped',
      NULL,
      jsonb_build_object('action', p_action, 'comment', p_comment)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'step_id', p_step_id,
    'next_step_id', v_next_runtime_step_id,
    'request_status', v_new_request_status,
    'transition_applied', v_transition.id IS NOT NULL,
    'terminal', v_transition.to_step_id IS NULL AND v_action_result IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb) IS
  'Processes a workflow step action, writes events, applies transitions when configured.';

CREATE OR REPLACE FUNCTION public.admin_get_request_workflow_config(
  p_request_type_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin', 'registrar']) THEN
    RAISE EXCEPTION 'غير مصرح بعرض إعدادات workflow'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.request_types rt WHERE rt.id = p_request_type_id
  ) THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'request_type_id', p_request_type_id,
    'workflows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'code', w.code,
          'name_ar', w.name_ar,
          'name_en', w.name_en,
          'description_ar', w.description_ar,
          'version', w.version,
          'status', w.status,
          'is_active', w.is_active,
          'created_at', w.created_at,
          'updated_at', w.updated_at
        )
        ORDER BY w.version DESC, w.created_at DESC
      )
      FROM public.request_type_workflows w
      WHERE w.request_type_id = p_request_type_id
    ), '[]'::jsonb),
    'steps', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'workflow_id', s.workflow_id,
          'step_key', s.step_key,
          'step_name_ar', s.step_name_ar,
          'step_order', s.step_order,
          'processing_unit_id', s.processing_unit_id,
          'processing_role_id', s.processing_role_id,
          'assignment_strategy', s.assignment_strategy,
          'action_type', s.action_type,
          'is_required', s.is_required,
          'can_return_to_student', s.can_return_to_student,
          'can_reject', s.can_reject,
          'can_skip', s.can_skip,
          'notify_on_enter', s.notify_on_enter,
          'notify_on_complete', s.notify_on_complete,
          'visible_to_student', s.visible_to_student
        )
        ORDER BY s.workflow_id, s.step_order
      )
      FROM public.request_type_workflow_steps s
      JOIN public.request_type_workflows w ON w.id = s.workflow_id
      WHERE w.request_type_id = p_request_type_id
    ), '[]'::jsonb),
    'transitions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'workflow_id', t.workflow_id,
          'from_step_id', t.from_step_id,
          'to_step_id', t.to_step_id,
          'action_result', t.action_result,
          'label_ar', t.label_ar,
          'condition_schema', t.condition_schema,
          'is_default', t.is_default
        )
        ORDER BY t.workflow_id, t.created_at
      )
      FROM public.request_type_workflow_transitions t
      JOIN public.request_type_workflows w ON w.id = t.workflow_id
      WHERE w.request_type_id = p_request_type_id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_app_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_app_roles() TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_processing_assignments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_processing_assignments() TO authenticated;

REVOKE ALL ON FUNCTION public.is_current_user_registrar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_registrar() TO authenticated;

REVOKE ALL ON FUNCTION public.is_current_user_admin_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin_actor() TO authenticated;

REVOKE ALL ON FUNCTION public.is_current_user_department_head_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_department_head_for_student(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_current_user_dean_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_dean_for_student(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_matches_workflow_runtime_step(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_matches_workflow_runtime_step(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_current_user_access_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_user_access_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_valid_actor_request_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_actor_request_action(text) TO authenticated;

REVOKE ALL ON FUNCTION public.can_current_user_act_on_step(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_request_actor_inbox(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_request_actor_inbox(jsonb, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_request_detail_for_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_request_detail_for_actor(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_request_workflow_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_request_workflow_config(uuid) TO authenticated;
