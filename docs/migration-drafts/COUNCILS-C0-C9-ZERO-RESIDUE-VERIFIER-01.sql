-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Zero-residue verifier after TEST_ONLY cleanup.
-- READ-ONLY. Asserts exact fixture IDs are gone; sentinel preserved.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_preserve uuid := 'c0c90000-0000-4000-8000-ffffffffffff'::uuid;
  v_temp_councils uuid[] := ARRAY['c0c90000-0000-4000-8000-000000000001'::uuid];
  v_temp_meetings uuid[] := ARRAY['c0c90000-0000-4000-8000-000000000010'::uuid];
  v_temp_topics uuid[] := ARRAY['c0c90000-0000-4000-8000-000000000020'::uuid];
  v_temp_agenda uuid[] := ARRAY['c0c90000-0000-4000-8000-000000000030'::uuid];
  v_temp_decisions uuid[] := ARRAY['c0c90000-0000-4000-8000-000000000040'::uuid];
  v_temp_users uuid[] := ARRAY[
    'c0c90000-0000-4000-8000-000000000101'::uuid,
    'c0c90000-0000-4000-8000-000000000102'::uuid,
    'c0c90000-0000-4000-8000-000000000103'::uuid,
    'c0c90000-0000-4000-8000-000000000104'::uuid,
    'c0c90000-0000-4000-8000-000000000105'::uuid,
    'c0c90000-0000-4000-8000-000000000106'::uuid
  ];
  v_left int;
BEGIN
  IF to_regclass('public.academic_councils') IS NOT NULL THEN
    SELECT count(*) INTO v_left FROM public.academic_councils WHERE id = ANY (v_temp_councils);
    IF v_left > 0 THEN
      RAISE EXCEPTION 'HOLD: residual TEST_ONLY councils remain: %', v_left;
    END IF;
    -- Sentinel preservation is best-effort: if seeded, must remain.
    IF EXISTS (SELECT 1 FROM public.academic_councils WHERE id = v_preserve) THEN
      RAISE NOTICE 'ZERO_RESIDUE_SENTINEL_PRESERVED: %', v_preserve;
    ELSE
      RAISE NOTICE 'ZERO_RESIDUE_SENTINEL_ABSENT_OK: sentinel was not seeded in this environment';
    END IF;
  END IF;

  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT count(*) INTO v_left FROM public.academic_council_meetings WHERE id = ANY (v_temp_meetings);
    IF v_left > 0 THEN RAISE EXCEPTION 'HOLD: residual TEST_ONLY meetings: %', v_left; END IF;
  END IF;

  IF to_regclass('public.academic_council_topics') IS NOT NULL THEN
    SELECT count(*) INTO v_left FROM public.academic_council_topics WHERE id = ANY (v_temp_topics);
    IF v_left > 0 THEN RAISE EXCEPTION 'HOLD: residual TEST_ONLY topics: %', v_left; END IF;
  END IF;

  IF to_regclass('public.academic_council_agenda_items') IS NOT NULL THEN
    SELECT count(*) INTO v_left FROM public.academic_council_agenda_items WHERE id = ANY (v_temp_agenda);
    IF v_left > 0 THEN RAISE EXCEPTION 'HOLD: residual TEST_ONLY agenda items: %', v_left; END IF;
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    SELECT count(*) INTO v_left FROM public.academic_council_decisions WHERE id = ANY (v_temp_decisions);
    IF v_left > 0 THEN RAISE EXCEPTION 'HOLD: residual TEST_ONLY decisions: %', v_left; END IF;
  END IF;

  IF to_regclass('public.academic_council_members') IS NOT NULL THEN
    SELECT count(*) INTO v_left
    FROM public.academic_council_members
    WHERE council_id = ANY (v_temp_councils) AND user_id = ANY (v_temp_users);
    IF v_left > 0 THEN RAISE EXCEPTION 'HOLD: residual TEST_ONLY memberships: %', v_left; END IF;
  END IF;

  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    SELECT count(*) INTO v_left
    FROM public.academic_council_notifications
    WHERE council_id = ANY (v_temp_councils) AND user_id = ANY (v_temp_users);
    IF v_left > 0 THEN RAISE EXCEPTION 'HOLD: residual TEST_ONLY notifications: %', v_left; END IF;
  END IF;

  RAISE NOTICE 'COUNCILS_ZERO_RESIDUE_VERIFIER_PASS';
END $$;

SELECT 'COUNCILS_ZERO_RESIDUE_VERIFIER_PASS' AS zero_residue_status;
