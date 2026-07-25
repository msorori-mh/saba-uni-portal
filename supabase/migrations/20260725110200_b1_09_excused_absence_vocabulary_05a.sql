-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 / order 9
-- Source draft: docs/migration-drafts/REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

-- Extends new excused-absence writes to the approved canonical vocabulary while
-- preserving historical values. No row rewrite, mapping, backfill, or activation.

BEGIN;

DO $preflight$
DECLARE
  v_definition text;
  v_normalized text;
  v_validated boolean;
BEGIN
  -- Use the raw catalog definition so CHECK((...)) parentheses match production
  -- signatures; pretty=true strips the outer grouping parentheses.
  SELECT pg_get_constraintdef(c.oid, false), c.convalidated
  INTO v_definition, v_validated
  FROM pg_constraint c
  WHERE c.conrelid = 'public.absence_excuse_details'::regclass
    AND c.conname = 'aed_reason_chk'
    AND c.contype = 'c';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'AED_REASON_CONSTRAINT_MISSING';
  END IF;

  v_normalized := regexp_replace(v_definition, '\s+', '', 'g');

  IF v_normalized IN (
    'CHECK((reason_type=ANY(ARRAY[''medical''::text,''family''::text,''emergency''::text,''other''::text])))',
    'CHECK((reason_type=ANY(ARRAY[''medical''::text,''family''::text,''emergency''::text,''other''::text])))NOTVALID'
  ) THEN
    ALTER TABLE public.absence_excuse_details DROP CONSTRAINT aed_reason_chk;
    ALTER TABLE public.absence_excuse_details ADD CONSTRAINT aed_reason_chk CHECK (
      reason_type IN ('medical','family_emergency','official','other','family','emergency')
    ) NOT VALID;
    ALTER TABLE public.absence_excuse_details VALIDATE CONSTRAINT aed_reason_chk;
  ELSIF v_normalized NOT IN (
    'CHECK((reason_type=ANY(ARRAY[''medical''::text,''family_emergency''::text,''official''::text,''other''::text,''family''::text,''emergency''::text])))',
    'CHECK((reason_type=ANY(ARRAY[''medical''::text,''family_emergency''::text,''official''::text,''other''::text,''family''::text,''emergency''::text])))NOTVALID'
  ) THEN
    RAISE EXCEPTION 'AED_REASON_CONSTRAINT_UNEXPECTED:%', v_definition;
  ELSIF NOT v_validated THEN
    ALTER TABLE public.absence_excuse_details VALIDATE CONSTRAINT aed_reason_chk;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.enforce_canonical_absence_reason_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.reason_type IS DISTINCT FROM OLD.reason_type)
     AND NEW.reason_type NOT IN ('medical','family_emergency','official','other') THEN
    RAISE EXCEPTION 'CANONICAL_ABSENCE_REASON_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.enforce_canonical_absence_reason_write()
  FROM PUBLIC, anon, authenticated;

DO $trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.absence_excuse_details'::regclass
      AND tgname='trg_enforce_canonical_absence_reason_write'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_enforce_canonical_absence_reason_write
      BEFORE INSERT OR UPDATE OF reason_type ON public.absence_excuse_details
      FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_absence_reason_write();
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.absence_excuse_details'::regclass
      AND tgname='trg_enforce_canonical_absence_reason_write'
      AND tgfoid='public.enforce_canonical_absence_reason_write()'::regprocedure
      AND tgtype=23 AND tgenabled='O' AND tgconstraint=0 AND tgnargs=0
      AND tgqual IS NULL
      AND tgattr::smallint[] = ARRAY[(
        SELECT a.attnum::smallint FROM pg_attribute a
        WHERE a.attrelid='public.absence_excuse_details'::regclass
          AND a.attname='reason_type' AND NOT a.attisdropped
      )]::smallint[]
  ) THEN
    RAISE EXCEPTION 'CANONICAL_ABSENCE_REASON_TRIGGER_MISMATCH';
  END IF;
END
$trigger$;

COMMENT ON CONSTRAINT aed_reason_chk ON public.absence_excuse_details IS
  'New writes use medical/family_emergency/official/other. Historical family/emergency values remain readable; no backfill.';

COMMIT;
