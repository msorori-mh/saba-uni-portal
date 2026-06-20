
-- 1) Extend request_type CHECK to include extra_chance
ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_type_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_type_chk
  CHECK (request_type = ANY (ARRAY['absence_excuse'::text, 'enrollment_suspension'::text, 'extra_chance'::text]));

-- 2) Activate extra_chance request type
UPDATE public.request_types SET is_active = true, updated_at = now() WHERE code = 'extra_chance';

-- 3) New table: extra_chance_details
CREATE TABLE public.extra_chance_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  semester_id uuid NOT NULL REFERENCES public.semesters(id),
  reason text NOT NULL,
  chance_type text NOT NULL CHECK (chance_type IN ('final_chance','additional_chance')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extra_chance_details TO authenticated;
GRANT ALL ON public.extra_chance_details TO service_role;

ALTER TABLE public.extra_chance_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY ecd_select ON public.extra_chance_details FOR SELECT TO authenticated
USING (
  public.is_owner_of_request(auth.uid(), request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
);

CREATE POLICY ecd_insert ON public.extra_chance_details FOR INSERT TO authenticated
WITH CHECK (
  public.is_owner_of_request(auth.uid(), request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);

CREATE POLICY ecd_update ON public.extra_chance_details FOR UPDATE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), request_id) AND EXISTS (
    SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'
  ))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);

CREATE POLICY ecd_delete ON public.extra_chance_details FOR DELETE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), request_id) AND EXISTS (
    SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'
  ))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
);

CREATE TRIGGER trg_extra_chance_details_updated_at
BEFORE UPDATE ON public.extra_chance_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) DB-level validation: prevent duplicate open extra_chance requests
CREATE OR REPLACE FUNCTION public.validate_extra_chance_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open_count integer;
  v_check boolean := false;
BEGIN
  IF NEW.request_type <> 'extra_chance' THEN
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

  SELECT COUNT(*) INTO v_open_count
  FROM public.student_requests
  WHERE student_profile_id = NEW.student_profile_id
    AND request_type = 'extra_chance'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open extra chance request already exists for this student';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_extra_chance_request
BEFORE INSERT OR UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_extra_chance_request();
