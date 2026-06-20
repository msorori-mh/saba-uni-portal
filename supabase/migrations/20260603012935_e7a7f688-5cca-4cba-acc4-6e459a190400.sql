
-- 1. email_logs
DROP POLICY IF EXISTS "Authenticated can insert email logs" ON public.email_logs;
CREATE POLICY "Admins can insert email logs"
ON public.email_logs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'system_admin'::app_role)
);

-- 2. faculty: column-level grant — hide email & phone from anon
REVOKE SELECT ON public.faculty FROM anon;
GRANT SELECT (
  id, employee_id, full_name_ar, full_name_en, degree, specialization,
  program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
  created_at, updated_at, category, start_year
) ON public.faculty TO anon;
GRANT SELECT ON public.faculty TO authenticated;

-- 3. grade_components
DROP POLICY IF EXISTS gc_select ON public.grade_components;
CREATE POLICY gc_select ON public.grade_components FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean','student_affairs']::text[])
  OR is_dept_head_of_section(auth.uid(), course_section_id)
  OR is_faculty_of_section(auth.uid(), course_section_id)
  OR EXISTS (
    SELECT 1 FROM public.student_enrollments e
    JOIN public.student_profiles sp ON sp.id = e.student_profile_id
    WHERE e.course_section_id = grade_components.course_section_id
      AND sp.user_id = auth.uid()
  )
);

-- 4. request access helpers
CREATE OR REPLACE FUNCTION public.is_dept_head_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_requests sr
    JOIN public.absence_excuse_details d ON d.request_id = sr.id
    JOIN public.course_sections cs ON cs.id = d.course_section_id
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    JOIN public.courses c ON c.id = co.course_id
    WHERE sr.id = _request_id
      AND sr.request_type = 'absence_excuse'
      AND c.department_id IS NOT NULL
      AND public.is_department_head_of(_user_id, c.department_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.student_requests sr
    JOIN public.grade_appeal_details g ON g.request_id = sr.id
    JOIN public.course_sections cs ON cs.id = g.course_section_id
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    JOIN public.courses c ON c.id = co.course_id
    WHERE sr.id = _request_id
      AND sr.request_type = 'grade_appeal'
      AND c.department_id IS NOT NULL
      AND public.is_department_head_of(_user_id, c.department_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_faculty_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_requests sr
    JOIN public.absence_excuse_details d ON d.request_id = sr.id
    JOIN public.course_sections cs ON cs.id = d.course_section_id
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    WHERE sr.id = _request_id
      AND sr.request_type = 'absence_excuse'
      AND fp.user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.student_requests sr
    JOIN public.grade_appeal_details g ON g.request_id = sr.id
    JOIN public.course_sections cs ON cs.id = g.course_section_id
    JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
    WHERE sr.id = _request_id
      AND sr.request_type = 'grade_appeal'
      AND fp.user_id = _user_id
  )
$$;

-- 5. storage UPDATE policies
DROP POLICY IF EXISTS payment_receipts_update_own ON storage.objects;
CREATE POLICY payment_receipts_update_own ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin']::text[])
  )
)
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin']::text[])
  )
);

DROP POLICY IF EXISTS sra_storage_update_own ON storage.objects;
CREATE POLICY sra_storage_update_own ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'student-request-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin']::text[])
  )
)
WITH CHECK (
  bucket_id = 'student-request-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_any_role(auth.uid(), ARRAY['admin','system_admin']::text[])
  )
);
