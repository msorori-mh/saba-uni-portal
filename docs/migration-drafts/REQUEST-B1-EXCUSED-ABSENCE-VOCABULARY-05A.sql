-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Extends new excused-absence writes to the approved canonical vocabulary while
-- preserving historical values. No row rewrite, mapping, backfill, or activation.

BEGIN;

DO $preflight$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid, true)
  INTO v_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.absence_excuse_details'::regclass
    AND c.conname = 'aed_reason_chk'
    AND c.contype = 'c';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'AED_REASON_CONSTRAINT_MISSING';
  END IF;

  IF regexp_replace(v_definition, '\s+', '', 'g') NOT IN (
    'CHECK((reason_type=ANY(ARRAY[''medical''::text,''family''::text,''emergency''::text,''other''::text])))',
    'CHECK((reason_type=ANY(ARRAY[''medical''::text,''family''::text,''emergency''::text,''other''::text])))NOTVALID'
  ) THEN
    RAISE EXCEPTION 'AED_REASON_CONSTRAINT_UNEXPECTED:%', v_definition;
  END IF;
END
$preflight$;

ALTER TABLE public.absence_excuse_details
  DROP CONSTRAINT aed_reason_chk;

ALTER TABLE public.absence_excuse_details
  ADD CONSTRAINT aed_reason_chk CHECK (
    reason_type IN (
      'medical',
      'family_emergency',
      'official',
      'other',
      'family',
      'emergency'
    )
  ) NOT VALID;

ALTER TABLE public.absence_excuse_details
  VALIDATE CONSTRAINT aed_reason_chk;

COMMENT ON CONSTRAINT aed_reason_chk ON public.absence_excuse_details IS
  'New writes use medical/family_emergency/official/other. Historical family/emergency values remain readable; no backfill.';

COMMIT;
