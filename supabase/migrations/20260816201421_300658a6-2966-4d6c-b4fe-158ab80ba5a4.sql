ALTER FUNCTION public.enforce_graduate_followup_workflow_update() SET search_path = public;
ALTER FUNCTION public.enforce_graduate_account_policy_update() SET search_path = public;
ALTER FUNCTION public.enforce_published_engagement_scope_immutability() SET search_path = public;
ALTER FUNCTION public.enforce_graduate_consent_identity_immutability() SET search_path = public;
ALTER FUNCTION public.enforce_graduate_followup_update() SET search_path = public;
ALTER FUNCTION public.enforce_official_decision_immutability() SET search_path = public;
ALTER FUNCTION public.reject_graduate_immutable_mutation() SET search_path = public;

DROP POLICY IF EXISTS co_select ON public.course_offerings;
CREATE POLICY co_select ON public.course_offerings
FOR SELECT TO authenticated
USING (
  status = 'active'
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean','faculty_member'])
  OR EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_offerings.course_id
      AND c.department_id IS NOT NULL
      AND public.is_department_head_of(auth.uid(), c.department_id)
  )
);

DROP POLICY IF EXISTS payment_receipts_update_own ON storage.objects;
CREATE POLICY payment_receipts_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
    OR (
      (auth.uid())::text = (storage.foldername(name))[1]
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_receipts pr
        WHERE pr.file_url LIKE '%' || storage.objects.name
          AND pr.status IS DISTINCT FROM 'submitted'
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
    OR (
      (auth.uid())::text = (storage.foldername(name))[1]
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_receipts pr
        WHERE pr.file_url LIKE '%' || storage.objects.name
          AND pr.status IS DISTINCT FROM 'submitted'
      )
    )
  )
);

DROP POLICY IF EXISTS sra_storage_update_own ON storage.objects;
CREATE POLICY sra_storage_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'student-request-attachments'
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
    OR (
      (auth.uid())::text = (storage.foldername(name))[1]
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_request_attachments sra
        JOIN public.student_requests sr ON sr.id = sra.request_id
        WHERE sra.file_url LIKE '%' || storage.objects.name
          AND sr.status NOT IN ('draft','returned','needs_completion')
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'student-request-attachments'
  AND (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
    OR (
      (auth.uid())::text = (storage.foldername(name))[1]
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_request_attachments sra
        JOIN public.student_requests sr ON sr.id = sra.request_id
        WHERE sra.file_url LIKE '%' || storage.objects.name
          AND sr.status NOT IN ('draft','returned','needs_completion')
      )
    )
  )
);