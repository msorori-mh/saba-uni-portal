CREATE OR REPLACE FUNCTION public.protect_student_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_via_rpc boolean := COALESCE(current_setting('student_request.submit_via_rpc', true), '') = '1';
  v_b1_atomic boolean := COALESCE(current_setting('b1.atomic_action', true), '') = '1';
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  IF v_b1_atomic AND v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = OLD.id
      AND s.completed_by = v_uid
      AND s.status IN ('completed','rejected','returned')
  ) THEN
    NEW.id                 := OLD.id;
    NEW.student_profile_id := OLD.student_profile_id;
    NEW.request_type       := OLD.request_type;
    NEW.submitted_at       := OLD.submitted_at;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid
  ) THEN
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('approved','completed') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.completed_at       := OLD.completed_at;
      NEW.cancelled_at       := now();
      RETURN NEW;
    END IF;

    IF v_via_rpc
       AND OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.cancelled_at       := OLD.cancelled_at;
      NEW.completed_at       := OLD.completed_at;
      IF OLD.status IN ('returned', 'returned_for_completion') THEN
        NEW.rejection_reason := NULL;
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
      ELSE
        NEW.reviewed_by        := OLD.reviewed_by;
        NEW.reviewed_at        := OLD.reviewed_at;
        NEW.rejection_reason   := OLD.rejection_reason;
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      RAISE EXCEPTION 'يجب إرسال الطلب عبر submit_student_request() وليس التحديث المباشر'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.cancelled_at       := OLD.cancelled_at;
      NEW.completed_at       := OLD.completed_at;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('returned','returned_for_completion')
       AND NEW.status IN ('returned','returned_for_completion') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      NEW.cancelled_at       := OLD.cancelled_at;
      NEW.completed_at       := OLD.completed_at;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$function$;