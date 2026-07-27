-- READ ONLY
-- Post-verifier for B1 order 27 (ACT_ON_ACADEMIC_EFFECT_INTEGRATION_01)
BEGIN;
DO $$
DECLARE v_body text;
BEGIN
  SELECT pg_get_functiondef('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure) INTO v_body;
  IF position('apply_b1_academic_effect_for_request' IN v_body)=0 THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: academic-effect dispatcher is not integrated';
  END IF;
END $$;
ROLLBACK;
