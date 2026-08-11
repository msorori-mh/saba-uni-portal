-- =========================================================
-- Generic Student Service Platform — Foundation (P1/P2/P3 schema)
-- forward-only; no destructive operations
-- =========================================================

-- ---------- P1: explicit workflow version pinning on the request ----------
ALTER TABLE public.student_requests
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.request_type_workflows(id),
  ADD COLUMN IF NOT EXISTS workflow_version integer;

CREATE INDEX IF NOT EXISTS idx_student_requests_workflow_id
  ON public.student_requests(workflow_id);

-- Legacy requests keep their pinned version implicitly through their
-- materialized steps; this resolver exposes it without touching their rows.
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

REVOKE ALL ON FUNCTION public.student_request_pinned_workflow_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_request_pinned_workflow_id(uuid) TO authenticated, service_role;

-- ---------- P1: workflow version lifecycle metadata ----------
ALTER TABLE public.request_type_workflows
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS change_note text;

UPDATE public.request_type_workflows
SET published_at = COALESCE(published_at, updated_at)
WHERE status = 'active' AND is_active = true AND published_at IS NULL;

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

GRANT SELECT ON public.request_type_workflow_change_log TO authenticated;
GRANT ALL ON public.request_type_workflow_change_log TO service_role;
ALTER TABLE public.request_type_workflow_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_change_log_admin_read"
  ON public.request_type_workflow_change_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'system_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_workflow_change_log_type
  ON public.request_type_workflow_change_log(request_type_id, created_at DESC);

-- ---------- P2: safe action catalog ----------
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

GRANT SELECT ON public.request_workflow_action_catalog TO authenticated;
GRANT ALL ON public.request_workflow_action_catalog TO service_role;
ALTER TABLE public.request_workflow_action_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_catalog_read_authenticated"
  ON public.request_workflow_action_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_action_catalog_updated_at
  BEFORE UPDATE ON public.request_workflow_action_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.request_workflow_action_catalog
  (code, name_ar, description_ar, kind, effect_function, restricted_request_type_code, action_type, sort_order)
VALUES
  ('REVIEW', 'مراجعة', 'مراجعة الطلب واستكمال البيانات دون أثر أكاديمي.', 'neutral', NULL, NULL, 'review', 10),
  ('APPROVE', 'موافقة', 'موافقة إدارية على الطلب.', 'neutral', NULL, NULL, 'approve', 20),
  ('ENDORSE', 'اعتماد', 'اعتماد نهائي من جهة الاعتماد.', 'neutral', NULL, NULL, 'approve', 30),
  ('ASSESS_FEE', 'تقدير الرسوم', 'تحديد رسوم الخدمة دون أي عملية دفع داخل البوابة.', 'neutral', NULL, NULL, 'assess_fee', 40),
  ('PAYMENT_CONFIRMATION', 'تأكيد السداد', 'تأكيد السداد الخارجي يدويًا من الشؤون المالية.', 'neutral', NULL, NULL, 'confirm_payment', 50),
  ('SIGN', 'توقيع', 'توقيع دون إنشاء وثيقة أو ملف.', 'neutral', NULL, NULL, 'sign', 60),
  ('ARCHIVE', 'أرشفة', 'أرشفة الطلب بعد اكتمال الإجراءات.', 'neutral', NULL, NULL, 'archive', 70),
  ('APPLY_ENROLLMENT_SUSPENSION', 'تطبيق وقف القيد', 'ينفذ أثر وقف القيد على سجل الطالب.', 'effect',
     'apply_b1_enrollment_suspension_effect', 'enrollment_suspension', 'apply_decision', 110),
  ('REGISTER_EXCUSED_ABSENCE', 'تسجيل غياب بعذر', 'يسجل الغياب بعذر على المقرر المحدد.', 'effect',
     'apply_b1_excused_absence_effect', 'excused_absence', 'apply_decision', 120),
  ('APPLY_DEPARTMENT_TRANSFER', 'تطبيق التحويل بين الأقسام', 'ينفذ تحويل الطالب إلى القسم والبرنامج الهدف.', 'effect',
     'apply_b1_department_transfer_effect', 'department_transfer', 'apply_decision', 130),
  ('APPLY_FINAL_CHANCE', 'منح الفرصة الأخيرة', 'يسجل الفرصة الأخيرة للطالب.', 'effect',
     'apply_b1_final_chance_effect', 'final_chance', 'apply_decision', 140),
  ('WITHDRAW_STUDENT_FILE', 'سحب ملف الطالب', 'ينفذ سحب ملف الطالب وإنهاء قيده.', 'effect',
     'apply_b1_file_withdrawal_effect', 'file_withdrawal', 'apply_decision', 150),
  ('ISSUE_ENROLLMENT_CERTIFICATE', 'إصدار إفادة قيد', 'إصدار وثيقة إفادة القيد عبر مسار الإصدار الرسمي.', 'document',
     NULL, 'enrollment_certificate', 'issue_document', 160)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.request_type_workflow_steps
  ADD COLUMN IF NOT EXISTS action_code text
    REFERENCES public.request_workflow_action_catalog(code);

-- ---------- P3: eligibility rule catalog + per-service rules ----------
CREATE TABLE IF NOT EXISTS public.request_eligibility_rule_catalog (
  code text PRIMARY KEY,
  name_ar text NOT NULL,
  description_ar text,
  param_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_message_ar text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.request_eligibility_rule_catalog TO authenticated;
GRANT ALL ON public.request_eligibility_rule_catalog TO service_role;
ALTER TABLE public.request_eligibility_rule_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eligibility_rule_catalog_read_authenticated"
  ON public.request_eligibility_rule_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_eligibility_rule_catalog_updated_at
  BEFORE UPDATE ON public.request_eligibility_rule_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.request_eligibility_rule_catalog
  (code, name_ar, description_ar, param_schema, default_message_ar, sort_order)
VALUES
  ('STUDENT_STUDY_STATUS_IN', 'حالة الدراسة ضمن قائمة',
   'يشترط أن تكون حالة دراسة الطالب ضمن القيم المحددة.',
   '{"values": {"type": "text[]", "required": true}}'::jsonb,
   'حالة الطالب الدراسية لا تسمح بتقديم هذا الطلب.', 10),
  ('MAX_CONSECUTIVE_SUSPENSION_YEARS', 'حد سنوات وقف القيد المتتالية',
   'يرفض الطلب عند بلوغ عدد سنوات وقف القيد المتتالية الحد المحدد.',
   '{"max": {"type": "integer", "required": true}}'::jsonb,
   'تجاوزت الحد المسموح لوقف القيد (سنتان متتاليتان).', 20),
  ('MAX_SUSPENSION_SEMESTERS', 'حد فصول وقف القيد',
   'يرفض الطلب عند بلوغ عدد فصول وقف القيد السابقة الحد المحدد.',
   '{"max": {"type": "integer", "required": true}}'::jsonb,
   'تجاوزت الحد المسموح لوقف القيد (أربعة فصول متفرقة).', 30),
  ('NOT_TRANSFERRED_CURRENT_YEAR', 'غير محوّل خلال السنة الحالية',
   'يمنع تقديم الطلب للطلاب المحوّلين خلال السنة الدراسية الحالية.',
   '{}'::jsonb,
   'لا يحق للطلاب المحوّلين خلال السنة الحالية تقديم هذا الطلب.', 40)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.request_type_eligibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL REFERENCES public.request_types(id) ON DELETE CASCADE,
  rule_code text NOT NULL REFERENCES public.request_eligibility_rule_catalog(code),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_ar text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_type_id, rule_code)
);

GRANT SELECT ON public.request_type_eligibility_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.request_type_eligibility_rules TO authenticated;
GRANT ALL ON public.request_type_eligibility_rules TO service_role;
ALTER TABLE public.request_type_eligibility_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eligibility_rules_read_authenticated"
  ON public.request_type_eligibility_rules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "eligibility_rules_admin_write"
  ON public.request_type_eligibility_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'system_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'system_admin'::app_role));

CREATE TRIGGER trg_request_type_eligibility_rules_updated_at
  BEFORE UPDATE ON public.request_type_eligibility_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed current enrollment_suspension rules 1:1 with today's hardcoded behaviour
INSERT INTO public.request_type_eligibility_rules
  (request_type_id, rule_code, params, message_ar, sort_order)
SELECT rt.id, v.rule_code, v.params, v.message_ar, v.sort_order
FROM public.request_types rt
CROSS JOIN (VALUES
  ('MAX_CONSECUTIVE_SUSPENSION_YEARS', '{"max": 2}'::jsonb,
   'تجاوزت الحد المسموح لوقف القيد (سنتان متتاليتان) — U-SUSP-1.', 10),
  ('MAX_SUSPENSION_SEMESTERS', '{"max": 4}'::jsonb,
   'تجاوزت الحد المسموح لوقف القيد (أربعة فصول متفرقة) — U-SUSP-1.', 20),
  ('STUDENT_STUDY_STATUS_IN', '{"values": ["new"]}'::jsonb,
   'وقف القيد متاح للطلاب المستجدين فقط، ويجب استكمال student_study_status بقيمة new.', 30),
  ('NOT_TRANSFERRED_CURRENT_YEAR', '{}'::jsonb,
   'لا يحق للطلاب المحوّلين خلال السنة الحالية تقديم طلب وقف القيد.', 40)
) AS v(rule_code, params, message_ar, sort_order)
WHERE rt.code = 'enrollment_suspension'
ON CONFLICT (request_type_id, rule_code) DO NOTHING;