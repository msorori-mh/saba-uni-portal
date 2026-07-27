-- READ ONLY
-- Preflight for B1 order 27 (ACT_ON_ACADEMIC_EFFECT_INTEGRATION_01)
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.apply_b1_academic_effect_for_request(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: order 27 function prerequisite missing';
  END IF;
END $$;
ROLLBACK;
