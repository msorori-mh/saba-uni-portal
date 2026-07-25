-- Post-verifier for B1 order 23 (TRANSFER_DEPARTMENT_SCOPE_POSITION_ASSIGNMENT_01)
BEGIN;
DO $$
DECLARE v_body text;
BEGIN
  SELECT pg_get_functiondef('public.current_user_matches_transfer_department_scope(uuid,text)'::regprocedure) INTO v_body;
  IF position('assigned_position_assignment_id' IN v_body) = 0 THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: expected contract marker missing for order 23';
  END IF;
END $$;
ROLLBACK;
