-- SR-C4: record excused absence when an absence_excuse request is approved

ALTER TABLE public.absence_excuse_details
  ADD COLUMN IF NOT EXISTS record_applied_at timestamptz;

CREATE TABLE IF NOT EXISTS public.student_excused_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id),
  absence_date date NOT NULL,
  reason_type text NOT NULL,
  absence_excuse_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE RESTRICT,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sea_reason_chk CHECK (reason_type IN ('medical','family','emergency','other')),
  CONSTRAINT sea_request_unique UNIQUE (absence_excuse_request_id),
  CONSTRAINT sea_student_section_date_unique UNIQUE (student_profile_id, course_section_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_sea_student ON public.student_excused_absences(student_profile_id);
CREATE INDEX IF NOT EXISTS idx_sea_section ON public.student_excused_absences(course_section_id);
CREATE INDEX IF NOT EXISTS idx_sea_date ON public.student_excused_absences(absence_date);

GRANT SELECT ON public.student_excused_absences TO authenticated;
GRANT ALL ON public.student_excused_absences TO service_role;

ALTER TABLE public.student_excused_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY sea_select ON public.student_excused_absences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_excused_absences.student_profile_id
        AND sp.user_id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
    OR public.is_faculty_of_section(auth.uid(), course_section_id)
    OR EXISTS (
      SELECT 1
      FROM public.course_sections cs
      JOIN public.course_offerings co ON co.id = cs.course_offering_id
      JOIN public.courses c ON c.id = co.course_id
      WHERE cs.id = student_excused_absences.course_section_id
        AND c.department_id IS NOT NULL
        AND public.is_department_head_of(auth.uid(), c.department_id)
    )
  );

CREATE OR REPLACE FUNCTION public.apply_absence_excuse_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details public.absence_excuse_details%ROWTYPE;
BEGIN
  IF NEW.request_type <> 'absence_excuse'
     OR NEW.status <> 'approved'
     OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_details
  FROM public.absence_excuse_details
  WHERE request_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Absence excuse details missing for request %', NEW.id;
  END IF;

  IF v_details.record_applied_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_enrollments se
    WHERE se.student_profile_id = NEW.student_profile_id
      AND se.course_section_id = v_details.course_section_id
      AND se.enrollment_status = 'enrolled'
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in the selected course section';
  END IF;

  INSERT INTO public.student_excused_absences (
    student_profile_id,
    course_section_id,
    absence_date,
    reason_type,
    absence_excuse_request_id
  )
  VALUES (
    NEW.student_profile_id,
    v_details.course_section_id,
    v_details.absence_date,
    v_details.reason_type,
    NEW.id
  )
  ON CONFLICT (student_profile_id, course_section_id, absence_date) DO NOTHING;

  UPDATE public.absence_excuse_details
     SET record_applied_at = now(),
         updated_at = now()
   WHERE id = v_details.id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_absence_excuse_on_approval'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_apply_absence_excuse_on_approval
      AFTER UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.apply_absence_excuse_on_approval();
  END IF;
END $$;
