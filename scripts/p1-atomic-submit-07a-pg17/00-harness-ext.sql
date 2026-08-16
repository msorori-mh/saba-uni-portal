-- P1-06 rehearsal harness extension (PG17, isolated cluster — never production).
-- Adds the production objects that P1-06 depends on but the P1-01..P1-05
-- harness did not need. Function bodies for create_student_request /
-- submit_student_request / initialize_student_request_workflow are the exact
-- live production preimages captured read-only for this mission.

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS request_number text;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS student_notes text;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS can_return_to_student boolean NOT NULL DEFAULT true;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS can_reject boolean NOT NULL DEFAULT true;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS can_skip boolean NOT NULL DEFAULT false;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS workflow_id uuid;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS workflow_step_id uuid;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS entered_at timestamptz;

CREATE TABLE IF NOT EXISTS public.student_request_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL,
  workflow_step_runtime_id uuid,
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_unit_id uuid,
  actor_role_id uuid,
  message_ar text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_to_student boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_type_eligibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL, rule_code text NOT NULL, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.request_eligibility_rule_catalog (
  code text PRIMARY KEY, is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.b1_e2e_88_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), correlation_id uuid UNIQUE,
  marker text, service_code text, student_user_id uuid, status text DEFAULT 'active',
  starts_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT now() + interval '1 day',
  created_request_id uuid, closed_at timestamptz
);

-- ---- production preimage helpers -------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_marker() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 'TEST_ONLY_B1_E2E_88'::text $$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_is_five_service(p_code text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_allows_hidden_create(p_request_type text, p_form_data jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_write_audit(
  p_event text, p_corr uuid, p_exec uuid, p_request uuid, p_step uuid, p_actor uuid, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RETURN; END $$;

CREATE OR REPLACE FUNCTION public.student_request_ineligible_status_message() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 'حالة القيد لا تسمح بتقديم الطلبات'::text $$;

CREATE OR REPLACE FUNCTION public.student_request_type_is_eligible(_profile_status text, _request_audience text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _request_audience = 'all' THEN true
    WHEN _request_audience = 'active_student' THEN _profile_status = 'active'
    WHEN _request_audience = 'graduate' THEN _profile_status = 'graduated'
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.assert_student_can_use_request_type(_profile_status text, _request_audience text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _profile_status NOT IN ('active', 'graduated') THEN
    RAISE EXCEPTION '%', public.student_request_ineligible_status_message() USING ERRCODE = '42501';
  END IF;
  IF NOT public.student_request_type_is_eligible(_profile_status, _request_audience) THEN
    RAISE EXCEPTION 'نوع الطلب غير متاح لحالة الطالب الحالية.' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assert_student_request_eligibility_rules(
  p_student_profile_id uuid, p_request_type_code text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_student_profile_id IS NULL OR nullif(btrim(coalesce(p_request_type_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ELIGIBILITY_CONTEXT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  RETURN; -- no active rules configured for the P1 types (production parity)
END $$;

CREATE OR REPLACE FUNCTION public.current_student_profile_for_auth()
RETURNS TABLE(profile_id uuid, profile_status text, academic_number text, full_name_ar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sp.id, sp.status, sp.academic_number, sp.full_name_ar
  FROM public.student_profiles sp WHERE sp.user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_request(p_user uuid, p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.student_requests sr
                 JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
                 WHERE sr.id = p_request AND sp.user_id = p_user);
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_registrar() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_current_user_admin_actor() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.get_active_workflow_for_request_type(p_request_type_id uuid)
RETURNS SETOF public.request_type_workflows
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM public.request_type_workflows w
  WHERE w.request_type_id = p_request_type_id AND w.status = 'active'
  ORDER BY w.version DESC LIMIT 1;
$$;

-- create_student_request / submit_student_request / initialize_student_request_workflow:
-- live production preimages (pre-P1-06).
CREATE OR REPLACE FUNCTION public.initialize_student_request_workflow(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.student_requests%ROWTYPE;
  v_type public.request_types%ROWTYPE;
  v_workflow public.request_type_workflows%ROWTYPE;
  v_step public.request_type_workflow_steps%ROWTYPE;
  v_first_step_id uuid;
  v_steps_created integer := 0;
  v_existing_count integer;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'معرّف الطلب مطلوب' USING ERRCODE = '22023';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_req FROM public.student_requests sr WHERE sr.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_owner_of_request(v_uid, p_request_id)
     AND NOT public.is_current_user_registrar()
     AND NOT public.is_current_user_admin_actor() THEN
    RAISE EXCEPTION 'غير مصرح بتهيئة workflow لهذا الطلب' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_existing_count
  FROM public.student_request_workflow_steps s WHERE s.student_request_id = p_request_id;
  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('initialized', false, 'reason', 'already_initialized',
                              'existing_steps', v_existing_count);
  END IF;

  SELECT * INTO v_type FROM public.request_types rt WHERE rt.code = v_req.request_type;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initialized', false, 'reason', 'no_active_workflow',
                              'detail', 'request_type_not_found');
  END IF;

  SELECT * INTO v_workflow FROM public.get_active_workflow_for_request_type(v_type.id);
  IF v_workflow.id IS NULL THEN
    RETURN jsonb_build_object('initialized', false, 'reason', 'no_active_workflow');
  END IF;

  FOR v_step IN
    SELECT * FROM public.request_type_workflow_steps rtws
    WHERE rtws.workflow_id = v_workflow.id ORDER BY rtws.step_order ASC
  LOOP
    INSERT INTO public.student_request_workflow_steps (
      student_request_id, workflow_id, workflow_step_id, step_key, step_name_ar, step_order,
      processing_unit_id, processing_role_id, status, entered_at, metadata)
    VALUES (
      p_request_id, v_workflow.id, v_step.id, v_step.step_key, v_step.step_name_ar, v_step.step_order,
      v_step.processing_unit_id, v_step.processing_role_id,
      CASE WHEN v_step.step_order = (SELECT min(s2.step_order) FROM public.request_type_workflow_steps s2
                                     WHERE s2.workflow_id = v_workflow.id) THEN 'active' ELSE 'pending' END,
      CASE WHEN v_step.step_order = (SELECT min(s2.step_order) FROM public.request_type_workflow_steps s2
                                     WHERE s2.workflow_id = v_workflow.id) THEN now() ELSE NULL END,
      jsonb_build_object('assignment_strategy', v_step.assignment_strategy,
                         'action_type', v_step.action_type,
                         'visible_to_student', v_step.visible_to_student,
                         'can_return_to_student', v_step.can_return_to_student,
                         'can_reject', v_step.can_reject,
                         'can_skip', v_step.can_skip,
                         'config', COALESCE(v_step.config, '{}'::jsonb)));
    v_steps_created := v_steps_created + 1;
  END LOOP;

  IF v_steps_created = 0 THEN
    RETURN jsonb_build_object('initialized', false, 'reason', 'no_active_workflow',
                              'detail', 'workflow_has_no_steps', 'workflow_id', v_workflow.id);
  END IF;

  SELECT s.id INTO v_first_step_id FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = p_request_id AND s.status = 'active'
  ORDER BY s.step_order ASC LIMIT 1;

  INSERT INTO public.student_request_workflow_events (
    student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
    message_ar, payload, visible_to_student)
  VALUES (p_request_id, NULL, 'submitted', v_uid, 'تم إرسال الطلب',
    jsonb_build_object('workflow_id', v_workflow.id, 'workflow_code', v_workflow.code,
                       'workflow_version', v_workflow.version), true);

  IF v_first_step_id IS NOT NULL THEN
    INSERT INTO public.student_request_workflow_events (
      student_request_id, workflow_step_runtime_id, event_type, actor_user_id,
      actor_unit_id, actor_role_id, message_ar, payload, visible_to_student)
    SELECT p_request_id, s.id, 'step_entered', v_uid, s.processing_unit_id, s.processing_role_id,
           'دخول الخطوة: ' || s.step_name_ar,
           jsonb_build_object('step_key', s.step_key, 'step_order', s.step_order),
           COALESCE((s.metadata ->> 'visible_to_student')::boolean, true)
    FROM public.student_request_workflow_steps s WHERE s.id = v_first_step_id;
  END IF;

  RETURN jsonb_build_object('initialized', true, 'workflow_id', v_workflow.id,
    'workflow_code', v_workflow.code, 'workflow_version', v_workflow.version,
    'steps_created', v_steps_created, 'active_step_id', v_first_step_id);
END $function$;

CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text, p_title text, p_form_data jsonb DEFAULT '{}'::jsonb,
  p_student_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_type public.request_types%ROWTYPE;
  v_request_id uuid;
  v_request_number text;
  v_form jsonb := COALESCE(p_form_data, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;
  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'نوع الطلب مطلوب' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'عنوان الطلب مطلوب' USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type FROM public.request_types rt WHERE rt.code = p_request_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود' USING ERRCODE = '22023';
  END IF;
  IF v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل' USING ERRCODE = '42501';
  END IF;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    IF NOT public.b1_e2e_88_allows_hidden_create(p_request_type, v_form) THEN
      RAISE EXCEPTION 'نوع الطلب غير متاح للطالب' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.student_requests (
    request_number, student_profile_id, request_type, title, description, status, form_data, student_notes)
  VALUES (v_request_number, v_profile_id, v_type.code, btrim(p_title), p_student_notes,
          'draft', v_form, p_student_notes)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END $function$;

CREATE OR REPLACE FUNCTION public.submit_student_request(p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_req public.student_requests%ROWTYPE;
  v_type public.request_types%ROWTYPE;
  v_init jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE = '28000';
  END IF;
  SELECT c.profile_id, c.profile_status INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.student_requests sr
  WHERE sr.id = p_request_id AND sr.student_profile_id = v_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود أو لا تملك صلاحية الوصول إليه' USING ERRCODE = '42501';
  END IF;
  IF v_req.status NOT IN ('draft','returned','returned_for_completion') THEN
    RAISE EXCEPTION 'لا يمكن إرسال هذا الطلب في حالته الحالية' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type FROM public.request_types rt WHERE rt.code = v_req.request_type;
  IF NOT FOUND OR v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);
  PERFORM set_config('student_request.submit_via_rpc', '1', true);

  UPDATE public.student_requests
  SET status = 'submitted', submitted_at = COALESCE(submitted_at, now()),
      rejection_reason = NULL, updated_at = now()
  WHERE id = p_request_id;

  v_init := public.initialize_student_request_workflow(p_request_id);
  RETURN true;
END $function$;

ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
ALTER TABLE public.semesters ADD COLUMN IF NOT EXISTS academic_year_id uuid;
