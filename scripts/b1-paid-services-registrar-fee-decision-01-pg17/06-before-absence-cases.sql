-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 rehearsal (throwaway cluster ONLY).
-- 03-cases-v2-as-deployed.sql planted two fee assessments with the harness
-- superuser to exercise the old paid branch. The excused-absence case file,
-- re-run next, asserts that NO fee-assessment row exists at all, so the two
-- planted harness rows are removed here. Nothing else is touched.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.student_request_fee_assessments) <> 2
     OR EXISTS (SELECT 1 FROM public.student_request_fee_assessments f
                WHERE f.request_id NOT IN ('99999999-9999-9999-9999-0000000000d2', '99999999-9999-9999-9999-0000000000f2')) THEN
    RAISE EXCEPTION 'CASE_FAIL: unexpected fee-assessment rows — this package must never write one';
  END IF;
END $$;
DELETE FROM public.student_request_fee_assessments
WHERE request_id IN ('99999999-9999-9999-9999-0000000000d2', '99999999-9999-9999-9999-0000000000f2');
