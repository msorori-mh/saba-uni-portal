-- READ ONLY
-- Post-verifier for B1-DRAFT-SAVE-RETURNED-STATUS-PARITY-01
BEGIN;
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure);

  IF position($new$not in ('draft','returned','returned_for_completion')$new$ IN v_def) = 0 THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: returned-status parity not present';
  END IF;
  IF position($old$if v_r.status is distinct from 'draft' then$old$ IN v_def) > 0 THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: legacy draft-only gate still present';
  END IF;
  -- Deny surface, ownership and version checks must be intact.
  IF position('b1_deny_draft_mutation' IN v_def) = 0
     OR position('B1_STALE_REQUEST_VERSION' IN v_def) = 0
     OR position('b1_require_active_student_profile' IN v_def) = 0
     OR position('b1_assert_draft_allowlist' IN v_def) = 0 THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: security invariants altered';
  END IF;
  IF has_function_privilege('anon',
      'public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: anon has EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated',
      'public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST_VERIFIER_FAIL: authenticated lost EXECUTE';
  END IF;
END $$;
ROLLBACK;
