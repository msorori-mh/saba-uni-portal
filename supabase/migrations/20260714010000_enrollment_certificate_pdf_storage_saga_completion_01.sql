-- =============================================================================
-- ENROLLMENT-CERTIFICATE-PDF-STORAGE-SAGA-COMPLETION-01
-- Review-only migration (NOT applied in this phase).
-- Completes private Storage + generation attempts + prepare/finalize/fail RPCs,
-- replaces assert with real readiness (bucket required), reduces public verify PII,
-- and implements archive completion after issued PDF artifact exists.
--
-- Ordering: after 20260713210000_enrollment_certificate_document_issuance_and_archive_contract_01.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Private official-documents bucket (no client uploads)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'official-documents',
  'official-documents',
  false,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No INSERT/UPDATE/DELETE policies for authenticated/anon.
-- Trusted server uploads use service_role (bypasses RLS).
-- Signed download URLs are created server-side only.

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'official_documents_deny_client_select'
  ) THEN
    CREATE POLICY official_documents_deny_client_select
      ON storage.objects
      FOR SELECT
      TO authenticated, anon
      USING (bucket_id <> 'official-documents');
  END IF;
END $mig$;

-- ---------------------------------------------------------------------------
-- 2) Generation attempts ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.enrollment_certificate_document_generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'enrollment_certificate',
  status text NOT NULL
    CHECK (status IN ('prepared', 'generating', 'uploaded', 'finalized', 'failed')),
  idempotency_key text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'official-documents',
  storage_path text NOT NULL,
  official_document_id uuid NULL REFERENCES public.official_documents(id),
  workflow_step_id uuid NULL,
  file_size_bytes bigint NULL,
  content_sha256 text NULL,
  error_code text NULL,
  error_message text NULL,
  snapshot jsonb NULL,
  verification_token_hash text NULL,
  -- Cleared on finalize; returned on prepare replay so PDF QR stays consistent after crash recovery.
  verification_token_pending text NULL,
  prepared_at timestamptz NULL,
  generating_at timestamptz NULL,
  generated_at timestamptz NULL,
  uploaded_at timestamptz NULL,
  finalized_at timestamptz NULL,
  failed_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecdga_unique_idempotency UNIQUE (student_request_id, idempotency_key),
  CONSTRAINT ecdga_document_type_ec CHECK (document_type = 'enrollment_certificate')
);

CREATE INDEX IF NOT EXISTS idx_ecdga_request_status
  ON public.enrollment_certificate_document_generation_attempts (student_request_id, status);

CREATE INDEX IF NOT EXISTS idx_ecdga_storage_path
  ON public.enrollment_certificate_document_generation_attempts (storage_path);

DROP TRIGGER IF EXISTS trg_ecdga_updated_at ON public.enrollment_certificate_document_generation_attempts;
CREATE TRIGGER trg_ecdga_updated_at
  BEFORE UPDATE ON public.enrollment_certificate_document_generation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.enrollment_certificate_document_generation_attempts ENABLE ROW LEVEL SECURITY;

-- No broad authenticated policies — only SECURITY DEFINER RPCs + service role.

COMMENT ON TABLE public.enrollment_certificate_document_generation_attempts IS
  'Durable enrollment-certificate PDF generation attempts (prepare→finalize saga).';

-- ---------------------------------------------------------------------------
-- 3) Real readiness assert (bucket must exist)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_enrollment_certificate_pdf_generation_ready()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id = 'official-documents' AND b.public IS FALSE
  ) THEN
    RAISE EXCEPTION
      'HOLD_ENROLLMENT_CERTIFICATE_PDF_STORAGE_BUCKET_MISSING: حاوية الوثائق الرسمية الخاصة غير مهيأة'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_enrollment_certificate_pdf_generation_ready() IS
  'Fails closed when official-documents private bucket is missing. '
  'Storage saga + worker generator required beyond this gate.';

REVOKE ALL ON FUNCTION public.assert_enrollment_certificate_pdf_generation_ready()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._ec_new_verification_token()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN upper(encode(extensions.gen_random_bytes(24), 'hex'));
EXCEPTION
  WHEN undefined_function OR invalid_schema_name THEN
    RETURN upper(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public._ec_sha256_hex(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN encode(extensions.digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex');
EXCEPTION
  WHEN undefined_function OR invalid_schema_name THEN
    -- Fallback uniqueness only (not cryptographic) — production installs pgcrypto.
    RETURN md5(p_text) || md5(reverse(p_text));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Prepare
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_enrollment_certificate_document_generation(
  p_step_id uuid,
  p_idempotency_key text
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
  v_req public.student_requests%ROWTYPE;
  v_fee public.student_request_fee_assessments%ROWTYPE;
  v_registrar_ok boolean := false;
  v_dean_ok boolean := false;
  v_existing uuid;
  v_attempt public.enrollment_certificate_document_generation_attempts%ROWTYPE;
  v_snapshot jsonb;
  v_token text;
  v_key text := nullif(btrim(COALESCE(p_idempotency_key, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;
  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'مفتاح Idempotency غير صالح' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_current_user_act_on_step(p_step_id, 'issue_document') THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ هذا الإجراء على هذه الخطوة' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_enrollment_certificate_pdf_generation_ready();

  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخطوة غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c
  WHERE c.id = v_step.workflow_step_id;

  SELECT r.* INTO v_req FROM public.student_requests r
  WHERE r.id = v_step.student_request_id FOR UPDATE;

  IF v_req.request_type IS DISTINCT FROM 'enrollment_certificate' THEN
    RAISE EXCEPTION 'التحضير مخصص لطلب شهادة القيد فقط' USING ERRCODE = '22023';
  END IF;
  IF v_req.status IN ('cancelled', 'rejected', 'completed') THEN
    RAISE EXCEPTION 'لا يمكن إصدار وثيقة لطلب منتهٍ أو مرفوض أو ملغى' USING ERRCODE = '22023';
  END IF;
  IF v_step.status IS DISTINCT FROM 'active'
     OR COALESCE(v_step.step_key, '') IS DISTINCT FROM 'document_issuance'
     OR COALESCE(v_config.action_type, '') IS DISTINCT FROM 'issue_document'
  THEN
    RAISE EXCEPTION 'خطوة الإصدار ليست النشطة أو غير متوافقة' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id AND s.step_key = 'registrar_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_registrar_ok;
  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id AND s.step_key = 'dean_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_dean_ok;
  IF NOT v_registrar_ok OR NOT v_dean_ok THEN
    RAISE EXCEPTION 'توقيع المسجل والعميد مطلوبان قبل الإصدار' USING ERRCODE = '22023';
  END IF;

  SELECT f.* INTO v_fee FROM public.student_request_fee_assessments f
  WHERE f.request_id = v_req.id AND f.payment_status <> 'cancelled'
  ORDER BY f.created_at DESC LIMIT 1;
  IF NOT FOUND OR v_fee.payment_status NOT IN ('not_required', 'paid', 'waived') THEN
    RAISE EXCEPTION 'تقييم الرسوم يجب أن يكون not_required أو paid أو waived' USING ERRCODE = '22023';
  END IF;

  SELECT d.id INTO v_existing FROM public.official_documents d
  WHERE d.student_request_id = v_req.id AND d.status IS DISTINCT FROM 'cancelled'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'توجد وثيقة فعّالة مرتبطة بهذا الطلب مسبقاً' USING ERRCODE = '22023';
  END IF;

  -- Idempotent replay (return pending token until finalized so QR stays consistent)
  SELECT a.* INTO v_attempt
  FROM public.enrollment_certificate_document_generation_attempts a
  WHERE a.student_request_id = v_req.id AND a.idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'storage_bucket', v_attempt.storage_bucket,
      'storage_path', v_attempt.storage_path,
      'snapshot', v_attempt.snapshot,
      'verification_token', CASE
        WHEN v_attempt.status = 'finalized' THEN NULL
        ELSE v_attempt.verification_token_pending
      END,
      'official_document_id', v_attempt.official_document_id
    );
  END IF;

  v_snapshot := public.build_enrollment_certificate_issuance_snapshot(v_req.student_profile_id);
  v_token := upper(public._ec_new_verification_token());

  INSERT INTO public.enrollment_certificate_document_generation_attempts (
    student_request_id,
    document_type,
    status,
    idempotency_key,
    storage_bucket,
    storage_path,
    workflow_step_id,
    snapshot,
    verification_token_hash,
    verification_token_pending,
    prepared_at,
    created_by
  )
  VALUES (
    v_req.id,
    'enrollment_certificate',
    'prepared',
    v_key,
    'official-documents',
    'pending', -- placeholder then update with id
    v_step.id,
    v_snapshot,
    public._ec_sha256_hex(v_token),
    v_token,
    now(),
    v_uid
  )
  RETURNING * INTO v_attempt;

  UPDATE public.enrollment_certificate_document_generation_attempts
  SET storage_path = 'enrollment-certificates/' || v_req.id::text || '/' || v_attempt.id::text || '.pdf',
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'storage_bucket', v_attempt.storage_bucket,
    'storage_path', v_attempt.storage_path,
    'snapshot', v_attempt.snapshot,
    'verification_token', v_token,
    'verify_path', '/verify-document?code=' || v_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_enrollment_certificate_document_generation(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_enrollment_certificate_document_generation(uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Mark generating / uploaded / fail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_enrollment_certificate_document_generating(
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.enrollment_certificate_document_generation_attempts%ROWTYPE;
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
  IF v_attempt.status = 'finalized' THEN
    RETURN jsonb_build_object('success', true, 'status', 'finalized', 'attempt_id', v_attempt.id);
  END IF;
  IF v_attempt.status NOT IN ('prepared', 'failed', 'generating') THEN
    RAISE EXCEPTION 'لا يمكن بدء التوليد من الحالة: %', v_attempt.status USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_current_user_act_on_step(v_attempt.workflow_step_id, 'issue_document') THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollment_certificate_document_generation_attempts
  SET status = 'generating',
      generating_at = COALESCE(generating_at, now()),
      error_code = NULL,
      error_message = NULL,
      failed_at = NULL,
      updated_at = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object('success', true, 'status', 'generating', 'attempt_id', v_attempt.id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_enrollment_certificate_document_generating(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_enrollment_certificate_document_generating(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_enrollment_certificate_document_uploaded(
  p_attempt_id uuid,
  p_sha256 text,
  p_byte_length bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.enrollment_certificate_document_generation_attempts%ROWTYPE;
  v_sha text := lower(nullif(btrim(COALESCE(p_sha256, '')), ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;
  IF v_sha IS NULL OR length(v_sha) < 32 OR p_byte_length IS NULL OR p_byte_length <= 0 THEN
    RAISE EXCEPTION 'hash أو الحجم غير صالح' USING ERRCODE = '22023';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.enrollment_certificate_document_generation_attempts a
  WHERE a.id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محاولة التوليد غير موجودة' USING ERRCODE = 'P0002';
  END IF;
  IF v_attempt.status = 'finalized' THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'finalized', 'attempt_id', v_attempt.id,
      'official_document_id', v_attempt.official_document_id
    );
  END IF;
  IF v_attempt.status = 'uploaded'
     AND v_attempt.content_sha256 = v_sha
     AND v_attempt.file_size_bytes = p_byte_length
  THEN
    RETURN jsonb_build_object('success', true, 'status', 'uploaded', 'attempt_id', v_attempt.id, 'idempotent', true);
  END IF;
  IF v_attempt.status NOT IN ('generating', 'prepared', 'uploaded') THEN
    RAISE EXCEPTION 'لا يمكن تسجيل الرفع من الحالة: %', v_attempt.status USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_current_user_act_on_step(v_attempt.workflow_step_id, 'issue_document') THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollment_certificate_document_generation_attempts
  SET status = 'uploaded',
      content_sha256 = v_sha,
      file_size_bytes = p_byte_length,
      generated_at = COALESCE(generated_at, now()),
      uploaded_at = now(),
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'uploaded',
    'attempt_id', v_attempt.id,
    'storage_path', v_attempt.storage_path,
    'content_sha256', v_attempt.content_sha256,
    'file_size_bytes', v_attempt.file_size_bytes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_enrollment_certificate_document_uploaded(uuid, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_enrollment_certificate_document_uploaded(uuid, text, bigint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fail_enrollment_certificate_document_generation(
  p_attempt_id uuid,
  p_error_code text,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.enrollment_certificate_document_generation_attempts%ROWTYPE;
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
  IF v_attempt.status = 'finalized' THEN
    RAISE EXCEPTION 'لا يمكن إنزال محاولة مكتملة إلى failed' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_current_user_act_on_step(v_attempt.workflow_step_id, 'issue_document') THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollment_certificate_document_generation_attempts
  SET status = 'failed',
      error_code = left(COALESCE(p_error_code, 'GENERATION_FAILED'), 120),
      error_message = left(COALESCE(p_error_message, 'فشل غير محدد'), 2000),
      failed_at = now(),
      updated_at = now()
  WHERE id = v_attempt.id;

  -- Intentionally no workflow mutation, no official_documents row, no storage delete.
  RETURN jsonb_build_object('success', true, 'status', 'failed', 'attempt_id', p_attempt_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_enrollment_certificate_document_generation(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_enrollment_certificate_document_generation(uuid, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Finalize (creates official_documents exactly once + completes issuance)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_enrollment_certificate_document_generation(
  p_attempt_id uuid,
  p_comment text DEFAULT NULL,
  p_verification_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.enrollment_certificate_document_generation_attempts%ROWTYPE;
  v_req public.student_requests%ROWTYPE;
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_doc_id uuid;
  v_num text;
  v_code text;
  v_snap jsonb;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_next_runtime_step_id uuid;
  v_actor_unit_id uuid;
  v_actor_role_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  PERFORM public.assert_enrollment_certificate_pdf_generation_ready();

  SELECT a.* INTO v_attempt
  FROM public.enrollment_certificate_document_generation_attempts a
  WHERE a.id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محاولة التوليد غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  -- Exactly-once finalize
  IF v_attempt.status = 'finalized' AND v_attempt.official_document_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'status', 'finalized',
      'attempt_id', v_attempt.id,
      'official_document_id', v_attempt.official_document_id,
      'storage_path', v_attempt.storage_path
    );
  END IF;

  IF v_attempt.status IS DISTINCT FROM 'uploaded' THEN
    RAISE EXCEPTION 'إنهاء الإصدار يتطلب محاولة بحالة uploaded (الحالة: %)', v_attempt.status
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(v_attempt.content_sha256, '')), '') IS NULL
     OR COALESCE(v_attempt.file_size_bytes, 0) <= 0 THEN
    RAISE EXCEPTION 'hash أو حجم الملف غير مكتمل' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = v_attempt.storage_bucket
      AND o.name = v_attempt.storage_path
  ) THEN
    RAISE EXCEPTION 'الملف غير موجود في التخزين الداخلي' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_current_user_act_on_step(v_attempt.workflow_step_id, 'issue_document') THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_req FROM public.student_requests r
  WHERE r.id = v_attempt.student_request_id FOR UPDATE;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
  WHERE s.id = v_attempt.workflow_step_id FOR UPDATE;

  IF v_step.status IS DISTINCT FROM 'active' OR COALESCE(v_step.step_key, '') IS DISTINCT FROM 'document_issuance' THEN
    RAISE EXCEPTION 'خطوة الإصدار ليست نشطة' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.official_documents d
    WHERE d.student_request_id = v_req.id AND d.status IS DISTINCT FROM 'cancelled'
  ) THEN
    RAISE EXCEPTION 'توجد وثيقة فعّالة مرتبطة بهذا الطلب مسبقاً' USING ERRCODE = '22023';
  END IF;

  v_snap := COALESCE(v_attempt.snapshot, '{}'::jsonb);
  v_num := public.generate_document_number();
  IF NULLIF(btrim(COALESCE(p_verification_token, '')), '') IS NOT NULL THEN
    IF public._ec_sha256_hex(upper(btrim(p_verification_token)))
         IS DISTINCT FROM v_attempt.verification_token_hash THEN
      RAISE EXCEPTION 'رمز التحقق لا يطابق محاولة التوليد' USING ERRCODE = '22023';
    END IF;
    v_code := upper(btrim(p_verification_token));
  ELSIF NULLIF(btrim(COALESCE(v_attempt.verification_token_pending, '')), '') IS NOT NULL THEN
    v_code := upper(btrim(v_attempt.verification_token_pending));
  ELSE
    RAISE EXCEPTION 'رمز التحقق مفقود — أعد التحضير أو مرّر الرمز إلى Finalize'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.official_documents (
    student_profile_id,
    student_request_id,
    document_type,
    document_number,
    verification_code,
    status,
    pdf_url,
    issued_at,
    issued_by,
    notes
  )
  VALUES (
    v_req.student_profile_id,
    v_req.id,
    'enrollment_certificate',
    v_num,
    v_code,
    'issued',
    v_attempt.storage_path,
    now(),
    v_uid,
    left('sha256=' || v_attempt.content_sha256 || ';bytes=' || v_attempt.file_size_bytes::text, 500)
  )
  RETURNING id INTO v_doc_id;

  INSERT INTO public.enrollment_certificate_document_details (
    official_document_id,
    student_request_id,
    student_profile_id,
    academic_number,
    student_name_ar,
    department_id,
    department_name_ar,
    program_id,
    program_name_ar,
    study_system,
    student_study_status,
    academic_year_id,
    academic_year_name,
    semester_id,
    semester_name,
    level_id,
    level_name,
    enrollment_status,
    issued_snapshot_at
  )
  VALUES (
    v_doc_id,
    v_req.id,
    v_req.student_profile_id,
    v_snap->>'academic_number',
    v_snap->>'student_name_ar',
    NULLIF(v_snap->>'department_id', '')::uuid,
    v_snap->>'department_name_ar',
    NULLIF(v_snap->>'program_id', '')::uuid,
    v_snap->>'program_name_ar',
    v_snap->>'study_system',
    v_snap->>'student_study_status',
    NULLIF(v_snap->>'academic_year_id', '')::uuid,
    v_snap->>'academic_year_name',
    NULLIF(v_snap->>'semester_id', '')::uuid,
    v_snap->>'semester_name',
    NULLIF(v_snap->>'level_id', '')::uuid,
    v_snap->>'level_name',
    v_snap->>'enrollment_status',
    COALESCE((v_snap->>'issued_snapshot_at')::timestamptz, now())
  );

  -- Workflow: issued → activate archive
  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'issued'
  ORDER BY t.is_default DESC, t.created_at
  LIMIT 1;

  IF v_transition.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد انتقال للنتيجة issued' USING ERRCODE = '22023';
  END IF;

  IF v_transition.to_step_id IS NOT NULL THEN
    SELECT s.id INTO v_next_runtime_step_id
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id
      AND s.workflow_step_id = v_transition.to_step_id
    LIMIT 1;
    IF v_next_runtime_step_id IS NULL THEN
      RAISE EXCEPTION 'خطوة الأرشفة غير مهيأة في runtime' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.student_request_workflow_steps
  SET status = 'completed',
      decision = 'issued',
      comment = p_comment,
      completed_by = v_uid,
      completed_at = now(),
      updated_at = now()
  WHERE id = v_step.id;

  IF v_next_runtime_step_id IS NOT NULL THEN
    UPDATE public.student_request_workflow_steps
    SET status = 'active', updated_at = now()
    WHERE id = v_next_runtime_step_id AND status IS DISTINCT FROM 'completed';
  END IF;

  UPDATE public.student_requests
  SET status = 'under_review',
      current_step_index = COALESCE(
        (SELECT step_order FROM public.student_request_workflow_steps WHERE id = v_next_runtime_step_id),
        current_step_index
      ),
      updated_at = now()
  WHERE id = v_req.id;

  SELECT a.unit_id, a.role_id INTO v_actor_unit_id, v_actor_role_id
  FROM public.current_user_processing_assignments() a
  WHERE a.unit_id IS NOT DISTINCT FROM v_step.processing_unit_id
  LIMIT 1;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type,
    actor_user_id, actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_req.id, v_step.id, 'document_issued',
    v_uid,
    COALESCE(v_actor_unit_id, v_step.processing_unit_id),
    COALESCE(v_actor_role_id, v_step.processing_role_id),
    p_comment,
    jsonb_build_object(
      'action', 'issue_document',
      'action_result', 'issued',
      'official_document_id', v_doc_id,
      'attempt_id', v_attempt.id,
      'document_number', v_num
    ),
    true
  );

  UPDATE public.enrollment_certificate_document_generation_attempts
  SET status = 'finalized',
      official_document_id = v_doc_id,
      finalized_at = now(),
      verification_token_hash = public._ec_sha256_hex(v_code),
      verification_token_pending = NULL,
      updated_at = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'status', 'finalized',
    'attempt_id', v_attempt.id,
    'official_document_id', v_doc_id,
    'document_number', v_num,
    'verification_code', v_code,
    'storage_path', v_attempt.storage_path,
    'next_step_id', v_next_runtime_step_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_enrollment_certificate_document_generation(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_enrollment_certificate_document_generation(uuid, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) issue RPC: prefer attempt finalize path via payload.attempt_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_enrollment_certificate_from_workflow_step(
  p_step_id uuid,
  p_comment text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id uuid;
  v_token text;
BEGIN
  v_attempt_id := NULLIF(p_payload->>'attempt_id', '')::uuid;
  v_token := NULLIF(p_payload->>'verification_token', '');
  IF v_attempt_id IS NOT NULL THEN
    RETURN public.finalize_enrollment_certificate_document_generation(v_attempt_id, p_comment, v_token);
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'code', 'ENROLLMENT_CERTIFICATE_USE_PDF_STORAGE_SAGA',
    'message_ar',
      'يجب تنفيذ مسار Prepare → Generate/Upload → Finalize لإصدار شهادة القيد. لا يُنشأ سجل الوثيقة قبل اكتمال الملف.',
    'step_id', p_step_id,
    'payload', COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.issue_enrollment_certificate_from_workflow_step(uuid, text, jsonb) IS
  'Delegates to finalize when payload.attempt_id present; otherwise returns USE_PDF_STORAGE_SAGA.';

-- ---------------------------------------------------------------------------
-- 8) Archive completion (no longer HTML HOLD after issued PDF exists)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_enrollment_certificate_from_workflow_step(
  p_step_id uuid,
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
  v_req public.student_requests%ROWTYPE;
  v_doc public.official_documents%ROWTYPE;
  v_registrar_ok boolean := false;
  v_dean_ok boolean := false;
  v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_actor_unit_id uuid;
  v_actor_role_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_current_user_act_on_step(p_step_id, 'archive') THEN
    RAISE EXCEPTION 'غير مصرح بتنفيذ هذا الإجراء على هذه الخطوة' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخطوة غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already archived
  IF v_step.status = 'completed' AND v_step.decision = 'archived' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'step_id', p_step_id, 'status', 'archived');
  END IF;

  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c WHERE c.id = v_step.workflow_step_id;
  SELECT r.* INTO v_req FROM public.student_requests r WHERE r.id = v_step.student_request_id FOR UPDATE;

  IF v_step.status IS DISTINCT FROM 'active'
     OR COALESCE(v_step.step_key, '') IS DISTINCT FROM 'archive'
     OR COALESCE(v_config.action_type, '') IS DISTINCT FROM 'archive'
  THEN
    RAISE EXCEPTION 'خطوة الأرشفة ليست النشطة أو غير متوافقة' USING ERRCODE = '22023';
  END IF;
  IF v_req.status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'لا يمكن أرشفة طلب مرفوض أو ملغى' USING ERRCODE = '22023';
  END IF;

  SELECT d.* INTO v_doc FROM public.official_documents d
  WHERE d.student_request_id = v_req.id AND d.status IS DISTINCT FROM 'cancelled'
  ORDER BY d.issued_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد وثيقة مرتبطة بالطلب' USING ERRCODE = '22023';
  END IF;
  IF v_doc.status = 'archived' THEN
    -- Sync step if needed then return
    UPDATE public.student_request_workflow_steps
    SET status = 'completed', decision = 'archived', completed_by = COALESCE(completed_by, v_uid),
        completed_at = COALESCE(completed_at, now()), updated_at = now()
    WHERE id = v_step.id AND status IS DISTINCT FROM 'completed';
    UPDATE public.student_requests
    SET status = 'completed', updated_at = now()
    WHERE id = v_req.id AND status IS DISTINCT FROM 'completed';
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'document_id', v_doc.id);
  END IF;
  IF v_doc.status IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'الأرشفة تتطلب وثيقة صادرة' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(v_doc.pdf_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'الملف الفعلي للوثيقة غير موجود' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id AND s.step_key = 'registrar_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_registrar_ok;
  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id AND s.step_key = 'dean_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_dean_ok;
  IF NOT v_registrar_ok OR NOT v_dean_ok THEN
    RAISE EXCEPTION 'التوقيعات يجب أن تكون مكتملة قبل الأرشفة' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = 'archived'
  ORDER BY t.is_default DESC, t.created_at LIMIT 1;
  IF v_transition.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد انتقال للنتيجة archived' USING ERRCODE = '22023';
  END IF;

  UPDATE public.official_documents
  SET status = 'archived', updated_at = now()
  WHERE id = v_doc.id AND status = 'issued';

  UPDATE public.student_request_workflow_steps
  SET status = 'completed', decision = 'archived', comment = p_comment,
      completed_by = v_uid, completed_at = now(), updated_at = now()
  WHERE id = v_step.id;

  UPDATE public.student_requests
  SET status = 'completed', updated_at = now()
  WHERE id = v_req.id;

  SELECT a.unit_id, a.role_id INTO v_actor_unit_id, v_actor_role_id
  FROM public.current_user_processing_assignments() a
  WHERE a.unit_id IS NOT DISTINCT FROM v_step.processing_unit_id LIMIT 1;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type,
    actor_user_id, actor_unit_id, actor_role_id, message_ar, payload, visible_to_student
  ) VALUES (
    v_req.id, v_step.id, 'archived',
    v_uid,
    COALESCE(v_actor_unit_id, v_step.processing_unit_id),
    COALESCE(v_actor_role_id, v_step.processing_role_id),
    p_comment,
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'action', 'archive', 'action_result', 'archived', 'document_id', v_doc.id
    ),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'step_id', p_step_id,
    'document_id', v_doc.id,
    'request_status', 'completed'
  );
END;
$$;

COMMENT ON FUNCTION public.archive_enrollment_certificate_from_workflow_step(uuid, text, jsonb) IS
  'Archives issued enrollment certificate document and completes the request. Idempotent.';

-- ---------------------------------------------------------------------------
-- 9) Public verify — minimal fields (no academic number / name)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_document(_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.official_documents%ROWTYPE;
  v_q text := upper(trim(COALESCE(_query, '')));
BEGIN
  IF length(v_q) < 6 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_doc
  FROM public.official_documents
  WHERE upper(document_number) = v_q
     OR upper(verification_code) = v_q
  LIMIT 1;

  IF v_doc.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'valid', v_doc.status IN ('issued', 'archived'),
    'document_type', v_doc.document_type,
    'document_number', v_doc.document_number,
    'status', v_doc.status,
    'issued_at', v_doc.issued_at,
    'reason', CASE
      WHEN v_doc.status = 'cancelled' THEN 'cancelled'
      WHEN v_doc.status NOT IN ('issued', 'archived') THEN 'not_valid_status'
      ELSE NULL
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_document(text) TO anon, authenticated;

