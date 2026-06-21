-- PR #28 SR-C3: equivalency parent approval gates + apply approved credits

ALTER TABLE public.equivalency_request_details
  ADD COLUMN IF NOT EXISTS credits_applied_at timestamptz;

CREATE TABLE IF NOT EXISTS public.student_equivalency_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id),
  equivalency_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE RESTRICT,
  equivalency_course_id uuid NOT NULL REFERENCES public.equivalency_courses(id) ON DELETE RESTRICT,
  external_course_code text NOT NULL,
  external_course_name text NOT NULL,
  credit_hours integer,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_equivalency_credits_course_unique UNIQUE (equivalency_course_id),
  CONSTRAINT student_equivalency_credits_student_course_unique UNIQUE (student_profile_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_sec_student ON public.student_equivalency_credits(student_profile_id);
CREATE INDEX IF NOT EXISTS idx_sec_course ON public.student_equivalency_credits(course_id);
CREATE INDEX IF NOT EXISTS idx_sec_request ON public.student_equivalency_credits(equivalency_request_id);

GRANT SELECT ON public.student_equivalency_credits TO authenticated;
GRANT ALL ON public.student_equivalency_credits TO service_role;

ALTER TABLE public.student_equivalency_credits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='student_equivalency_credits' AND policyname='sec_select') THEN
    CREATE POLICY sec_select ON public.student_equivalency_credits
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = student_equivalency_credits.student_profile_id
            AND sp.user_id = auth.uid()
        )
        OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_equivalency_parent_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pending integer := 0; v_approvable integer := 0;
BEGIN
  IF NEW.request_type <> 'equivalency' OR NEW.status <> 'approved' OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO v_pending FROM public.equivalency_courses ec
   WHERE ec.equivalency_request_id = NEW.id AND ec.status = 'pending';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cannot approve equivalency request while course reviews are still pending';
  END IF;
  SELECT COUNT(*) INTO v_approvable FROM public.equivalency_courses ec
   WHERE ec.equivalency_request_id = NEW.id AND ec.status = 'approved' AND ec.target_course_id IS NOT NULL;
  IF v_approvable = 0 THEN
    RAISE EXCEPTION 'Cannot approve equivalency request without at least one approved course with a target course';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_equivalency_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_details_id uuid; v_applied_at timestamptz; v_course record;
BEGIN
  IF NEW.request_type <> 'equivalency' OR NEW.status <> 'approved' OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;
  SELECT erd.id, erd.credits_applied_at INTO v_details_id, v_applied_at
    FROM public.equivalency_request_details erd WHERE erd.request_id = NEW.id FOR UPDATE;
  IF v_details_id IS NULL THEN
    RAISE EXCEPTION 'Equivalency request details missing for request %', NEW.id;
  END IF;
  IF v_applied_at IS NOT NULL THEN RETURN NEW; END IF;
  FOR v_course IN
    SELECT ec.id, ec.target_course_id, ec.external_course_code, ec.external_course_name, ec.external_credit_hours
      FROM public.equivalency_courses ec
     WHERE ec.equivalency_request_id = NEW.id AND ec.status = 'approved' AND ec.target_course_id IS NOT NULL
  LOOP
    INSERT INTO public.student_equivalency_credits (
      student_profile_id, course_id, equivalency_request_id, equivalency_course_id,
      external_course_code, external_course_name, credit_hours
    ) VALUES (
      NEW.student_profile_id, v_course.target_course_id, NEW.id, v_course.id,
      v_course.external_course_code, v_course.external_course_name,
      COALESCE(v_course.external_credit_hours, (SELECT c.credit_hours FROM public.courses c WHERE c.id = v_course.target_course_id))
    ) ON CONFLICT (student_profile_id, course_id) DO NOTHING;
  END LOOP;
  UPDATE public.equivalency_request_details SET credits_applied_at = now(), updated_at = now() WHERE id = v_details_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_validate_equivalency_parent_approval' AND tgrelid='public.student_requests'::regclass) THEN
    CREATE TRIGGER trg_validate_equivalency_parent_approval
      BEFORE UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.validate_equivalency_parent_approval();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_apply_equivalency_on_approval' AND tgrelid='public.student_requests'::regclass) THEN
    CREATE TRIGGER trg_apply_equivalency_on_approval
      AFTER UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.apply_equivalency_on_approval();
  END IF;
END $$;

CREATE OR REPLACE VIEW public.student_unofficial_transcript
WITH (security_invoker = true) AS
WITH approved_totals AS (
  SELECT sg.student_enrollment_id, SUM(sg.score)::numeric AS total_score, SUM(gc.max_score)::numeric AS total_max
  FROM public.student_grades sg JOIN public.grade_components gc ON gc.id = sg.grade_component_id
  WHERE sg.status = 'approved' GROUP BY sg.student_enrollment_id
),
enrollment_rows AS (
  SELECT se.id AS enrollment_id, sp.id AS student_profile_id, sp.academic_number,
    sp.full_name_ar AS student_name_ar, sp.full_name_en AS student_name_en,
    prog.id AS program_id, prog.name_ar AS program_name,
    dept.id AS department_id, dept.name_ar AS department_name,
    ay.id AS academic_year_id, ay.name AS academic_year_name,
    sem.id AS semester_id, sem.name AS semester_name, sem.code AS semester_code,
    lvl.id AS level_id, lvl.name AS level_name, lvl.level_number,
    c.id AS course_id, c.code AS course_code, c.name_ar AS course_name, c.credit_hours,
    cs.section_code, at.total_score AS final_score, at.total_max AS max_score,
    CASE WHEN at.total_max > 0 THEN ROUND((at.total_score / at.total_max) * 100, 2) ELSE 0 END AS percentage,
    CASE WHEN at.total_max > 0 AND ROUND((at.total_score / at.total_max) * 100, 2) >= 50 THEN 'passed' ELSE 'failed' END AS course_status,
    se.enrollment_status, NULL::text AS notes
  FROM public.student_enrollments se
  JOIN approved_totals at ON at.student_enrollment_id = se.id
  JOIN public.student_profiles sp ON sp.id = se.student_profile_id
  JOIN public.course_sections cs ON cs.id = se.course_section_id
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  LEFT JOIN public.programs prog ON prog.id = co.program_id
  LEFT JOIN public.departments dept ON dept.id = c.department_id
  JOIN public.academic_years ay ON ay.id = co.academic_year_id
  JOIN public.semesters sem ON sem.id = co.semester_id
  JOIN public.academic_levels lvl ON lvl.id = co.level_id
),
equivalency_rows AS (
  SELECT sec.id AS enrollment_id, sec.student_profile_id, sp.academic_number,
    sp.full_name_ar AS student_name_ar, sp.full_name_en AS student_name_en,
    prog.id AS program_id, prog.name_ar AS program_name,
    dept.id AS department_id, dept.name_ar AS department_name,
    NULL::uuid AS academic_year_id, 'معادلة'::text AS academic_year_name,
    NULL::uuid AS semester_id, 'معادلة'::text AS semester_name, 'EQ'::text AS semester_code,
    NULL::uuid AS level_id, '—'::text AS level_name, NULL::integer AS level_number,
    c.id AS course_id, c.code AS course_code, c.name_ar AS course_name,
    COALESCE(sec.credit_hours, c.credit_hours) AS credit_hours,
    '—'::text AS section_code, 100::numeric AS final_score, 100::numeric AS max_score,
    100::numeric AS percentage, 'passed'::text AS course_status,
    'completed'::text AS enrollment_status,
    ('معادلة: ' || sec.external_course_code || ' — ' || sec.external_course_name)::text AS notes
  FROM public.student_equivalency_credits sec
  JOIN public.student_profiles sp ON sp.id = sec.student_profile_id
  JOIN public.courses c ON c.id = sec.course_id
  LEFT JOIN public.programs prog ON prog.id = sp.program_id
  LEFT JOIN public.departments dept ON dept.id = c.department_id
)
SELECT * FROM enrollment_rows UNION ALL SELECT * FROM equivalency_rows;

GRANT SELECT ON public.student_unofficial_transcript TO authenticated;