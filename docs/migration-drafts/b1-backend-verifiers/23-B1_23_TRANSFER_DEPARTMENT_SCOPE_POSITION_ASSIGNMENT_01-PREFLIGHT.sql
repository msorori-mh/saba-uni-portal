-- Preflight for B1 order 23 (TRANSFER_DEPARTMENT_SCOPE_POSITION_ASSIGNMENT_01)
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.current_user_matches_transfer_department_scope(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: prerequisite function missing for order 23';
  END IF;
END $$;
ROLLBACK;
