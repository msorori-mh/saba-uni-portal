-- Post-fix + idempotency + fail-closed + rollback proofs.
DO $verify$
DECLARE
  v_five_false integer;
  v_ec_visible boolean;
  v_ec_marker text;
  v_unrelated_grade boolean;
  v_unrelated_transcript boolean;
  v_unrelated_active boolean;
BEGIN
  SELECT count(*) INTO v_five_false
  FROM public.request_types
  WHERE code IN (
      'enrollment_suspension','excused_absence','department_transfer',
      'final_chance','file_withdrawal'
    )
    AND student_visible IS FALSE;
  IF v_five_false <> 5 THEN
    RAISE EXCEPTION 'VERIFY_FAIL: five not all false (got %)', v_five_false;
  END IF;

  SELECT student_visible, marker
    INTO v_ec_visible, v_ec_marker
  FROM public.request_types
  WHERE code = 'enrollment_certificate';
  IF v_ec_visible IS DISTINCT FROM true OR v_ec_marker IS DISTINCT FROM 'ec' THEN
    RAISE EXCEPTION 'VERIFY_FAIL: enrollment_certificate changed';
  END IF;

  SELECT student_visible, is_active
    INTO v_unrelated_grade, v_unrelated_active
  FROM public.request_types
  WHERE code = 'grade_appeal';
  IF v_unrelated_grade IS DISTINCT FROM true OR v_unrelated_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY_FAIL: grade_appeal changed';
  END IF;

  SELECT student_visible INTO v_unrelated_transcript
  FROM public.request_types
  WHERE code = 'official_transcript';
  IF v_unrelated_transcript IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'VERIFY_FAIL: official_transcript changed';
  END IF;

  RAISE NOTICE 'B1_34_VERIFY_PASS';
END
$verify$;
