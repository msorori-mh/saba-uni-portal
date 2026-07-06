-- STUDENT-REQUEST-TYPES-RLS-SUBMIT-BYPASS-FIX-01
-- Close direct UPDATE bypass: draft/returned -> submitted without submit_student_request RPC.
-- Requires: 20260710140000_student_request_types_rpc_rls.sql
-- No data writes, no VALIDATE CONSTRAINT, no seed.

-- =============================================================================
-- 1. RLS: sr_update_self — block student transition to submitted via direct UPDATE
-- =============================================================================

DROP POLICY IF EXISTS sr_update_self ON public.student_requests;

CREATE POLICY sr_update_self ON public.student_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status = ANY (ARRAY[
      'draft',
      'returned',
      'returned_for_completion',
      'submitted',
      'under_review',
      'in_review'
    ])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_profile_id
        AND sp.user_id = auth.uid()
    )
    -- submitted / in_review / under_review only via submit_student_request() RPC.
    AND status = ANY (ARRAY['draft', 'returned', 'returned_for_completion', 'cancelled'])
  );

COMMENT ON POLICY sr_update_self ON public.student_requests IS
  'Student may edit draft/returned requests or cancel; cannot set status to submitted '
  'directly. Use submit_student_request() RPC which re-checks audience eligibility.';

-- sr_update_priv and all SELECT policies unchanged.

-- =============================================================================
-- 2. Trigger: protect_student_request — block direct submit; allow RPC flag
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_student_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_via_rpc boolean := COALESCE(current_setting('student_request.submit_via_rpc', true), '') = '1';
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid
  ) THEN
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('approved','completed') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.completed_at       := OLD.completed_at;
      NEW.cancelled_at       := COALESCE(NEW.cancelled_at, now());
      RETURN NEW;
    END IF;

    -- Submit transitions only when submit_student_request() set the session flag
    -- (RPC already ran assert_student_can_use_request_type).
    IF v_via_rpc
       AND OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      IF OLD.status IN ('returned', 'returned_for_completion') THEN
        NEW.rejection_reason := NULL;
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
      ELSE
        NEW.reviewed_by        := OLD.reviewed_by;
        NEW.reviewed_at        := OLD.reviewed_at;
        NEW.rejection_reason   := OLD.rejection_reason;
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      RAISE EXCEPTION 'يجب إرسال الطلب عبر submit_student_request() وليس التحديث المباشر'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('returned','returned_for_completion')
       AND NEW.status IN ('returned','returned_for_completion') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$$;

-- =============================================================================
-- 3. RPC: submit_student_request — set bypass flag for trigger (replaces prior def)
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

  PERFORM set_config('student_request.submit_via_rpc', '1', true);

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

REVOKE ALL ON FUNCTION public.submit_student_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid) TO authenticated;
