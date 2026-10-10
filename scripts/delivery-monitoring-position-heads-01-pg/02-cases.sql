\set ON_ERROR_STOP on
-- Direct-RPC authorization matrix AFTER the draft (role `authenticated` + JWT subject).
DO $cases$
DECLARE
  cs_a constant uuid := '5ec00000-0000-4000-8000-0000000000a1';
  it_a constant uuid := '5ec00000-0000-4000-8000-0000000000b1';
  denied constant text := 'ERR:CDP_NOT_AUTHORIZED';
  v text; j jsonb; i integer;
BEGIN
  -- position-only head: was denied, now sees ONLY his position's department
  IF (SELECT mon FROM public.hp_before WHERE hp_before.n = 1) <> denied THEN RAISE EXCEPTION 'CASE_FAIL: fixture 1 was not denied before'; END IF;
  v := public.hp_sections(1);
  IF v <> 'department:CS101-A,CS101-B' THEN RAISE EXCEPTION 'CASE_FAIL: position head sees %', v; END IF;
  j := public.hp_mon(1)::jsonb;
  IF j->'departments' <> '[{"department_name_ar": "علوم الحاسوب"}]'::jsonb OR (j->'totals'->>'sections')::int <> 2
     OR (SELECT sum((r->>'count')::int) FROM jsonb_array_elements(j->'reasons') r) <> 2 THEN
    RAISE EXCEPTION 'CASE_FAIL: position head scope payload %', j - 'rows';
  END IF;
  RAISE NOTICE 'ok: position-only head (faculty profile in another department) -> department scope, CS sections only';
  -- drill-down: reads his department's section (no manage, no internal notes); other departments denied
  j := public.hp_plan(1, cs_a)::jsonb;
  IF (j->>'can_manage')::boolean OR jsonb_array_length(j->'sessions') <> 2
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(j->'sessions') s WHERE s->>'reason' IS NOT NULL OR s->>'notes' IS NOT NULL) THEN
    RAISE EXCEPTION 'CASE_FAIL: position head drill-down %', j;
  END IF;
  IF public.hp_plan(1, it_a) <> denied THEN RAISE EXCEPTION 'CASE_FAIL: position head opened another department'; END IF;
  RAISE NOTICE 'ok: position-only head drill-down -> read-only own department, other department denied';

  -- unchanged actors: byte-identical monitoring payload and drill-downs before/after
  FOR i IN SELECT x FROM unnest(ARRAY[2, 3, 4, 5, 6, 7, 16]) x LOOP
    IF (SELECT b.mon IS DISTINCT FROM public.hp_mon(i) OR b.plan_cs IS DISTINCT FROM public.hp_plan(i, cs_a)
               OR b.plan_it IS DISTINCT FROM public.hp_plan(i, it_a) FROM public.hp_before b WHERE b.n = i) THEN
      RAISE EXCEPTION 'CASE_FAIL: actor % changed', i;
    END IF;
  END LOOP;
  IF public.hp_sections(2) <> 'department:IT101-A' THEN RAISE EXCEPTION 'CASE_FAIL: legacy head %', public.hp_sections(2); END IF;
  FOR i IN SELECT x FROM unnest(ARRAY[3, 4, 5, 6, 16]) x LOOP
    IF public.hp_sections(i) <> 'college:CS101-A,CS101-B,IS101-A,IT101-A' THEN RAISE EXCEPTION 'CASE_FAIL: college actor % sees %', i, public.hp_sections(i); END IF;
  END LOOP;
  RAISE NOTICE 'ok: legacy-role head, dean, admin, system_admin, registrar, student_affairs -> identical before/after';

  -- denied: plain faculty and every non-qualifying position shape
  FOR i IN SELECT x FROM unnest(ARRAY[7, 8, 9, 10, 11, 12, 13]) x LOOP
    IF public.hp_mon(i) <> denied THEN RAISE EXCEPTION 'CASE_FAIL: actor % must be denied, got %', i, left(public.hp_mon(i), 80); END IF;
    IF (SELECT b.plan_cs IS DISTINCT FROM public.hp_plan(i, cs_a) OR b.plan_it IS DISTINCT FROM public.hp_plan(i, it_a)
        FROM public.hp_before b WHERE b.n = i) THEN
      RAISE EXCEPTION 'CASE_FAIL: drill-down of actor % changed', i;
    END IF;
  END LOOP;
  IF public.hp_plan(7, cs_a) LIKE 'ERR:%' OR public.hp_plan(7, it_a) <> denied THEN RAISE EXCEPTION 'CASE_FAIL: plain faculty own/other section'; END IF;
  RAISE NOTICE 'ok: plain faculty, ended / inactive / future assignment, NULL-department head position, inactive position, non-head position -> CDP_NOT_AUTHORIZED';

  -- legacy + position together: union of both departments (assignment ends today = still valid)
  IF public.hp_sections(15) <> 'department:IS101-A,IT101-A' THEN RAISE EXCEPTION 'CASE_FAIL: union head %', public.hp_sections(15); END IF;
  -- documented behaviour change: legacy role with no department used to get an EMPTY page, now a clear denial
  IF (SELECT mon::jsonb->'totals'->>'sections' FROM public.hp_before b WHERE b.n = 14) <> '0' OR public.hp_mon(14) <> denied THEN
    RAISE EXCEPTION 'CASE_FAIL: department-less legacy role';
  END IF;
  RAISE NOTICE 'ok: legacy+position head -> both departments; department-less legacy role: empty page before, denied now';

  IF public.hp_mon(NULL) <> 'ERR:CDP_UNAUTHENTICATED' THEN RAISE EXCEPTION 'CASE_FAIL: unauthenticated'; END IF;
  v := public.hp_call(1, 'SELECT count(*)::text FROM public.delivery_monitoring_headed_departments(public.hp_u(3))');
  IF v NOT LIKE 'ERR:permission denied%' THEN RAISE EXCEPTION 'CASE_FAIL: helper callable by authenticated: %', v; END IF;
  RAISE NOTICE 'ok: unauthenticated denied; helper not executable by API roles';
  RAISE NOTICE 'DELIVERY_MONITORING_POSITION_HEADS_01_CASES_PASS';
END $cases$;
