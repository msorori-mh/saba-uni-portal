DO $stamp$
DECLARE
  v_commit text := '0f388f494d869786f2a1ef56792509d70018d8d4';
  v_oid regprocedure := 'public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'::regprocedure;
BEGIN
  IF to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'B1_ATOMIC_CALLER_MISSING';
  END IF;

  IF v_commit = 'APPROVED_RELEASE_COMMIT_PLACEHOLDER'
     OR v_commit !~ '^[0-9a-f]{40}$'
  THEN
    RAISE EXCEPTION 'B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED';
  END IF;

  EXECUTE format(
    'COMMENT ON FUNCTION %s IS %L',
    v_oid,
    'B1_ATOMIC_CALLER_RELEASE_EVIDENCE=' || v_commit
  );
END
$stamp$;