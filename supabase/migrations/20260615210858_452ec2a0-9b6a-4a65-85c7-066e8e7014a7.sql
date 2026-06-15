
-- ============ 1) organizational_positions ============
CREATE TABLE public.organizational_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_ar text NOT NULL,
  name_en text NULL,
  parent_code text NULL,
  unit_type text NOT NULL DEFAULT 'position',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizational_positions TO authenticated;
GRANT ALL ON public.organizational_positions TO service_role;

ALTER TABLE public.organizational_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "op_read_leadership" ON public.organizational_positions
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin','dean']));

CREATE POLICY "op_insert_admin" ON public.organizational_positions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE POLICY "op_update_admin" ON public.organizational_positions
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE POLICY "op_delete_admin" ON public.organizational_positions
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE TRIGGER trg_op_updated
  BEFORE UPDATE ON public.organizational_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 2) position_assignments ============
CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.organizational_positions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_from date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to date NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_active_position_holder
  ON public.position_assignments(position_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_assignments TO authenticated;
GRANT ALL ON public.position_assignments TO service_role;

ALTER TABLE public.position_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pa_read_leadership" ON public.position_assignments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin','dean']));

CREATE POLICY "pa_insert_admin" ON public.position_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE POLICY "pa_update_admin" ON public.position_assignments
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE POLICY "pa_delete_admin" ON public.position_assignments
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE TRIGGER trg_pa_updated
  BEFORE UPDATE ON public.position_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3) position_role_mapping ============
CREATE TABLE public.position_role_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.organizational_positions(id) ON DELETE CASCADE,
  role_code text NOT NULL REFERENCES public.roles_catalog(code) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_id, role_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_role_mapping TO authenticated;
GRANT ALL ON public.position_role_mapping TO service_role;

ALTER TABLE public.position_role_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prm_read_leadership" ON public.position_role_mapping
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin','dean']));

CREATE POLICY "prm_insert_admin" ON public.position_role_mapping
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE POLICY "prm_update_admin" ON public.position_role_mapping
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

CREATE POLICY "prm_delete_admin" ON public.position_role_mapping
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['system_admin','admin']));

-- ============ 4) Seed positions ============
INSERT INTO public.organizational_positions (code, name_ar, parent_code, unit_type, sort_order) VALUES
  ('college_council',                        'مجلس الكلية',                                                  NULL,                'council',   10),
  ('dean',                                   'عميد الكلية',                                                 'college_council',   'position',  20),
  ('vice_dean_academic',                     'نائب العميد للشؤون الأكاديمية والدراسات العليا','dean',             'position',  30),
  ('vice_dean_students',                     'نائب العميد لشؤون الطلاب',                            'dean',             'position',  40),
  ('college_secretary',                      'أمين الكلية',                                                 'dean',             'position',  50),
  ('dean_office_manager',                    'إدارة مكتب العميد',                                       'dean',             'department',60),
  ('curriculum_unit',                        'وحدة الخطط والمناهج',                                  'vice_dean_academic','unit',     70),
  ('quality_unit',                           'وحدة الجودة',                                                 'dean',             'unit',     80),
  ('academic_departments',                   'الأقسام العلمية',                                          'vice_dean_academic','department',90),
  ('registrar_department',                   'إدارة القبول والتسجيل',                                'vice_dean_academic','department',100),
  ('exams_department',                       'إدارة الاختبارات',                                          'vice_dean_academic','department',110),
  ('student_activities_department',          'إدارة الأنشطة ورعاية الشباب',                  'vice_dean_students','department',120),
  ('services_maintenance_department',        'إدارة الخدمات والصيانة',                              'college_secretary','department',130),
  ('administrative_affairs_department',      'إدارة الشؤون الإدارية',                                'college_secretary','department',140),
  ('financial_affairs_equipment_department', 'إدارة الشؤون المالية والتجهيزات',              'college_secretary','department',150),
  ('college_administration_department',      'إدارة الكلية',                                                'college_secretary','department',160),
  ('scientific_research_department',         'إدارة البحث العلمي',                                      'vice_dean_academic','department',170),
  ('faculty_affairs_graduate_studies_department','إدارة الشؤون الأكاديمية وشؤون أعضاء هيئة التدريس','vice_dean_academic','department',180),
  ('graduate_studies_department',            'إدارة الدراسات العليا',                                'vice_dean_academic','department',190);

-- ============ 5) Seed role mappings (only where matching operational role exists) ============
-- Mapping codes use roles_catalog codes. Substitutions for codes that do not exist in roles_catalog:
--   student_affairs       -> student_affairs_director (closest existing)
--   registrar             -> registrar_director / registrar_officer
--   viewer                -> quality_officer (no 'viewer' code in roles_catalog)
INSERT INTO public.position_role_mapping (position_id, role_code, notes)
SELECT op.id, m.role_code, m.notes FROM (VALUES
  ('dean',                                       'dean',                       'العميد'),
  ('vice_dean_academic',                         'vice_dean',                  'وكيل العميد للشؤون الأكاديمية'),
  ('vice_dean_students',                         'vice_dean',                  'وكيل العميد لشؤون الطلاب'),
  ('vice_dean_students',                         'student_affairs_director',   'إشراف شؤون الطلاب'),
  ('registrar_department',                       'registrar_director',         'إدارة القبول والتسجيل'),
  ('exams_department',                           'registrar_officer',          'تشغيل الاختبارات'),
  ('financial_affairs_equipment_department',     'finance_officer',            'الشؤون المالية'),
  ('faculty_affairs_graduate_studies_department','academic_affairs_director',  'شؤون أعضاء هيئة التدريس'),
  ('graduate_studies_department',                'registrar_director',         'الدراسات العليا'),
  ('quality_unit',                               'quality_officer',            'وحدة الجودة')
) AS m(position_code, role_code, notes)
JOIN public.organizational_positions op ON op.code = m.position_code;

-- ============ 6) Audit log on changes ============
CREATE OR REPLACE FUNCTION public.trg_audit_org_positions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('org_position', NEW.id, 'org_position_created', NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_audit('org_position', NEW.id, 'org_position_updated', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('org_position', OLD.id, 'org_position_deleted', to_jsonb(OLD), NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;$$;

CREATE TRIGGER trg_audit_org_positions
AFTER INSERT OR UPDATE OR DELETE ON public.organizational_positions
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_org_positions();

CREATE OR REPLACE FUNCTION public.trg_audit_position_assignments()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('position_assignment', NEW.id, 'position_assigned', NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      PERFORM public.log_audit('position_assignment', NEW.id, 'position_assignment_ended', to_jsonb(OLD), to_jsonb(NEW));
    ELSE
      PERFORM public.log_audit('position_assignment', NEW.id, 'position_assignment_updated', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  END IF;
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_audit_position_assignments
AFTER INSERT OR UPDATE ON public.position_assignments
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_position_assignments();

CREATE OR REPLACE FUNCTION public.trg_audit_position_role_mapping()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('position_role_mapping', NEW.id, 'position_role_mapping_added', NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    PERFORM public.log_audit('position_role_mapping', NEW.id,
      CASE WHEN NEW.is_active THEN 'position_role_mapping_enabled' ELSE 'position_role_mapping_disabled' END,
      to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('position_role_mapping', OLD.id, 'position_role_mapping_removed', to_jsonb(OLD), NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;$$;

CREATE TRIGGER trg_audit_position_role_mapping
AFTER INSERT OR UPDATE OR DELETE ON public.position_role_mapping
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_position_role_mapping();
