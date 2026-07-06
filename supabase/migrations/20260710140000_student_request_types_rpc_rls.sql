-- STUDENT-REQUEST-TYPES-RPC-RLS-01
-- Audience-aware RPCs and tighter RLS for student requests.
-- Requires: 20260710130000_student_request_types_schema.sql (request_audience columns).
-- No data writes, no FK VALIDATE, no code normalization, no seed.

-- =============================================================================
-- Constants (inline via functions)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.student_request_ineligible_status_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'لا يمكنك تقديم طلبات حالياً بسبب حالة القيد الأكاديمي. يرجى مراجعة شؤون الطلاب.'::text;
$$;

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_student_profile_for_auth()
RETURNS TABLE (
  profile_id uuid,
  profile_status text,
  academic_number text,
  full_name_ar text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.id, sp.status, sp.academic_number, sp.full_name_ar
  FROM public.student_profiles sp
  WHERE sp.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.student_request_type_is_eligible(
  _profile_status text,
  _request_audience text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _profile_status = 'active' THEN
      _request_audience IN ('active_student', 'both')
    WHEN _profile_status = 'graduated' THEN
      _request_audience IN ('graduate', 'both')
    ELSE
      false
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_student_can_use_request_type(
  _profile_status text,
  _request_audience text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _profile_status NOT IN ('active', 'graduated') THEN
    RAISE EXCEPTION '%', public.student_request_ineligible_status_message()
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.student_request_type_is_eligible(_profile_status, _request_audience) THEN
    IF _profile_status = 'active' AND _request_audience = 'graduate' THEN
      RAISE EXCEPTION 'هذا الطلب متاح للخريجين فقط.'
        USING ERRCODE = '42501';
    ELSIF _profile_status = 'graduated' AND _request_audience = 'active_student' THEN
      RAISE EXCEPTION 'هذا الطلب متاح للطلاب المستمرين فقط.'
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'نوع الطلب غير متاح لحالة الطالب الحالية.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

-- =============================================================================
-- RPC: get_available_request_types_for_current_student
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_available_request_types_for_current_student()
RETURNS TABLE (
  id uuid,
  code text,
  name_ar text,
  description_ar text,
  request_audience text,
  ineligible_display_mode text,
  requires_attachment boolean,
  sort_order integer,
  is_eligible boolean,
  is_disabled boolean,
  disabled_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_profile_status text;
  v_ineligible_msg text := public.student_request_ineligible_status_message();
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

  -- Non active / non graduated: all active types as disabled (awareness).
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

  -- Active student: eligible types + graduate types per display_mode.
  IF v_profile_status = 'active' THEN
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
      true AS is_eligible,
      false AS is_disabled,
      NULL::text AS disabled_reason
    FROM public.request_types rt
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

    ORDER BY sort_order, name_ar;
    RETURN;
  END IF;

  -- Graduated: graduate + both only; active_student hidden.
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
    true AS is_eligible,
    false AS is_disabled,
    NULL::text AS disabled_reason
  FROM public.request_types rt
  WHERE rt.is_active = true
    AND rt.student_visible = true
    AND rt.request_audience IN ('graduate', 'both')
  ORDER BY rt.sort_order, rt.name_ar;
END;
$$;

-- =============================================================================
-- RPC: create_student_request
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text,
  p_title text,
  p_form_data jsonb DEFAULT '{}'::jsonb,
  p_student_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_type public.request_types%ROWTYPE;
  v_request_id uuid;
  v_request_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'نوع الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'عنوان الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = p_request_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود'
      USING ERRCODE = '22023';
  END IF;

  IF v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل'
      USING ERRCODE = '42501';
  END IF;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير متاح للطالب'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.student_requests (
    request_number,
    student_profile_id,
    request_type,
    title,
    description,
    status,
    form_data,
    student_notes
  ) VALUES (
    v_request_number,
    v_profile_id,
    v_type.code,
    btrim(p_title),
    p_student_notes,
    'draft',
    COALESCE(p_form_data, '{}'::jsonb),
    p_student_notes
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- =============================================================================
-- RPC: submit_student_request
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

  UPDATE public.student_requests
  SET
    status = 'submitted',
    submitted_at = COALESCE(submitted_at, now()),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$$;

-- =============================================================================
-- RPC: get_my_student_requests
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_student_requests(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  request_number text,
  request_type text,
  request_type_name_ar text,
  title text,
  status text,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  current_role_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_safe_limit integer;
  v_safe_offset integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  SELECT c.profile_id INTO v_profile_id
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  v_safe_limit := GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
  v_safe_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  SELECT
    sr.id,
    sr.request_number,
    sr.request_type,
    rt.name_ar AS request_type_name_ar,
    sr.title,
    sr.status,
    sr.submitted_at,
    sr.created_at,
    sr.updated_at,
    sr.current_role_key
  FROM public.student_requests sr
  LEFT JOIN public.request_types rt ON rt.code = sr.request_type
  WHERE sr.student_profile_id = v_profile_id
  ORDER BY sr.created_at DESC
  LIMIT v_safe_limit
  OFFSET v_safe_offset;
END;
$$;

-- =============================================================================
-- RLS: student_requests — block direct student INSERT
-- =============================================================================

DROP POLICY IF EXISTS sr_insert_self ON public.student_requests;

COMMENT ON TABLE public.student_requests IS
  'Student INSERT for portal users must use create_student_request() RPC. '
  'sr_insert_self removed in STUDENT-REQUEST-TYPES-RPC-RLS-01.';

-- sr_insert_priv, sr_select_*, sr_update_self, sr_update_priv unchanged.

-- =============================================================================
-- RLS: student_request_attachments — owner + eligible status + editable request
-- =============================================================================

DROP POLICY IF EXISTS sra_insert ON public.student_request_attachments;

CREATE POLICY sra_insert ON public.student_request_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      is_owner_of_request(auth.uid(), request_id)
      AND uploaded_by = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.student_requests sr
        JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
        WHERE sr.id = request_id
          AND sp.user_id = auth.uid()
          AND sp.status IN ('active', 'graduated')
          AND sr.status IN ('draft', 'returned', 'returned_for_completion')
      )
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

-- =============================================================================
-- Grants
-- =============================================================================

REVOKE ALL ON FUNCTION public.student_request_ineligible_status_message() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_request_ineligible_status_message() TO authenticated;

REVOKE ALL ON FUNCTION public.current_student_profile_for_auth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_student_profile_for_auth() TO authenticated;

REVOKE ALL ON FUNCTION public.student_request_type_is_eligible(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_request_type_is_eligible(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.assert_student_can_use_request_type(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_student_can_use_request_type(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_available_request_types_for_current_student() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_request_types_for_current_student() TO authenticated;

REVOKE ALL ON FUNCTION public.create_student_request(text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_student_request(text, text, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_student_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_student_requests(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_student_requests(integer, integer) TO authenticated;
