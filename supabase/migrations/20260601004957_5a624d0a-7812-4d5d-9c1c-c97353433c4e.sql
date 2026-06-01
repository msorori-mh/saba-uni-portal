
-- 4F: Academic Equivalency Request

-- 1) Activate request type
UPDATE public.request_types SET is_active = true, updated_at = now() WHERE code = 'equivalency';
INSERT INTO public.request_types (code, name_ar, description_ar, is_active, requires_attachment, sort_order)
SELECT 'equivalency', 'المقاصة الأكاديمية', 'طلب معادلة مواد سابقة من جامعة أخرى', true, true, 50
WHERE NOT EXISTS (SELECT 1 FROM public.request_types WHERE code = 'equivalency');

-- 2) Expand CHECK constraint on student_requests.request_type
ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_type_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_type_chk
  CHECK (request_type IN ('absence_excuse','enrollment_suspension','extra_chance','transfer','equivalency'));

-- 3) equivalency_request_details
CREATE TABLE public.equivalency_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.student_requests(id) ON DELETE CASCADE,
  previous_university_name text NOT NULL,
  previous_program_name text NOT NULL,
  transfer_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equivalency_request_details TO authenticated;
GRANT ALL ON public.equivalency_request_details TO service_role;

ALTER TABLE public.equivalency_request_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY erd_select ON public.equivalency_request_details FOR SELECT TO authenticated
USING (
  public.is_owner_of_request(auth.uid(), request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
);
CREATE POLICY erd_insert ON public.equivalency_request_details FOR INSERT TO authenticated
WITH CHECK (
  public.is_owner_of_request(auth.uid(), request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);
CREATE POLICY erd_update ON public.equivalency_request_details FOR UPDATE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);
CREATE POLICY erd_delete ON public.equivalency_request_details FOR DELETE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
);

CREATE TRIGGER erd_updated_at BEFORE UPDATE ON public.equivalency_request_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) equivalency_courses
CREATE TABLE public.equivalency_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equivalency_request_id uuid NOT NULL REFERENCES public.equivalency_request_details(request_id) ON DELETE CASCADE,
  external_course_code text NOT NULL,
  external_course_name text NOT NULL,
  external_credit_hours integer,
  target_course_id uuid REFERENCES public.courses(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eqc_request ON public.equivalency_courses(equivalency_request_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equivalency_courses TO authenticated;
GRANT ALL ON public.equivalency_courses TO service_role;

ALTER TABLE public.equivalency_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY eqc_select ON public.equivalency_courses FOR SELECT TO authenticated
USING (
  public.is_owner_of_request(auth.uid(), equivalency_request_id)
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
);
CREATE POLICY eqc_insert ON public.equivalency_courses FOR INSERT TO authenticated
WITH CHECK (
  (public.is_owner_of_request(auth.uid(), equivalency_request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = equivalency_request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);
CREATE POLICY eqc_update ON public.equivalency_courses FOR UPDATE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), equivalency_request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = equivalency_request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);
CREATE POLICY eqc_delete ON public.equivalency_courses FOR DELETE TO authenticated
USING (
  (public.is_owner_of_request(auth.uid(), equivalency_request_id)
    AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = equivalency_request_id AND sr.status = 'draft'))
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);

CREATE TRIGGER eqc_updated_at BEFORE UPDATE ON public.equivalency_courses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Prevent duplicate open equivalency requests
CREATE OR REPLACE FUNCTION public.validate_equivalency_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_count integer;
  v_check boolean := false;
BEGIN
  IF NEW.request_type <> 'equivalency' THEN
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
    AND request_type = 'equivalency'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open equivalency request already exists for this student';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_equivalency_request ON public.student_requests;
CREATE TRIGGER trg_validate_equivalency_request
BEFORE INSERT OR UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_equivalency_request();
