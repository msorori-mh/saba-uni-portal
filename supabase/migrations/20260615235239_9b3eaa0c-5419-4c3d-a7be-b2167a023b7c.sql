
-- A) admin_set_student_status
CREATE OR REPLACE FUNCTION public.admin_set_student_status(
  _profile_id uuid,
  _active boolean
)
RETURNS TABLE(profile_id uuid, user_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','system_admin','registrar','student_affairs']
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege: only admin/registrar/student_affairs can change student status'
      USING ERRCODE = '42501';
  END IF;

  v_new_status := CASE WHEN _active THEN 'active' ELSE 'inactive' END;

  PERFORM set_config('app.bypass_student_lock','1', true);

  UPDATE public.student_profiles
     SET status     = v_new_status,
         updated_at = now()
   WHERE id = _profile_id
   RETURNING student_profiles.user_id INTO v_user_id;

  PERFORM set_config('app.bypass_student_lock','', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student profile % not found', _profile_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, entity_type, entity_id, action_type, notes, new_values
  ) VALUES (
    auth.uid(), 'admin', 'student', _profile_id,
    'student_account_status_changed',
    CASE WHEN _active THEN 'تفعيل حساب الطالب' ELSE 'تعطيل حساب الطالب' END,
    jsonb_build_object('status', v_new_status, 'user_id', v_user_id)
  );

  RETURN QUERY SELECT _profile_id, v_user_id, v_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_student_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_status(uuid, boolean) TO authenticated, service_role;

-- B) admin_mark_student_password_reset
CREATE OR REPLACE FUNCTION public.admin_mark_student_password_reset(
  _profile_id uuid
)
RETURNS TABLE(profile_id uuid, user_id uuid, must_change_password boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(),
    ARRAY['admin','system_admin','registrar','student_affairs']
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege: only admin/registrar/student_affairs can reset student password flag'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_student_lock','1', true);

  UPDATE public.student_profiles
     SET must_change_password = true,
         updated_at = now()
   WHERE id = _profile_id
   RETURNING student_profiles.user_id INTO v_user_id;

  PERFORM set_config('app.bypass_student_lock','', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student profile % not found', _profile_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, entity_type, entity_id, action_type, notes, new_values
  ) VALUES (
    auth.uid(), 'admin', 'student', _profile_id,
    'student_password_reset_required',
    'إعادة تعيين كلمة المرور — تم تفعيل وجوب التغيير عند الدخول',
    jsonb_build_object('must_change_password', true, 'user_id', v_user_id)
  );

  RETURN QUERY SELECT _profile_id, v_user_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_student_password_reset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_student_password_reset(uuid) TO authenticated, service_role;
