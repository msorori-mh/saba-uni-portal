-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Order-1 release stamp for B1 ACL cutover sequencing.
-- Replace APPROVED_RELEASE_COMMIT_PLACEHOLDER with the exact deployed
-- origin/main (or approved release) 40-character lowercase SHA before promotion.
-- This draft must not be applied while the placeholder remains.

DO $stamp$
DECLARE
  v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';
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
