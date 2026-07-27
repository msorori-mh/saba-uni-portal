-- READ ONLY
-- Post-verifier for B1 order 26 (ACADEMIC_EFFECT_FUNCTIONS_01)
BEGIN;
DO $$
DECLARE v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.apply_b1_enrollment_suspension_effect(uuid)',
    'public.apply_b1_excused_absence_effect(uuid)',
    'public.apply_b1_department_transfer_effect(uuid)',
    'public.apply_b1_final_chance_effect(uuid)',
    'public.apply_b1_file_withdrawal_effect(uuid)',
    'public.apply_b1_academic_effect_for_request(uuid)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'POST_VERIFIER_FAIL: effect function missing: %',v_signature;
    END IF;
    IF has_function_privilege('authenticated',v_signature,'EXECUTE') THEN
      RAISE EXCEPTION 'POST_VERIFIER_FAIL: authenticated has EXECUTE: %',v_signature;
    END IF;
  END LOOP;
END $$;
ROLLBACK;
