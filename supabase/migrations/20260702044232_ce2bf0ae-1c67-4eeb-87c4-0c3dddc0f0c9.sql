DROP POLICY IF EXISTS sr_update_self ON public.student_requests;

CREATE POLICY sr_update_self ON public.student_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status = ANY (ARRAY['draft','submitted','under_review','returned','returned_for_completion'])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status = ANY (ARRAY['draft','submitted','under_review','returned','returned_for_completion','cancelled'])
  );