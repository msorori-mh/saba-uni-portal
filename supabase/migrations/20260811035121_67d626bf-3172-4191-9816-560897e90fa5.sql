CREATE OR REPLACE FUNCTION public.graduate_affairs_cohort_employment_report(p_program_id uuid, p_graduation_year integer, p_minimum_cell_size integer DEFAULT 5)
 RETURNS TABLE(population bigint, employed bigint, specialization_related bigint, verified bigint, suppressed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_manager boolean;
  v_is_specialist boolean;
  v_program_department_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF p_program_id IS NULL OR p_graduation_year IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_INVALID_INPUT';
  END IF;
  v_is_manager := public.graduate_affairs_is_manager();
  v_is_specialist := public.graduate_affairs_is_specialist();
  IF NOT (v_is_manager OR v_is_specialist) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;
  IF v_is_specialist AND NOT v_is_manager THEN
    SELECT p.department_id INTO v_program_department_id
    FROM public.programs p
    WHERE p.id = p_program_id;
    IF v_program_department_id IS NULL
       OR v_program_department_id NOT IN (SELECT public.graduate_affairs_specialist_department_ids()) THEN
      RAISE EXCEPTION 'GRADUATE_AFFAIRS_OUT_OF_SCOPE';
    END IF;
  END IF;

  PERFORM public.graduate_affairs_audit(
    'graduate_cohort_report_read', 'graduate_program', p_program_id,
    'cohort_report', jsonb_build_object(
      'program_id', p_program_id,
      'graduation_year', p_graduation_year,
      'minimum_cell_size', p_minimum_cell_size));

  RETURN QUERY
  SELECT *
  FROM public.graduate_aggregate_employment_report(
    p_program_id, p_graduation_year, p_minimum_cell_size);
END;
$function$;

DO $$
DECLARE
  v_tag text := 'GA_E2E_MATRIX_01';
  v_manager uuid := '640b6cce-781a-4831-8950-c4b889204908';
  v_specialist uuid := 'c870a7ee-d328-410d-b9e8-408c2fb033d5';
  v_program uuid := '8df96335-4197-4e33-85ca-a970608f6a63';
  v_other_program uuid := '260a5be9-7680-4ce2-b0e0-683de4d93b05';
  v_year integer := EXTRACT(YEAR FROM (current_date - 30))::integer;
  v_supp boolean;
  v_pop bigint;
  v_err text;
BEGIN
  DELETE FROM public.ga_e2e_matrix_results WHERE run_tag = v_tag AND case_no IN (18,20,21);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role','authenticated')::text, true);
  SELECT population, suppressed INTO v_pop, v_supp
  FROM public.graduate_affairs_cohort_employment_report(v_program, v_year, 5);
  INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
  VALUES (v_tag,18,'cohort report small-cell suppression','suppress',
    CASE WHEN v_supp IS TRUE AND v_pop IS NULL THEN 'PASS' ELSE 'FAIL' END,
    format('population=%s suppressed=%s', v_pop, v_supp));

  BEGIN
    PERFORM * FROM public.graduate_affairs_cohort_employment_report(NULL, NULL, 5);
    INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
    VALUES (v_tag,20,'cohort report without program','deny','FAIL','accepted');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
    VALUES (v_tag,20,'cohort report without program','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_INVALID_INPUT' THEN 'PASS' ELSE 'FAIL' END, v_err);
  END;

  -- 21 negative: specialist requesting a program outside their department scope
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_specialist, 'role','authenticated')::text, true);
  BEGIN
    PERFORM * FROM public.graduate_affairs_cohort_employment_report(v_other_program, v_year, 5);
    INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
    VALUES (v_tag,21,'specialist out-of-scope cohort report','deny','FAIL','accepted');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    INSERT INTO public.ga_e2e_matrix_results(run_tag,case_no,case_name,expectation,outcome,detail)
    VALUES (v_tag,21,'specialist out-of-scope cohort report','deny',
      CASE WHEN v_err = 'GRADUATE_AFFAIRS_OUT_OF_SCOPE' THEN 'PASS' ELSE 'FAIL' END, v_err);
  END;
END $$;