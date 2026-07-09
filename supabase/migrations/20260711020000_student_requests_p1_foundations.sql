-- STUDENT-REQUESTS-P1-FOUNDATIONS-01
-- Additive schema foundation for student request workflows per
-- docs/STUDENT-REQUESTS-WORKFLOW-CANONICAL-SPEC-01.md and Gap Audit P1.
--
-- Creates:
--   student_profiles opening eligibility fields (4 columns)
--   student_request_service_windows
--   student_request_fee_assessments
--   student_request_parallel_groups + student_request_parallel_group_members
--   central_signatory_references
--   RPC stubs: get_student_request_eligibility_context,
--               check_student_request_basic_eligibility
--
-- No seed, no data writes, no code rename, no workflow cutover, no UI changes.

-- =============================================================================
-- 1. student_profiles — opening eligibility fields (transitional / import)
-- =============================================================================

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS student_study_status text,
  ADD COLUMN IF NOT EXISTS transferred_current_year boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_suspension_semesters_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_suspension_years_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_profiles_student_study_status_chk'
      AND conrelid = 'public.student_profiles'::regclass
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_student_study_status_chk
      CHECK (student_study_status IS NULL OR student_study_status IN ('new', 'repeat'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_profiles_previous_suspension_semesters_count_chk'
      AND conrelid = 'public.student_profiles'::regclass
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_previous_suspension_semesters_count_chk
      CHECK (previous_suspension_semesters_count >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_profiles_consecutive_suspension_years_count_chk'
      AND conrelid = 'public.student_profiles'::regclass
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_consecutive_suspension_years_count_chk
      CHECK (consecutive_suspension_years_count >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.student_profiles.student_study_status IS
  'Opening import field: new (مستجد) or repeat (باقي). Transitional until operational '
  'history replaces it. Required for enrollment_suspension eligibility in a later phase.';

COMMENT ON COLUMN public.student_profiles.transferred_current_year IS
  'Opening import field: true if student was transferred (dept/college/university) '
  'during the current academic year. Transitional.';

COMMENT ON COLUMN public.student_profiles.previous_suspension_semesters_count IS
  'Opening import field: count of prior discrete suspension semesters. '
  'Ineligible for enrollment_suspension when >= 4 (U-SUSP-1).';

COMMENT ON COLUMN public.student_profiles.consecutive_suspension_years_count IS
  'Opening import field: count of consecutive academic years with approved suspension '
  'without active study between. Ineligible when >= 2 (U-SUSP-1).';

-- =============================================================================
-- 2. student_request_service_windows
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_request_service_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_code text NOT NULL,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL,
  target_semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  max_allowed_courses integer,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_service_windows_request_type_code_fk'
      AND conrelid = 'public.student_request_service_windows'::regclass
  ) THEN
    ALTER TABLE public.student_request_service_windows
      ADD CONSTRAINT student_request_service_windows_request_type_code_fk
      FOREIGN KEY (request_type_code)
      REFERENCES public.request_types(code)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_service_windows_dates_chk'
      AND conrelid = 'public.student_request_service_windows'::regclass
  ) THEN
    ALTER TABLE public.student_request_service_windows
      ADD CONSTRAINT student_request_service_windows_dates_chk
      CHECK (ends_at > starts_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_service_windows_max_allowed_courses_chk'
      AND conrelid = 'public.student_request_service_windows'::regclass
  ) THEN
    ALTER TABLE public.student_request_service_windows
      ADD CONSTRAINT student_request_service_windows_max_allowed_courses_chk
      CHECK (max_allowed_courses IS NULL OR max_allowed_courses >= 0);
  END IF;
END $$;

COMMENT ON TABLE public.student_request_service_windows IS
  'Admin-configurable service activation windows per request type '
  '(enrollment_suspension, excused_absence, grade_appeal, october_exam_entry_form). '
  'No seed in P1 — populated later via admin UI.';

COMMENT ON COLUMN public.student_request_service_windows.max_allowed_courses IS
  'Optional cap (e.g. october_exam_entry_form per U-OCT-1). NULL = no cap in window row.';

COMMENT ON COLUMN public.student_request_service_windows.target_semester_id IS
  'Optional semester scope (e.g. grade_appeal window for a specific semester).';

-- =============================================================================
-- 3. student_request_fee_assessments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_request_fee_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'YER',
  assessed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'pending',
  payment_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_confirmed_at timestamptz,
  hafiza_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_fee_assessments_amount_chk'
      AND conrelid = 'public.student_request_fee_assessments'::regclass
  ) THEN
    ALTER TABLE public.student_request_fee_assessments
      ADD CONSTRAINT student_request_fee_assessments_amount_chk
      CHECK (amount >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_fee_assessments_payment_status_chk'
      AND conrelid = 'public.student_request_fee_assessments'::regclass
  ) THEN
    ALTER TABLE public.student_request_fee_assessments
      ADD CONSTRAINT student_request_fee_assessments_payment_status_chk
      CHECK (payment_status IN ('pending', 'paid', 'waived', 'cancelled'));
  END IF;
END $$;

COMMENT ON TABLE public.student_request_fee_assessments IS
  'Fee assessment foundation for student requests. No payment integration in P1. '
  'Hafiza linkage deferred to a later phase via hafiza_reference.';

COMMENT ON COLUMN public.student_request_fee_assessments.hafiza_reference IS
  'Optional external hafiza/receipt reference — populated when payment integration lands.';

-- =============================================================================
-- 4. student_request_parallel_groups + members
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_request_parallel_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  student_request_workflow_step_id uuid
    REFERENCES public.student_request_workflow_steps(id) ON DELETE SET NULL,
  group_key text NOT NULL,
  mode text NOT NULL DEFAULT 'all_required',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_parallel_groups_mode_chk'
      AND conrelid = 'public.student_request_parallel_groups'::regclass
  ) THEN
    ALTER TABLE public.student_request_parallel_groups
      ADD CONSTRAINT student_request_parallel_groups_mode_chk
      CHECK (mode IN ('all_required'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_parallel_groups_status_chk'
      AND conrelid = 'public.student_request_parallel_groups'::regclass
  ) THEN
    ALTER TABLE public.student_request_parallel_groups
      ADD CONSTRAINT student_request_parallel_groups_status_chk
      CHECK (status IN ('pending', 'completed', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_parallel_groups_request_group_key_key'
      AND conrelid = 'public.student_request_parallel_groups'::regclass
  ) THEN
    ALTER TABLE public.student_request_parallel_groups
      ADD CONSTRAINT student_request_parallel_groups_request_group_key_key
      UNIQUE (student_request_id, group_key);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.student_request_parallel_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL
    REFERENCES public.student_request_parallel_groups(id) ON DELETE CASCADE,
  unit_key text,
  processing_unit_id uuid
    REFERENCES public.request_processing_units(id) ON DELETE SET NULL,
  role_key text,
  processing_role_id uuid
    REFERENCES public.request_processing_roles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_parallel_group_members_status_chk'
      AND conrelid = 'public.student_request_parallel_group_members'::regclass
  ) THEN
    ALTER TABLE public.student_request_parallel_group_members
      ADD CONSTRAINT student_request_parallel_group_members_status_chk
      CHECK (status IN ('pending', 'completed', 'waived', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_request_parallel_group_members_unit_or_role_chk'
      AND conrelid = 'public.student_request_parallel_group_members'::regclass
  ) THEN
    ALTER TABLE public.student_request_parallel_group_members
      ADD CONSTRAINT student_request_parallel_group_members_unit_or_role_chk
      CHECK (
        unit_key IS NOT NULL
        OR processing_unit_id IS NOT NULL
        OR role_key IS NOT NULL
        OR processing_role_id IS NOT NULL
      );
  END IF;
END $$;

COMMENT ON TABLE public.student_request_parallel_groups IS
  'Parallel approval gate foundation (e.g. file_withdrawal clearance). '
  'Not wired to workflow runtime in P1.';

COMMENT ON TABLE public.student_request_parallel_group_members IS
  'Members of a parallel group (finance, library, labs, student activities). '
  'Resolved via unit_key or processing_unit_id in a later runtime phase.';

-- =============================================================================
-- 5. central_signatory_references
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.central_signatory_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_ar text NOT NULL,
  title_ar text NOT NULL,
  scope text NOT NULL DEFAULT 'university',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'central_signatory_references_code_key'
      AND conrelid = 'public.central_signatory_references'::regclass
  ) THEN
    ALTER TABLE public.central_signatory_references
      ADD CONSTRAINT central_signatory_references_code_key UNIQUE (code);
  END IF;
END $$;

COMMENT ON TABLE public.central_signatory_references IS
  'Reference-only central university signatories (e.g. university registrar general, '
  'VP student affairs). Not staff_profiles rows. Used by grade_statement_non_graduate '
  'only — enrollment_certificate is college-internal per U-CERT-1. No seed in P1.';

-- =============================================================================
-- 6. updated_at triggers
-- =============================================================================

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_student_request_service_windows_updated_at'
      AND tgrelid = 'public.student_request_service_windows'::regclass
  ) THEN
    CREATE TRIGGER trg_student_request_service_windows_updated_at
      BEFORE UPDATE ON public.student_request_service_windows
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_student_request_fee_assessments_updated_at'
      AND tgrelid = 'public.student_request_fee_assessments'::regclass
  ) THEN
    CREATE TRIGGER trg_student_request_fee_assessments_updated_at
      BEFORE UPDATE ON public.student_request_fee_assessments
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_student_request_parallel_group_members_updated_at'
      AND tgrelid = 'public.student_request_parallel_group_members'::regclass
  ) THEN
    CREATE TRIGGER trg_student_request_parallel_group_members_updated_at
      BEFORE UPDATE ON public.student_request_parallel_group_members
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_central_signatory_references_updated_at'
      AND tgrelid = 'public.central_signatory_references'::regclass
  ) THEN
    CREATE TRIGGER trg_central_signatory_references_updated_at
      BEFORE UPDATE ON public.central_signatory_references
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $mig$;

-- =============================================================================
-- 7. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_srservice_windows_type_active
  ON public.student_request_service_windows(request_type_code, is_active);

CREATE INDEX IF NOT EXISTS idx_srservice_windows_dates
  ON public.student_request_service_windows(starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_sr_fee_assessments_request_id
  ON public.student_request_fee_assessments(request_id);

CREATE INDEX IF NOT EXISTS idx_sr_fee_assessments_payment_status
  ON public.student_request_fee_assessments(payment_status);

CREATE INDEX IF NOT EXISTS idx_sr_parallel_groups_request_id
  ON public.student_request_parallel_groups(student_request_id);

CREATE INDEX IF NOT EXISTS idx_sr_parallel_group_members_group_id
  ON public.student_request_parallel_group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_central_signatory_references_code
  ON public.central_signatory_references(code);

CREATE INDEX IF NOT EXISTS idx_central_signatory_references_active
  ON public.central_signatory_references(is_active);

-- =============================================================================
-- 8. RPC helpers + stubs (read-only context, no data writes)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_can_read_student_eligibility_context(
  p_student_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_profiles sp
    WHERE sp.id = p_student_profile_id
      AND sp.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  IF public.has_any_role(
    auth.uid(),
    ARRAY['system_admin', 'admin', 'student_affairs', 'registrar']::text[]
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'غير مصرح بعرض سياق أهلية هذا الطالب.'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_request_eligibility_context(
  p_student_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_academic record;
BEGIN
  PERFORM public.assert_can_read_student_eligibility_context(p_student_profile_id);

  SELECT
    sp.id,
    sp.user_id,
    sp.academic_number,
    sp.full_name_ar,
    sp.status AS profile_status,
    sp.department_id,
    sp.program_id,
    sp.student_study_status,
    sp.transferred_current_year,
    sp.previous_suspension_semesters_count,
    sp.consecutive_suspension_years_count
  INTO v_row
  FROM public.student_profiles sp
  WHERE sp.id = p_student_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    sas.level_id,
    sas.enrollment_status,
    sas.academic_year_id,
    sas.semester_id
  INTO v_academic
  FROM public.student_academic_status sas
  WHERE sas.student_profile_id = p_student_profile_id
  ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'student_profile_id', v_row.id,
    'profile_status', v_row.profile_status,
    'academic_number', v_row.academic_number,
    'full_name_ar', v_row.full_name_ar,
    'department_id', v_row.department_id,
    'program_id', v_row.program_id,
    'student_study_status', v_row.student_study_status,
    'transferred_current_year', v_row.transferred_current_year,
    'previous_suspension_semesters_count', v_row.previous_suspension_semesters_count,
    'consecutive_suspension_years_count', v_row.consecutive_suspension_years_count,
    'current_level_id', v_academic.level_id,
    'current_enrollment_status', v_academic.enrollment_status,
    'current_academic_year_id', v_academic.academic_year_id,
    'current_semester_id', v_academic.semester_id,
    'decisions', jsonb_build_object(
      'u_cert_1', 'enrollment_certificate is college-internal only',
      'u_susp_1_max_consecutive_years', 2,
      'u_susp_1_max_previous_semesters', 4,
      'u_oct_1', 'failed_or_remaining_courses_without_approved_success'
    ),
    'foundation_phase', 'P1',
    'note', 'Stub context only — full per-type rules deferred to later phases.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_student_request_basic_eligibility(
  p_request_type_code text,
  p_student_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ctx jsonb;
  v_profile_status text;
  v_audience text;
  v_is_eligible boolean := true;
  v_reasons text[] := ARRAY[]::text[];
  v_study_status text;
  v_transferred boolean;
  v_prev_semesters integer;
  v_consecutive_years integer;
BEGIN
  PERFORM public.assert_can_read_student_eligibility_context(p_student_profile_id);

  v_ctx := public.get_student_request_eligibility_context(p_student_profile_id);
  v_profile_status := v_ctx->>'profile_status';
  v_study_status := v_ctx->>'student_study_status';
  v_transferred := COALESCE((v_ctx->>'transferred_current_year')::boolean, false);
  v_prev_semesters := COALESCE((v_ctx->>'previous_suspension_semesters_count')::integer, 0);
  v_consecutive_years := COALESCE((v_ctx->>'consecutive_suspension_years_count')::integer, 0);

  SELECT rt.request_audience
  INTO v_audience
  FROM public.request_types rt
  WHERE rt.code = p_request_type_code
    AND rt.is_active = true;

  IF v_audience IS NULL THEN
    RETURN jsonb_build_object(
      'request_type_code', p_request_type_code,
      'student_profile_id', p_student_profile_id,
      'is_eligible', false,
      'reasons', ARRAY['نوع الطلب غير معروف أو غير مفعّل.']::text[],
      'context', v_ctx,
      'foundation_phase', 'P1'
    );
  END IF;

  IF NOT public.student_request_type_is_eligible(v_profile_status, v_audience) THEN
    v_is_eligible := false;
    v_reasons := array_append(v_reasons, 'نوع الطلب غير متاح لحالة الطالب (جمهور/حالة profile).');
  END IF;

  IF p_request_type_code = 'enrollment_suspension' THEN
    IF v_consecutive_years >= 2 THEN
      v_is_eligible := false;
      v_reasons := array_append(
        v_reasons,
        'تجاوزت الحد المسموح لوقف القيد (سنتان متتاليتان) — U-SUSP-1.'
      );
    END IF;

    IF v_prev_semesters >= 4 THEN
      v_is_eligible := false;
      v_reasons := array_append(
        v_reasons,
        'تجاوزت الحد المسموح لوقف القيد (أربعة فصول متفرقة) — U-SUSP-1.'
      );
    END IF;

    IF v_study_status IS DISTINCT FROM 'new' THEN
      v_is_eligible := false;
      v_reasons := array_append(
        v_reasons,
        'وقف القيد متاح للطلاب المستجدين فقط، ويجب استكمال student_study_status بقيمة new.'
      );
    END IF;

    IF v_transferred THEN
      v_is_eligible := false;
      v_reasons := array_append(
        v_reasons,
        'لا يحق للطلاب المحوّلين خلال السنة الحالية تقديم طلب وقف القيد.'
      );
    END IF;
  END IF;

  IF array_length(v_reasons, 1) IS NULL THEN
    v_reasons := ARRAY[]::text[];
  END IF;

  RETURN jsonb_build_object(
    'request_type_code', p_request_type_code,
    'student_profile_id', p_student_profile_id,
    'is_eligible', v_is_eligible,
    'reasons', to_jsonb(v_reasons),
    'context', v_ctx,
    'foundation_phase', 'P1',
    'note', 'Basic stub rules only — service windows, level, courses, and payment gates deferred.'
  );
END;
$$;

COMMENT ON FUNCTION public.get_student_request_eligibility_context(uuid) IS
  'P1 stub: returns read-only eligibility context JSON for a student profile. No writes.';

COMMENT ON FUNCTION public.check_student_request_basic_eligibility(text, uuid) IS
  'P1 stub: basic audience + enrollment_suspension U-SUSP-1 checks. '
  'Not wired into create/submit RPCs yet.';

-- =============================================================================
-- 9. Grants + RLS (enabled, no policies — closed by default)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_service_windows TO authenticated;
GRANT ALL ON public.student_request_service_windows TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_fee_assessments TO authenticated;
GRANT ALL ON public.student_request_fee_assessments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_parallel_groups TO authenticated;
GRANT ALL ON public.student_request_parallel_groups TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_parallel_group_members TO authenticated;
GRANT ALL ON public.student_request_parallel_group_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.central_signatory_references TO authenticated;
GRANT ALL ON public.central_signatory_references TO service_role;

ALTER TABLE public.student_request_service_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_request_fee_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_request_parallel_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_request_parallel_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.central_signatory_references ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.assert_can_read_student_eligibility_context(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_student_request_eligibility_context(uuid)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.check_student_request_basic_eligibility(text, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_student_request_eligibility_context(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_student_request_basic_eligibility(text, uuid)
  TO authenticated;
