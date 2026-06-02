-- Phase 12B — Pilot Launch Package & Operational Readiness

CREATE TABLE IF NOT EXISTS public.pilot_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','ready','active','suspended','completed')),
  launch_date date,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pilot_config TO authenticated;
GRANT ALL ON public.pilot_config TO service_role;
ALTER TABLE public.pilot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_config_read" ON public.pilot_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean') OR public.has_role(auth.uid(),'registrar'));
CREATE POLICY "pilot_config_insert" ON public.pilot_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "pilot_config_update" ON public.pilot_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));
INSERT INTO public.pilot_config (id, status) VALUES (1, 'planning') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pilot_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('student','faculty','staff','admin')),
  department_id uuid,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','inactive','suspended')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pilot_participants_role ON public.pilot_participants(role);
CREATE INDEX IF NOT EXISTS idx_pilot_participants_status ON public.pilot_participants(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_participants TO authenticated;
GRANT ALL ON public.pilot_participants TO service_role;
ALTER TABLE public.pilot_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_participants_read" ON public.pilot_participants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_participants_write" ON public.pilot_participants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

CREATE TABLE IF NOT EXISTS public.pilot_test_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_test_scenarios TO authenticated;
GRANT ALL ON public.pilot_test_scenarios TO service_role;
ALTER TABLE public.pilot_test_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_test_scenarios_read" ON public.pilot_test_scenarios FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_test_scenarios_write" ON public.pilot_test_scenarios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

CREATE TABLE IF NOT EXISTS public.pilot_test_results (
  scenario_id uuid PRIMARY KEY REFERENCES public.pilot_test_scenarios(id) ON DELETE CASCADE,
  result text NOT NULL DEFAULT 'not_tested' CHECK (result IN ('pass','fail','not_tested')),
  notes text,
  tested_by uuid,
  tested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_test_results TO authenticated;
GRANT ALL ON public.pilot_test_results TO service_role;
ALTER TABLE public.pilot_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_test_results_read" ON public.pilot_test_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_test_results_write" ON public.pilot_test_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

CREATE TABLE IF NOT EXISTS public.pilot_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period IN ('morning','during_day','end_of_day')),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_checklist_items TO authenticated;
GRANT ALL ON public.pilot_checklist_items TO service_role;
ALTER TABLE public.pilot_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_checklist_items_read" ON public.pilot_checklist_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_checklist_items_write" ON public.pilot_checklist_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

CREATE TABLE IF NOT EXISTS public.pilot_checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.pilot_checklist_items(id) ON DELETE CASCADE,
  run_date date NOT NULL DEFAULT current_date,
  completed boolean NOT NULL DEFAULT true,
  completed_by uuid,
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (item_id, run_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_checklist_runs TO authenticated;
GRANT ALL ON public.pilot_checklist_runs TO service_role;
ALTER TABLE public.pilot_checklist_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_checklist_runs_read" ON public.pilot_checklist_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_checklist_runs_write" ON public.pilot_checklist_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

CREATE TABLE IF NOT EXISTS public.pilot_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pilot_issues_status ON public.pilot_issues(status);
CREATE INDEX IF NOT EXISTS idx_pilot_issues_severity ON public.pilot_issues(severity);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_issues TO authenticated;
GRANT ALL ON public.pilot_issues TO service_role;
ALTER TABLE public.pilot_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_issues_read" ON public.pilot_issues FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_issues_write" ON public.pilot_issues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

CREATE TABLE IF NOT EXISTS public.pilot_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('student','faculty','staff','admin')),
  type text NOT NULL CHECK (type IN ('bug','suggestion','training_need','process_issue')),
  subject text,
  message text NOT NULL,
  recorded_by uuid,
  subject_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_category ON public.pilot_feedback(category);
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_type ON public.pilot_feedback(type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_feedback TO authenticated;
GRANT ALL ON public.pilot_feedback TO service_role;
ALTER TABLE public.pilot_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot_feedback_read" ON public.pilot_feedback FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin')
         OR public.has_role(auth.uid(),'dean'));
CREATE POLICY "pilot_feedback_write" ON public.pilot_feedback FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'system_admin'));

INSERT INTO public.pilot_test_scenarios (category, code, name, order_index) VALUES
  ('academic','ACA_LOGIN','تسجيل الدخول للطلاب وهيئة التدريس',1),
  ('academic','ACA_PROFILE','عرض الملف الشخصي',2),
  ('academic','ACA_ENROLL','تسجيل المقررات',3),
  ('academic','ACA_GRADES','عرض/إدخال الدرجات',4),
  ('academic','ACA_TRANSCRIPT','عرض السجل الأكاديمي',5),
  ('financial','FIN_FEES','عرض الرسوم',10),
  ('financial','FIN_DISCOUNTS','تطبيق الخصومات',11),
  ('financial','FIN_RECEIPTS','إصدار سند مالي',12),
  ('requests','REQ_ABSENCE','طلب عذر غياب',20),
  ('requests','REQ_SUSPEND','طلب تأجيل دراسة',21),
  ('requests','REQ_TRANSFER','طلب نقل',22),
  ('requests','REQ_EQUIV','طلب معادلة مقررات',23),
  ('documents','DOC_CERT','إصدار شهادة قيد',30),
  ('documents','DOC_TRANSCRIPT','إصدار سجل أكاديمي رسمي',31),
  ('documents','DOC_VERIFY','التحقق من وثيقة',32),
  ('operations','OPS_AUDIT','مراجعة سجل التدقيق',40),
  ('operations','OPS_NOTIF','الإشعارات والتنبيهات',41),
  ('operations','OPS_REPORTS','التقارير والتصدير',42)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pilot_test_results (scenario_id, result)
  SELECT id, 'not_tested' FROM public.pilot_test_scenarios
  WHERE id NOT IN (SELECT scenario_id FROM public.pilot_test_results);

INSERT INTO public.pilot_checklist_items (period, code, label, order_index) VALUES
  ('morning','M_READINESS','فحص جاهزية النظام',1),
  ('morning','M_OPS','فحص مركز العمليات',2),
  ('morning','M_ALERTS','مراجعة التنبيهات الحرجة',3),
  ('morning','M_BACKUP','التحقق من حالة النسخ الاحتياطي',4),
  ('during_day','D_REQUESTS','متابعة قائمة الطلبات',10),
  ('during_day','D_RECEIPTS','مراجعة سندات الدفع المعلّقة',11),
  ('during_day','D_IMPORTS','فحص عمليات الاستيراد الفاشلة',12),
  ('during_day','D_NOTIFS','مراجعة الإشعارات الفاشلة',13),
  ('end_of_day','E_AUDIT','مراجعة سجل التدقيق',20),
  ('end_of_day','E_ISSUES','مراجعة المشاكل المسجلة',21),
  ('end_of_day','E_FEEDBACK','مراجعة ملاحظات المستخدمين',22)
ON CONFLICT (code) DO NOTHING;
