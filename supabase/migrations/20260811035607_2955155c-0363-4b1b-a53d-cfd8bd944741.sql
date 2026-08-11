DO $$
DECLARE
  v_tag text := 'GA_E2E_MATRIX_01';
  v_graduate uuid;
  v_record uuid := '4d35f5da-2d67-4fd2-8b43-0453aa6eea16';
  v_event uuid;
  v_int integer;
  v_err text;
BEGIN
  DELETE FROM public.ga_e2e_matrix_results WHERE run_tag = v_tag AND case_no IN (22,23,24);
  SELECT sp.user_id INTO v_graduate
  FROM public.graduate_records r JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE r.id = v_record;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_graduate, 'role','authenticated')::text, true);

  SELECT count(*) INTO v_int FROM public.graduate_list_self_surveys(v_record);
  INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
  VALUES (v_tag,22,'graduate_list_self_surveys','allow', CASE WHEN v_int >= 1 THEN 'PASS' ELSE 'FAIL' END, v_int::text);

  SELECT count(*) INTO v_int FROM public.graduate_my_consents(v_record);
  INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
  VALUES (v_tag,23,'graduate_my_consents','allow', CASE WHEN v_int >= 1 THEN 'PASS' ELSE 'FAIL' END, v_int::text);

  SELECT id INTO v_event FROM public.graduate_events WHERE state = 'published' AND starts_at > now() LIMIT 1;
  BEGIN
    PERFORM public.graduate_register_for_event(v_event, v_record, '00000000-0000-0000-0000-000000000000');
    INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
    VALUES (v_tag,24,'event registration with invalid consent','deny','FAIL','accepted');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
    VALUES (v_tag,24,'event registration with invalid consent','deny',
      CASE WHEN v_err = 'GRADUATE_EVENT_CONSENT_INVALID' THEN 'PASS' ELSE 'FAIL' END, v_err);
  END;
END $$;