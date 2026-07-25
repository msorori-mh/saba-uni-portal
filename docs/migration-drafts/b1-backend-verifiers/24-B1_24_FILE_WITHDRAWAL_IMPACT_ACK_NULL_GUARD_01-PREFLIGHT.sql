-- READ ONLY
-- Preflight for B1 order 24 (FILE_WITHDRAWAL_IMPACT_ACK_NULL_GUARD_01)
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: prerequisite function missing for order 24';
  END IF;
END $$;
ROLLBACK;
