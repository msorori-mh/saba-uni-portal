-- READ ONLY
-- Preflight for B1-DRAFT-SAVE-RETURNED-STATUS-PARITY-01
BEGIN;
DO $$
DECLARE v_def text;
BEGIN
  IF to_regprocedure('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: save_b1_request_draft_for_student missing';
  END IF;
  v_def := pg_get_functiondef('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure);
  IF position($old$if v_r.status is distinct from 'draft' then$old$ IN v_def) = 0
     AND position($new$not in ('draft','returned','returned_for_completion')$new$ IN v_def) = 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: unexpected status gate shape';
  END IF;
  IF position('b1_deny_draft_mutation' IN v_def) = 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: opaque deny helper missing from body';
  END IF;
END $$;
ROLLBACK;
