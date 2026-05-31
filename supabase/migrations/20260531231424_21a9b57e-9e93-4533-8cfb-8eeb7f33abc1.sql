
-- Phase 2B: Courses & Study Plans

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  credit_hours integer NOT NULL DEFAULT 3,
  theory_hours integer NOT NULL DEFAULT 0,
  practical_hours integer NOT NULL DEFAULT 0,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT ON public.courses TO anon;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_select ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY courses_select_anon ON public.courses FOR SELECT TO anon USING (status = 'active');
CREATE POLICY courses_insert ON public.courses FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR (department_id IS NOT NULL AND public.is_department_head_of(auth.uid(), department_id))
  );
CREATE POLICY courses_update ON public.courses FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR (department_id IS NOT NULL AND public.is_department_head_of(auth.uid(), department_id))
  );
CREATE POLICY courses_delete ON public.courses FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar'])
    OR (department_id IS NOT NULL AND public.is_department_head_of(auth.uid(), department_id))
  );

CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- study_plans
CREATE TABLE public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  total_credit_hours integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plans TO authenticated;
GRANT SELECT ON public.study_plans TO anon;
GRANT ALL ON public.study_plans TO service_role;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;

-- helper: is department head for a program (via program.department_id)
CREATE OR REPLACE FUNCTION public.is_dept_head_of_program(_user_id uuid, _program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = _program_id
      AND p.department_id IS NOT NULL
      AND public.is_department_head_of(_user_id, p.department_id)
  )
$$;

CREATE POLICY sp_select ON public.study_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_select_anon ON public.study_plans FOR SELECT TO anon USING (is_active = true);
CREATE POLICY sp_insert ON public.study_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR public.is_dept_head_of_program(auth.uid(), program_id)
  );
CREATE POLICY sp_update ON public.study_plans FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR public.is_dept_head_of_program(auth.uid(), program_id)
  );
CREATE POLICY sp_delete ON public.study_plans FOR DELETE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar'])
    OR public.is_dept_head_of_program(auth.uid(), program_id)
  );

CREATE TRIGGER trg_sp_updated BEFORE UPDATE ON public.study_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- study_plan_courses
CREATE TABLE public.study_plan_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  level_id uuid NOT NULL REFERENCES public.academic_levels(id),
  semester_code text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  prerequisite_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_plan_id, course_id, level_id, semester_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_courses TO authenticated;
GRANT SELECT ON public.study_plan_courses TO anon;
GRANT ALL ON public.study_plan_courses TO service_role;
ALTER TABLE public.study_plan_courses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_study_plan(_user_id uuid, _study_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.study_plans sp
      WHERE sp.id = _study_plan_id
        AND public.is_dept_head_of_program(_user_id, sp.program_id)
    )
$$;

CREATE POLICY spc_select ON public.study_plan_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY spc_select_anon ON public.study_plan_courses FOR SELECT TO anon USING (true);
CREATE POLICY spc_insert ON public.study_plan_courses FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_study_plan(auth.uid(), study_plan_id));
CREATE POLICY spc_update ON public.study_plan_courses FOR UPDATE TO authenticated
  USING (public.can_manage_study_plan(auth.uid(), study_plan_id));
CREATE POLICY spc_delete ON public.study_plan_courses FOR DELETE TO authenticated
  USING (public.can_manage_study_plan(auth.uid(), study_plan_id));

CREATE TRIGGER trg_spc_updated BEFORE UPDATE ON public.study_plan_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SEED
DO $$
DECLARE
  v_cs_dept uuid := '11111111-1111-4111-8111-111111111111';
  v_cs_prog uuid := '8df96335-4197-4e33-85ca-a970608f6a63';
  v_lvl1 uuid := 'f2361240-2d15-412e-9795-da706bdb568d';
  v_lvl2 uuid := 'c770ec46-a955-4348-9767-e5a3ae86966c';
  v_cs101 uuid; v_cs102 uuid; v_cs201 uuid; v_cs202 uuid; v_math101 uuid;
  v_plan uuid;
BEGIN
  INSERT INTO public.courses (code, name_ar, name_en, credit_hours, theory_hours, practical_hours, department_id)
  VALUES
    ('CS101', 'برمجة حاسوب 1', 'Computer Programming I', 3, 2, 2, v_cs_dept),
    ('CS102', 'برمجة حاسوب 2', 'Computer Programming II', 3, 2, 2, v_cs_dept),
    ('CS201', 'هياكل البيانات', 'Data Structures', 3, 2, 2, v_cs_dept),
    ('CS202', 'قواعد البيانات', 'Databases', 3, 2, 2, v_cs_dept),
    ('MATH101', 'رياضيات متقطعة', 'Discrete Mathematics', 3, 3, 0, v_cs_dept);

  SELECT id INTO v_cs101 FROM public.courses WHERE code='CS101';
  SELECT id INTO v_cs102 FROM public.courses WHERE code='CS102';
  SELECT id INTO v_cs201 FROM public.courses WHERE code='CS201';
  SELECT id INTO v_cs202 FROM public.courses WHERE code='CS202';
  SELECT id INTO v_math101 FROM public.courses WHERE code='MATH101';

  INSERT INTO public.study_plans (program_id, name, version, total_credit_hours, is_active)
  VALUES (v_cs_prog, 'خطة بكالوريوس علوم الحاسوب 2025', '2025', 15, true)
  RETURNING id INTO v_plan;

  INSERT INTO public.study_plan_courses (study_plan_id, course_id, level_id, semester_code, is_required, prerequisite_course_id, sort_order) VALUES
    (v_plan, v_cs101,   v_lvl1, 'first',  true, NULL,    1),
    (v_plan, v_math101, v_lvl1, 'first',  true, NULL,    2),
    (v_plan, v_cs102,   v_lvl1, 'second', true, v_cs101, 1),
    (v_plan, v_cs201,   v_lvl2, 'first',  true, v_cs102, 1),
    (v_plan, v_cs202,   v_lvl2, 'first',  true, NULL,    2);
END $$;
