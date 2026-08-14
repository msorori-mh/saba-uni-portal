-- =====================================================================
-- DRAFT ONLY — NOT APPLIED TO PRODUCTION
-- Package: COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04
-- Part 3/3: Meeting date chronology invariant
--
-- Required order:
--   intake_opens_at < intake_closes_at <= scheduled_at
--
-- Intake window rule: the window is either FULLY used (both timestamps set)
-- or NOT used at all (both NULL). A half-open window is rejected.
--
-- Legacy data: some production meetings currently violate this order.
-- Enforcement is applied by a TRIGGER that only fires when one of the three
-- timestamps is actually written, so a legacy meeting can still complete its
-- lifecycle (status transitions, minutes, archiving) without being stranded.
-- The table-level CHECK is intentionally NOT part of this apply step: even
-- NOT VALID, it binds every future UPDATE of a legacy row. It is kept below
-- as a DEFERRED step to be enabled under a separate authorization, after the
-- legacy rows have been corrected by their owners.
--
-- No backfill, no cleanup, no DELETE — forward-only, per project rules.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- A) Any previously created chronology CHECK is removed: the trigger below
--    is the enforcement surface for this package.
-- ---------------------------------------------------------------------
ALTER TABLE public.academic_council_meetings
  DROP CONSTRAINT IF EXISTS ck_ac_meetings_date_chronology;

-- ---------------------------------------------------------------------
-- B) Explicit, readable Arabic errors for the UI instead of a raw 23514.
--    Fires only when a date column is written (INSERT, or UPDATE OF dates).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.council_assert_meeting_date_chronology()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Legacy safety: an UPDATE that does not actually change any of the three
  -- timestamps must never be blocked by this invariant.
  IF TG_OP = 'UPDATE'
     AND NEW.intake_opens_at IS NOT DISTINCT FROM OLD.intake_opens_at
     AND NEW.intake_closes_at IS NOT DISTINCT FROM OLD.intake_closes_at
     AND NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at THEN
    RETURN NEW;
  END IF;

  IF (NEW.intake_opens_at IS NULL) <> (NEW.intake_closes_at IS NULL) THEN
    RAISE EXCEPTION 'COUNCIL_MEETING_INTAKE_WINDOW_PARTIAL: يجب تحديد تاريخي فتح وإغلاق الاستقبال معاً أو تركهما فارغين معاً'
      USING ERRCODE = '22000';
  END IF;

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

-- =====================================================================
-- DEFERRED STEP — DO NOT APPLY WITH THIS PACKAGE
-- Enable only after legacy meetings have been corrected, under a separate
-- authorization. NOT VALID skips the initial scan but still binds every
-- future UPDATE of a legacy row, which would strand in-session meetings.
-- ---------------------------------------------------------------------
-- ALTER TABLE public.academic_council_meetings
--   ADD CONSTRAINT ck_ac_meetings_date_chronology
--   CHECK (
--     (intake_opens_at IS NULL AND intake_closes_at IS NULL)
--     OR (
--       intake_opens_at IS NOT NULL AND intake_closes_at IS NOT NULL
--       AND intake_opens_at < intake_closes_at
--       AND (scheduled_at IS NULL OR intake_closes_at <= scheduled_at)
--     )
--   ) NOT VALID;
-- =====================================================================

-- ---------------------------------------------------------------------
-- POST-VERIFIER (read-only, run manually after apply)
-- ---------------------------------------------------------------------
-- SELECT id, title, intake_opens_at, intake_closes_at, scheduled_at,
--        (intake_opens_at < intake_closes_at AND intake_closes_at <= scheduled_at) AS chronology_ok
-- FROM public.academic_council_meetings
-- ORDER BY chronology_ok NULLS FIRST, scheduled_at;
