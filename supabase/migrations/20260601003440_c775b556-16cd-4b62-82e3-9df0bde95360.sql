
-- 1) Activate transfer request type and widen check constraint
UPDATE public.request_types SET is_active = true, updated_at = now() WHERE code = 'transfer';

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_type_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_type_chk
  CHECK (request_type = ANY (ARRAY['absence_excuse','enrollment_suspension','extra_chance','transfer']));

-- 2) Transfer request details
CREATE TABLE public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  current_program_id uuid NOT NULL REFERENCES public.programs(id),
  requested_program_id uuid NOT NULL REFERENCES public.programs(id),
  current_department_id uuid REFERENCES public.departments(id),
  requested_department_id uuid REFERENCES public.departments(id),
  transfer_reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trd_request_unique UNIQUE (request_id),
  CONSTRAINT trd_program_or_dept_changes CHECK (
    current_program_id <> requested_program_id
    OR current_department_id IS DISTINCT FROM requested_department_id
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_request_details TO authenticated;
GRANT ALL ON public.transfer_request_details TO service_role;

ALTER TABLE public.transfer_request_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY trd_select ON public.transfer_request_details FOR SELECT TO authenticated
USING (
  public.is_owner_of_request(auth.uid(), request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  OR EXISTS (
    SELECT 1 FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = transfer_request_details.request_id
      AND (
        (sp.department_id IS NOT NULL AND public.is_department_head_of(auth.uid(), sp.department_id))
        OR (transfer_request_details.current_department_id IS NOT NULL
            AND public.is_department_head_of(auth.uid(), transfer_request_details.current_department_id))
        OR (transfer_request_details.requested_department_id IS NOT NULL
            AND public.is_department_head_of(auth.uid(), transfer_request_details.requested_department_id))
      )
  )
);

CREATE POLICY trd_insert ON public.transfer_request_details FOR INSERT TO authenticated
WITH CHECK (
  public.is_owner_of_request(auth.uid(), request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);

CREATE POLICY trd_update ON public.transfer_request_details FOR UPDATE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = transfer_request_details.request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);

CREATE POLICY trd_delete ON public.transfer_request_details FOR DELETE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = transfer_request_details.request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
);

CREATE TRIGGER trg_trd_updated_at
BEFORE UPDATE ON public.transfer_request_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Validation: block duplicate transfer requests + suspended students
CREATE OR REPLACE FUNCTION public.validate_transfer_request()
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
  IF NEW.request_type <> 'transfer' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status IN ('draft','submitted','under_review') THEN
    v_check := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status IN ('submitted','under_review')
        AND COALESCE(OLD.status,'') NOT IN ('submitted','under_review','approved','rejected','cancelled') THEN
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

  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'Cannot create transfer request: student is currently suspended';
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.student_requests
  WHERE student_profile_id = NEW.student_profile_id
    AND request_type = 'transfer'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open transfer request already exists for this student';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_transfer_request
BEFORE INSERT OR UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_transfer_request();

-- 4) Apply transfer on approval
CREATE OR REPLACE FUNCTION public.apply_transfer_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details record;
BEGIN
  IF NEW.request_type = 'transfer'
     AND NEW.status = 'approved'
     AND COALESCE(OLD.status, '') IS DISTINCT FROM 'approved' THEN

    SELECT requested_program_id, requested_department_id
      INTO v_details
      FROM public.transfer_request_details
     WHERE request_id = NEW.id;

    IF v_details.requested_program_id IS NOT NULL THEN
      -- bypass student profile lock trigger
      PERFORM set_config('app.bypass_student_lock', '1', true);
      UPDATE public.student_profiles
         SET program_id = v_details.requested_program_id,
             department_id = COALESCE(v_details.requested_department_id, department_id),
             updated_at = now()
       WHERE id = NEW.student_profile_id;
      PERFORM set_config('app.bypass_student_lock', '0', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_transfer_on_approval
AFTER UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_on_approval();
