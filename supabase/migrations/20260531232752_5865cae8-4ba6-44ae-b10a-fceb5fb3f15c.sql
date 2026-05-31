-- Phase 2D: Student Enrollments

CREATE TABLE public.student_enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_profile_id uuid NOT NULL,
  course_section_id uuid NOT NULL,
  enrollment_status text NOT NULL DEFAULT 'enrolled',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_enrollments_status_chk CHECK (enrollment_status IN ('enrolled','dropped','completed')),
  CONSTRAINT student_enrollments_unique UNIQUE (student_profile_id, course_section_id)
);

CREATE INDEX idx_student_enrollments_student ON public.student_enrollments(student_profile_id);
CREATE INDEX idx_student_enrollments_section ON public.student_enrollments(course_section_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments TO authenticated;
GRANT ALL ON public.student_enrollments TO service_role;

ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

-- Student: view own only
CREATE POLICY se_student_select ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = student_enrollments.student_profile_id
      AND sp.user_id = auth.uid()
  ));

-- Privileged: full access
CREATE POLICY se_priv_select ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY se_priv_insert ON public.student_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY se_priv_update ON public.student_enrollments
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY se_priv_delete ON public.student_enrollments
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

-- Department head: read enrollments for sections of courses in their department
CREATE POLICY se_dept_head_select ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.course_sections cs
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    JOIN public.courses c ON c.id = co.course_id
    WHERE cs.id = student_enrollments.course_section_id
      AND c.department_id IS NOT NULL
      AND public.is_department_head_of(auth.uid(), c.department_id)
  ));

-- Faculty: read enrollments for sections they teach
CREATE POLICY se_faculty_select ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.course_sections cs
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    WHERE cs.id = student_enrollments.course_section_id
      AND fp.user_id = auth.uid()
  ));

-- updated_at trigger
CREATE TRIGGER trg_se_updated_at
  BEFORE UPDATE ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation: ensure section matches student's current academic status
CREATE OR REPLACE FUNCTION public.validate_student_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_program uuid;
  v_offering record;
  v_status record;
BEGIN
  SELECT program_id INTO v_student_program
  FROM public.student_profiles WHERE id = NEW.student_profile_id;

  SELECT co.program_id, co.level_id, co.academic_year_id, co.semester_id
    INTO v_offering
  FROM public.course_sections cs
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  WHERE cs.id = NEW.course_section_id;

  IF v_offering IS NULL THEN
    RAISE EXCEPTION 'Invalid course section';
  END IF;

  -- Program must match
  IF v_student_program IS NOT NULL AND v_offering.program_id IS NOT NULL
     AND v_student_program <> v_offering.program_id THEN
    RAISE EXCEPTION 'Student program does not match course offering program';
  END IF;

  -- Match current academic status if exists
  SELECT academic_year_id, semester_id, level_id INTO v_status
  FROM public.student_academic_status
  WHERE student_profile_id = NEW.student_profile_id
    AND enrollment_status = 'active'
  ORDER BY updated_at DESC LIMIT 1;

  IF v_status IS NOT NULL THEN
    IF v_status.academic_year_id <> v_offering.academic_year_id THEN
      RAISE EXCEPTION 'Course offering academic year does not match student current year';
    END IF;
    IF v_status.semester_id <> v_offering.semester_id THEN
      RAISE EXCEPTION 'Course offering semester does not match student current semester';
    END IF;
    IF v_status.level_id <> v_offering.level_id THEN
      RAISE EXCEPTION 'Course offering level does not match student current level';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_se_validate
  BEFORE INSERT ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.validate_student_enrollment();
