
CREATE TABLE IF NOT EXISTS public.roles_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.roles_catalog TO authenticated;
GRANT ALL ON public.roles_catalog TO service_role;

ALTER TABLE public.roles_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_catalog_read_authenticated"
  ON public.roles_catalog FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "roles_catalog_admin_insert"
  ON public.roles_catalog FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY "roles_catalog_admin_update"
  ON public.roles_catalog FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER roles_catalog_updated_at
  BEFORE UPDATE ON public.roles_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.roles_catalog (code, name_ar, name_en, description) VALUES
  ('system_admin', 'مدير النظام', 'System Administrator', 'صلاحيات تقنية كاملة على النظام'),
  ('admin', 'مدير', 'Administrator', 'صلاحيات إدارية كاملة'),
  ('dean', 'العميد', 'Dean', 'عميد الكلية'),
  ('vice_dean', 'وكيل العميد', 'Vice Dean', 'وكيل عميد الكلية'),
  ('department_head', 'رئيس قسم', 'Department Head', 'رئيس قسم أكاديمي'),
  ('faculty_member', 'عضو هيئة تدريس', 'Faculty Member', 'عضو هيئة تدريس'),
  ('academic_affairs_director', 'مدير الشؤون الأكاديمية', 'Academic Affairs Director', 'مدير إدارة الشؤون الأكاديمية'),
  ('academic_affairs_officer', 'مختص الشؤون الأكاديمية', 'Academic Affairs Officer', 'مختص بالشؤون الأكاديمية'),
  ('registrar_director', 'مدير القبول والتسجيل', 'Registrar Director', 'مدير إدارة القبول والتسجيل'),
  ('registrar_officer', 'مختص القبول والتسجيل', 'Registrar Officer', 'مختص بإدارة القبول والتسجيل'),
  ('student_affairs_director', 'مدير شؤون الطلاب', 'Student Affairs Director', 'مدير إدارة شؤون الطلاب'),
  ('student_affairs_officer', 'مختص شؤون الطلاب', 'Student Affairs Officer', 'مختص بشؤون الطلاب'),
  ('graduates_director', 'مدير شؤون الخريجين', 'Graduates Director', 'مدير إدارة الخريجين'),
  ('graduates_officer', 'مختص شؤون الخريجين', 'Graduates Officer', 'مختص بشؤون الخريجين'),
  ('finance_director', 'المدير المالي', 'Finance Director', 'مدير الإدارة المالية'),
  ('finance_officer', 'مختص مالي', 'Finance Officer', 'مختص بالشؤون المالية'),
  ('quality_director', 'مدير الجودة', 'Quality Director', 'مدير إدارة الجودة'),
  ('quality_officer', 'مختص الجودة', 'Quality Officer', 'مختص بالجودة')
ON CONFLICT (code) DO NOTHING;
