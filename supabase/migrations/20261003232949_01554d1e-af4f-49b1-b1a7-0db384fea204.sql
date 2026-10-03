-- Reserve the final official document number BEFORE the PDF is rendered so the
-- printed number equals official_documents.document_number. Forward-only.
ALTER TABLE public.enrollment_certificate_document_generation_attempts
  ADD COLUMN IF NOT EXISTS reserved_document_number text;

CREATE OR REPLACE FUNCTION public.reserve_enrollment_certificate_document_number(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.enrollment_certificate_document_generation_attempts%ROWTYPE;
  v_num text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.enrollment_certificate_document_generation_attempts a
  WHERE a.id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محاولة التوليد غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_current_user_act_on_step(v_attempt.workflow_step_id, 'issue_document') THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(COALESCE(v_attempt.reserved_document_number, '')), '') IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'document_number', v_attempt.reserved_document_number);
  END IF;

  IF v_attempt.status IS DISTINCT FROM 'generating' THEN
    RAISE EXCEPTION 'حجز رقم الوثيقة يتطلب محاولة بحالة generating (الحالة: %)', v_attempt.status
      USING ERRCODE = '22023';
  END IF;

  v_num := public.generate_document_number();

  UPDATE public.enrollment_certificate_document_generation_attempts
  SET reserved_document_number = v_num, updated_at = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'document_number', v_num);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_enrollment_certificate_document_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_enrollment_certificate_document_number(uuid) TO authenticated, service_role;

-- Finalize uses the reserved number when present (legacy attempts fall back).
DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.finalize_enrollment_certificate_document_generation(uuid, text, text)'::regprocedure);
  v_new := replace(
    v_def,
    'v_num := public.generate_document_number();',
    'v_num := COALESCE(NULLIF(btrim(COALESCE(v_attempt.reserved_document_number, '''')), ''''), public.generate_document_number());'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'finalize body anchor not found';
  END IF;
  EXECUTE v_new;
END
$mig$;