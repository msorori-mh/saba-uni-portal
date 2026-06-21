-- PR #27 SR-C1: apply grade changes when a grade_appeal request is approved

ALTER TABLE public.grade_appeal_details
  ADD COLUMN IF NOT EXISTS approved_total_score numeric,
  ADD COLUMN IF NOT EXISTS grades_applied_at timestamptz;

CREATE OR REPLACE FUNCTION public.apply_grade_appeal_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details public.grade_appeal_details%ROWTYPE;
  v_enrollment_id uuid;
  v_current_total numeric := 0;
  v_section_max numeric := 0;
  v_approved_total numeric;
  v_allocated numeric := 0;
  v_grade record;
  v_last_grade_id uuid;
  v_new_score numeric;
  v_staff_id uuid;
BEGIN
  IF NEW.request_type <> 'grade_appeal'
     OR NEW.status <> 'approved'
     OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_details
  FROM public.grade_appeal_details
  WHERE request_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade appeal details missing for request %', NEW.id;
  END IF;

  IF v_details.grades_applied_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_approved_total := v_details.approved_total_score;
  IF v_approved_total IS NULL THEN
    RAISE EXCEPTION 'approved_total_score must be set before approving a grade appeal';
  END IF;

  v_enrollment_id := v_details.student_enrollment_id;
  IF v_enrollment_id IS NULL THEN
    RAISE EXCEPTION 'student_enrollment_id missing on grade appeal details';
  END IF;

  SELECT COALESCE(SUM(gc.max_score), 0) INTO v_section_max
  FROM public.grade_components gc
  JOIN public.student_enrollments se ON se.course_section_id = gc.course_section_id
  WHERE se.id = v_enrollment_id;

  IF v_approved_total < 0 OR v_approved_total > v_section_max THEN
    RAISE EXCEPTION 'Approved total % must be between 0 and section max %', v_approved_total, v_section_max;
  END IF;

  SELECT COALESCE(SUM(sg.score), 0) INTO v_current_total
  FROM public.student_grades sg
  WHERE sg.student_enrollment_id = v_enrollment_id
    AND sg.status IN ('submitted', 'approved');

  IF v_current_total <= 0 THEN
    RAISE EXCEPTION 'No recorded grades to adjust for this enrollment';
  END IF;

  SELECT id INTO v_staff_id
  FROM public.staff_profiles
  WHERE user_id = NEW.reviewed_by
  LIMIT 1;

  SELECT sg.id INTO v_last_grade_id
  FROM public.student_grades sg
  JOIN public.grade_components gc ON gc.id = sg.grade_component_id
  WHERE sg.student_enrollment_id = v_enrollment_id
    AND sg.status IN ('submitted', 'approved')
  ORDER BY gc.sort_order DESC, sg.id DESC
  LIMIT 1;

  FOR v_grade IN
    SELECT sg.id, sg.score, gc.max_score, gc.sort_order
    FROM public.student_grades sg
    JOIN public.grade_components gc ON gc.id = sg.grade_component_id
    WHERE sg.student_enrollment_id = v_enrollment_id
      AND sg.status IN ('submitted', 'approved')
    ORDER BY gc.sort_order, sg.id
  LOOP
    IF v_grade.id = v_last_grade_id THEN
      v_new_score := LEAST(v_grade.max_score, GREATEST(0, v_approved_total - v_allocated));
    ELSE
      v_new_score := LEAST(
        v_grade.max_score,
        ROUND(v_approved_total * (v_grade.score / v_current_total), 2)
      );
      v_allocated := v_allocated + v_new_score;
    END IF;

    UPDATE public.student_grades
       SET score = v_new_score,
           status = 'approved',
           approved_at = now(),
           approved_by = v_staff_id,
           updated_at = now()
     WHERE id = v_grade.id;
  END LOOP;

  UPDATE public.grade_appeal_details
     SET grades_applied_at = now(),
         updated_at = now()
   WHERE id = v_details.id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_grade_appeal_on_approval'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_apply_grade_appeal_on_approval
      AFTER UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.apply_grade_appeal_on_approval();
  END IF;
END $$;

-- PR #27 SR-C2: enrollment reinstatement request type + approval effect

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_type_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_type_chk
  CHECK (request_type = ANY (ARRAY[
    'absence_excuse','enrollment_suspension','enrollment_reinstatement','extra_chance',
    'transfer','equivalency','grade_appeal'
  ]));

INSERT INTO public.request_types (code, name_ar, description_ar, is_active, requires_attachment, sort_order)
VALUES (
  'enrollment_reinstatement',
  'إعادة قيد',
  'طلب إعادة تفعيل القيد بعد وقف أكاديمي',
  true,
  true,
  25
)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  is_active = true,
  requires_attachment = EXCLUDED.requires_attachment,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE public.enrollment_reinstatement_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  requested_from_academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  requested_from_semester_id uuid NOT NULL REFERENCES public.semesters(id),
  reinstatement_reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_reinstatement_details_request_unique UNIQUE (request_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollment_reinstatement_details TO authenticated;
GRANT ALL ON public.enrollment_reinstatement_details TO service_role;

ALTER TABLE public.enrollment_reinstatement_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY erd_select ON public.enrollment_reinstatement_details
  FOR SELECT TO authenticated
  USING (
    public.is_owner_of_request(auth.uid(), request_id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );

CREATE POLICY erd_insert ON public.enrollment_reinstatement_details
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner_of_request(auth.uid(), request_id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY erd_update ON public.enrollment_reinstatement_details
  FOR UPDATE TO authenticated
  USING (
    (public.is_owner_of_request(auth.uid(), request_id)
      AND EXISTS (
        SELECT 1 FROM public.student_requests sr
        WHERE sr.id = enrollment_reinstatement_details.request_id
          AND sr.status = 'draft'
      ))
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY erd_delete ON public.enrollment_reinstatement_details
  FOR DELETE TO authenticated
  USING (
    (public.is_owner_of_request(auth.uid(), request_id)
      AND EXISTS (
        SELECT 1 FROM public.student_requests sr
        WHERE sr.id = enrollment_reinstatement_details.request_id
          AND sr.status = 'draft'
      ))
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE TRIGGER trg_erd_updated_at
  BEFORE UPDATE ON public.enrollment_reinstatement_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_enrollment_reinstatement_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_count integer;
  v_status text;
  v_check boolean := false;
BEGIN
  IF NEW.request_type <> 'enrollment_reinstatement' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status IN ('draft','submitted','under_review') THEN
    v_check := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status IN ('submitted','under_review')
        AND COALESCE(OLD.status, '') NOT IN ('submitted','under_review','approved','rejected','cancelled','returned') THEN
    v_check := true;
  END IF;

  IF NOT v_check THEN
    RETURN NEW;
  END IF;

  SELECT enrollment_status INTO v_status
  FROM public.student_academic_status
  WHERE student_profile_id = NEW.student_profile_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_status IS NULL OR v_status <> 'suspended' THEN
    RAISE EXCEPTION 'Cannot create reinstatement request: student is not currently suspended';
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.student_requests
  WHERE student_profile_id = NEW.student_profile_id
    AND request_type = 'enrollment_reinstatement'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review','returned');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open enrollment reinstatement request already exists for this student';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_validate_reinstatement_request'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_validate_reinstatement_request
      BEFORE INSERT OR UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.validate_enrollment_reinstatement_request();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_enrollment_reinstatement_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_id uuid;
BEGIN
  IF NEW.request_type = 'enrollment_reinstatement'
     AND NEW.status = 'approved'
     AND COALESCE(OLD.status, '') IS DISTINCT FROM 'approved' THEN
    SELECT id INTO v_status_id
      FROM public.student_academic_status
     WHERE student_profile_id = NEW.student_profile_id
     ORDER BY updated_at DESC
     LIMIT 1;

    IF v_status_id IS NOT NULL THEN
      UPDATE public.student_academic_status
         SET enrollment_status = 'active',
             updated_at = now()
       WHERE id = v_status_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_reinstatement_on_approval'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_apply_reinstatement_on_approval
      AFTER UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.apply_enrollment_reinstatement_on_approval();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_student_request_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_type_label text;
  v_title text;
  v_msg text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('approved','rejected','returned') THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT sp.user_id INTO v_user_id
  FROM public.student_profiles sp
  WHERE sp.id = NEW.student_profile_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_type_label := CASE NEW.request_type
    WHEN 'absence_excuse' THEN 'عذر غياب'
    WHEN 'enrollment_suspension' THEN 'وقف القيد'
    WHEN 'enrollment_reinstatement' THEN 'إعادة القيد'
    WHEN 'extra_chance' THEN 'فرصة إضافية'
    WHEN 'transfer' THEN 'التحويل'
    WHEN 'equivalency' THEN 'المقاصة'
    WHEN 'grade_appeal' THEN 'تظلم درجات'
    ELSE NEW.request_type
  END;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد طلب ' || v_type_label;
    v_msg := 'تم اعتماد طلبك (' || COALESCE(NEW.title,'') || ').';
  ELSIF NEW.status = 'returned' THEN
    v_title := 'طلب ' || v_type_label || ' يحتاج استكمال';
    v_msg := COALESCE('ملاحظات: ' || NEW.rejection_reason, 'يرجى استكمال بيانات الطلب وإعادة الإرسال.');
  ELSE
    v_title := 'تم رفض طلب ' || v_type_label;
    v_msg := COALESCE('سبب الرفض: ' || NEW.rejection_reason, 'تم رفض طلبك.');
  END IF;

  PERFORM public.create_notification(v_user_id, v_title, v_msg, 'request', 'student_request', NEW.id);
  RETURN NEW;
END;
$$;