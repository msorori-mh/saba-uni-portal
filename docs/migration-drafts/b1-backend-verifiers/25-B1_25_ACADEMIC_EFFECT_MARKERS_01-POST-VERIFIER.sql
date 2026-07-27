-- READ ONLY
-- Post-verifier for B1 order 25 (ACADEMIC_EFFECT_MARKERS_01)
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.enrollment_suspension_details'::regclass AND attname='effect_applied_at' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.transfer_request_details'::regclass AND attname='effect_applied_at' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.transfer_request_details'::regclass AND attname='previous_department_id' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.transfer_request_details'::regclass AND attname='previous_program_id' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.file_withdrawal_details'::regclass AND attname='effect_applied_at' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: academic-effect marker columns missing';
  END IF;
END $$;
ROLLBACK;
