
-- Phase 4A: Student Requests (absence excuses)
-- Tables first, then helpers (so SQL functions can resolve all relations).

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'absence_excuse',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sr_status_chk CHECK (status IN ('draft','submitted','under_review','approved','rejected','cancelled')),
  CONSTRAINT sr_type_chk CHECK (request_type IN ('absence_excuse'))
);
CREATE INDEX idx_sr_student ON public.student_requests(student_profile_id);
CREATE INDEX idx_sr_status ON public.student_requests(status);

CREATE TABLE public.absence_excuse_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  course_section_id uuid NOT NULL,
  absence_date date NOT NULL,
  reason_type text NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aed_reason_chk CHECK (reason_type IN ('medical','family','emergency','other'))
);
CREATE INDEX idx_aed_request ON public.absence_excuse_details(request_id);
CREATE INDEX idx_aed_section ON public.absence_excuse_details(course_section_id);

CREATE TABLE public.student_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);
CREATE INDEX idx_sra_request ON public.student_request_attachments(request_id);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_requests TO authenticated;
GRANT ALL ON public.student_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_excuse_details TO authenticated;
GRANT ALL ON public.absence_excuse_details TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_request_attachments TO authenticated;
GRANT ALL ON public.student_request_attachments TO service_role;

-- ============================================================
-- HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_owner_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = _request_id AND sp.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_dept_head_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.absence_excuse_details d
    JOIN public.course_sections cs ON cs.id = d.course_section_id
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    JOIN public.courses c ON c.id = co.course_id
    WHERE d.request_id = _request_id
      AND c.department_id IS NOT NULL
      AND public.is_department_head_of(_user_id, c.department_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_faculty_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.absence_excuse_details d
    JOIN public.course_sections cs ON cs.id = d.course_section_id
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    WHERE d.request_id = _request_id AND fp.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.protect_student_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid) THEN
    -- Cancellation: allowed if not approved
    IF NEW.status = 'cancelled' AND OLD.status <> 'approved' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;
    -- Submit a draft
    IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;
    -- Edit while draft
    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_sr_updated_at
BEFORE UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_sr_protect
BEFORE UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.protect_student_request();

CREATE TRIGGER trg_aed_updated_at
BEFORE UPDATE ON public.absence_excuse_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.student_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_excuse_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_request_attachments ENABLE ROW LEVEL SECURITY;

-- student_requests
CREATE POLICY sr_select_self ON public.student_requests
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
  );
CREATE POLICY sr_select_priv ON public.student_requests
  FOR SELECT TO authenticated USING (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );
CREATE POLICY sr_select_dept_head ON public.student_requests
  FOR SELECT TO authenticated USING (is_dept_head_of_request(auth.uid(), id));
CREATE POLICY sr_select_faculty ON public.student_requests
  FOR SELECT TO authenticated USING (is_faculty_of_request(auth.uid(), id));

CREATE POLICY sr_insert_self ON public.student_requests
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
    AND status IN ('draft','submitted')
  );
CREATE POLICY sr_insert_priv ON public.student_requests
  FOR INSERT TO authenticated WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY sr_update_self ON public.student_requests
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
  );
CREATE POLICY sr_update_priv ON public.student_requests
  FOR UPDATE TO authenticated USING (
    has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY sr_delete_self ON public.student_requests
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
    AND status = 'draft'
  );
CREATE POLICY sr_delete_admin ON public.student_requests
  FOR DELETE TO authenticated USING (
    has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

-- absence_excuse_details
CREATE POLICY aed_select ON public.absence_excuse_details
  FOR SELECT TO authenticated USING (
    is_owner_of_request(auth.uid(), request_id)
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
    OR is_dept_head_of_request(auth.uid(), request_id)
    OR is_faculty_of_request(auth.uid(), request_id)
  );
CREATE POLICY aed_insert ON public.absence_excuse_details
  FOR INSERT TO authenticated WITH CHECK (
    is_owner_of_request(auth.uid(), request_id)
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );
CREATE POLICY aed_update ON public.absence_excuse_details
  FOR UPDATE TO authenticated USING (
    (is_owner_of_request(auth.uid(), request_id) AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'))
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );
CREATE POLICY aed_delete ON public.absence_excuse_details
  FOR DELETE TO authenticated USING (
    (is_owner_of_request(auth.uid(), request_id) AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'))
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

-- student_request_attachments
CREATE POLICY sra_select ON public.student_request_attachments
  FOR SELECT TO authenticated USING (
    is_owner_of_request(auth.uid(), request_id)
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
    OR is_dept_head_of_request(auth.uid(), request_id)
    OR is_faculty_of_request(auth.uid(), request_id)
  );
CREATE POLICY sra_insert ON public.student_request_attachments
  FOR INSERT TO authenticated WITH CHECK (
    (is_owner_of_request(auth.uid(), request_id) AND uploaded_by = auth.uid())
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );
CREATE POLICY sra_delete ON public.student_request_attachments
  FOR DELETE TO authenticated USING (
    (is_owner_of_request(auth.uid(), request_id) AND EXISTS (SELECT 1 FROM public.student_requests sr WHERE sr.id = request_id AND sr.status = 'draft'))
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-request-attachments', 'student-request-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Files keyed as "{auth.uid()}/{request_id}/{filename}"
CREATE POLICY sra_storage_select_self ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'student-request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY sra_storage_select_priv ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'student-request-attachments'
    AND has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );
CREATE POLICY sra_storage_insert_self ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'student-request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY sra_storage_delete_self ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'student-request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY sra_storage_delete_admin ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'student-request-attachments'
    AND has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );
