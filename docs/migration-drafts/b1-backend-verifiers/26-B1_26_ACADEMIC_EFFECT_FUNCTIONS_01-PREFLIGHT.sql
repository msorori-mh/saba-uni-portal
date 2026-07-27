-- READ ONLY
-- Preflight for B1 order 26 (ACADEMIC_EFFECT_FUNCTIONS_01)
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.can_current_user_act_on_step(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: atomic action authorization prerequisite missing';
  END IF;
END $$;
ROLLBACK;
