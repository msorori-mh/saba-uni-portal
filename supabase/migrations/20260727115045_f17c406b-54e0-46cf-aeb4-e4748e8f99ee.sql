CREATE OR REPLACE FUNCTION public.validate_enrollment_suspension_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_open_count integer;
  v_status text;
  v_check boolean := false;
BEGIN
  IF NEW.request_type <> 'enrollment_suspension' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status IN ('draft','submitted','under_review') THEN
    v_check := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status IN ('submitted','under_review')
        AND COALESCE(OLD.status, '') NOT IN ('submitted','under_review','approved','rejected','cancelled') THEN
    v_check := true;
  END IF;

  IF NOT v_check THEN
    RETURN NEW;
  END IF;

  -- Student must currently hold an active enrollment.
  -- Production vocabulary uses both 'active' and 'enrolled' for an active enrollment.
  SELECT enrollment_status INTO v_status
  FROM public.student_academic_status
  WHERE student_profile_id = NEW.student_profile_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_status IS NULL OR v_status NOT IN ('active','enrolled') THEN
    RAISE EXCEPTION 'Cannot create suspension request: student is not currently active';
  END IF;

  -- No other open suspension request
  SELECT COUNT(*) INTO v_open_count
  FROM public.student_requests
  WHERE student_profile_id = NEW.student_profile_id
    AND request_type = 'enrollment_suspension'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open enrollment suspension request already exists for this student';
  END IF;

  RETURN NEW;
END;
$function$;