-- Phase 2C: Course Offerings, Sections & Class Schedule

-- =================== course_offerings ===================
CREATE TABLE public.course_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  semester_id uuid NOT NULL,
  program_id uuid NOT NULL,
  level_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_course_offering UNIQUE (course_id, academic_year_id, semester_id, program_id, level_id)
);

GRANT SELECT ON public.course_offerings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_offerings TO authenticated;
GRANT ALL ON public.course_offerings TO service_role;

ALTER TABLE public.course_offerings ENABLE ROW LEVEL SECURITY;

CREATE POLICY co_select ON public.course_offerings FOR SELECT TO authenticated USING (true);
CREATE POLICY co_select_anon ON public.course_offerings FOR SELECT TO anon USING (status = 'active');
CREATE POLICY co_insert ON public.course_offerings FOR INSERT TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.department_id IS NOT NULL
        AND is_department_head_of(auth.uid(), c.department_id)
    )
  );
CREATE POLICY co_update ON public.course_offerings FOR UPDATE TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id AND c.department_id IS NOT NULL
        AND is_department_head_of(auth.uid(), c.department_id)
    )
  );
CREATE POLICY co_delete ON public.course_offerings FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));

CREATE TRIGGER trg_course_offerings_updated_at
BEFORE UPDATE ON public.course_offerings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================== course_sections ===================
CREATE TABLE public.course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_offering_id uuid NOT NULL REFERENCES public.course_offerings(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id) ON DELETE SET NULL,
  capacity integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_code UNIQUE (course_offering_id, section_code)
);

GRANT SELECT ON public.course_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_sections TO authenticated;
GRANT ALL ON public.course_sections TO service_role;

ALTER TABLE public.course_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY cs_select ON public.course_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY cs_select_anon ON public.course_sections FOR SELECT TO anon USING (status = 'active');
CREATE POLICY cs_insert ON public.course_sections FOR INSERT TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.course_offerings o
      JOIN public.courses c ON c.id = o.course_id
      WHERE o.id = course_offering_id AND c.department_id IS NOT NULL
        AND is_department_head_of(auth.uid(), c.department_id)
    )
  );
CREATE POLICY cs_update ON public.course_sections FOR UPDATE TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.course_offerings o
      JOIN public.courses c ON c.id = o.course_id
      WHERE o.id = course_offering_id AND c.department_id IS NOT NULL
        AND is_department_head_of(auth.uid(), c.department_id)
    )
  );
CREATE POLICY cs_delete ON public.course_sections FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));

CREATE TRIGGER trg_course_sections_updated_at
BEFORE UPDATE ON public.course_sections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================== class_schedule ===================
CREATE TABLE public.class_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  day_of_week text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  schedule_type text NOT NULL DEFAULT 'lecture',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_time CHECK (end_time > start_time),
  CONSTRAINT chk_day CHECK (day_of_week IN ('saturday','sunday','monday','tuesday','wednesday','thursday','friday')),
  CONSTRAINT chk_type CHECK (schedule_type IN ('lecture','lab','tutorial'))
);

GRANT SELECT ON public.class_schedule TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule TO authenticated;
GRANT ALL ON public.class_schedule TO service_role;

ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY sch_select ON public.class_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY sch_select_anon ON public.class_schedule FOR SELECT TO anon USING (true);
CREATE POLICY sch_insert ON public.class_schedule FOR INSERT TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.course_sections s
      JOIN public.course_offerings o ON o.id = s.course_offering_id
      JOIN public.courses c ON c.id = o.course_id
      WHERE s.id = course_section_id AND c.department_id IS NOT NULL
        AND is_department_head_of(auth.uid(), c.department_id)
    )
  );
CREATE POLICY sch_update ON public.class_schedule FOR UPDATE TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
    OR EXISTS (
      SELECT 1 FROM public.course_sections s
      JOIN public.course_offerings o ON o.id = s.course_offering_id
      JOIN public.courses c ON c.id = o.course_id
      WHERE s.id = course_section_id AND c.department_id IS NOT NULL
        AND is_department_head_of(auth.uid(), c.department_id)
    )
  );
CREATE POLICY sch_delete ON public.class_schedule FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));

CREATE TRIGGER trg_class_schedule_updated_at
BEFORE UPDATE ON public.class_schedule
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_offerings_year_sem ON public.course_offerings(academic_year_id, semester_id);
CREATE INDEX idx_offerings_program_level ON public.course_offerings(program_id, level_id);
CREATE INDEX idx_sections_offering ON public.course_sections(course_offering_id);
CREATE INDEX idx_sections_faculty ON public.course_sections(faculty_profile_id);
CREATE INDEX idx_schedule_section ON public.class_schedule(course_section_id);
