-- Issuance is performed by the request's document_issuance step. An older
-- generic issuer has no request/step argument and cannot prove that boundary.
REVOKE INSERT, UPDATE ON public.official_documents FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.issue_official_document(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_official_document(uuid,text,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_approved_grade_component()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_section uuid;
BEGIN
  v_section := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_section_id ELSE NEW.course_section_id END;
  PERFORM pg_advisory_xact_lock(hashtext('grade-section:' || v_section::text));
  IF EXISTS (
    SELECT 1 FROM public.student_grades g
    JOIN public.student_enrollments e ON e.id = g.student_enrollment_id
    WHERE e.course_section_id = v_section AND g.status = 'approved'
  ) OR (TG_OP = 'UPDATE' AND OLD.course_section_id IS DISTINCT FROM NEW.course_section_id
    AND EXISTS (
      SELECT 1 FROM public.student_grades g
      JOIN public.student_enrollments e ON e.id = g.student_enrollment_id
      WHERE e.course_section_id = OLD.course_section_id AND g.status = 'approved'
    )) THEN
    RAISE EXCEPTION 'APPROVED_GRADE_COMPONENT_LOCKED' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_guard_approved_grade_component ON public.grade_components;
CREATE TRIGGER trg_guard_approved_grade_component
  BEFORE INSERT OR UPDATE OR DELETE ON public.grade_components
  FOR EACH ROW EXECUTE FUNCTION public.guard_approved_grade_component();

CREATE OR REPLACE FUNCTION public.validate_student_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max numeric;
  v_component_section uuid;
  v_enrollment_section uuid;
BEGIN
  SELECT max_score, course_section_id INTO v_max, v_component_section
  FROM public.grade_components WHERE id = NEW.grade_component_id;
  SELECT course_section_id INTO v_enrollment_section
  FROM public.student_enrollments WHERE id = NEW.student_enrollment_id;
  IF v_max IS NULL OR v_enrollment_section IS NULL
     OR v_enrollment_section IS DISTINCT FROM v_component_section THEN
    RAISE EXCEPTION 'GRADE_COMPONENT_SECTION_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.score > v_max THEN
    RAISE EXCEPTION 'Score % exceeds component max_score %', NEW.score, v_max;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_grade_approval_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NEW.status = 'approved' THEN
      RAISE EXCEPTION 'GRADE_APPROVAL_RPC_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND
     (NEW.status = 'approved' OR OLD.status = 'approved') AND
     (NEW.status IS DISTINCT FROM OLD.status OR
      NEW.score IS DISTINCT FROM OLD.score OR
      NEW.student_enrollment_id IS DISTINCT FROM OLD.student_enrollment_id OR
      NEW.grade_component_id IS DISTINCT FROM OLD.grade_component_id OR
      NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
      NEW.approved_at IS DISTINCT FROM OLD.approved_at) AND
     current_setting('grade.approval_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'GRADE_APPROVAL_RPC_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_grade_approval_transition ON public.student_grades;
CREATE TRIGGER trg_guard_grade_approval_transition
  BEFORE INSERT OR UPDATE ON public.student_grades
  FOR EACH ROW EXECUTE FUNCTION public.guard_grade_approval_transition();

CREATE OR REPLACE FUNCTION public.approve_submitted_section_grades(
  p_section_id uuid, p_grade_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_department_id uuid;
  v_faculty_user_id uuid;
  v_staff_profile_id uuid;
  v_expected integer;
  v_found integer;
BEGIN
  IF v_uid IS NULL OR p_section_id IS NULL OR p_grade_ids IS NULL
     OR cardinality(p_grade_ids) < 1 OR cardinality(p_grade_ids) > 5000 THEN
    RAISE EXCEPTION 'INVALID_GRADE_APPROVAL_INPUT' USING ERRCODE = '22023';
  END IF;
  SELECT c.department_id, fp.user_id
    INTO v_department_id, v_faculty_user_id
  FROM public.course_sections s
  JOIN public.course_offerings o ON o.id = s.course_offering_id
  JOIN public.courses c ON c.id = o.course_id
  LEFT JOIN public.faculty_profiles fp ON fp.id = s.faculty_profile_id
  WHERE s.id = p_section_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRADE_SECTION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_uid IS NOT DISTINCT FROM v_faculty_user_id THEN
    RAISE EXCEPTION 'GRADE_SELF_APPROVAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar'])
     AND NOT (v_department_id IS NOT NULL
       AND public.is_department_head_of(v_uid, v_department_id)
       AND v_uid IS DISTINCT FROM v_faculty_user_id) THEN
    RAISE EXCEPTION 'GRADE_APPROVAL_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('grade-section:' || p_section_id::text));

  SELECT count(DISTINCT id) INTO v_expected FROM unnest(p_grade_ids) AS id;
  IF v_expected <> cardinality(p_grade_ids) THEN
    RAISE EXCEPTION 'DUPLICATE_GRADE_IDS' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_found FROM (
    SELECT g.id FROM public.student_grades g
    JOIN public.student_enrollments e ON e.id = g.student_enrollment_id
    JOIN public.grade_components c ON c.id = g.grade_component_id
    WHERE g.id = ANY(p_grade_ids)
      AND e.course_section_id = p_section_id
      AND c.course_section_id = p_section_id
      AND g.status = 'submitted'
    FOR UPDATE OF g
  ) eligible;
  IF v_found <> v_expected THEN
    RAISE EXCEPTION 'GRADE_SECTION_OR_STATUS_MISMATCH' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_staff_profile_id FROM public.staff_profiles
    WHERE user_id = v_uid AND status = 'active' LIMIT 1;
  PERFORM set_config('grade.approval_rpc', '1', true);
  UPDATE public.student_grades
    SET status = 'approved', approved_at = now(), approved_by = v_staff_profile_id
  WHERE id = ANY(p_grade_ids);
  RETURN v_found;
END $$;

REVOKE ALL ON FUNCTION public.approve_submitted_section_grades(uuid,uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_submitted_section_grades(uuid,uuid[])
  TO authenticated, service_role;
