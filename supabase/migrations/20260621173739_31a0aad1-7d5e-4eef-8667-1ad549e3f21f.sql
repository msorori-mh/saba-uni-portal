-- SR-C5: record granted extra chance when an extra_chance request is approved

ALTER TABLE public.extra_chance_details
  ADD COLUMN IF NOT EXISTS chance_applied_at timestamptz;

CREATE TABLE IF NOT EXISTS public.student_extra_chances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  semester_id uuid NOT NULL REFERENCES public.semesters(id),
  chance_type text NOT NULL,
  reason text NOT NULL,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sxc_chance_type_chk CHECK (chance_type IN ('final_chance', 'additional_chance')),
  CONSTRAINT sxc_request_unique UNIQUE (request_id),
  CONSTRAINT sxc_student_term_type_unique UNIQUE (student_profile_id, academic_year_id, semester_id, chance_type)
);

CREATE INDEX IF NOT EXISTS idx_sxc_student ON public.student_extra_chances(student_profile_id);
CREATE INDEX IF NOT EXISTS idx_sxc_year ON public.student_extra_chances(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_sxc_semester ON public.student_extra_chances(semester_id);
CREATE INDEX IF NOT EXISTS idx_sxc_request ON public.student_extra_chances(request_id);

GRANT SELECT ON public.student_extra_chances TO authenticated;
GRANT ALL ON public.student_extra_chances TO service_role;

ALTER TABLE public.student_extra_chances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sxc_select ON public.student_extra_chances;
CREATE POLICY sxc_select ON public.student_extra_chances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_extra_chances.student_profile_id
        AND sp.user_id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );

CREATE OR REPLACE FUNCTION public.apply_extra_chance_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details public.extra_chance_details%ROWTYPE;
BEGIN
  IF NEW.request_type <> 'extra_chance'
     OR NEW.status <> 'approved'
     OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_details
  FROM public.extra_chance_details
  WHERE request_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extra chance details missing for request %', NEW.id;
  END IF;

  IF v_details.chance_applied_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_details.academic_year_id IS NULL OR v_details.semester_id IS NULL
     OR v_details.chance_type IS NULL OR btrim(v_details.reason) = '' THEN
    RAISE EXCEPTION 'Extra chance request details are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.semesters s
    WHERE s.id = v_details.semester_id
      AND s.academic_year_id = v_details.academic_year_id
  ) THEN
    RAISE EXCEPTION 'Semester does not belong to the selected academic year';
  END IF;

  IF NEW.student_profile_id IS NULL THEN
    RAISE EXCEPTION 'Extra chance request is missing student profile';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_academic_status sas
    WHERE sas.student_profile_id = NEW.student_profile_id
      AND sas.academic_year_id = v_details.academic_year_id
      AND sas.semester_id = v_details.semester_id
      AND sas.enrollment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Student does not have active academic status for the selected year and semester';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_extra_chances sec
    WHERE sec.student_profile_id = NEW.student_profile_id
      AND sec.academic_year_id = v_details.academic_year_id
      AND sec.semester_id = v_details.semester_id
      AND sec.chance_type = v_details.chance_type
  ) THEN
    RAISE EXCEPTION 'A matching extra chance record already exists for this student';
  END IF;

  INSERT INTO public.student_extra_chances (
    student_profile_id,
    request_id,
    academic_year_id,
    semester_id,
    chance_type,
    reason,
    approved_by,
    approved_at
  )
  VALUES (
    NEW.student_profile_id,
    NEW.id,
    v_details.academic_year_id,
    v_details.semester_id,
    v_details.chance_type,
    v_details.reason,
    NEW.reviewed_by,
    COALESCE(NEW.reviewed_at, now())
  );

  UPDATE public.extra_chance_details
     SET chance_applied_at = now(),
         updated_at = now()
   WHERE id = v_details.id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_extra_chance_on_approval'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_apply_extra_chance_on_approval
      AFTER UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.apply_extra_chance_on_approval();
  END IF;
END $$;