-- 1) Activate the enrollment_suspension request type
UPDATE public.request_types SET is_active = true, updated_at = now()
 WHERE code = 'enrollment_suspension';

-- 2) Details table
CREATE TABLE public.enrollment_suspension_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  requested_from_academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  requested_from_semester_id uuid NOT NULL REFERENCES public.semesters(id),
  suspension_reason text NOT NULL,
  suspension_duration_type text NOT NULL
    CHECK (suspension_duration_type IN ('one_semester','full_year')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_suspension_details_request_unique UNIQUE (request_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollment_suspension_details TO authenticated;
GRANT ALL ON public.enrollment_suspension_details TO service_role;

ALTER TABLE public.enrollment_suspension_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY esd_select ON public.enrollment_suspension_details
  FOR SELECT TO authenticated
  USING (
    public.is_owner_of_request(auth.uid(), request_id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );

CREATE POLICY esd_insert ON public.enrollment_suspension_details
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner_of_request(auth.uid(), request_id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY esd_update ON public.enrollment_suspension_details
  FOR UPDATE TO authenticated
  USING (
    (public.is_owner_of_request(auth.uid(), request_id)
      AND EXISTS (SELECT 1 FROM public.student_requests sr
                   WHERE sr.id = enrollment_suspension_details.request_id
                     AND sr.status = 'draft'))
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY esd_delete ON public.enrollment_suspension_details
  FOR DELETE TO authenticated
  USING (
    (public.is_owner_of_request(auth.uid(), request_id)
      AND EXISTS (SELECT 1 FROM public.student_requests sr
                   WHERE sr.id = enrollment_suspension_details.request_id
                     AND sr.status = 'draft'))
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE TRIGGER trg_esd_updated_at
  BEFORE UPDATE ON public.enrollment_suspension_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) DB-level validation: student must be active and have no open suspension request
CREATE OR REPLACE FUNCTION public.validate_enrollment_suspension_request()
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

  -- Student must currently be active
  SELECT enrollment_status INTO v_status
  FROM public.student_academic_status
  WHERE student_profile_id = NEW.student_profile_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_status IS NULL OR v_status <> 'active' THEN
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
$$;

CREATE TRIGGER trg_validate_suspension_request
  BEFORE INSERT OR UPDATE ON public.student_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_enrollment_suspension_request();

-- 4) On approval, update the student academic status to suspended
CREATE OR REPLACE FUNCTION public.apply_enrollment_suspension_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_id uuid;
BEGIN
  IF NEW.request_type = 'enrollment_suspension'
     AND NEW.status = 'approved'
     AND COALESCE(OLD.status, '') IS DISTINCT FROM 'approved' THEN
    SELECT id INTO v_status_id
      FROM public.student_academic_status
     WHERE student_profile_id = NEW.student_profile_id
     ORDER BY updated_at DESC
     LIMIT 1;

    IF v_status_id IS NOT NULL THEN
      UPDATE public.student_academic_status
         SET enrollment_status = 'suspended',
             updated_at = now()
       WHERE id = v_status_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_suspension_on_approval
  AFTER UPDATE ON public.student_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_enrollment_suspension_on_approval();