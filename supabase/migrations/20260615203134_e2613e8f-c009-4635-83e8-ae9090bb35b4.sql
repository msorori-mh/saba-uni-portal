
-- SECURITY-FIX: tighten policies flagged by scanner

-- 1) student_requests.sr_update_self → restrict to authenticated only
DROP POLICY IF EXISTS sr_update_self ON public.student_requests;
CREATE POLICY sr_update_self ON public.student_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status = ANY (ARRAY['draft','submitted','under_review'])
  );

-- 2) user_role_assignments: stop exposing every assignment to every authenticated user
DROP POLICY IF EXISTS ura_read_authenticated ON public.user_role_assignments;

CREATE POLICY ura_read_self ON public.user_role_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY ura_read_admin ON public.user_role_assignments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

-- 3) rate_limit_attempts: explicit admin-only SELECT (writes still go through SECURITY DEFINER RPC)
CREATE POLICY rla_admin_select ON public.rate_limit_attempts
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));
