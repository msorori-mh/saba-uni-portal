-- MISSION 08C / G2 — rebind ONLY the TEST_ONLY section TESTONLY-P1 to a TEST_ONLY instructor.
-- No real faculty row, no real faculty profile and no real course section is touched.
DO $do$
DECLARE
  v_section uuid := '4c3a9388-ef3a-4bcd-9d47-671ec4b00647';
  v_testonly_fp uuid := '12a28908-cdcf-5234-8832-797555e8db25';
  v_code text;
  v_ok boolean;
BEGIN
  SELECT section_code INTO v_code FROM public.course_sections WHERE id = v_section FOR UPDATE;
  IF v_code IS DISTINCT FROM 'TESTONLY-P1' THEN
    RAISE EXCEPTION 'G2_SECTION_NOT_TESTONLY:%', COALESCE(v_code,'<missing>');
  END IF;

  SELECT (fp.status='active' AND fp.user_id IS NOT NULL AND fp.full_name_ar LIKE '%TEST_ONLY%')
    INTO v_ok FROM public.faculty_profiles fp WHERE fp.id = v_testonly_fp;
  IF NOT COALESCE(v_ok,false) THEN
    RAISE EXCEPTION 'G2_INSTRUCTOR_FIXTURE_NOT_TESTONLY_OR_INACTIVE';
  END IF;

  UPDATE public.course_sections
  SET faculty_profile_id = v_testonly_fp, updated_at = now()
  WHERE id = v_section AND section_code = 'TESTONLY-P1';

  IF NOT EXISTS (
    SELECT 1 FROM public.course_sections
    WHERE id = v_section AND faculty_profile_id = v_testonly_fp
  ) THEN RAISE EXCEPTION 'G2_REBIND_FAILED'; END IF;
END
$do$;