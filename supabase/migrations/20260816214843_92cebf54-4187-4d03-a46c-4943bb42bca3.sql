-- =====================================================================
-- P1-06 — ATOMIC SUBMIT PATH (forward-only)
-- Mission: PORTAL_REFORM_P1_06_CONTROLLED_PRODUCTION_APPLY_07B
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. P1 service predicate (independent of b1_e2e_88_is_five_service)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_is_atomic_submit_service(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_code IN (
    'october_exam_entry_form',
    'replacement_student_card',
    'grade_appeal'
  );
$$;

REVOKE ALL ON FUNCTION public.p1_is_atomic_submit_service(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_is_atomic_submit_service(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. P1 TEST_ONLY hidden-E2E registry (separate from B1-88)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.p1_e2e_07_executions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             text NOT NULL UNIQUE,
  marker             text NOT NULL DEFAULT 'TEST_ONLY_P1_E2E_07_',
  service_code       text NOT NULL,
  student_user_id    uuid NOT NULL,
  status             text NOT NULL DEFAULT 'active',
  starts_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT now() + interval '2 days',
  created_request_id uuid,
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p1_e2e_07_run_id_ns_chk CHECK (run_id LIKE 'TEST_ONLY_P1_E2E_07_%'),
  CONSTRAINT p1_e2e_07_marker_chk    CHECK (marker = 'TEST_ONLY_P1_E2E_07_'),
  CONSTRAINT p1_e2e_07_status_chk    CHECK (status IN ('active', 'closed')),
  CONSTRAINT p1_e2e_07_service_chk   CHECK (public.p1_is_atomic_submit_service(service_code))
);

REVOKE ALL ON public.p1_e2e_07_executions FROM PUBLIC;
GRANT ALL ON public.p1_e2e_07_executions TO service_role;
ALTER TABLE public.p1_e2e_07_executions ENABLE ROW LEVEL SECURITY;
-- intentionally: no policy for anon/authenticated (fail closed)

CREATE OR REPLACE FUNCTION public.p1_e2e_07_marker()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'TEST_ONLY_P1_E2E_07_'::text $$;

REVOKE ALL ON FUNCTION public.p1_e2e_07_marker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_e2e_07_marker() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.p1_actor_is_test_only(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_user IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u WHERE u.id = p_user;
  IF v_email IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_email LIKE 'test-only.%@usr.edu.ye';
END $$;

REVOKE ALL ON FUNCTION public.p1_actor_is_test_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_actor_is_test_only(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.p1_e2e_07_allows_hidden_submit(
  p_service_code text,
  p_run_id       text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run text := btrim(COALESCE(p_run_id, ''));
  v_exec public.p1_e2e_07_executions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_run = '' THEN
    RETURN NULL;
  END IF;
  IF NOT public.p1_is_atomic_submit_service(p_service_code) THEN
    RETURN NULL;
  END IF;
  IF v_run NOT LIKE public.p1_e2e_07_marker() || '%' THEN
    RETURN NULL;
  END IF;
  IF NOT public.p1_actor_is_test_only(v_uid) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_exec
  FROM public.p1_e2e_07_executions e
  WHERE e.run_id = v_run;

  IF NOT FOUND
     OR v_exec.status IS DISTINCT FROM 'active'
     OR v_exec.closed_at IS NOT NULL
     OR v_exec.expires_at <= now()
     OR v_exec.starts_at > now()
     OR v_exec.student_user_id IS DISTINCT FROM v_uid
     OR v_exec.service_code IS DISTINCT FROM p_service_code
     OR v_exec.created_request_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_exec.id;
END $$;

REVOKE ALL ON FUNCTION public.p1_e2e_07_allows_hidden_submit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_e2e_07_allows_hidden_submit(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Canonical detail presence predicate (used by the submit guards)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.p1_request_has_canonical_detail(
  p_request_id uuid,
  p_code       text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code = 'october_exam_entry_form' THEN
    RETURN EXISTS (SELECT 1 FROM public.october_exam_entry_details d WHERE d.request_id = p_request_id);
  ELSIF p_code = 'replacement_student_card' THEN
    RETURN EXISTS (SELECT 1 FROM public.replacement_card_details d WHERE d.request_id = p_request_id);
  ELSIF p_code = 'grade_appeal' THEN
    RETURN EXISTS (SELECT 1 FROM public.grade_appeal_details d WHERE d.request_id = p_request_id);
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.p1_request_has_canonical_detail(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_request_has_canonical_detail(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. THE ATOMIC SUBMIT RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_student_request_with_details(
  p_request_type  text,
  p_title         text,
  p_form_data     jsonb DEFAULT '{}'::jsonb,
  p_student_notes text DEFAULT NULL,
  p_test_run_id   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_student      uuid;
  v_status       text;
  v_audience     text;
  v_type         public.request_types%ROWTYPE;
  v_form         jsonb := COALESCE(p_form_data, '{}'::jsonb);
  v_request_id   uuid;
  v_request_no   text;
  v_exec_id      uuid;
  v_hidden       boolean := false;
  v_selected     uuid[];
  v_snapshot     jsonb;
  v_year         uuid;
  v_semester     uuid;
  v_loss_reason  text;
  v_loss_ack     boolean;
  v_loss_date    date;
  v_prev_serial  text;
  v_enrollment   uuid;
  v_section      uuid;
  v_course       uuid;
  v_appeal_ctx   jsonb;
  v_total        numeric;
  v_max_total    numeric;
  v_reason       text;
  v_init         jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'نوع الطلب مطلوب' USING ERRCODE = '22023';
  END IF;

  IF NOT public.p1_is_atomic_submit_service(p_request_type) THEN
    RAISE EXCEPTION 'P1_ATOMIC_SUBMIT_TYPE_NOT_SUPPORTED:%', p_request_type
      USING ERRCODE = '22023';
  END IF;

  v_student := public.p1_active_student_profile(v_uid);
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب نشط مرتبط بحسابك' USING ERRCODE = '42501';
  END IF;

  SELECT sp.status INTO v_status FROM public.student_profiles sp WHERE sp.id = v_student;

  SELECT * INTO v_type FROM public.request_types rt WHERE rt.code = p_request_type;
  IF NOT FOUND OR v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل' USING ERRCODE = '42501';
  END IF;
  v_audience := v_type.request_audience;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    v_exec_id := public.p1_e2e_07_allows_hidden_submit(p_request_type, p_test_run_id);
    IF v_exec_id IS NULL THEN
      RAISE EXCEPTION 'نوع الطلب غير متاح للطالب' USING ERRCODE = '42501';
    END IF;
    v_hidden := true;
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_status, v_audience);
  PERFORM public.assert_student_request_eligibility_rules(v_student, v_type.code);

  IF v_type.code = 'october_exam_entry_form' THEN
    SELECT COALESCE(array_agg(DISTINCT (x)::uuid), '{}'::uuid[])
    INTO v_selected
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(v_form->'remaining_courses') = 'array'
                THEN v_form->'remaining_courses' ELSE '[]'::jsonb END
         ) AS t(x);

    IF COALESCE(array_length(v_selected, 1), 0) = 0 THEN
      RAISE EXCEPTION 'OCTOBER_SELECTION_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

    v_snapshot := public.p1_assert_october_eligibility(v_student, v_selected);

    SELECT ay.id INTO v_year FROM public.academic_years ay WHERE ay.is_current LIMIT 1;
    SELECT s.id INTO v_semester FROM public.semesters s WHERE s.is_current LIMIT 1;

  ELSIF v_type.code = 'replacement_student_card' THEN
    PERFORM public.p1_assert_replacement_card_eligibility(v_student);

    v_loss_reason := btrim(COALESCE(v_form->>'loss_reason', ''));
    v_loss_ack    := COALESCE((v_form->>'loss_declaration_ack')::boolean, false);
    v_loss_date   := NULLIF(btrim(COALESCE(v_form->>'loss_incident_date', '')), '')::date;
    v_prev_serial := NULLIF(btrim(COALESCE(v_form->>'previous_card_serial', '')), '');

    IF length(v_loss_reason) < 3 THEN
      RAISE EXCEPTION 'REPLACEMENT_CARD_LOSS_REASON_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;
    IF v_loss_ack IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'REPLACEMENT_CARD_DECLARATION_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

  ELSE
    v_enrollment := NULLIF(btrim(COALESCE(v_form->>'final_result_id', '')), '')::uuid;
    IF v_enrollment IS NULL THEN
      RAISE EXCEPTION 'FINAL_RESULT_APPEAL_SELECTION_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

    v_reason := btrim(COALESCE(v_form->>'appeal_reason', ''));
    IF length(v_reason) < 3 THEN
      RAISE EXCEPTION 'FINAL_RESULT_APPEAL_REASON_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

    v_appeal_ctx := public.p1_assert_final_result_appeal_eligibility(v_student, v_enrollment, now());

    SELECT se.course_section_id, co.course_id, co.academic_year_id, co.semester_id
    INTO v_section, v_course, v_year, v_semester
    FROM public.student_enrollments se
    JOIN public.course_sections cs  ON cs.id = se.course_section_id
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    WHERE se.id = v_enrollment;

    IF v_section IS NULL OR v_year IS NULL OR v_semester IS NULL THEN
      RAISE EXCEPTION 'FINAL_RESULT_APPEAL_CONTEXT_INCOMPLETE' USING ERRCODE = 'check_violation';
    END IF;

    SELECT r.total, r.max_total INTO v_total, v_max_total
    FROM public.p1_enrollment_result(v_enrollment) r;
  END IF;

  v_request_no := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  IF v_hidden THEN
    v_form := v_form || jsonb_build_object(
      'p1_e2e_marker', public.p1_e2e_07_marker(),
      'p1_e2e_run_id', btrim(p_test_run_id),
      'p1_e2e_immutable', true
    );
  END IF;

  INSERT INTO public.student_requests (
    request_number, student_profile_id, request_type, title,
    description, status, form_data, student_notes
  ) VALUES (
    v_request_no, v_student, v_type.code, btrim(COALESCE(NULLIF(btrim(p_title), ''), v_type.name_ar)),
    p_student_notes, 'draft', v_form, p_student_notes
  )
  RETURNING id INTO v_request_id;

  IF v_type.code = 'october_exam_entry_form' THEN
    INSERT INTO public.october_exam_entry_details (
      request_id, student_profile_id, academic_year_id, semester_id,
      academic_level_order, remaining_courses_count,
      eligible_requirement_ids, selected_requirement_ids,
      eligibility_snapshot, approved_list_generated_at
    ) VALUES (
      v_request_id, v_student, v_year, v_semester,
      (v_snapshot->>'academic_level_order')::integer,
      (v_snapshot->>'remaining_courses_count')::integer,
      ARRAY(SELECT jsonb_array_elements_text(v_snapshot->'eligible_requirement_ids'))::uuid[],
      v_selected,
      v_snapshot,
      now()
    );

  ELSIF v_type.code = 'replacement_student_card' THEN
    INSERT INTO public.replacement_card_details (
      request_id, student_profile_id, loss_reason, loss_declaration_ack,
      loss_incident_date, previous_card_serial
    ) VALUES (
      v_request_id, v_student, v_loss_reason, true, v_loss_date, v_prev_serial
    );

  ELSE
    INSERT INTO public.grade_appeal_details (
      request_id, student_profile_id, academic_year_id, semester_id,
      course_section_id, student_enrollment_id, course_id,
      current_grade_total, current_grade_status, reason, appeal_kind,
      previous_final_result, final_result_published_at, appeal_window_end
    ) VALUES (
      v_request_id, v_student, v_year, v_semester,
      v_section, v_enrollment, v_course,
      v_total,
      CASE WHEN COALESCE(v_max_total, 0) > 0 AND (v_total / v_max_total) >= 0.48
           THEN 'passed' ELSE 'failed' END,
      v_reason, 'final_result',
      v_total,
      (v_appeal_ctx->>'final_result_published_at')::timestamptz,
      (v_appeal_ctx->>'appeal_window_end')::timestamptz
    );
  END IF;

  PERFORM set_config('student_request.submit_via_rpc', '1', true);

  UPDATE public.student_requests
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, now()),
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = v_request_id;

  v_init := public.initialize_student_request_workflow(v_request_id);

  IF COALESCE((v_init->>'initialized')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P1_WORKFLOW_INITIALIZATION_FAILED:%', COALESCE(v_init->>'reason', 'unknown')
      USING ERRCODE = '42501';
  END IF;

  IF v_hidden THEN
    UPDATE public.p1_e2e_07_executions e
    SET created_request_id = v_request_id
    WHERE e.id = v_exec_id
      AND e.created_request_id IS NULL
      AND e.student_user_id = v_uid
      AND e.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'P1_E2E_07_EXECUTION_CLAIM_FAILED' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_request_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_student_request_with_details(text, text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_student_request_with_details(text, text, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_student_request_with_details(text, text, jsonb, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. CLOSE THE GENERIC CREATE BYPASS (create_student_request)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text,
  p_title text,
  p_form_data jsonb DEFAULT '{}'::jsonb,
  p_student_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_type public.request_types%ROWTYPE;
  v_request_id uuid;
  v_request_number text;
  v_form jsonb := COALESCE(p_form_data, '{}'::jsonb);
  v_e2e_ok boolean := false;
  v_corr uuid;
  v_canonical text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'نوع الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  -- P1-06: the three P1 services have a canonical atomic submit path.
  IF public.p1_is_atomic_submit_service(btrim(p_request_type)) THEN
    RAISE EXCEPTION 'P1_ATOMIC_SUBMIT_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'عنوان الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = p_request_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود'
      USING ERRCODE = '22023';
  END IF;

  IF v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_form->>'e2e_marker', '') = public.b1_e2e_88_marker()
     AND p_request_type = 'enrollment_certificate' THEN
    RAISE EXCEPTION 'B1_E2E_88_ENROLLMENT_CERTIFICATE_FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    v_e2e_ok := public.b1_e2e_88_allows_hidden_create(p_request_type, v_form);
    IF NOT v_e2e_ok THEN
      RAISE EXCEPTION 'نوع الطلب غير متاح للطالب'
        USING ERRCODE = '42501';
    END IF;
    IF p_request_type = 'enrollment_certificate' THEN
      RAISE EXCEPTION 'B1_E2E_88_ENROLLMENT_CERTIFICATE_FORBIDDEN'
        USING ERRCODE = '42501';
    END IF;
    v_canonical := CASE p_request_type
      WHEN 'absence_excuse' THEN 'excused_absence'
      WHEN 'transfer' THEN 'department_transfer'
      WHEN 'extra_chance' THEN 'final_chance'
      ELSE p_request_type
    END;
    IF NOT public.b1_e2e_88_is_five_service(v_canonical) THEN
      RAISE EXCEPTION 'B1_E2E_88_SERVICE_NOT_ALLOWED:%', p_request_type
        USING ERRCODE = '42501';
    END IF;
    v_corr := (v_form->>'e2e_correlation_id')::uuid;
    v_form := v_form || jsonb_build_object(
      'e2e_marker', public.b1_e2e_88_marker(),
      'e2e_correlation_id', v_corr::text,
      'e2e_immutable', true
    );
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.student_requests (
    request_number,
    student_profile_id,
    request_type,
    title,
    description,
    status,
    form_data,
    student_notes
  ) VALUES (
    v_request_number,
    v_profile_id,
    v_type.code,
    btrim(p_title),
    p_student_notes,
    'draft',
    v_form,
    p_student_notes
  )
  RETURNING id INTO v_request_id;

  IF v_e2e_ok THEN
    UPDATE public.b1_e2e_88_executions e
    SET created_request_id = v_request_id
    WHERE e.correlation_id = v_corr
      AND e.created_request_id IS NULL
      AND e.student_user_id = v_uid
      AND e.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'B1_E2E_88_CREATE_EXECUTION_CLAIM_FAILED'
        USING ERRCODE = '42501';
    END IF;

    PERFORM public.b1_e2e_88_write_audit(
      'request_created', v_corr,
      (SELECT id FROM public.b1_e2e_88_executions WHERE correlation_id = v_corr),
      v_request_id, NULL, v_uid,
      jsonb_build_object('request_type', p_request_type, 'request_number', v_request_number)
    );
  END IF;

  RETURN v_request_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. CLOSE THE DETAIL-LESS SUBMIT BYPASS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_student_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_req public.student_requests%ROWTYPE;
  v_type public.request_types%ROWTYPE;
  v_init_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req
  FROM public.student_requests sr
  WHERE sr.id = p_request_id
    AND sr.student_profile_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود أو لا تملك صلاحية الوصول إليه'
      USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('draft', 'returned', 'returned_for_completion') THEN
    RAISE EXCEPTION 'لا يمكن إرسال هذا الطلب في حالته الحالية'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = v_req.request_type;

  IF NOT FOUND OR v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل'
      USING ERRCODE = '42501';
  END IF;

  -- P1-06: a P1 request may never be submitted without its canonical detail row.
  IF public.p1_is_atomic_submit_service(v_req.request_type)
     AND NOT public.p1_request_has_canonical_detail(p_request_id, v_req.request_type) THEN
    RAISE EXCEPTION 'P1_ATOMIC_SUBMIT_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  PERFORM set_config('student_request.submit_via_rpc', '1', true);

  UPDATE public.student_requests
  SET
    status = 'submitted',
    submitted_at = COALESCE(submitted_at, now()),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  v_init_result := public.initialize_student_request_workflow(p_request_id);

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.p1_guard_detailless_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'draft'
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
     AND public.p1_is_atomic_submit_service(NEW.request_type)
     AND NOT public.p1_request_has_canonical_detail(NEW.id, NEW.request_type) THEN
    RAISE EXCEPTION 'P1_DETAILLESS_SUBMIT_FORBIDDEN:%', NEW.request_type
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_p1_guard_detailless_submit ON public.student_requests;
CREATE TRIGGER trg_p1_guard_detailless_submit
BEFORE INSERT OR UPDATE OF status ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.p1_guard_detailless_submit();

-- ---------------------------------------------------------------------
-- 6. DIRECT DETAIL WRITE = DENY (grade_appeal_details legacy client write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS gad_insert ON public.grade_appeal_details;
CREATE POLICY gad_insert ON public.grade_appeal_details
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

DROP POLICY IF EXISTS gad_update ON public.grade_appeal_details;
CREATE POLICY gad_update ON public.grade_appeal_details
FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

DROP POLICY IF EXISTS gad_delete ON public.grade_appeal_details;
CREATE POLICY gad_delete ON public.grade_appeal_details
FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));