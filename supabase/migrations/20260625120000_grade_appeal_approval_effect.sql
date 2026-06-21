-- SR-C1: apply grade changes when a grade_appeal request is approved

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
