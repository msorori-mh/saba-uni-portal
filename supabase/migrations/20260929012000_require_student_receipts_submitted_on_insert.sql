-- Only the student's own, unreviewed receipt may enter through the student
-- insert path. Staff retain the existing privileged role-based insert path.
ALTER POLICY pr_insert_student ON public.payment_receipts
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
    OR (
      EXISTS (
        SELECT 1 FROM public.student_profiles sp
        WHERE sp.id = student_profile_id AND sp.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.student_fees sf
        WHERE sf.id = student_fee_id AND sf.student_profile_id = student_profile_id
      )
      AND status = 'submitted'
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND student_payment_id IS NULL
      AND rejection_reason IS NULL
    )
  );
