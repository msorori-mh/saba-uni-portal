-- Secure RPC to link a student profile to its auth user, bypassing
-- protect_student_sensitive_fields ONLY for trusted callers.
CREATE OR REPLACE FUNCTION public.link_student_user_account(
  _profile_id uuid,
  _target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_existing_user uuid;
  v_other_profile uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_any_role(v_caller, ARRAY['admin','system_admin','registrar','student_affairs']) THEN
    RAISE EXCEPTION 'Forbidden: insufficient privileges to link student account'
      USING ERRCODE = '42501';
  END IF;

  IF _profile_id IS NULL OR _target_user_id IS NULL THEN
    RAISE EXCEPTION 'profile_id and target_user_id are required' USING ERRCODE = '22023';
  END IF;

  -- Ensure target user id isn't already linked to a different profile
  SELECT id INTO v_other_profile
  FROM public.student_profiles
  WHERE user_id = _target_user_id AND id <> _profile_id
  LIMIT 1;
  IF v_other_profile IS NOT NULL THEN
    RAISE EXCEPTION 'Target auth user is already linked to another student profile'
      USING ERRCODE = '23505';
  END IF;

  -- Current linkage
  SELECT user_id INTO v_existing_user FROM public.student_profiles WHERE id = _profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_existing_user IS NOT NULL AND v_existing_user = _target_user_id THEN
    RETURN jsonb_build_object('ok', true, 'already_linked', true,
      'profile_id', _profile_id, 'user_id', _target_user_id);
  END IF;
  IF v_existing_user IS NOT NULL AND v_existing_user <> _target_user_id THEN
    RAISE EXCEPTION 'Student profile already linked to a different auth user'
      USING ERRCODE = '23505';
  END IF;

  -- Bypass protection trigger for this scoped update only
  PERFORM set_config('app.bypass_student_lock', '1', true);
  UPDATE public.student_profiles
     SET user_id = _target_user_id,
         must_change_password = true,
         status = COALESCE(NULLIF(status, ''), 'active'),
         updated_at = now()
   WHERE id = _profile_id;
  PERFORM set_config('app.bypass_student_lock', '0', true);

  PERFORM public.log_audit(
    'student_profile', _profile_id, 'student_account_linked',
    jsonb_build_object('user_id', v_existing_user),
    jsonb_build_object('user_id', _target_user_id),
    'Linked student profile to auth user via link_student_user_account'
  );

  RETURN jsonb_build_object('ok', true, 'profile_id', _profile_id, 'user_id', _target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.link_student_user_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_student_user_account(uuid, uuid) TO authenticated, service_role;