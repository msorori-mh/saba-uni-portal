-- SECURITY-RBAC-01B: Grant dean read-only RLS on core student tables.
-- Aligns Postgres policies with NAV + server PRIV_ROLES / executive access.
-- Write paths remain registrar/student_affairs/admin only.
-- Uses ALTER POLICY (no DROP) for Migration Review compliance.

ALTER POLICY "Admins can view all student profiles"
  ON public.student_profiles
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs', 'dean']
  ));

ALTER POLICY sas_priv_select
  ON public.student_academic_status
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs', 'dean']
  ));

ALTER POLICY se_priv_select
  ON public.student_enrollments
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs', 'dean']
  ));
