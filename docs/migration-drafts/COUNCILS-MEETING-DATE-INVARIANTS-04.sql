-- =====================================================================
-- DRAFT ONLY — NOT APPLIED TO PRODUCTION
-- Package: COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
-- Part 3/3: Meeting date chronology invariant
--
-- Required order:
--   intake_opens_at < intake_closes_at <= scheduled_at
--
-- Legacy data: 3 of 6 production meetings currently violate this order.
-- The constraint is added NOT VALID on purpose: it binds every new row
-- and every future UPDATE, and it does NOT touch or rewrite legacy rows.
-- No backfill, no cleanup, no DELETE — forward-only, per project rules.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- A) Structural invariant for all new/updated meetings
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_council_meetings
  DROP CONSTRAINT IF EXISTS ck_ac_meetings_date_chronology;

ALTER TABLE public.academic_council_meetings
  ADD CONSTRAINT ck_ac_meetings_date_chronology
  CHECK (
    intake_opens_at IS NULL
    OR intake_closes_at IS NULL
    OR scheduled_at IS NULL
    OR (intake_opens_at < intake_closes_at AND intake_closes_at <= scheduled_at)
  ) NOT VALID;

COMMENT ON CONSTRAINT ck_ac_meetings_date_chronology ON public.academic_council_meetings IS
  'Intake must open before it closes, and must close no later than the session start. NOT VALID: legacy rows are preserved untouched; enforcement applies to inserts and updates.';

-- ---------------------------------------------------------------------
-- B) Explicit, readable error for the UI instead of a raw 23514
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_assert_meeting_date_chronology()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.intake_opens_at IS NOT NULL AND NEW.intake_closes_at IS NOT NULL
     AND NEW.intake_opens_at >= NEW.intake_closes_at THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_INTAKE_WINDOW_INVALID: تاريخ فتح الاستقبال يجب أن يسبق تاريخ إغلاقه'
      USING ERRCODE = '22000';
  END IF;

  IF NEW.intake_closes_at IS NOT NULL AND NEW.scheduled_at IS NOT NULL
     AND NEW.intake_closes_at > NEW.scheduled_at THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_INTAKE_AFTER_SESSION: إغلاق الاستقبال يجب ألا يتجاوز موعد انعقاد الجلسة'
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ac_meetings_date_chronology ON public.academic_council_meetings;
CREATE TRIGGER trg_ac_meetings_date_chronology
  BEFORE INSERT OR UPDATE OF intake_opens_at, intake_closes_at, scheduled_at
  ON public.academic_council_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.council_assert_meeting_date_chronology();

COMMIT;

-- ---------------------------------------------------------------------
-- POST-VERIFIER (read-only, run manually after apply)
-- ---------------------------------------------------------------------
-- SELECT id, title, intake_opens_at, intake_closes_at, scheduled_at,
--        (intake_opens_at < intake_closes_at AND intake_closes_at <= scheduled_at) AS chronology_ok
-- FROM public.academic_council_meetings
-- ORDER BY chronology_ok NULLS FIRST, scheduled_at;
