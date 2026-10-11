-- Fail closed: a submitted request without a configured workflow is invisible to staff.
-- The exception rolls back the status update in the same transaction.
CREATE OR REPLACE FUNCTION public.submit_student_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- P1-06: a P1 request may never be submitted without its canonical detail row.
  IF public.p1_is_atomic_submit_service(v_req.request_type)
     AND NOT public.p1_request_has_canonical_detail(p_request_id, v_req.request_type) THEN
    RAISE EXCEPTION 'P1_ATOMIC_SUBMIT_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  PERFORM set_config('student_request.submit_via_rpc', '1', true);

  UPDATE public.student_requests
  SET
    status = 'submitted',
    submitted_at = COALESCE(submitted_at, now()),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  v_init_result := public.initialize_student_request_workflow(p_request_id);

  -- A fresh submission must have a real workflow. A returned request can
  -- legitimately reuse the runtime steps created by its first submission.
  IF COALESCE((v_init_result->>'initialized')::boolean, false) IS DISTINCT FROM true
     AND NOT (
       COALESCE(v_init_result->>'reason', '') = 'already_initialized'
       AND COALESCE((v_init_result->>'existing_steps')::integer, 0) > 0
     ) THEN
    RAISE EXCEPTION 'STUDENT_REQUEST_WORKFLOW_INITIALIZATION_FAILED:%',
      COALESCE(v_init_result->>'reason', 'unknown')
      USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$;
