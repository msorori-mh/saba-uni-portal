-- SR-D1B: block official transcript approval/issuance until student has approved grades.
CREATE OR REPLACE FUNCTION public.student_has_approved_grades_for_transcript(_student_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_enrollments se
    JOIN public.student_grades sg ON sg.student_enrollment_id = se.id
    WHERE se.student_profile_id = _student_profile_id
      AND sg.status = 'approved'
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_has_approved_grades_for_transcript(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_official_transcript_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_count integer;
  v_profile_status text;
  v_check boolean := false;
BEGIN
  IF NEW.request_type <> 'official_transcript' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'approved'
     AND COALESCE(OLD.status, '') <> 'approved'
     AND NOT public.student_has_approved_grades_for_transcript(NEW.student_profile_id) THEN
    RAISE EXCEPTION 'Cannot approve official transcript: student has no approved grades';
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

  SELECT status INTO v_profile_status
  FROM public.student_profiles
  WHERE id = NEW.student_profile_id;

  IF v_profile_status IS NULL OR v_profile_status <> 'active' THEN
    RAISE EXCEPTION 'Cannot create official transcript request: student profile is not active';
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.student_requests
  WHERE student_profile_id = NEW.student_profile_id
    AND request_type = 'official_transcript'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review','returned');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open official transcript request already exists for this student';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_official_transcript_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details public.official_transcript_request_details%ROWTYPE;
  v_doc_id uuid;
  v_num text;
  v_code text;
BEGIN
  IF NEW.request_type <> 'official_transcript'
     OR NEW.status <> 'approved'
     OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;

  IF NOT public.student_has_approved_grades_for_transcript(NEW.student_profile_id) THEN
    RAISE EXCEPTION 'Cannot issue official transcript: student has no approved grades';
  END IF;

  SELECT * INTO v_details
  FROM public.official_transcript_request_details
  WHERE request_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Official transcript details missing for request %', NEW.id;
  END IF;

  IF v_details.document_issued_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_num := public.generate_document_number();
  v_code := public.generate_verification_code();

  INSERT INTO public.official_documents (
    student_profile_id,
    document_type,
    document_number,
    verification_code,
    issued_by,
    status,
    metadata
  ) VALUES (
    NEW.student_profile_id,
    'official_transcript',
    v_num,
    v_code,
    NEW.reviewed_by,
    'issued',
    jsonb_build_object('student_request_id', NEW.id)
  )
  RETURNING id INTO v_doc_id;

  PERFORM public.log_audit(
    'document',
    v_doc_id,
    'transcript_generated',
    NULL,
    jsonb_build_object(
      'document_number', v_num,
      'document_type', 'official_transcript',
      'student_profile_id', NEW.student_profile_id,
      'verification_code', v_code,
      'student_request_id', NEW.id
    ),
    NULL,
    NEW.reviewed_by
  );

  UPDATE public.official_transcript_request_details
     SET document_issued_at = now(),
         official_document_id = v_doc_id,
         updated_at = now()
   WHERE request_id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_official_document(
  _student_profile_id uuid,
  _document_type text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_num text;
  v_code text;
  v_action text;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','registrar','student_affairs']) THEN
    RAISE EXCEPTION 'Not authorized to issue documents';
  END IF;

  IF _document_type NOT IN (
    'enrollment_certificate','student_status_certificate','official_transcript','financial_receipt'
  ) THEN
    RAISE EXCEPTION 'Invalid document_type: %', _document_type;
  END IF;

  IF _document_type = 'official_transcript'
     AND NOT public.student_has_approved_grades_for_transcript(_student_profile_id) THEN
    RAISE EXCEPTION 'Cannot issue official transcript: student has no approved grades';
  END IF;

  v_num := public.generate_document_number();
  v_code := public.generate_verification_code();

  INSERT INTO public.official_documents(
    student_profile_id, document_type, document_number, verification_code,
    issued_by, status, metadata
  ) VALUES (
    _student_profile_id, _document_type, v_num, v_code, v_uid, 'issued', COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  v_action := CASE _document_type
    WHEN 'enrollment_certificate' THEN 'certificate_generated'
    WHEN 'student_status_certificate' THEN 'certificate_generated'
    WHEN 'official_transcript' THEN 'transcript_generated'
    WHEN 'financial_receipt' THEN 'financial_receipt_generated'
  END;

  PERFORM public.log_audit('document', v_id, v_action, NULL,
    jsonb_build_object(
      'document_number', v_num,
      'document_type', _document_type,
      'student_profile_id', _student_profile_id,
      'verification_code', v_code
    ));

  RETURN jsonb_build_object(
    'id', v_id,
    'document_number', v_num,
    'verification_code', v_code
  );
END;
$$;

UPDATE public.request_types
SET is_active = false
WHERE code = 'official_transcript';