-- READ ONLY
-- Post-verifier for B1 order 24 (FILE_WITHDRAWAL_IMPACT_ACK_NULL_GUARD_01)
BEGIN;
DO $$
DECLARE v_body text;
BEGIN
  SELECT pg_get_functiondef('public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])'::regprocedure) INTO v_body;
  IF position('IS DISTINCT FROM' IN v_body) = 0 THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: expected contract marker missing for order 24';
  END IF;
END $$;
ROLLBACK;
