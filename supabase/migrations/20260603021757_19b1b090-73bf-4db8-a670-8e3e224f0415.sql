
-- Fix 1: Faculty table — allow anonymous public read of non-sensitive columns only.
-- Email and phone remain readable only to authenticated users (admins via RLS).
GRANT SELECT (id, employee_id, full_name_ar, full_name_en, degree, specialization,
              program_id, rank, photo, bio_ar, bio_en, sort_order, is_active,
              category, start_year, created_at, updated_at)
  ON public.faculty TO anon;

-- Fix 2: Restrict student self-update on student_requests to non-finalized statuses.
-- The protect_student_request trigger already governs allowed transitions; this
-- tightens RLS so approved/rejected/cancelled rows cannot be targeted at all.
DROP POLICY IF EXISTS sr_update_self ON public.student_requests;
CREATE POLICY sr_update_self ON public.student_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status IN ('draft','submitted','under_review')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status IN ('draft','submitted','under_review','cancelled')
  );
