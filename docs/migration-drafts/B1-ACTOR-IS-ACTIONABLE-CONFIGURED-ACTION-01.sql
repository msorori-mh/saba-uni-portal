-- ============================================================================
-- B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01
-- SOURCE-ONLY  ·  NEVER APPLIED BY THIS PR  ·  FORWARD-ONLY
--
-- DEFECT
--   Three actor-facing read RPCs probe the authorization gate with the
--   hard-coded literal action 'approve':
--     public.get_my_request_actor_inbox(jsonb, integer, integer)
--     public.get_student_request_detail_for_actor(uuid)
--     public.get_student_request_fee_processing_context(uuid)
--   For any workflow step whose configured action_type is not 'approve'
--   (e.g. 'review' on student_affairs_intake), the gate correctly denies
--   the probe and the UI renders «لست الفاعل المُسنَد للخطوة النشطة»
--   even for the exact direct assignee.
--
-- FIX
--   Probe the action that is actually configured on the workflow step
--   (request_type_workflow_steps.action_type), resolved through the new
--   helper public.workflow_runtime_step_configured_action(uuid).
--   * NO default to 'approve'.
--   * NO role bypass added (no admin / registrar / dean short-circuit).
--   * Fail-closed: an unconfigured / NULL action_type yields is_actionable
--     = false; the authorization gate itself is untouched.
--
-- NOT IN SCOPE
--   public.can_current_user_act_on_step is NOT modified.
--   No DML, no student_visible change, no workflow activation, no grants
--   widened.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Configured-action resolver (read-only, fail-closed)
-- ---------------------------------------------------------------------------
create or replace function public.workflow_runtime_step_configured_action(
  p_step_id uuid
)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select c.action_type
  from public.student_request_workflow_steps s
  join public.request_type_workflow_steps c on c.id = s.workflow_step_id
  where s.id = p_step_id
$function$;

revoke all on function public.workflow_runtime_step_configured_action(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Actor inbox — configured-action probe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_request_actor_inbox(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(workflow_step_runtime_id uuid, student_request_id uuid, request_type_code text, request_type_name_ar text, student_id uuid, student_name text, department_id uuid, department_name_ar text, step_key text, step_name_ar text, step_status text, processing_unit_id uuid, processing_unit_name_ar text, processing_role_id uuid, processing_role_name_ar text, submitted_at timestamp with time zone, is_actionable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_safe_limit integer;
  v_safe_offset integer;
  v_status_filter text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  v_safe_limit  := GREATEST(LEAST(COALESCE(p_limit,  50), 200), 1);
  v_safe_offset := GREATEST(COALESCE(p_offset, 0), 0);

  IF p_filters ? 'status' THEN
    SELECT array_agg(x::text) INTO v_status_filter
    FROM jsonb_array_elements_text(p_filters -> 'status') AS x;
  ELSE
    v_status_filter := ARRAY['pending', 'active'];
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    sr.id,
    sr.request_type,
    rt.name_ar,
    sp.id,
    sp.full_name_ar,
    sp.department_id,
    d.name_ar,
    s.step_key,
    s.step_name_ar,
    s.status,
    s.processing_unit_id,
    rpu.name_ar,
    s.processing_role_id,
    rpr.name_ar,
    sr.submitted_at,
    (
      s.status = 'active'
      AND public.workflow_runtime_step_configured_action(s.id) IS NOT NULL
      AND public.can_current_user_act_on_step(
            s.id,
            public.workflow_runtime_step_configured_action(s.id)
          )
    ) AS is_actionable
  FROM public.student_request_workflow_steps s
  JOIN public.student_requests sr ON sr.id = s.student_request_id
  JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  LEFT JOIN public.departments d ON d.id = sp.department_id
  LEFT JOIN public.request_processing_units rpu ON rpu.id = s.processing_unit_id
  LEFT JOIN public.request_processing_roles rpr ON rpr.id = s.processing_role_id
  WHERE s.status = ANY(v_status_filter)
    AND public.user_matches_workflow_runtime_step(s.id)
    AND (NOT (p_filters ? 'processing_unit_code') OR rpu.code = p_filters ->> 'processing_unit_code')
    AND (NOT (p_filters ? 'request_type_code')    OR sr.request_type = p_filters ->> 'request_type_code')
    AND (NOT (p_filters ? 'department_id')         OR sp.department_id::text = p_filters ->> 'department_id')
    AND (
      NOT (p_filters ? 'search')
      OR sr.request_number ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.full_name_ar    ILIKE '%' || (p_filters ->> 'search') || '%'
      OR sp.academic_number ILIKE '%' || (p_filters ->> 'search') || '%'
    )
  ORDER BY COALESCE(sr.submitted_at, s.created_at) DESC, s.step_order ASC
  LIMIT v_safe_limit
  OFFSET v_safe_offset;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Actor detail — configured-action probe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_request_detail_for_actor(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            AND public.workflow_runtime_step_configured_action(s.id) IS NOT NULL
            AND public.can_current_user_act_on_step(
                  s.id,
                  public.workflow_runtime_step_configured_action(s.id)
                )
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
$function$;

-- ---------------------------------------------------------------------------
-- 4. Fee processing context — configured-action probe
--    NOTE: the pre-existing is_current_user_admin_actor() display clause is
--    preserved verbatim; this migration neither adds nor widens any bypass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_request_fee_processing_context(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_runtime public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_fee public.student_request_fee_assessments%ROWTYPE;
  v_can_execute boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'معرّف الطلب مطلوب' USING ERRCODE = '22023'; END IF;
  IF NOT public.can_current_user_access_request(p_request_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول إلى هذا الطلب' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_runtime FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id AND s.status = 'active'
  ORDER BY s.step_order LIMIT 1;

  IF FOUND THEN
    SELECT c.* INTO v_config FROM public.request_type_workflow_steps c WHERE c.id = v_runtime.workflow_step_id;
    v_can_execute := public.is_current_user_admin_actor()
      OR (
        v_config.action_type IS NOT NULL
        AND public.can_current_user_act_on_step(v_runtime.id, v_config.action_type)
      );
  END IF;

  SELECT fa.* INTO v_fee FROM public.student_request_fee_assessments fa
  WHERE fa.request_id = p_request_id AND fa.payment_status <> 'cancelled'
  ORDER BY fa.created_at DESC LIMIT 1;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id,
    'runtime_step_id', v_runtime.id, 'step_key', v_runtime.step_key,
    'step_status', v_runtime.status, 'action_type', v_config.action_type,
    'processing_unit_id', v_runtime.processing_unit_id,
    'processing_role_id', v_runtime.processing_role_id,
    'can_execute_current_step', COALESCE(v_can_execute, false),
    'fee_assessment', CASE WHEN v_fee.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_fee.id, 'amount', v_fee.amount, 'currency', COALESCE(v_fee.currency, 'YER'),
      'payment_status', v_fee.payment_status, 'payment_reference', v_fee.payment_reference,
      'assessed_at', v_fee.assessed_at, 'payment_confirmed_at', v_fee.payment_confirmed_at
    ) END);
END;
$function$;

commit;
