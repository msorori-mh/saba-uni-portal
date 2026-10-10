-- Runs in a clone where the draft was applied WITHOUT its engine patches.
-- Proves the function changes are required, not optional: the unpatched
-- strict initializer resolves `department_head_signature` across ALL
-- departments and refuses to start the cycle.
DO $$
DECLARE v_err text;
BEGIN
  INSERT INTO public.student_requests (id, student_profile_id, request_type, request_number, title, status)
  VALUES ('99999999-9999-9999-9999-0000000000aa','77777777-7777-7777-7777-000000000001',
          'excused_absence','SR-TESTONLY-EAWF01-UNPATCHED','غياب بعذر','submitted');
  BEGIN
    PERFORM public.initialize_b1_request_workflow_strict('99999999-9999-9999-9999-0000000000aa','excused_absence');
    v_err := 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF v_err NOT LIKE 'B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:department_head_signature:%' THEN
    RAISE EXCEPTION 'NECESSITY_PROBE_FAIL: %', v_err;
  END IF;
  RAISE NOTICE 'ok: unpatched engine refuses the new cycle: %', v_err;
END $$;
