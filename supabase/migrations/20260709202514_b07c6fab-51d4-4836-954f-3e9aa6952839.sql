-- STUDENT-REQUEST-TYPES-SCHEMA-01
-- Schema-only preparation for request audience and ineligible display mode.

ALTER TABLE public.request_types
  ADD COLUMN IF NOT EXISTS request_audience text NOT NULL DEFAULT 'active_student';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_types_request_audience_chk'
      AND conrelid = 'public.request_types'::regclass
  ) THEN
    ALTER TABLE public.request_types
      ADD CONSTRAINT request_types_request_audience_chk
      CHECK (request_audience IN ('active_student', 'graduate', 'both'));
  END IF;
END $$;

COMMENT ON COLUMN public.request_types.request_audience IS
  'Target audience for this request type: active_student, graduate, or both. Eligibility enforcement must be applied via RPC/RLS in a later phase; UI filtering alone is not sufficient.';

ALTER TABLE public.request_types
  ADD COLUMN IF NOT EXISTS ineligible_display_mode text NOT NULL DEFAULT 'hidden';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_types_ineligible_display_mode_chk'
      AND conrelid = 'public.request_types'::regclass
  ) THEN
    ALTER TABLE public.request_types
      ADD CONSTRAINT request_types_ineligible_display_mode_chk
      CHECK (ineligible_display_mode IN ('hidden', 'disabled'));
  END IF;
END $$;

COMMENT ON COLUMN public.request_types.ineligible_display_mode IS
  'How to present this request type to ineligible students: hidden (omit) or disabled (visible but not actionable). Enforcement of create/submit must still occur in RPC/RLS; this column guides UI display only.';

ALTER TABLE public.student_requests
  DROP CONSTRAINT IF EXISTS sr_type_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_requests_type_request_types_code_fk'
      AND conrelid = 'public.student_requests'::regclass
  ) THEN
    ALTER TABLE public.student_requests
      ADD CONSTRAINT student_requests_type_request_types_code_fk
      FOREIGN KEY (request_type)
      REFERENCES public.request_types(code)
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT student_requests_type_request_types_code_fk
  ON public.student_requests IS
  'Links request_type to request_types master data. Added NOT VALID so existing rows are not checked until VALIDATE CONSTRAINT runs after code normalization. New rows and updates are checked immediately.';