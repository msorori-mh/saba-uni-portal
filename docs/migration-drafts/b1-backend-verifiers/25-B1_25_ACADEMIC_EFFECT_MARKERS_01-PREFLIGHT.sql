-- READ ONLY
-- Preflight for B1 order 25 (ACADEMIC_EFFECT_MARKERS_01)
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.enrollment_suspension_details') IS NULL
     OR to_regclass('public.transfer_request_details') IS NULL
     OR to_regclass('public.file_withdrawal_details') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: academic-effect detail table missing';
  END IF;
END $$;
ROLLBACK;
