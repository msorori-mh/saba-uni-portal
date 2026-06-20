CREATE OR REPLACE FUNCTION public.link_faculty_profile_account(
  p_profile_id uuid,
  p_auth_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.bypass_faculty_lock', '1', true);
  UPDATE public.faculty_profiles
    SET user_id = p_auth_user_id,
        must_change_password = true,
        status = 'active'
    WHERE id = p_profile_id;
  INSERT INTO public.user_roles(user_id, role)
    VALUES (p_auth_user_id, 'faculty_member')
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.link_faculty_profile_account(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_faculty_profile_account(uuid, uuid) TO service_role;