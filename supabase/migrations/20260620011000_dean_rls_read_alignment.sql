-- SECURITY-RBAC-03: Grant dean read-only RLS on core student tables.
-- Aligns Postgres policies with NAV + server PRIV_ROLES / executive access.
-- Write paths remain registrar/student_affairs/admin only.

DROP POLICY IF EXISTS "Admins can view all student profiles" ON public.student_profiles;
CREATE POLICY "Admins can view all student profiles"
  ON public.student_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs', 'dean']
  ));

DROP POLICY IF EXISTS "sas_priv_select" ON public.student_academic_status;
CREATE POLICY "sas_priv_select" ON public.student_academic_status FOR SELECT TO authenticated
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs', 'dean']
  ));

DROP POLICY IF EXISTS se_priv_select ON public.student_enrollments;
CREATE POLICY se_priv_select ON public.student_enrollments FOR SELECT TO authenticated
  USING (public.has_any_role(
    auth.uid(),
    ARRAY['admin', 'system_admin', 'registrar', 'student_affairs', 'dean']
  ));
