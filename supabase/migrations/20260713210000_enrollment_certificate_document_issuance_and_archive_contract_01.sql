-- =============================================================================
-- ENROLLMENT-CERTIFICATE-DOCUMENT-ISSUANCE-AND-ARCHIVE-CONTRACT-01
-- Schema + specialized RPCs prepared for review. NOT applied to production here.
--
-- Completes durable request↔ document linkage and typed enrollment snapshot.
-- Specialized issue/archive RPCs validate the full path then FAIL CLOSED on:
--   HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING
-- because no reusable server PDF/Storage generator exists in this repo.
-- Creating official_documents alone is NOT complete issuance.
--
-- No data mutation of trial request 93807768-…, no cleanup, no backfill.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- G3 support: allow signed / issued / archived on runtime decision + events
-- ---------------------------------------------------------------------------

ALTER TABLE public.student_request_workflow_steps
  DROP CONSTRAINT IF EXISTS student_request_workflow_steps_decision_chk;

ALTER TABLE public.student_request_workflow_steps
  ADD CONSTRAINT student_request_workflow_steps_decision_chk
  CHECK (
    decision IS NULL
    OR decision IN (
      'approved',
      'rejected',
      'returned',
      'skipped',
      'completed',
      'signed',
      'issued',
      'archived'
    )
  );

ALTER TABLE public.student_request_workflow_events
  DROP CONSTRAINT IF EXISTS student_request_workflow_events_event_type_chk;

ALTER TABLE public.student_request_workflow_events
  ADD CONSTRAINT student_request_workflow_events_event_type_chk
  CHECK (event_type IN (
    'created',
    'submitted',
    'step_entered',
    'assigned',
    'commented',
    'approved',
    'rejected',
    'returned',
    'attachment_requested',
    'payment_requested',
    'signed',
    'archived',
    'document_issued',
    'completed',
    'cancelled'
  ));

-- ---------------------------------------------------------------------------
-- G1: durable student_requests ↔ official_documents link
-- ---------------------------------------------------------------------------

ALTER TABLE public.official_documents
  ADD COLUMN IF NOT EXISTS student_request_id uuid
    REFERENCES public.student_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_official_documents_student_request_id
  ON public.official_documents(student_request_id);

-- At most one non-cancelled document per request (NULL allowed for legacy rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_official_documents_one_active_per_request
  ON public.official_documents(student_request_id)
  WHERE student_request_id IS NOT NULL
    AND status IS DISTINCT FROM 'cancelled';

DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.official_documents'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.official_documents DROP CONSTRAINT %I', v_conname);
  END LOOP;

  ALTER TABLE public.official_documents
    ADD CONSTRAINT official_documents_status_chk
    CHECK (status IN ('draft', 'issued', 'cancelled', 'archived'));
END $$;

COMMENT ON COLUMN public.official_documents.student_request_id IS
  'Optional durable link to student_requests. NULL for legacy / ad-hoc documents. '
  'At most one non-cancelled document per request (partial unique index).';

-- ---------------------------------------------------------------------------
-- G2: typed enrollment certificate details (issuance snapshot)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.enrollment_certificate_document_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_document_id uuid NOT NULL
    REFERENCES public.official_documents(id) ON DELETE CASCADE,
  student_request_id uuid NOT NULL
    REFERENCES public.student_requests(id) ON DELETE CASCADE,
  student_profile_id uuid NOT NULL
    REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
  academic_number text NOT NULL,
  student_name_ar text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name_ar text NOT NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  program_name_ar text NOT NULL,
  study_system text,
  student_study_status text,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  academic_year_name text NOT NULL,
  semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL,
  semester_name text NOT NULL,
  level_id uuid REFERENCES public.academic_levels(id) ON DELETE SET NULL,
  level_name text NOT NULL,
  enrollment_status text NOT NULL,
  issued_snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_certificate_document_details_doc_unique
    UNIQUE (official_document_id),
  CONSTRAINT enrollment_certificate_document_details_request_unique
    UNIQUE (student_request_id)
);

CREATE INDEX IF NOT EXISTS idx_ecdd_student_profile
  ON public.enrollment_certificate_document_details(student_profile_id);

CREATE INDEX IF NOT EXISTS idx_ecdd_request
  ON public.enrollment_certificate_document_details(student_request_id);

COMMENT ON TABLE public.enrollment_certificate_document_details IS
  'Issuance-time academic snapshot for enrollment certificates. Verification and '
  'document views must prefer this snapshot over live student profile data.';

GRANT SELECT, INSERT, UPDATE ON public.enrollment_certificate_document_details TO authenticated;
GRANT ALL ON public.enrollment_certificate_document_details TO service_role;

ALTER TABLE public.enrollment_certificate_document_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enrollment_certificate_document_details'
      AND policyname = 'ecdd_select'
  ) THEN
    CREATE POLICY ecdd_select ON public.enrollment_certificate_document_details
      FOR SELECT TO authenticated
      USING (
        public.is_owner_of_request(auth.uid(), student_request_id)
        OR public.has_any_role(
          auth.uid(),
          ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enrollment_certificate_document_details'
      AND policyname = 'ecdd_staff_insert'
  ) THEN
    CREATE POLICY ecdd_staff_insert ON public.enrollment_certificate_document_details
      FOR INSERT TO authenticated
      WITH CHECK (
        public.has_any_role(
          auth.uid(),
          ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enrollment_certificate_document_details'
      AND policyname = 'ecdd_staff_update'
  ) THEN
    CREATE POLICY ecdd_staff_update ON public.enrollment_certificate_document_details
      FOR UPDATE TO authenticated
      USING (
        public.has_any_role(
          auth.uid(),
          ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']
        )
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_ecdd_updated_at ON public.enrollment_certificate_document_details;
CREATE TRIGGER trg_ecdd_updated_at
  BEFORE UPDATE ON public.enrollment_certificate_document_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- PDF/Storage gate — no inventing file generation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_enrollment_certificate_pdf_generation_ready()
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Catalog scan is intentional: no official-documents Storage bucket / PDF
  -- generator exists in this codebase path. Keep fail-closed until a durable
  -- reusable generator is introduced in a later phase.
  RAISE EXCEPTION
    'HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING: مولّد PDF/Storage لشهادة القيد غير متوفر كمسار خادم قابل لإعادة الاستخدام — إنشاء صف official_documents وحده لا يُعد إصداراً كاملاً'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.assert_enrollment_certificate_pdf_generation_ready() IS
  'Always raises HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING until '
  'a reusable server PDF/Storage generator is introduced. Do not remove without '
  'replacing with a real generator that writes an accessible file artifact.';

REVOKE ALL ON FUNCTION public.assert_enrollment_certificate_pdf_generation_ready()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot builder (read-only; used by issue RPC after PDF gate is lifted)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_enrollment_certificate_issuance_snapshot(
  p_student_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sp public.student_profiles%ROWTYPE;
  v_sas public.student_academic_status%ROWTYPE;
  v_dept_name text;
  v_program_name text;
  v_year_name text;
  v_semester_name text;
  v_level_name text;
BEGIN
  SELECT * INTO v_sp
  FROM public.student_profiles
  WHERE id = p_student_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_sas
  FROM public.student_academic_status
  WHERE student_profile_id = p_student_profile_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  SELECT d.name_ar INTO v_dept_name
  FROM public.departments d
  WHERE d.id = v_sp.department_id;

  SELECT p.name_ar INTO v_program_name
  FROM public.programs p
  WHERE p.id = v_sp.program_id;

  IF v_sas.academic_year_id IS NOT NULL THEN
    SELECT ay.name INTO v_year_name
    FROM public.academic_years ay
    WHERE ay.id = v_sas.academic_year_id;
  END IF;

  IF v_sas.semester_id IS NOT NULL THEN
    SELECT s.name INTO v_semester_name
    FROM public.semesters s
    WHERE s.id = v_sas.semester_id;
  END IF;

  IF v_sas.level_id IS NOT NULL THEN
    SELECT l.name INTO v_level_name
    FROM public.academic_levels l
    WHERE l.id = v_sas.level_id;
  END IF;

  IF NULLIF(btrim(COALESCE(v_sp.academic_number, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(v_sp.full_name_ar, '')), '') IS NULL
     OR v_sp.department_id IS NULL
     OR NULLIF(btrim(COALESCE(v_dept_name, '')), '') IS NULL
     OR v_sp.program_id IS NULL
     OR NULLIF(btrim(COALESCE(v_program_name, '')), '') IS NULL
     OR v_sas.id IS NULL
     OR v_sas.academic_year_id IS NULL
     OR NULLIF(btrim(COALESCE(v_year_name, '')), '') IS NULL
     OR v_sas.semester_id IS NULL
     OR NULLIF(btrim(COALESCE(v_semester_name, '')), '') IS NULL
     OR v_sas.level_id IS NULL
     OR NULLIF(btrim(COALESCE(v_level_name, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(v_sas.enrollment_status, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'اللقطة الأكاديمية غير مكتملة — لا يمكن إصدار شهادة القيد'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'student_profile_id', v_sp.id,
    'academic_number', v_sp.academic_number,
    'student_name_ar', v_sp.full_name_ar,
    'department_id', v_sp.department_id,
    'department_name_ar', v_dept_name,
    'program_id', v_sp.program_id,
    'program_name_ar', v_program_name,
    'study_system', v_sp.study_system,
    'student_study_status', v_sp.student_study_status,
    'academic_year_id', v_sas.academic_year_id,
    'academic_year_name', v_year_name,
    'semester_id', v_sas.semester_id,
    'semester_name', v_semester_name,
    'level_id', v_sas.level_id,
    'level_name', v_level_name,
    'enrollment_status', v_sas.enrollment_status,
    'issued_snapshot_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.build_enrollment_certificate_issuance_snapshot(uuid) IS
  'Builds complete academic snapshot for enrollment certificate issuance. '
  'Raises if any required field is missing. Prefer details table after issue.';

REVOKE ALL ON FUNCTION public.build_enrollment_certificate_issuance_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- G4: specialized issuance RPC (fail-closed on PDF before any issued write)
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
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_req public.student_requests%ROWTYPE;
  v_fee public.student_request_fee_assessments%ROWTYPE;
  v_registrar_ok boolean := false;
  v_dean_ok boolean := false;
  v_snapshot jsonb;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_current_user_act_on_step(p_step_id, 'issue_document') THEN
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

  SELECT r.* INTO v_req
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id
  FOR UPDATE;

  IF v_req.request_type IS DISTINCT FROM 'enrollment_certificate' THEN
    RAISE EXCEPTION 'الإصدار مخصص لطلب شهادة القيد فقط'
      USING ERRCODE = '22023';
  END IF;

  IF v_req.status IN ('cancelled', 'rejected', 'completed') THEN
    RAISE EXCEPTION 'لا يمكن إصدار وثيقة لطلب منتهٍ أو مرفوض أو ملغى'
      USING ERRCODE = '22023';
  END IF;

  IF v_step.status IS DISTINCT FROM 'active'
     OR COALESCE(v_step.step_key, '') IS DISTINCT FROM 'document_issuance'
     OR COALESCE(v_config.action_type, '') IS DISTINCT FROM 'issue_document'
  THEN
    RAISE EXCEPTION 'خطوة الإصدار ليست النشطة أو غير متوافقة'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id
      AND s.step_key = 'registrar_signature'
      AND s.status = 'completed'
      AND s.decision = 'signed'
  ) INTO v_registrar_ok;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id
      AND s.step_key = 'dean_signature'
      AND s.status = 'completed'
      AND s.decision = 'signed'
  ) INTO v_dean_ok;

  IF NOT v_registrar_ok OR NOT v_dean_ok THEN
    RAISE EXCEPTION 'توقيع المسجل والعميد مطلوبان قبل الإصدار'
      USING ERRCODE = '22023';
  END IF;

  SELECT f.* INTO v_fee
  FROM public.student_request_fee_assessments f
  WHERE f.request_id = v_req.id
    AND f.payment_status <> 'cancelled'
  ORDER BY f.created_at DESC
  LIMIT 1;

  IF NOT FOUND
     OR v_fee.payment_status NOT IN ('not_required', 'paid', 'waived')
  THEN
    RAISE EXCEPTION 'تقييم الرسوم يجب أن يكون not_required أو paid أو waived'
      USING ERRCODE = '22023';
  END IF;

  SELECT d.id INTO v_existing
  FROM public.official_documents d
  WHERE d.student_request_id = v_req.id
    AND d.status IS DISTINCT FROM 'cancelled'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'توجد وثيقة فعّالة مرتبطة بهذا الطلب مسبقاً'
      USING ERRCODE = '22023';
  END IF;

  -- Snapshot completeness gate (raises if incomplete).
  v_snapshot := public.build_enrollment_certificate_issuance_snapshot(v_req.student_profile_id);

  -- CRITICAL: fail before creating document/file/status transitions.
  -- G4: do not treat row insert as issuance without durable file generation.
  PERFORM public.assert_enrollment_certificate_pdf_generation_ready();

  -- Unreachable until PDF generator is implemented.
  RETURN jsonb_build_object(
    'success', false,
    'code', 'HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING',
    'step_id', p_step_id,
    'snapshot_keys', (SELECT array_agg(key) FROM jsonb_object_keys(v_snapshot) AS key),
    'comment', p_comment,
    'payload', COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.issue_enrollment_certificate_from_workflow_step(uuid, text, jsonb) IS
  'Enrollment certificate issuance from document_issuance step. Validates signatures, '
  'fees, snapshot, and uniqueness then raises PDF HOLD before any issued write.';

REVOKE ALL ON FUNCTION public.issue_enrollment_certificate_from_workflow_step(uuid, text, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_enrollment_certificate_from_workflow_step(uuid, text, jsonb)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- G6: specialized archive RPC (requires issued linked document + accessible file)
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.can_current_user_act_on_step(p_step_id, 'archive') THEN
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

  SELECT r.* INTO v_req
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id
  FOR UPDATE;

  IF v_step.status IS DISTINCT FROM 'active'
     OR COALESCE(v_step.step_key, '') IS DISTINCT FROM 'archive'
     OR COALESCE(v_config.action_type, '') IS DISTINCT FROM 'archive'
  THEN
    RAISE EXCEPTION 'خطوة الأرشفة ليست النشطة أو غير متوافقة'
      USING ERRCODE = '22023';
  END IF;

  IF v_req.status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'لا يمكن أرشفة طلب مرفوض أو ملغى'
      USING ERRCODE = '22023';
  END IF;

  SELECT d.* INTO v_doc
  FROM public.official_documents d
  WHERE d.student_request_id = v_req.id
    AND d.status IS DISTINCT FROM 'cancelled'
  ORDER BY d.issued_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا توجد وثيقة مرتبطة بالطلب'
      USING ERRCODE = '22023';
  END IF;

  IF v_doc.status IS DISTINCT FROM 'issued' AND v_doc.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'الأرشفة تتطلب وثيقة صادرة'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(COALESCE(v_doc.pdf_url, '')), '') IS NULL THEN
    RAISE EXCEPTION
      'HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING: الملف الفعلي للوثيقة غير موجود أو غير قابل للوصول داخلياً'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id
      AND s.step_key = 'registrar_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_registrar_ok;

  SELECT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_req.id
      AND s.step_key = 'dean_signature'
      AND s.status = 'completed' AND s.decision = 'signed'
  ) INTO v_dean_ok;

  IF NOT v_registrar_ok OR NOT v_dean_ok THEN
    RAISE EXCEPTION 'التوقيعات يجب أن تكون مكتملة قبل الأرشفة'
      USING ERRCODE = '22023';
  END IF;

  -- Hard stop: until PDF/file generation exists, archive remains gated.
  PERFORM public.assert_enrollment_certificate_pdf_generation_ready();

  RETURN jsonb_build_object(
    'success', false,
    'code', 'HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING',
    'step_id', p_step_id,
    'document_id', v_doc.id,
    'comment', p_comment,
    'payload', COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.archive_enrollment_certificate_from_workflow_step(uuid, text, jsonb) IS
  'Archive enrollment certificate workflow step. Requires linked issued document '
  'with accessible file; currently fails closed on PDF HOLD.';

REVOKE ALL ON FUNCTION public.archive_enrollment_certificate_from_workflow_step(uuid, text, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_enrollment_certificate_from_workflow_step(uuid, text, jsonb)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Wire act_on: preserve post-zero-fee sign path; route enrollment issue/archive
-- to specialized RPCs that HOLD on missing PDF generation before any mutation.
-- ---------------------------------------------------------------------------

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
  v_required_action_type text;
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
      'commented',
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

  IF v_step.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'الخطوة ليست نشطة — لا يمكن تنفيذ الإجراء'
      USING ERRCODE = '22023';
  END IF;

  v_required_action_type := CASE p_action
    WHEN 'sign' THEN 'sign'
    WHEN 'issue_document' THEN 'issue_document'
    WHEN 'archive' THEN 'archive'
    ELSE NULL
  END;

  IF v_required_action_type IS NOT NULL THEN
    IF COALESCE(v_config.action_type, '') IS DISTINCT FROM v_required_action_type THEN
      RAISE EXCEPTION 'الإجراء % غير متوافق مع نوع الخطوة %',
        p_action, COALESCE(v_config.action_type, 'null')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_action = 'approve' AND COALESCE(v_config.action_type, '') = 'sign' THEN
    RAISE EXCEPTION 'خطوة التوقيع تتطلب إجراء sign وليس approve'
      USING ERRCODE = '22023';
  END IF;

  -- Delegate enrollment_certificate issue/archive (PDF HOLD inside specialized RPCs).
  IF p_action = 'issue_document' THEN
    IF (
      SELECT r.request_type FROM public.student_requests r
      WHERE r.id = v_step.student_request_id
    ) = 'enrollment_certificate' THEN
      RETURN public.issue_enrollment_certificate_from_workflow_step(p_step_id, p_comment, p_payload);
    END IF;
    RAISE EXCEPTION
      'DOCUMENT_ISSUANCE_EXECUTION_CONTRACT_MISSING: عقد إصدار الوثيقة لهذا النوع غير مكتمل'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'archive' THEN
    IF (
      SELECT r.request_type FROM public.student_requests r
      WHERE r.id = v_step.student_request_id
    ) = 'enrollment_certificate' THEN
      RETURN public.archive_enrollment_certificate_from_workflow_step(p_step_id, p_comment, p_payload);
    END IF;
    RAISE EXCEPTION
      'ARCHIVE_REQUIRES_ISSUED_DOCUMENT_CONTRACT: الأرشفة متوقفة حتى يكتمل عقد الإصدار'
      USING ERRCODE = 'P0001';
  END IF;

  v_action_result := CASE p_action
    WHEN 'approve' THEN 'approve'
    WHEN 'reject' THEN 'reject'
    WHEN 'return' THEN 'return'
    WHEN 'request_attachment' THEN 'request_attachment'
    WHEN 'request_payment' THEN 'request_payment'
    WHEN 'skip' THEN 'skip'
    WHEN 'complete' THEN 'complete'
    WHEN 'sign' THEN 'signed'
    WHEN 'archive' THEN 'archived'
    WHEN 'issue_document' THEN 'issued'
    ELSE NULL
  END;

  IF v_action_result IS NULL THEN
    RAISE EXCEPTION 'إجراء غير مدعوم: %', p_action
      USING ERRCODE = '22023';
  END IF;

  v_event_type := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'request_attachment' THEN 'attachment_requested'
    WHEN 'request_payment' THEN 'payment_requested'
    WHEN 'sign' THEN 'signed'
    WHEN 'archive' THEN 'archived'
    WHEN 'issue_document' THEN 'document_issued'
    WHEN 'complete' THEN 'completed'
    WHEN 'skip' THEN 'approved'
    ELSE 'commented'
  END;

  v_visible_to_student := p_action IN (
    'approve', 'reject', 'return', 'request_attachment',
    'request_payment', 'complete', 'issue_document', 'sign'
  );

  v_decision := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned'
    WHEN 'skip' THEN 'skipped'
    WHEN 'complete' THEN 'completed'
    WHEN 'sign' THEN 'signed'
    WHEN 'issue_document' THEN 'issued'
    WHEN 'archive' THEN 'archived'
    ELSE NULL
  END;

  IF v_step.workflow_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد workflow مرتبط بهذه الخطوة'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_transition
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = v_step.workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM v_step.workflow_step_id
    AND t.action_result = v_action_result
  ORDER BY t.is_default DESC, t.created_at
  LIMIT 1;

  IF v_transition.id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد انتقال للنتيجة: %', v_action_result
      USING ERRCODE = '22023';
  END IF;

  IF v_transition.to_step_id IS NOT NULL THEN
    SELECT s.id INTO v_next_runtime_step_id
    FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = v_step.student_request_id
      AND s.workflow_step_id = v_transition.to_step_id
    LIMIT 1;

    IF v_next_runtime_step_id IS NULL THEN
      RAISE EXCEPTION 'الخطوة التالية غير مهيأة في runtime — أُلغيت المعاملة دون تغيير'
        USING ERRCODE = 'P0002';
    END IF;
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
      'action_result', v_action_result,
      'previous_status', v_step.status,
      'new_step_status', v_new_step_status
    ),
    v_visible_to_student
  );

  v_new_request_status := NULL;

  IF v_transition.to_step_id IS NOT NULL THEN
    UPDATE public.student_request_workflow_steps
    SET status = 'active', entered_at = now(), updated_at = now()
    WHERE id = v_next_runtime_step_id
      AND status IS DISTINCT FROM 'active';

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
      jsonb_build_object(
        'from_step_id', v_step.id,
        'transition_id', v_transition.id,
        'action_result', v_action_result
      ),
      false
    );

    v_new_request_status := COALESCE(v_config.status_on_complete, 'in_review');
  ELSE
    v_new_request_status := CASE v_action_result
      WHEN 'reject' THEN 'rejected'
      WHEN 'return' THEN 'returned_for_completion'
      WHEN 'complete' THEN 'completed'
      WHEN 'archived' THEN 'completed'
      WHEN 'cancel' THEN 'cancelled'
      ELSE 'completed'
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
    'action_result', v_action_result,
    'step_id', p_step_id,
    'next_step_id', v_next_runtime_step_id,
    'request_status', v_new_request_status,
    'transition_applied', true,
    'terminal', v_transition.to_step_id IS NULL
  );
END;
$$;

COMMENT ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb) IS
  'Staff workflow actor. Maps sign→signed with fail-closed transitions. '
  'Enrollment certificate issue_document/archive delegate to specialized RPCs '
  'that HOLD on HOLD_ENROLLMENT_CERTIFICATE_PDF_GENERATION_CONTRACT_MISSING. '
  'auth.uid() required; no service-role auth bypass.';

REVOKE ALL ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_student_request_step(uuid, text, text, jsonb)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- G5: public verification — expose safe fields including student identity
-- Prefer enrollment snapshot when present; never expose verification_code back.
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
  v_name text;
  v_academic text;
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

  SELECT d.student_name_ar, d.academic_number
    INTO v_name, v_academic
  FROM public.enrollment_certificate_document_details d
  WHERE d.official_document_id = v_doc.id;

  IF v_name IS NULL THEN
    SELECT sp.full_name_ar, sp.academic_number
      INTO v_name, v_academic
    FROM public.student_profiles sp
    WHERE sp.id = v_doc.student_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'valid', v_doc.status IN ('issued', 'archived'),
    'document_type', v_doc.document_type,
    'document_number', v_doc.document_number,
    'status', v_doc.status,
    'issued_at', v_doc.issued_at,
    'student_name_ar', v_name,
    'academic_number', v_academic
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_document(text) TO anon, authenticated;
