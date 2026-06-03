
ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_type_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_type_chk
  CHECK (request_type = ANY (ARRAY[
    'absence_excuse','enrollment_suspension','extra_chance',
    'transfer','equivalency','grade_appeal'
  ]));

INSERT INTO public.request_types (code, name_ar, description_ar, is_active, requires_attachment, sort_order)
VALUES ('grade_appeal', 'تظلم درجات', 'تظلم على درجة مقرر مسجَّل في فصل دراسي محدد', true, false, 60)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  is_active = true;

CREATE TABLE public.grade_appeal_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  student_profile_id uuid NOT NULL,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  semester_id uuid NOT NULL REFERENCES public.semesters(id),
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id),
  student_enrollment_id uuid REFERENCES public.student_enrollments(id),
  current_grade_total numeric,
  current_grade_status text,
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);

CREATE INDEX idx_gad_student ON public.grade_appeal_details(student_profile_id);
CREATE INDEX idx_gad_semester ON public.grade_appeal_details(semester_id);
CREATE INDEX idx_gad_section ON public.grade_appeal_details(course_section_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_appeal_details TO authenticated;
GRANT ALL ON public.grade_appeal_details TO service_role;

ALTER TABLE public.grade_appeal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY gad_select ON public.grade_appeal_details
  FOR SELECT TO authenticated
  USING (
    is_owner_of_request(auth.uid(), request_id)
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
    OR is_dept_head_of_section(auth.uid(), course_section_id)
    OR is_faculty_of_section(auth.uid(), course_section_id)
  );

CREATE POLICY gad_insert ON public.grade_appeal_details
  FOR INSERT TO authenticated
  WITH CHECK (
    is_owner_of_request(auth.uid(), request_id)
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY gad_update ON public.grade_appeal_details
  FOR UPDATE TO authenticated
  USING (
    (is_owner_of_request(auth.uid(), request_id) AND EXISTS (
      SELECT 1 FROM public.student_requests sr
      WHERE sr.id = grade_appeal_details.request_id AND sr.status = 'draft'
    ))
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY gad_delete ON public.grade_appeal_details
  FOR DELETE TO authenticated
  USING (
    (is_owner_of_request(auth.uid(), request_id) AND EXISTS (
      SELECT 1 FROM public.student_requests sr
      WHERE sr.id = grade_appeal_details.request_id AND sr.status = 'draft'
    ))
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE TRIGGER trg_gad_updated_at
  BEFORE UPDATE ON public.grade_appeal_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Prevent duplicate active appeals via trigger (subqueries not allowed in partial indexes)
CREATE OR REPLACE FUNCTION public.prevent_duplicate_grade_appeal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.grade_appeal_details gad
    JOIN public.student_requests sr ON sr.id = gad.request_id
    WHERE gad.student_profile_id = NEW.student_profile_id
      AND gad.semester_id = NEW.semester_id
      AND gad.course_section_id = NEW.course_section_id
      AND gad.id <> NEW.id
      AND sr.status IN ('draft','submitted','under_review')
  ) THEN
    RAISE EXCEPTION 'يوجد تظلم نشط بالفعل لهذا المقرر في هذا الفصل'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gad_prevent_dup
  BEFORE INSERT OR UPDATE ON public.grade_appeal_details
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_grade_appeal();
