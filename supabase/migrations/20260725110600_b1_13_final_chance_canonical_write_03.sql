-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-FIVE-SERVICES-BACKEND-IMPLEMENTATION-01 / order 13
-- Source draft: docs/migration-drafts/FINAL-CHANCE-CANONICAL-WRITE-03.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

-- Migration 3/3 for EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION.
-- Stored request_types may be either canonical final_chance or legacy
-- extra_chance, but must resolve to exactly one row across both codes.
-- This migration constrains new academic chance values only; it performs
-- no historical rewrite or backfill and does not mutate request_types.

BEGIN;

DO $preflight$
DECLARE
  v_extra_chance_type_count integer;
  v_final_chance_type_count integer;
  v_legacy_only boolean;
  v_canonical_only boolean;
BEGIN
  IF to_regclass('public.extra_chance_details') IS NULL
     OR to_regclass('public.student_extra_chances') IS NULL THEN
    RAISE EXCEPTION 'FINAL_CHANCE_REQUIRED_TABLES_MISSING';
  END IF;

  SELECT count(*) INTO v_extra_chance_type_count
  FROM public.request_types rt
  WHERE rt.code = 'extra_chance';

  SELECT count(*) INTO v_final_chance_type_count
  FROM public.request_types rt
  WHERE rt.code = 'final_chance';

  -- Exactly one stored request type across both codes:
  -- A) legacy-only: extra_chance=1 AND final_chance=0
  -- B) canonical-only: extra_chance=0 AND final_chance=1
  -- Fail-closed for both/neither/duplicates/any other count.
  v_legacy_only := (v_extra_chance_type_count = 1 AND v_final_chance_type_count = 0);
  v_canonical_only := (v_extra_chance_type_count = 0 AND v_final_chance_type_count = 1);

  IF NOT (v_legacy_only OR v_canonical_only) THEN
    RAISE EXCEPTION 'FINAL_CHANCE_STORED_ALIAS_CONTRACT_MISMATCH:extra=%:canonical=%',
      v_extra_chance_type_count, v_final_chance_type_count;
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.assert_final_chance_type_for_new_write(
  p_chance_type text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_chance_type IS DISTINCT FROM 'final_chance' THEN
    RAISE EXCEPTION 'FINAL_CHANCE_TYPE_REQUIRED_FOR_NEW_WRITE'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_final_chance_type_for_new_write(text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_final_chance_type_for_new_write(text) IS
  'Fail-closed validator for new final-exam-chance writes. Historical aliases are read-only.';

CREATE OR REPLACE FUNCTION public.enforce_final_chance_detail_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_final_chance_type_for_new_write(NEW.chance_type);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_final_chance_detail_write()
  FROM PUBLIC, anon, authenticated;

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.extra_chance_details'::regclass
      AND tgname = 'trg_enforce_final_chance_detail_write'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_enforce_final_chance_detail_write
      BEFORE INSERT OR UPDATE OF chance_type ON public.extra_chance_details
      FOR EACH ROW EXECUTE FUNCTION public.enforce_final_chance_detail_write();
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.extra_chance_details'::regclass
      AND tgname = 'trg_enforce_final_chance_detail_write'
      AND tgfoid = 'public.enforce_final_chance_detail_write()'::regprocedure
      AND tgenabled = 'O'
      AND tgtype = 23 -- ROW + BEFORE + INSERT + UPDATE
      AND tgconstraint = 0
      AND tgnargs = 0
      AND (
        SELECT count(*) = 1 AND bool_and(a.attname = 'chance_type')
        FROM unnest(tgattr::smallint[]) AS cols(attnum)
        JOIN pg_attribute a
          ON a.attrelid = tgrelid AND a.attnum = cols.attnum
      )
  ) THEN
    RAISE EXCEPTION 'FINAL_CHANCE_DETAIL_TRIGGER_CONTRACT_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_extra_chances'::regclass
      AND tgname = 'trg_enforce_final_chance_record_write'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_enforce_final_chance_record_write
      BEFORE INSERT OR UPDATE OF chance_type ON public.student_extra_chances
      FOR EACH ROW EXECUTE FUNCTION public.enforce_final_chance_detail_write();
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.student_extra_chances'::regclass
      AND tgname = 'trg_enforce_final_chance_record_write'
      AND tgfoid = 'public.enforce_final_chance_detail_write()'::regprocedure
      AND tgenabled = 'O'
      AND tgtype = 23 -- ROW + BEFORE + INSERT + UPDATE
      AND tgconstraint = 0
      AND tgnargs = 0
      AND (
        SELECT count(*) = 1 AND bool_and(a.attname = 'chance_type')
        FROM unnest(tgattr::smallint[]) AS cols(attnum)
        JOIN pg_attribute a
          ON a.attrelid = tgrelid AND a.attnum = cols.attnum
      )
  ) THEN
    RAISE EXCEPTION 'FINAL_CHANCE_RECORD_TRIGGER_CONTRACT_MISMATCH';
  END IF;
END;
$triggers$;

-- NOT VALID preserves existing historical rows without scanning or rewriting
-- them, while PostgreSQL enforces the predicate for every new/changed row.
DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.extra_chance_details'::regclass
      AND conname = 'ecd_final_chance_new_write_chk'
  ) THEN
    ALTER TABLE public.extra_chance_details
      ADD CONSTRAINT ecd_final_chance_new_write_chk
      CHECK (chance_type = 'final_chance') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.extra_chance_details'::regclass
      AND c.conname = 'ecd_final_chance_new_write_chk'
      AND c.contype = 'c'
      AND c.convalidated = false
      AND c.connoinherit = false
      AND pg_get_expr(c.conbin, c.conrelid) = '(chance_type = ''final_chance''::text)'
  ) THEN
    RAISE EXCEPTION 'FINAL_CHANCE_DETAIL_CONSTRAINT_CONTRACT_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.student_extra_chances'::regclass
      AND conname = 'sxc_final_chance_new_write_chk'
  ) THEN
    ALTER TABLE public.student_extra_chances
      ADD CONSTRAINT sxc_final_chance_new_write_chk
      CHECK (chance_type = 'final_chance') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.student_extra_chances'::regclass
      AND c.conname = 'sxc_final_chance_new_write_chk'
      AND c.contype = 'c'
      AND c.convalidated = false
      AND c.connoinherit = false
      AND pg_get_expr(c.conbin, c.conrelid) = '(chance_type = ''final_chance''::text)'
  ) THEN
    RAISE EXCEPTION 'FINAL_CHANCE_RECORD_CONSTRAINT_CONTRACT_MISMATCH';
  END IF;
END;
$constraints$;

-- Direct client detail writes remain closed until the atomic server-side B1
-- submit boundary is installed and reviewed.
REVOKE ALL PRIVILEGES ON public.extra_chance_details FROM authenticated;
GRANT SELECT ON public.extra_chance_details TO authenticated;

COMMIT;
