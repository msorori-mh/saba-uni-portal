DO $$
DECLARE v_locked int; v_updated int; v_hidden int; v_ec_ok boolean; v_other int;
BEGIN
  SELECT count(*) INTO v_locked FROM (
    SELECT 1 FROM public.request_types
    WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
    FOR UPDATE) s;
  IF v_locked <> 5 THEN RAISE EXCEPTION 'B1_RELEASE_LOCK_COUNT_MISMATCH: %', v_locked; END IF;

  IF EXISTS (SELECT 1 FROM public.request_types
             WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
               AND (is_active IS DISTINCT FROM true OR student_visible IS DISTINCT FROM false))
  THEN RAISE EXCEPTION 'B1_RELEASE_PRECONDITION_MISMATCH'; END IF;

  UPDATE public.request_types SET student_visible = true, updated_at = now()
  WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 5 THEN RAISE EXCEPTION 'B1_RELEASE_UPDATE_COUNT_MISMATCH: %', v_updated; END IF;

  SELECT count(*) INTO v_hidden FROM public.request_types
   WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
     AND (student_visible IS DISTINCT FROM true OR is_active IS DISTINCT FROM true);
  IF v_hidden <> 0 THEN RAISE EXCEPTION 'B1_RELEASE_POST_HIDDEN: %', v_hidden; END IF;

  SELECT (is_active AND student_visible) INTO v_ec_ok FROM public.request_types WHERE code='enrollment_certificate';
  IF v_ec_ok IS NOT TRUE THEN RAISE EXCEPTION 'B1_RELEASE_EC_STATE_CHANGED'; END IF;

  SELECT count(*) INTO v_other FROM public.request_types
   WHERE code NOT IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
     AND updated_at > now() - interval '5 seconds';
  IF v_other <> 0 THEN RAISE EXCEPTION 'B1_RELEASE_NON_TARGET_TOUCHED: %', v_other; END IF;
END $$;