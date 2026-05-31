
-- academic_years
CREATE TABLE public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ay_select" ON public.academic_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "ay_insert" ON public.academic_years FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "ay_update" ON public.academic_years FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "ay_delete" ON public.academic_years FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE TRIGGER trg_ay_updated BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- semesters
CREATE TABLE public.semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.semesters TO authenticated;
GRANT ALL ON public.semesters TO service_role;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sem_select" ON public.semesters FOR SELECT TO authenticated USING (true);
CREATE POLICY "sem_insert" ON public.semesters FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "sem_update" ON public.semesters FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "sem_delete" ON public.semesters FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE TRIGGER trg_sem_updated BEFORE UPDATE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- academic_levels
CREATE TABLE public.academic_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_levels TO authenticated;
GRANT ALL ON public.academic_levels TO service_role;
ALTER TABLE public.academic_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lvl_select" ON public.academic_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "lvl_insert" ON public.academic_levels FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "lvl_update" ON public.academic_levels FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "lvl_delete" ON public.academic_levels FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE TRIGGER trg_lvl_updated BEFORE UPDATE ON public.academic_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- student_academic_status
CREATE TABLE public.student_academic_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
  level_id UUID NOT NULL REFERENCES public.academic_levels(id) ON DELETE RESTRICT,
  enrollment_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_profile_id, academic_year_id, semester_id)
);
CREATE INDEX idx_sas_student ON public.student_academic_status(student_profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_academic_status TO authenticated;
GRANT ALL ON public.student_academic_status TO service_role;
ALTER TABLE public.student_academic_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sas_priv_select" ON public.student_academic_status FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "sas_self_select" ON public.student_academic_status FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = student_academic_status.student_profile_id AND sp.user_id = auth.uid()));
CREATE POLICY "sas_priv_insert" ON public.student_academic_status FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "sas_priv_update" ON public.student_academic_status FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY "sas_priv_delete" ON public.student_academic_status FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE TRIGGER trg_sas_updated BEFORE UPDATE ON public.student_academic_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed
INSERT INTO public.academic_years (name, start_date, end_date, is_current)
VALUES ('2025-2026', '2025-09-01', '2026-07-15', true);

INSERT INTO public.semesters (academic_year_id, name, code, start_date, end_date, is_current)
SELECT id, 'الفصل الأول', 'first', '2025-09-01', '2026-01-15', true FROM public.academic_years WHERE name = '2025-2026';
INSERT INTO public.semesters (academic_year_id, name, code, start_date, end_date, is_current)
SELECT id, 'الفصل الثاني', 'second', '2026-02-01', '2026-06-15', false FROM public.academic_years WHERE name = '2025-2026';
INSERT INTO public.semesters (academic_year_id, name, code, start_date, end_date, is_current)
SELECT id, 'الفصل الصيفي', 'summer', '2026-06-20', '2026-08-15', false FROM public.academic_years WHERE name = '2025-2026';

INSERT INTO public.academic_levels (name, level_number) VALUES
  ('المستوى الأول', 1),
  ('المستوى الثاني', 2),
  ('المستوى الثالث', 3),
  ('المستوى الرابع', 4);

INSERT INTO public.student_academic_status (student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
SELECT
  sp.id,
  ay.id,
  s.id,
  lv.id,
  'active'
FROM public.student_profiles sp
CROSS JOIN public.academic_years ay
CROSS JOIN public.semesters s
CROSS JOIN public.academic_levels lv
WHERE sp.academic_number = '20230001'
  AND ay.name = '2025-2026'
  AND s.code = 'first' AND s.academic_year_id = ay.id
  AND lv.level_number = 1;
