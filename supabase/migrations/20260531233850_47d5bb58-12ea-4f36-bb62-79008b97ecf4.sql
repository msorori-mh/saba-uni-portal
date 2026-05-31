-- =========================================
-- grade_components
-- =========================================
CREATE TABLE public.grade_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_section_id uuid NOT NULL,
  name text NOT NULL,
  max_score numeric NOT NULL CHECK (max_score > 0),
  weight numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_section_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_components TO authenticated;
GRANT ALL ON public.grade_components TO service_role;

ALTER TABLE public.grade_components ENABLE ROW LEVEL SECURITY;

-- Helper: is faculty owner of section
CREATE OR REPLACE FUNCTION public.is_faculty_of_section(_user_id uuid, _section_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_sections cs
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    WHERE cs.id = _section_id AND fp.user_id = _user_id
  )
$$;

-- Helper: dept head over section
CREATE OR REPLACE FUNCTION public.is_dept_head_of_section(_user_id uuid, _section_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_sections cs
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    JOIN public.courses c ON c.id = co.course_id
    WHERE cs.id = _section_id
      AND c.department_id IS NOT NULL
      AND public.is_department_head_of(_user_id, c.department_id)
  )
$$;

-- Trigger: max_score total per section ≤ 100
CREATE OR REPLACE FUNCTION public.validate_grade_component_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(max_score),0) INTO v_total
  FROM public.grade_components
  WHERE course_section_id = NEW.course_section_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_total + NEW.max_score > 100 THEN
    RAISE EXCEPTION 'Total max_score for section cannot exceed 100 (current=%, attempted+%)', v_total, NEW.max_score;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gc_validate_total
BEFORE INSERT OR UPDATE ON public.grade_components
FOR EACH ROW EXECUTE FUNCTION public.validate_grade_component_total();

CREATE TRIGGER gc_updated_at
BEFORE UPDATE ON public.grade_components
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY gc_select ON public.grade_components FOR SELECT TO authenticated USING (true);

CREATE POLICY gc_insert ON public.grade_components FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
  OR public.is_dept_head_of_section(auth.uid(), course_section_id)
  OR public.is_faculty_of_section(auth.uid(), course_section_id)
);

CREATE POLICY gc_update ON public.grade_components FOR UPDATE TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean'])
  OR public.is_dept_head_of_section(auth.uid(), course_section_id)
  OR public.is_faculty_of_section(auth.uid(), course_section_id)
);

CREATE POLICY gc_delete ON public.grade_components FOR DELETE TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar'])
  OR public.is_faculty_of_section(auth.uid(), course_section_id)
);

-- =========================================
-- student_grades
-- =========================================
CREATE TABLE public.student_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_enrollment_id uuid NOT NULL,
  grade_component_id uuid NOT NULL,
  score numeric NOT NULL CHECK (score >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  entered_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_enrollment_id, grade_component_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_grades TO authenticated;
GRANT ALL ON public.student_grades TO service_role;

ALTER TABLE public.student_grades ENABLE ROW LEVEL SECURITY;

-- Validate score ≤ component.max_score
CREATE OR REPLACE FUNCTION public.validate_student_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max numeric;
BEGIN
  SELECT max_score INTO v_max FROM public.grade_components WHERE id = NEW.grade_component_id;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Invalid grade component';
  END IF;
  IF NEW.score > v_max THEN
    RAISE EXCEPTION 'Score % exceeds component max_score %', NEW.score, v_max;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sg_validate
BEFORE INSERT OR UPDATE ON public.student_grades
FOR EACH ROW EXECUTE FUNCTION public.validate_student_grade();

CREATE TRIGGER sg_updated_at
BEFORE UPDATE ON public.student_grades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: faculty of grade row (via enrollment->section)
CREATE OR REPLACE FUNCTION public.is_faculty_of_grade(_user_id uuid, _enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    JOIN public.course_sections cs ON cs.id = se.course_section_id
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    WHERE se.id = _enrollment_id AND fp.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_student_of_enrollment(_user_id uuid, _enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    JOIN public.student_profiles sp ON sp.id = se.student_profile_id
    WHERE se.id = _enrollment_id AND sp.user_id = _user_id
  )
$$;

-- SELECT policies
CREATE POLICY sg_priv_select ON public.student_grades FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean','student_affairs']));

CREATE POLICY sg_faculty_select ON public.student_grades FOR SELECT TO authenticated
USING (public.is_faculty_of_grade(auth.uid(), student_enrollment_id));

CREATE POLICY sg_dept_head_select ON public.student_grades FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.student_enrollments se
  JOIN public.course_sections cs ON cs.id = se.course_section_id
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  WHERE se.id = student_grades.student_enrollment_id
    AND c.department_id IS NOT NULL
    AND public.is_department_head_of(auth.uid(), c.department_id)
));

CREATE POLICY sg_student_select ON public.student_grades FOR SELECT TO authenticated
USING (status = 'approved' AND public.is_student_of_enrollment(auth.uid(), student_enrollment_id));

-- INSERT: faculty for own sections (only draft) or privileged
CREATE POLICY sg_insert ON public.student_grades FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar'])
  OR (status = 'draft' AND public.is_faculty_of_grade(auth.uid(), student_enrollment_id))
);

-- UPDATE: faculty can edit draft and may move to submitted; privileged can do anything
CREATE POLICY sg_update_priv ON public.student_grades FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));

CREATE POLICY sg_update_faculty ON public.student_grades FOR UPDATE TO authenticated
USING (
  public.is_faculty_of_grade(auth.uid(), student_enrollment_id)
  AND status IN ('draft')
)
WITH CHECK (
  public.is_faculty_of_grade(auth.uid(), student_enrollment_id)
  AND status IN ('draft','submitted')
);

CREATE POLICY sg_delete ON public.student_grades FOR DELETE TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar'])
  OR (status = 'draft' AND public.is_faculty_of_grade(auth.uid(), student_enrollment_id))
);

-- =========================================
-- View: student_course_grade_summary
-- =========================================
CREATE OR REPLACE VIEW public.student_course_grade_summary
WITH (security_invoker = true) AS
SELECT
  se.id AS enrollment_id,
  sp.id AS student_profile_id,
  sp.academic_number,
  sp.full_name_ar AS student_name,
  cs.id AS course_section_id,
  cs.section_code,
  c.id AS course_id,
  c.code AS course_code,
  c.name_ar AS course_name,
  COALESCE(SUM(sg.score), 0)::numeric AS total_score,
  COALESCE((SELECT SUM(max_score) FROM public.grade_components gc2 WHERE gc2.course_section_id = cs.id), 0)::numeric AS total_max,
  CASE WHEN COALESCE((SELECT SUM(max_score) FROM public.grade_components gc2 WHERE gc2.course_section_id = cs.id),0) > 0
       THEN ROUND(COALESCE(SUM(sg.score),0) / (SELECT SUM(max_score) FROM public.grade_components gc2 WHERE gc2.course_section_id = cs.id) * 100, 2)
       ELSE 0 END AS percentage,
  CASE
    WHEN BOOL_AND(sg.status = 'approved') AND COUNT(sg.id) > 0 THEN 'approved'
    WHEN BOOL_OR(sg.status = 'submitted') THEN 'submitted'
    ELSE 'draft'
  END AS overall_status
FROM public.student_enrollments se
JOIN public.student_profiles sp ON sp.id = se.student_profile_id
JOIN public.course_sections cs ON cs.id = se.course_section_id
JOIN public.course_offerings co ON co.id = cs.course_offering_id
JOIN public.courses c ON c.id = co.course_id
LEFT JOIN public.student_grades sg ON sg.student_enrollment_id = se.id
GROUP BY se.id, sp.id, sp.academic_number, sp.full_name_ar, cs.id, cs.section_code, c.id, c.code, c.name_ar;

GRANT SELECT ON public.student_course_grade_summary TO authenticated;
