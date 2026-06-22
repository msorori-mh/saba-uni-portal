-- SECURITY-RBAC-05: Align people-profile RLS with hr_officer access in admin-nav + server functions.
-- Also adds link_staff_profile_account RPC (mirrors faculty) for safe staff login linking via service_role.

-- ---------------------------------------------------------------------------
-- SELECT: hr_officer may view all staff/faculty profiles (read-only via RLS)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Privileged roles can view all faculty profiles" ON public.faculty_profiles;
CREATE POLICY "Privileged roles can view all faculty profiles"
  ON public.faculty_profiles FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','registrar','student_affairs','hr_officer']
    )
  );

DROP POLICY IF EXISTS "Privileged roles can view all staff profiles" ON public.staff_profiles;
CREATE POLICY "Privileged roles can view all staff profiles"
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin','system_admin','dean','hr_officer']
    )
  );

-- ---------------------------------------------------------------------------
-- Staff account link RPC (bypasses sensitive-field trigger; service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_staff_profile_account(
  p_profile_id uuid,
  p_auth_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.bypass_staff_lock', '1', true);
  UPDATE public.staff_profiles
    SET user_id = p_auth_user_id,
        must_change_password = true,
        status = 'active'
    WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_staff_profile_account(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_staff_profile_account(uuid, uuid) TO service_role;
