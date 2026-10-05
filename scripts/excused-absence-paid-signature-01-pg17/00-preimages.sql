-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 rehearsal — production-shaped
-- preimages (isolated throwaway cluster ONLY; nothing here is a migration).
--
-- The P1-08 rehearsal chain already provides the strict B1 runtime
-- (initializer, authorization gate, atomic executor, external payment
-- confirmation). This file adds the remaining DEPLOYED objects the
-- excused-absence package touches or depends on. Every function body below is
-- copied verbatim from the applied migration named above it.

-- ---------------------------------------------------------------------------
-- Schema shape
-- ---------------------------------------------------------------------------
ALTER TABLE public.request_type_workflows ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.request_type_workflows ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE public.request_type_workflows ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
ALTER TABLE public.request_type_workflows ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.request_type_workflows ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.request_type_workflows ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.request_type_workflows
  ADD CONSTRAINT request_type_workflows_request_type_id_code_version_key UNIQUE (request_type_id, code, version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_request_type_workflows_one_active_per_type
  ON public.request_type_workflows (request_type_id) WHERE is_active = true;

ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS step_name_en text;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS status_on_enter text;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS status_on_complete text;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS notify_on_enter boolean NOT NULL DEFAULT true;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS notify_on_complete boolean NOT NULL DEFAULT true;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS requires_attachment boolean NOT NULL DEFAULT false;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS produces_document boolean NOT NULL DEFAULT false;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS form_schema jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.request_type_workflow_steps
  ADD CONSTRAINT request_type_workflow_steps_workflow_id_step_key_key UNIQUE (workflow_id, step_key);
ALTER TABLE public.request_type_workflow_steps
  ADD CONSTRAINT request_type_workflow_steps_workflow_id_step_order_key UNIQUE (workflow_id, step_order);

ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS workflow_id uuid;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS workflow_version integer;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.request_processing_assignments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- production parity: UNIQUE (workflow_id, step_key) + append-only trigger
ALTER TABLE public.b1_workflow_runtime_contract_snapshot
  ADD CONSTRAINT b1_workflow_runtime_contract_snapshot_workflow_id_step_key_key UNIQUE (workflow_id, step_key);

CREATE TABLE IF NOT EXISTS public.request_workflow_action_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  kind text NOT NULL CHECK (kind IN ('neutral', 'effect', 'document')),
  effect_function text,
  restricted_request_type_code text,
  action_type text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- source: 20260811195233 + 20260811202824 (CLEAR)
INSERT INTO public.request_workflow_action_catalog
  (code, name_ar, kind, effect_function, restricted_request_type_code, action_type, sort_order)
VALUES
  ('REVIEW', 'مراجعة', 'neutral', NULL, NULL, 'review', 10),
  ('APPROVE', 'موافقة', 'neutral', NULL, NULL, 'approve', 20),
  ('ENDORSE', 'اعتماد', 'neutral', NULL, NULL, 'approve', 30),
  ('CLEAR', 'إخلاء طرف', 'neutral', NULL, NULL, 'clear', 35),
  ('ASSESS_FEE', 'تقدير الرسوم', 'neutral', NULL, NULL, 'assess_fee', 40),
  ('PAYMENT_CONFIRMATION', 'تأكيد السداد', 'neutral', NULL, NULL, 'confirm_payment', 50),
  ('SIGN', 'توقيع', 'neutral', NULL, NULL, 'sign', 60),
  ('ARCHIVE', 'أرشفة', 'neutral', NULL, NULL, 'archive', 70),
  ('APPLY_ENROLLMENT_SUSPENSION', 'تطبيق وقف القيد', 'effect',
     'apply_b1_enrollment_suspension_effect', 'enrollment_suspension', 'apply_decision', 110),
  ('REGISTER_EXCUSED_ABSENCE', 'تسجيل غياب بعذر', 'effect',
     'apply_b1_excused_absence_effect', 'excused_absence', 'apply_decision', 120),
  ('WITHDRAW_STUDENT_FILE', 'سحب ملف الطالب', 'effect',
     'apply_b1_file_withdrawal_effect', 'file_withdrawal', 'apply_decision', 150)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.request_type_workflow_steps
  ADD COLUMN IF NOT EXISTS action_code text REFERENCES public.request_workflow_action_catalog(code);

CREATE TABLE IF NOT EXISTS public.request_workflow_transition_condition_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.request_workflow_publish_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid,
  request_type_code text NOT NULL,
  is_valid boolean NOT NULL,
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_type_workflow_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL REFERENCES public.request_types(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.request_type_workflows(id) ON DELETE SET NULL,
  version integer,
  change_kind text NOT NULL,
  change_note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.absence_excuse_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  course_section_id uuid NOT NULL,
  absence_date date NOT NULL,
  reason_type text NOT NULL,
  absence_reason_detail text,
  record_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_excused_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  course_section_id uuid NOT NULL,
  absence_date date NOT NULL,
  reason_type text NOT NULL,
  absence_excuse_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_profile_id, course_section_id, absence_date)
);

-- ---------------------------------------------------------------------------
-- Workflow version lifecycle + request pinning
-- ---------------------------------------------------------------------------
-- source: 20260811195421_15ae9a03-9124-4650-b258-2aae1d377222.sql
CREATE OR REPLACE FUNCTION public.tg_stamp_workflow_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.is_active = true
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.is_active IS DISTINCT FROM true) THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
    NEW.superseded_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active' AND OLD.is_active = true
     AND (NEW.status IS DISTINCT FROM 'active' OR NEW.is_active IS DISTINCT FROM true) THEN
    NEW.superseded_at := COALESCE(NEW.superseded_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_workflow_version_lifecycle ON public.request_type_workflows;
CREATE TRIGGER trg_stamp_workflow_version_lifecycle
  BEFORE INSERT OR UPDATE ON public.request_type_workflows
  FOR EACH ROW EXECUTE FUNCTION public.tg_stamp_workflow_version_lifecycle();

-- source: 20260811195233_03208498-8667-4902-8512-248c4a27a525.sql
CREATE OR REPLACE FUNCTION public.student_request_pinned_workflow_id(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT sr.workflow_id FROM public.student_requests sr WHERE sr.id = p_request_id),
    (SELECT s.workflow_id
       FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = p_request_id
        AND s.workflow_id IS NOT NULL
      ORDER BY s.step_order
      LIMIT 1)
  );
$$;

-- source: 20260811195440_8d154336-05a6-4e4b-a2b8-c22f0e96a568.sql
CREATE OR REPLACE FUNCTION public.tg_pin_student_request_workflow_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical text;
  v_workflow_id uuid;
  v_version integer;
BEGIN
  IF NEW.workflow_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_canonical := CASE NEW.request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE NEW.request_type END;

  SELECT w.id, w.version
  INTO v_workflow_id, v_version
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE w.is_active = true
    AND w.status = 'active'
    AND rt.code IN (NEW.request_type, v_canonical)
  ORDER BY w.version DESC
  LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    NEW.workflow_id := v_workflow_id;
    NEW.workflow_version := v_version;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pin_student_request_workflow_version ON public.student_requests;
CREATE TRIGGER trg_pin_student_request_workflow_version
  BEFORE INSERT ON public.student_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_pin_student_request_workflow_version();

-- ---------------------------------------------------------------------------
-- Publish validator
-- ---------------------------------------------------------------------------
-- source: 20260811202716_dcdd1cb9-a0c8-4d36-a0b9-4a67be6577a1.sql
CREATE OR REPLACE FUNCTION public.validate_request_workflow_publish(p_workflow_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type_code text; v_bad record; v_count integer; v_start_count integer;
BEGIN
  SELECT rt.code INTO v_type_code
  FROM public.request_type_workflows w
  JOIN public.request_types rt ON rt.id = w.request_type_id
  WHERE w.id = p_workflow_id;
  IF v_type_code IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflow_steps s WHERE s.workflow_id = p_workflow_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: لا توجد خطوات في هذا الإصدار'; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id AND s.processing_unit_id IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: خطوة بلا وحدة معالجة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id AND s.processing_role_id IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: خطوة بلا دور معالجة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  LEFT JOIN public.request_processing_roles r ON r.id = s.processing_role_id
  WHERE s.workflow_id = p_workflow_id AND (r.id IS NULL OR r.unit_id IS DISTINCT FROM s.processing_unit_id) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: الدور لا ينتمي إلى الوحدة في الخطوة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id AND COALESCE(s.action_type,'') NOT IN
    ('review','approve','clear','assess_fee','confirm_payment','sign','archive','apply_decision','issue_document') LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: نوع إجراء غير صالح في الخطوة (%)', v_bad.step_key; END IF;

  SELECT s.step_key INTO v_bad FROM public.request_type_workflow_steps s
  LEFT JOIN public.request_workflow_action_catalog a ON a.code = s.action_code
  WHERE s.workflow_id = p_workflow_id AND s.action_code IS NOT NULL
    AND (a.code IS NULL OR NOT a.is_active
      OR (a.restricted_request_type_code IS NOT NULL AND a.restricted_request_type_code <> v_type_code)
      OR (a.action_type IS NOT NULL AND a.action_type IS DISTINCT FROM s.action_type)) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: إجراء غير مسموح لهذه الخدمة في الخطوة (%)', v_bad.step_key; END IF;

  SELECT t.action_result AS step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = p_workflow_id AND t.to_step_id IS NOT NULL
    AND (ts.id IS NULL OR ts.workflow_id <> p_workflow_id) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: انتقال إلى خطوة غير موجودة (%)', v_bad.step_key; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id
      AND (t.is_default OR COALESCE(t.condition_schema,'{}'::jsonb) = '{}'::jsonb)
    GROUP BY 1,2 HAVING count(*) > 1
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: مسار افتراضي مكرر لنفس الخطوة والنتيجة'; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id
    GROUP BY 1,2
    HAVING count(*) FILTER (WHERE t.is_default OR COALESCE(t.condition_schema,'{}'::jsonb) = '{}'::jsonb) = 0
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: يوجد تفرّع بلا مسار افتراضي'; END IF;

  SELECT t.action_result AS step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id
    AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                    WHERE c.code = t.condition_schema ->> 'code' AND c.is_active) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: شرط انتقال غير مسموح (%)', v_bad.step_key; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT t.from_step_id, t.action_result, t.priority
    FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id AND NOT t.is_default
      AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
    GROUP BY 1,2,3 HAVING count(*) > 1
  ) d;
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: تعارض في أولويات التفرّع'; END IF;

  SELECT fs.step_key INTO v_bad
  FROM public.request_type_workflow_transitions t
  JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
  JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
  WHERE t.workflow_id = p_workflow_id
    AND t.action_result NOT IN ('reject','return','cancel')
    AND ts.step_order <= fs.step_order LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: دورة غير منتهية في المسار عند الخطوة (%)', v_bad.step_key; END IF;

  SELECT count(*) INTO v_start_count FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NULL AND t.to_step_id IS NOT NULL;
  IF v_start_count <> 1 THEN RAISE EXCEPTION 'PUBLISH_INVALID: يجب تعريف نقطة بداية واحدة للمسار'; END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NOT NULL AND t.to_step_id IS NULL;
  IF v_count = 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: لا توجد نهاية معرّفة للمسار'; END IF;

  SELECT count(*) INTO v_count FROM public.request_type_workflow_steps s
  WHERE s.workflow_id = p_workflow_id
    AND s.id NOT IN (
      WITH RECURSIVE reach AS (
        SELECT t.to_step_id AS id FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id = p_workflow_id AND t.from_step_id IS NULL AND t.to_step_id IS NOT NULL
        UNION
        SELECT t.to_step_id FROM public.request_type_workflow_transitions t
        JOIN reach r ON r.id = t.from_step_id
        WHERE t.workflow_id = p_workflow_id AND t.to_step_id IS NOT NULL
      ) SELECT id FROM reach
    );
  IF v_count > 0 THEN RAISE EXCEPTION 'PUBLISH_INVALID: توجد خطوة غير قابلة للوصول (%)', v_count; END IF;

  SELECT e.rule_code AS step_key INTO v_bad
  FROM public.request_type_eligibility_rules e
  JOIN public.request_type_workflows w ON w.request_type_id = e.request_type_id
  LEFT JOIN public.request_eligibility_rule_catalog c ON c.code = e.rule_code
  WHERE w.id = p_workflow_id AND e.is_active AND (c.code IS NULL OR NOT c.is_active) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'PUBLISH_INVALID: شرط أهلية غير مسموح (%)', v_bad.step_key; END IF;

  RETURN jsonb_build_object('valid', true, 'workflow_id', p_workflow_id, 'request_type_code', v_type_code);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Runtime contract snapshot immutability
-- ---------------------------------------------------------------------------
-- source: 20260811204643_2babc2a1-18cd-40b3-bcf4-83f10a26f5ef.sql
CREATE OR REPLACE FUNCTION public.b1_runtime_contract_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  RAISE EXCEPTION 'B1_RUNTIME_CONTRACT_SNAPSHOT_IS_IMMUTABLE';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_b1_runtime_contract_snapshot_immutable
  ON public.b1_workflow_runtime_contract_snapshot;
CREATE TRIGGER trg_b1_runtime_contract_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.b1_workflow_runtime_contract_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.b1_runtime_contract_snapshot_immutable();

-- ---------------------------------------------------------------------------
-- Academic effect path (excused absence)
-- ---------------------------------------------------------------------------
-- source: 20260727120100_b1_26_academic_effect_functions_01.sql
CREATE OR REPLACE FUNCTION public.apply_b1_excused_absence_effect(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid(); v_request public.student_requests%ROWTYPE;
  v_details public.absence_excuse_details%ROWTYPE; v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF current_setting('b1.atomic_action',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_request FROM public.student_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_type NOT IN ('absence_excuse','excused_absence') OR v_request.status NOT IN ('in_review','completed')
    THEN RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
   WHERE s.student_request_id=p_request_id AND c.step_key='record_apply' AND c.action_type='apply_decision'
     AND s.status IN ('active','completed') ORDER BY (s.status='active') DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT (CASE WHEN v_step.status='completed' THEN v_step.completed_by=v_uid
    ELSE public.can_current_user_act_on_step(v_step.id,'apply_decision') END) THEN RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps p WHERE p.student_request_id=p_request_id
    AND p.step_order<v_step.step_order AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  SELECT * INTO v_details FROM public.absence_excuse_details WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_EXCUSED_ABSENCE_DETAILS_REQUIRED'; END IF;
  IF v_details.record_applied_at IS NOT NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_enrollments WHERE student_profile_id=v_request.student_profile_id
    AND course_section_id=v_details.course_section_id AND enrollment_status='enrolled') THEN RAISE EXCEPTION 'B1_ACTIVE_ENROLLMENT_REQUIRED'; END IF;
  INSERT INTO public.student_excused_absences(student_profile_id,course_section_id,absence_date,reason_type,absence_excuse_request_id)
    VALUES(v_request.student_profile_id,v_details.course_section_id,v_details.absence_date,v_details.reason_type,p_request_id)
    ON CONFLICT (student_profile_id,course_section_id,absence_date) DO NOTHING;
  UPDATE public.absence_excuse_details SET record_applied_at=now(),updated_at=now() WHERE request_id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,actor_unit_id,actor_role_id,payload,visible_to_student)
    VALUES(p_request_id,v_step.id,'academic_effect_applied',v_uid,v_step.processing_unit_id,v_step.processing_role_id,
      jsonb_build_object('effect','excused_absence','course_section_id',v_details.course_section_id,'absence_date',v_details.absence_date),true);
END $$;

-- source: 20260811195421_15ae9a03-9124-4650-b258-2aae1d377222.sql
CREATE OR REPLACE FUNCTION public.apply_configured_action_effect(
  p_request_id uuid,
  p_action_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_fn text;
  v_restricted text;
  v_request_type text;
  v_canonical text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  -- Same execution guard as the existing academic-effect path: effects may
  -- only run inside the approved atomic step-action service.
  IF current_setting('b1.atomic_action', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT a.kind, a.effect_function, a.restricted_request_type_code
  INTO v_kind, v_fn, v_restricted
  FROM public.request_workflow_action_catalog a
  WHERE a.code = p_action_code AND a.is_active = true;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_ACTION_CODE: %', p_action_code USING ERRCODE = '22023';
  END IF;

  IF v_kind <> 'effect' OR v_fn IS NULL THEN
    RETURN; -- neutral / document actions carry no academic effect here
  END IF;

  SELECT sr.request_type INTO v_request_type
  FROM public.student_requests sr WHERE sr.id = p_request_id;

  IF v_request_type IS NULL THEN
    RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND';
  END IF;

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type END;

  IF v_restricted IS NOT NULL AND v_restricted <> v_canonical THEN
    RAISE EXCEPTION 'ACTION_CODE_NOT_ALLOWED_FOR_REQUEST' USING ERRCODE = '42501';
  END IF;

  CASE v_fn
    WHEN 'apply_b1_enrollment_suspension_effect' THEN
      PERFORM public.apply_b1_enrollment_suspension_effect(p_request_id);
    WHEN 'apply_b1_excused_absence_effect' THEN
      PERFORM public.apply_b1_excused_absence_effect(p_request_id);
    WHEN 'apply_b1_department_transfer_effect' THEN
      PERFORM public.apply_b1_department_transfer_effect(p_request_id);
    WHEN 'apply_b1_final_chance_effect' THEN
      PERFORM public.apply_b1_final_chance_effect(p_request_id);
    WHEN 'apply_b1_file_withdrawal_effect' THEN
      PERFORM public.apply_b1_file_withdrawal_effect(p_request_id);
    ELSE
      RAISE EXCEPTION 'EFFECT_FUNCTION_NOT_WHITELISTED: %', v_fn USING ERRCODE = '42501';
  END CASE;
END;
$$;

-- source: 20260811195730_0fc4a36c-d805-4ce7-a90a-cfbd69c45b33.sql
CREATE OR REPLACE FUNCTION public.apply_b1_academic_effect_for_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_type text;
  v_canonical text;
  v_workflow_id uuid;
  v_action_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000';
  END IF;
  IF current_setting('b1.atomic_action', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_ACTION_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT request_type INTO v_request_type FROM public.student_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND'; END IF;

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type END;

  -- Configuration first: use the effect action bound to this request's pinned workflow.
  v_workflow_id := public.student_request_pinned_workflow_id(p_request_id);

  IF v_workflow_id IS NOT NULL THEN
    SELECT s.action_code
    INTO v_action_code
    FROM public.request_type_workflow_steps s
    JOIN public.request_workflow_action_catalog a ON a.code = s.action_code
    WHERE s.workflow_id = v_workflow_id
      AND a.kind = 'effect'
      AND a.is_active = true
    ORDER BY s.step_order
    LIMIT 1;
  END IF;

  IF v_action_code IS NOT NULL THEN
    PERFORM public.apply_configured_action_effect(p_request_id, v_action_code);
    RETURN;
  END IF;

  -- Fallback: unchanged built-in mapping while services are still unbound.
  CASE v_canonical
    WHEN 'enrollment_suspension' THEN PERFORM public.apply_b1_enrollment_suspension_effect(p_request_id);
    WHEN 'excused_absence' THEN PERFORM public.apply_b1_excused_absence_effect(p_request_id);
    WHEN 'department_transfer' THEN PERFORM public.apply_b1_department_transfer_effect(p_request_id);
    WHEN 'final_chance' THEN PERFORM public.apply_b1_final_chance_effect(p_request_id);
    WHEN 'file_withdrawal' THEN PERFORM public.apply_b1_file_withdrawal_effect(p_request_id);
    ELSE RAISE EXCEPTION 'B1_ACADEMIC_EFFECT_REQUEST_REQUIRED';
  END CASE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic runtime boundary + assignee-effective activation guards
-- ---------------------------------------------------------------------------
-- source: 20260724061333_abf1bbb5-1bd0-4a7b-a805-866a3b98a61a.sql
CREATE OR REPLACE FUNCTION public.guard_b1_runtime_mutation_boundary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_request_id uuid:=COALESCE(NEW.student_request_id,OLD.student_request_id); v_type text;
BEGIN
  SELECT r.request_type INTO v_type FROM public.student_requests r WHERE r.id=v_request_id;
  IF public.is_b1_stored_request_type(v_type)
     AND current_setting('b1.atomic_init',true) IS DISTINCT FROM '1'
     AND current_setting('b1.atomic_action',true) IS DISTINCT FROM '1'
     AND current_setting('b1.specialized_action',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

DROP TRIGGER IF EXISTS trg_guard_b1_runtime_mutation_boundary ON public.student_request_workflow_steps;
CREATE TRIGGER trg_guard_b1_runtime_mutation_boundary BEFORE INSERT OR UPDATE OR DELETE
  ON public.student_request_workflow_steps FOR EACH ROW
  EXECUTE FUNCTION public.guard_b1_runtime_mutation_boundary();

-- source: 20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
CREATE OR REPLACE FUNCTION public.b1_assignment_identity_lock_key()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- Constant, namespaced to B1 assignment identity. Never derive it from row
  -- data: a single global key is what makes the contract deadlock-free.
  SELECT 7346501982230114001::bigint;
$function$;

-- source: 20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_boundary()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(public.b1_assignment_identity_lock_key());
END;
$function$;

-- source: 20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.b1_lock_assignment_identity_boundary();
  RETURN NULL; -- BEFORE STATEMENT triggers ignore the return value.
END;
$function$;

-- source: 20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  p_step public.student_request_workflow_steps
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$

DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical text;
  v_department_id uuid;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_count integer;
  v_assignment_id uuid;
BEGIN
  v_step := p_step;
  IF v_step.id IS NULL OR v_step.student_request_id IS NULL THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;


  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Legacy / non-B1: untouched behaviour. Early return BEFORE the lock.
  IF NOT public.is_b1_stored_request_type(v_request_type) THEN
    RETURN;
  END IF;

  -- LOCK BEFORE READ. Everything below observes an identity boundary that no
  -- concurrent assignment, profile, position or transfer-scope mutation can
  -- change until this transaction commits or aborts.
  PERFORM public.b1_lock_assignment_identity_boundary();

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  -- Department scope: source head resolves ONLY the head of
  -- current_department_id, target head ONLY the head of requested_department_id.
  IF v_canonical = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
    SELECT CASE v_step.step_key
             WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id
           END
      INTO v_department_id
    FROM public.transfer_request_details d
    WHERE d.request_id = v_step.student_request_id;
    IF v_department_id IS NULL THEN
      RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING:%', v_step.step_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Exactly one effective assignment for (unit, role, department scope).
  -- is_valid_b1_direct_assignment re-reads staff_profiles.status/user_id,
  -- faculty_profiles.status/user_id/department_id and
  -- position_assignments.user_id/is_active/assigned_from/assigned_to under the
  -- lock, so a disabled profile or a swapped user_id is seen here.
  SELECT count(*) INTO v_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, v_count
      USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  -- Exactly one identity kind stored on the resolved assignment.
  IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
       v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_NOT_SINGULAR:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Exactly one identity kind stored on the runtime step.
  IF num_nonnulls(v_step.assigned_user_id, v_step.assigned_staff_profile_id,
       v_step.assigned_faculty_profile_id, v_step.assigned_position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, 0
      USING ERRCODE = '42501';
  END IF;

  -- Stored runtime identity must still equal the effective identity.
  IF v_step.assigned_user_id IS DISTINCT FROM v_assignment.user_id
     OR v_step.assigned_staff_profile_id IS DISTINCT FROM v_assignment.staff_profile_id
     OR v_step.assigned_faculty_profile_id IS DISTINCT FROM v_assignment.faculty_profile_id
     OR v_step.assigned_position_assignment_id IS DISTINCT FROM v_assignment.position_assignment_id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Provenance pin, when recorded at initialization.
  v_assignment_id := (v_step.metadata ->> 'direct_assignment_id')::uuid;
  IF v_assignment_id IS NOT NULL AND v_assignment_id IS DISTINCT FROM v_assignment.id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_PROVENANCE_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- source: 20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(v_step);
END;
$function$;

-- source: 20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql
CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(NEW);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_b1_lock_runtime_step_identity_stmt ON public.student_request_workflow_steps;
CREATE TRIGGER trg_b1_lock_runtime_step_identity_stmt
BEFORE INSERT OR UPDATE ON public.student_request_workflow_steps
FOR EACH STATEMENT EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();

DROP TRIGGER IF EXISTS trg_guard_b1_runtime_step_activation_insert ON public.student_request_workflow_steps;
CREATE TRIGGER trg_guard_b1_runtime_step_activation_insert
BEFORE INSERT ON public.student_request_workflow_steps
FOR EACH ROW WHEN (NEW.status = 'active')
EXECUTE FUNCTION public.guard_b1_runtime_step_activation();

DROP TRIGGER IF EXISTS trg_guard_b1_runtime_step_activation ON public.student_request_workflow_steps;
CREATE TRIGGER trg_guard_b1_runtime_step_activation
BEFORE UPDATE OF status ON public.student_request_workflow_steps
FOR EACH ROW WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
EXECUTE FUNCTION public.guard_b1_runtime_step_activation();

-- ---------------------------------------------------------------------------
-- Conditional routing, notifications and request protection
-- ---------------------------------------------------------------------------
ALTER TABLE public.request_workflow_transition_condition_catalog ADD COLUMN IF NOT EXISTS description_ar text;
ALTER TABLE public.request_workflow_transition_condition_catalog ADD COLUMN IF NOT EXISTS params_schema jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.request_workflow_transition_condition_catalog ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- source: 20260811202314
INSERT INTO public.request_workflow_transition_condition_catalog(code,name_ar,description_ar,sort_order)
VALUES
  ('FEE_IS_ZERO','لا توجد رسوم','ينطبق عندما لا يوجد تقييم رسوم فعّال أو كان المبلغ صفرًا',10),
  ('FEE_GREATER_THAN_ZERO','توجد رسوم مستحقة','ينطبق عندما يوجد تقييم رسوم فعّال بمبلغ أكبر من صفر',20),
  ('PAYMENT_ALREADY_CONFIRMED','السداد مؤكد مسبقًا','ينطبق عندما تم تأكيد سداد الرسوم لهذا الطلب',30),
  ('ATTACHMENT_PRESENT','يوجد مرفق','ينطبق عندما يملك الطلب مرفقًا واحدًا على الأقل مرفوعًا',40),
  ('TARGET_DEPARTMENT_DIFFERS','القسم المستهدف مختلف','ينطبق عندما يختلف القسم المطلوب عن القسم الحالي للطالب',50)
ON CONFLICT (code) DO NOTHING;

-- Legacy fee-assessment ledger read by the deployed condition evaluator.
-- It stays EMPTY in this rehearsal: the excused-absence cycle never writes it.
CREATE TABLE IF NOT EXISTS public.student_request_fee_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.student_request_attachment_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL,
  upload_status text NOT NULL DEFAULT 'uploaded'
);

-- The P1 rehearsal base ships an inert stub with a different parameter name.
DROP FUNCTION IF EXISTS public.evaluate_workflow_transition_condition(uuid, jsonb);
-- source: 20260811202314_488b316c-1f2f-464b-9087-0c2204c671e8.sql
CREATE OR REPLACE FUNCTION public.evaluate_workflow_transition_condition(
  p_request_id uuid, p_condition jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text; v_amount numeric; v_paid boolean;
BEGIN
  IF p_condition IS NULL OR p_condition = '{}'::jsonb THEN RETURN true; END IF;
  v_code := NULLIF(btrim(COALESCE(p_condition->>'code','')),'');
  IF v_code IS NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                 WHERE c.code = v_code AND c.is_active) THEN
    RAISE EXCEPTION 'B1_CONDITION_CODE_NOT_ALLOWED:%', v_code;
  END IF;

  SELECT f.amount, (f.payment_status = 'paid') INTO v_amount, v_paid
  FROM public.student_request_fee_assessments f
  WHERE f.request_id = p_request_id AND f.payment_status <> 'cancelled'
  ORDER BY f.assessed_at DESC LIMIT 1;

  IF v_code = 'FEE_IS_ZERO' THEN
    RETURN COALESCE(v_amount, 0) = 0;
  ELSIF v_code = 'FEE_GREATER_THAN_ZERO' THEN
    RETURN COALESCE(v_amount, 0) > 0;
  ELSIF v_code = 'PAYMENT_ALREADY_CONFIRMED' THEN
    RETURN COALESCE(v_paid, false);
  ELSIF v_code = 'ATTACHMENT_PRESENT' THEN
    RETURN EXISTS (SELECT 1 FROM public.student_request_attachment_uploads u
                   WHERE u.student_request_id = p_request_id
                     AND u.upload_status IN ('uploaded','attached','active'));
  ELSIF v_code = 'TARGET_DEPARTMENT_DIFFERS' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.transfer_request_details d
      JOIN public.student_requests r ON r.id = d.request_id
      JOIN public.student_profiles sp ON sp.id = r.student_profile_id
      WHERE d.request_id = p_request_id
        AND d.requested_department_id IS DISTINCT FROM sp.department_id);
  END IF;

  RAISE EXCEPTION 'B1_CONDITION_CODE_NOT_IMPLEMENTED:%', v_code;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL DEFAULT 'system',
  reference_type text,
  reference_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_chk
    CHECK (notification_type IN ('request','grade','finance','payment_receipt','system','council','student_request_completed'))
);

-- source: 20260601021528_918c7cad-221c-4de2-bc27-1c79c1819814.sql
CREATE OR REPLACE FUNCTION public.create_notification(
  _target_user_id uuid,
  _title text,
  _message text,
  _type text,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF _target_user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.notifications(user_id, title, message, notification_type, reference_type, reference_id)
  VALUES (_target_user_id, _title, _message, _type, _reference_type, _reference_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- source: 20260627120000_official_transcript_request.sql
CREATE OR REPLACE FUNCTION public.trg_notify_student_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_type_label text;
  v_title text;
  v_msg text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status,'') = COALESCE(NEW.status,'') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected','returned') THEN RETURN NEW; END IF;

  SELECT sp.user_id INTO v_user_id FROM public.student_profiles sp WHERE sp.id = NEW.student_profile_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_type_label := CASE NEW.request_type
    WHEN 'absence_excuse' THEN 'عذر غياب'
    WHEN 'enrollment_suspension' THEN 'وقف القيد'
    WHEN 'enrollment_reinstatement' THEN 'إعادة القيد'
    WHEN 'extra_chance' THEN 'فرصة إضافية'
    WHEN 'transfer' THEN 'التحويل'
    WHEN 'equivalency' THEN 'المقاصة'
    WHEN 'grade_appeal' THEN 'تظلم درجات'
    WHEN 'official_transcript' THEN 'سجل أكاديمي رسمي'
    ELSE NEW.request_type
  END;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد طلب ' || v_type_label;
    v_msg := 'تم اعتماد طلبك (' || COALESCE(NEW.title,'') || ').';
  ELSIF NEW.status = 'returned' THEN
    v_title := 'طلب ' || v_type_label || ' يحتاج استكمال';
    v_msg := COALESCE('ملاحظات: ' || NEW.rejection_reason, 'يرجى استكمال بيانات الطلب وإعادة الإرسال.');
  ELSE
    v_title := 'تم رفض طلب ' || v_type_label;
    v_msg := COALESCE('سبب الرفض: ' || NEW.rejection_reason, 'تم رفض طلبك.');
  END IF;

  PERFORM public.create_notification(v_user_id, v_title, v_msg, 'request', 'student_request', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_student_request ON public.student_requests;
CREATE TRIGGER trg_notify_student_request
AFTER UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_student_request();

ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- source: 20260812135536_a66697e2-7839-4f21-b0b1-ce47d1240c34.sql
CREATE OR REPLACE FUNCTION public.protect_student_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_via_rpc boolean := COALESCE(current_setting('student_request.submit_via_rpc', true), '') = '1';
  v_b1_atomic boolean := COALESCE(current_setting('b1.atomic_action', true), '') = '1';
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  IF v_b1_atomic AND v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = OLD.id
      AND s.completed_by = v_uid
      AND s.status IN ('completed','rejected','returned')
  ) THEN
    NEW.id                 := OLD.id;
    NEW.student_profile_id := OLD.student_profile_id;
    NEW.request_type       := OLD.request_type;
    NEW.submitted_at       := OLD.submitted_at;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid
  ) THEN
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('approved','completed') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.completed_at       := OLD.completed_at;
      NEW.cancelled_at       := now();
      RETURN NEW;
    END IF;

    IF v_via_rpc
       AND OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.cancelled_at       := OLD.cancelled_at;
      NEW.completed_at       := OLD.completed_at;
      IF OLD.status IN ('returned', 'returned_for_completion') THEN
        NEW.rejection_reason := NULL;
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
      ELSE
        NEW.reviewed_by        := OLD.reviewed_by;
        NEW.reviewed_at        := OLD.reviewed_at;
        NEW.rejection_reason   := OLD.rejection_reason;
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      RAISE EXCEPTION 'يجب إرسال الطلب عبر submit_student_request() وليس التحديث المباشر'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.cancelled_at       := OLD.cancelled_at;
      NEW.completed_at       := OLD.completed_at;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('returned','returned_for_completion')
       AND NEW.status IN ('returned','returned_for_completion') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.cancelled_at       := OLD.cancelled_at;
      NEW.completed_at       := OLD.completed_at;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_student_request ON public.student_requests;
CREATE TRIGGER trg_protect_student_request
BEFORE UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.protect_student_request();
