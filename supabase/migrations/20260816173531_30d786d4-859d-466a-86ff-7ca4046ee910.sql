-- PORTAL_REFORM_P1_STUDENT_SERVICES_SOURCE_CLOSURE_02
-- P1-01 — canonical detail models for the P1 student services.
-- FORWARD-ONLY. IDEMPOTENT. NO DATA BACKFILL. NO VISIBILITY FLIP.
--
-- Covers:
--   1. october_exam_entry_details   (new)
--   2. replacement_card_details     (new)
--   3. grade_appeal_details         (evolution → formal final-result appeal)
--
-- Client write is NEVER allowed on these tables: rows are written only by the
-- SECURITY DEFINER functions shipped in P1-02 / P1-04. Therefore authenticated
-- receives SELECT only; service_role receives ALL.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. october_exam_entry_details
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.october_exam_entry_details (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                 uuid NOT NULL UNIQUE REFERENCES public.student_requests(id) ON DELETE CASCADE,
  student_profile_id         uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  academic_year_id           uuid REFERENCES public.academic_years(id),
  semester_id                uuid REFERENCES public.semesters(id),
  academic_level_order       integer NOT NULL,
  remaining_courses_count    integer NOT NULL,
  eligible_requirement_ids   uuid[] NOT NULL DEFAULT '{}'::uuid[],
  selected_requirement_ids   uuid[] NOT NULL DEFAULT '{}'::uuid[],
  eligibility_snapshot       jsonb  NOT NULL DEFAULT '{}'::jsonb,
  approved_list_generated_at timestamptz NOT NULL DEFAULT now(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.october_exam_entry_details TO authenticated;
GRANT ALL    ON public.october_exam_entry_details TO service_role;

ALTER TABLE public.october_exam_entry_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oct_details_select_self ON public.october_exam_entry_details;
CREATE POLICY oct_details_select_self
  ON public.october_exam_entry_details FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = october_exam_entry_details.student_profile_id
      AND sp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS oct_details_select_staff ON public.october_exam_entry_details;
CREATE POLICY oct_details_select_staff
  ON public.october_exam_entry_details FOR SELECT TO authenticated
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin','system_admin','registrar','student_affairs','finance_officer']
  ));

DROP TRIGGER IF EXISTS trg_oct_details_updated_at ON public.october_exam_entry_details;
CREATE TRIGGER trg_oct_details_updated_at
  BEFORE UPDATE ON public.october_exam_entry_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_oct_details_student
  ON public.october_exam_entry_details (student_profile_id);

-- ---------------------------------------------------------------------------
-- 2. replacement_card_details
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.replacement_card_details (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL UNIQUE REFERENCES public.student_requests(id) ON DELETE CASCADE,
  student_profile_id    uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  loss_reason           text NOT NULL,
  loss_declaration_ack  boolean NOT NULL DEFAULT false,
  loss_incident_date    date,
  previous_card_serial  text,
  issued_card_serial    text,
  payment_confirmed_at  timestamptz,
  payment_confirmed_by  uuid,
  card_issued_at        timestamptz,
  card_issued_by        uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT replacement_card_details_reason_chk CHECK (length(btrim(loss_reason)) >= 3),
  CONSTRAINT replacement_card_details_ack_chk    CHECK (loss_declaration_ack IS TRUE)
);

GRANT SELECT ON public.replacement_card_details TO authenticated;
GRANT ALL    ON public.replacement_card_details TO service_role;

ALTER TABLE public.replacement_card_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rcd_select_self ON public.replacement_card_details;
CREATE POLICY rcd_select_self
  ON public.replacement_card_details FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = replacement_card_details.student_profile_id
      AND sp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS rcd_select_staff ON public.replacement_card_details;
CREATE POLICY rcd_select_staff
  ON public.replacement_card_details FOR SELECT TO authenticated
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin','system_admin','registrar','student_affairs','finance_officer']
  ));

DROP TRIGGER IF EXISTS trg_rcd_updated_at ON public.replacement_card_details;
CREATE TRIGGER trg_rcd_updated_at
  BEFORE UPDATE ON public.replacement_card_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_rcd_student
  ON public.replacement_card_details (student_profile_id);

-- ---------------------------------------------------------------------------
-- 3. grade_appeal_details — evolution to the FORMAL FINAL RESULT appeal
--    (coursework component appeals belong to P2 and are NOT modelled here)
-- ---------------------------------------------------------------------------
ALTER TABLE public.grade_appeal_details
  ADD COLUMN IF NOT EXISTS appeal_kind              text NOT NULL DEFAULT 'final_result',
  ADD COLUMN IF NOT EXISTS course_id                uuid REFERENCES public.courses(id),
  ADD COLUMN IF NOT EXISTS final_result_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS appeal_window_end        timestamptz,
  ADD COLUMN IF NOT EXISTS previous_final_result    numeric,
  ADD COLUMN IF NOT EXISTS approved_final_result    numeric,
  ADD COLUMN IF NOT EXISTS result_change_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_change_applied_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grade_appeal_details_kind_chk'
      AND conrelid = 'public.grade_appeal_details'::regclass
  ) THEN
    ALTER TABLE public.grade_appeal_details
      ADD CONSTRAINT grade_appeal_details_kind_chk
      CHECK (appeal_kind IN ('final_result'));
  END IF;
END $$;

COMMENT ON COLUMN public.grade_appeal_details.appeal_kind IS
  'P1 models formal FINAL RESULT appeals only. Coursework component appeals are P2.';
COMMENT ON COLUMN public.grade_appeal_details.appeal_window_end IS
  'final_result_published_at + 7 days. Enforced server-side in P1-02.';

COMMIT;