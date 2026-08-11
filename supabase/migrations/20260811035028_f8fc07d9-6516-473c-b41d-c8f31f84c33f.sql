CREATE TABLE IF NOT EXISTS public.ga_e2e_matrix_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_tag text NOT NULL,
  case_no integer NOT NULL,
  case_name text NOT NULL,
  expectation text NOT NULL,
  outcome text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ga_e2e_matrix_results TO service_role;
ALTER TABLE public.ga_e2e_matrix_results ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_tag text := 'GA_E2E_MATRIX_01';
  v_grad_user uuid := '8414b3b6-7a8a-4c78-85d3-b15fefd92a47';
  v_other_student uuid := '6dbd7a8e-a98b-463a-96ad-bb3da456803b';
  v_specialist uuid := 'c870a7ee-d328-410d-b9e8-408c2fb033d5';
  v_manager uuid := '640b6cce-781a-4831-8950-c4b889204908';
  v_registrar uuid := '4c261c1c-97fb-42da-a544-e8a59853ebe3';
  v_record uuid;
  v_version uuid;
  v_event uuid;
  v_consent_survey uuid;
  v_consent_event uuid;
  v_tmp uuid;
  v_int integer;
  v_json jsonb;
  v_err text;
  v_program uuid := '8df96335-4197-4e33-85ca-a970608f6a63';
BEGIN
  DELETE FROM public.ga_e2e_matrix_results WHERE run_tag = v_tag;

  SELECT id INTO v_record FROM public.graduate_records
   WHERE official_decision_id = (SELECT id FROM public.graduate_official_decisions WHERE source_reference='TEST_ONLY_GA_E2E_01');
  SELECT sv.id INTO v_version FROM public.graduate_survey_versions sv
    JOIN public.graduate_surveys s ON s.id = sv.survey_id
   WHERE s.title = 'استبيان توظيف الخريجين — TEST_ONLY_GA_E2E_01';
  SELECT id INTO v_event FROM public.graduate_events WHERE title = 'ملتقى الخريجين المهني — TEST_ONLY_GA_E2E_01';

  -- helper: set actor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_grad_user, 'role','authenticated')::text, true);

  -- 1 positive: self context
  v_json := public.graduate_affairs_resolve_self_context('profile_self_service');
  INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
  VALUES (v_tag,1,'graduate_affairs_resolve_self_context (graduate)','allow',
    CASE WHEN (v_json->>'owns_graduate_record')::boolean AND (v_json->>'graduate_record_id') = v_record::text
         THEN 'PASS' ELSE 'FAIL' END, v_json::text);

  -- 2 positive: grant survey consent
  v_consent_survey := public.graduate_grant_consent(v_record,'survey_participation','ga-notice-v1');
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,2,'graduate_grant_consent survey','allow',
    CASE WHEN v_consent_survey IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, v_consent_survey::text, now());

  -- 3 positive: submit valid survey response
  v_tmp := public.graduate_submit_survey_response(v_version, v_record, v_consent_survey,
    '{"employment_status":"employed","comments":"تجربة اختبارية"}'::jsonb);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,3,'graduate_submit_survey_response valid','allow',
    CASE WHEN v_tmp IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, v_tmp::text, now());

  -- 4 negative: unknown answer key
  BEGIN
    PERFORM public.graduate_submit_survey_response(v_version, v_record, v_consent_survey,
      '{"employment_status":"employed","evil_key":"x"}'::jsonb);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,4,'survey unknown key','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,4,'survey unknown key','deny',
      CASE WHEN v_err LIKE 'GRADUATE_SURVEY_UNKNOWN_KEY%' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 5 negative: invalid option
  BEGIN
    PERFORM public.graduate_submit_survey_response(v_version, v_record, v_consent_survey,
      '{"employment_status":"hacker"}'::jsonb);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,5,'survey invalid option','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,5,'survey invalid option','deny',
      CASE WHEN v_err LIKE 'GRADUATE_SURVEY_INVALID_OPTION%' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 6 negative: required missing
  BEGIN
    PERFORM public.graduate_submit_survey_response(v_version, v_record, v_consent_survey, '{"comments":"x"}'::jsonb);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,6,'survey required missing','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,6,'survey required missing','deny',
      CASE WHEN v_err LIKE 'GRADUATE_SURVEY_REQUIRED_MISSING%' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 7 positive: event consent + registration
  v_consent_event := public.graduate_grant_consent(v_record,'event_participation','ga-notice-v1');
  v_tmp := public.graduate_register_for_event(v_event, v_record, v_consent_event);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,7,'graduate_register_for_event','allow',
    CASE WHEN v_tmp IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, v_tmp::text, now());

  -- 8 negative: register for unknown/unpublished event
  BEGIN
    PERFORM public.graduate_register_for_event(gen_random_uuid(), v_record, v_consent_event);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,8,'register unpublished event','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,8,'register unpublished event','deny',
      CASE WHEN v_err = 'GRADUATE_EVENT_NOT_OPEN' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 9 positive: employment self report
  v_tmp := public.graduate_report_employment(v_record,'employed','شركة اختبارية','مطور برمجيات','directly_related', current_date - 10, NULL);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,9,'graduate_report_employment','allow',
    CASE WHEN v_tmp IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, v_tmp::text, now());

  -- 10 positive: update own profile
  SELECT COALESCE(row_version,0) INTO v_int FROM public.graduate_profiles WHERE graduate_record_id = v_record;
  v_int := COALESCE(v_int, 0);
  v_int := public.graduate_update_own_profile(v_record,'خريج اختباري','email','ملخص مهني اختباري','graduates_affairs', v_int);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,10,'graduate_update_own_profile','allow',
    CASE WHEN v_int > 0 THEN 'PASS' ELSE 'FAIL' END, v_int::text, now());

  -- 11 positive: visible lists
  SELECT count(*) INTO v_int FROM public.graduate_list_visible_opportunities(v_record);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,11,'graduate_list_visible_opportunities','allow',
    CASE WHEN v_int >= 1 THEN 'PASS' ELSE 'FAIL' END, v_int::text, now());

  -- 12 negative: other student acts on this record
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_student, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.graduate_grant_consent(v_record,'survey_participation','ga-notice-v1');
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,12,'other student grant consent','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,12,'other student grant consent','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_ACCESS_DENIED' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 13 negative: other student reads staff file
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,13,'student reads staff file','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,13,'student reads staff file','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_ACCESS_DENIED' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 14 negative: registrar (no GA assignment) reads staff file
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_registrar, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,14,'registrar reads staff file','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,14,'registrar reads staff file','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_ACCESS_DENIED' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 15 positive: specialist in-scope reads file
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_specialist, 'role','authenticated')::text, true);
  v_json := public.graduate_affairs_get_graduate_file(v_record);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,15,'specialist reads in-scope file','allow',
    CASE WHEN v_json->'record'->>'id' = v_record::text THEN 'PASS' ELSE 'FAIL' END, left(v_json::text,200), now());

  -- 16 positive: specialist creates + transitions followup
  v_tmp := public.graduate_affairs_create_followup(v_record, v_specialist, 'employment_verification', now() + interval '3 days');
  PERFORM public.graduate_affairs_transition_followup(v_tmp, 'in_progress', NULL, now() + interval '5 days');
  PERFORM public.graduate_affairs_transition_followup(v_tmp, 'completed', 'تم التحقق', NULL);
  SELECT state::text INTO v_err FROM public.graduate_followups WHERE id = v_tmp;
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,16,'specialist followup lifecycle','allow',
    CASE WHEN v_err = 'completed' THEN 'PASS' ELSE 'FAIL' END, v_err, now());

  -- 17 positive: manager searches records
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_int FROM public.graduate_affairs_search_records(NULL, NULL, NULL, 50);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,17,'manager search records','allow',
    CASE WHEN v_int >= 1 THEN 'PASS' ELSE 'FAIL' END, v_int::text, now());

  -- 18 privacy: cohort report suppresses small cells
  SELECT count(*) INTO v_int FROM public.graduate_affairs_cohort_employment_report(v_program, NULL, 5);
  INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,18,'cohort report small-cell suppression','suppress',
    CASE WHEN v_int = 0 THEN 'PASS' ELSE 'FAIL' END, v_int::text, now());

  -- 18b negative: cohort report without a program must fail closed
  BEGIN
    PERFORM * FROM public.graduate_affairs_cohort_employment_report(NULL, NULL, 5);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,20,'cohort report without program','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,20,'cohort report without program','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_INVALID_INPUT' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;

  -- 19 negative: anonymous caller
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.graduate_affairs_get_graduate_file(v_record);
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,19,'anonymous staff file read','deny','FAIL','accepted',now());
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results VALUES (gen_random_uuid(),v_tag,19,'anonymous staff file read','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED' THEN 'PASS' ELSE 'FAIL' END, v_err, now());
  END;
END $$;