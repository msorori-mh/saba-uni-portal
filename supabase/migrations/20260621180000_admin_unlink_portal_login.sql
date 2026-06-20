-- Admin unlink portal login: clear profile.user_id with protect_* bypass (matches ACCOUNT_PROVISION_ROLES).

CREATE OR REPLACE FUNCTION public.admin_unlink_portal_login(
  p_kind text,
  p_profile_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_user_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_kind = 'student' THEN
    IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','registrar','student_affairs']) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
    SELECT user_id INTO v_old_user_id FROM public.student_profiles WHERE id = p_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'student profile % not found', p_profile_id USING ERRCODE = 'P0002';
    END IF;
    PERFORM set_config('app.bypass_student_lock', '1', true);
    UPDATE public.student_profiles
       SET user_id = NULL, updated_at = now()
     WHERE id = p_profile_id;
    PERFORM set_config('app.bypass_student_lock', '0', true);

  ELSIF p_kind = 'faculty' THEN
    IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','hr_officer']) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
    SELECT user_id INTO v_old_user_id FROM public.faculty_profiles WHERE id = p_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'faculty profile % not found', p_profile_id USING ERRCODE = 'P0002';
    END IF;
    PERFORM set_config('app.bypass_faculty_lock', '1', true);
    UPDATE public.faculty_profiles
       SET user_id = NULL, updated_at = now()
     WHERE id = p_profile_id;
    PERFORM set_config('app.bypass_faculty_lock', '', true);

  ELSIF p_kind = 'staff' THEN
    IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','hr_officer']) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
    SELECT user_id INTO v_old_user_id FROM public.staff_profiles WHERE id = p_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staff profile % not found', p_profile_id USING ERRCODE = 'P0002';
    END IF;
    PERFORM set_config('app.bypass_staff_lock', '1', true);
    UPDATE public.staff_profiles
       SET user_id = NULL, updated_at = now()
     WHERE id = p_profile_id;
    PERFORM set_config('app.bypass_staff_lock', '', true);

  ELSE
    RAISE EXCEPTION 'invalid kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  RETURN v_old_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unlink_portal_login(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlink_portal_login(text, uuid) TO authenticated, service_role;
