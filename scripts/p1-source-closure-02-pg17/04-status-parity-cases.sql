-- 06A: production parity for request_type_workflows_status_chk.
-- The previous harness allowed 'published' and masked a production incompatibility.
\set ON_ERROR_STOP on

DO $$
DECLARE v_def text; v_type uuid;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conname = 'request_type_workflows_status_chk';
  PERFORM public.t_expect('HARNESS_PRODUCTION_STATUS_PARITY constraint exists', v_def IS NOT NULL);
  PERFORM public.t_expect('HARNESS_PRODUCTION_STATUS_PARITY draft|active|retired',
    v_def LIKE '%draft%' AND v_def LIKE '%active%' AND v_def LIKE '%retired%'
    AND v_def NOT LIKE '%published%');

  SELECT id INTO v_type FROM public.request_types WHERE code = 'october_exam_entry_form';
  PERFORM public.t_expect('parity fixture request type present', v_type IS NOT NULL);

  -- PUBLISHED_STATUS_REJECTED
  PERFORM public.t_raises(
    'PUBLISHED_STATUS_REJECTED',
    format($q$INSERT INTO public.request_type_workflows
      (request_type_id, code, name_ar, version, status, is_active)
      VALUES (%L, 'p1_parity_published', 'parity', 99, 'published', false)$q$, v_type),
    'request_type_workflows_status_chk');

  -- ACTIVE_STATUS_ACCEPTED
  INSERT INTO public.request_type_workflows
    (request_type_id, code, name_ar, version, status, is_active)
  VALUES (v_type, 'p1_parity_active', 'parity', 99, 'active', false);
  PERFORM public.t_expect('ACTIVE_STATUS_ACCEPTED',
    EXISTS (SELECT 1 FROM public.request_type_workflows
            WHERE code = 'p1_parity_active' AND status = 'active'));
  DELETE FROM public.request_type_workflows WHERE code = 'p1_parity_active';
END $$;

-- Seeded P1 workflows must all be 'active', never 'published'.
DO $$
DECLARE v_bad int; v_active int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.request_type_workflows WHERE status = 'published';
  PERFORM public.t_expect('no published workflow rows after P1-03', v_bad = 0);
  SELECT count(*) INTO v_active FROM public.request_type_workflows
   WHERE change_note = 'P1 source closure 02 seed' AND status = 'active' AND is_active;
  PERFORM public.t_expect('P1-03 seeded workflows are active', v_active >= 1);
  RAISE NOTICE 'P1_03_SEEDED_ACTIVE_WORKFLOWS=%', v_active;
END $$;

-- student_visible must remain untouched by P1-03.
DO $$
DECLARE v_vis int;
BEGIN
  SELECT count(*) INTO v_vis FROM public.request_types
   WHERE code IN ('october_exam_entry_form','replacement_student_card','grade_appeal')
     AND student_visible;
  PERFORM public.t_expect('P1-03 leaves P1 services hidden', v_vis = 0);
END $$;
