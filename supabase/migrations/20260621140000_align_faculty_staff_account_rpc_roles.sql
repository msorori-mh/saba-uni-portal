-- SECURITY-RBAC-03: Align faculty/staff account RPC role checks with ACCOUNT_PROVISION_ROLES.
-- Server functions + admin-nav allow dean/hr_officer for faculty/staff account ops;
-- RPCs still checked registrar/student_affairs only.

CREATE OR REPLACE FUNCTION public.admin_set_faculty_status(_profile_id uuid, _active boolean)
RETURNS TABLE(profile_id uuid, user_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','system_admin','dean','registrar','hr_officer']
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege: only privileged staff can change faculty status'
      USING ERRCODE = '42501';
  END IF;

  v_new_status := CASE WHEN _active THEN 'active' ELSE 'inactive' END;

  PERFORM set_config('app.bypass_faculty_lock','1', true);
  UPDATE public.faculty_profiles
     SET status = v_new_status, updated_at = now()
   WHERE id = _profile_id
   RETURNING faculty_profiles.user_id INTO v_user_id;
  PERFORM set_config('app.bypass_faculty_lock','', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'faculty profile % not found', _profile_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, entity_type, entity_id, action_type, notes, new_values
  ) VALUES (
    auth.uid(), 'admin', 'faculty', _profile_id,
    'faculty_account_status_changed',
    CASE WHEN _active THEN 'تفعيل حساب عضو هيئة التدريس' ELSE 'تعطيل حساب عضو هيئة التدريس' END,
    jsonb_build_object('status', v_new_status, 'user_id', v_user_id)
  );

  RETURN QUERY SELECT _profile_id, v_user_id, v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_faculty_password_reset(_profile_id uuid)
RETURNS TABLE(profile_id uuid, user_id uuid, must_change_password boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','system_admin','dean','registrar','hr_officer']
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_faculty_lock','1', true);
  UPDATE public.faculty_profiles
     SET must_change_password = true, updated_at = now()
   WHERE id = _profile_id
   RETURNING faculty_profiles.user_id INTO v_user_id;
  PERFORM set_config('app.bypass_faculty_lock','', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'faculty profile % not found', _profile_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, entity_type, entity_id, action_type, notes, new_values
  ) VALUES (
    auth.uid(), 'admin', 'faculty', _profile_id,
    'faculty_password_reset_required',
    'إعادة تعيين كلمة المرور — تم تفعيل وجوب التغيير عند الدخول',
    jsonb_build_object('must_change_password', true, 'user_id', v_user_id)
  );

  RETURN QUERY SELECT _profile_id, v_user_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_staff_status(_profile_id uuid, _active boolean)
RETURNS TABLE(profile_id uuid, user_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','system_admin','dean','hr_officer']
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  v_new_status := CASE WHEN _active THEN 'active' ELSE 'inactive' END;

  PERFORM set_config('app.bypass_staff_lock','1', true);
  UPDATE public.staff_profiles
     SET status = v_new_status, updated_at = now()
   WHERE id = _profile_id
   RETURNING staff_profiles.user_id INTO v_user_id;
  PERFORM set_config('app.bypass_staff_lock','', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff profile % not found', _profile_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, entity_type, entity_id, action_type, notes, new_values
  ) VALUES (
    auth.uid(), 'admin', 'staff', _profile_id,
    'staff_account_status_changed',
    CASE WHEN _active THEN 'تفعيل حساب موظف' ELSE 'تعطيل حساب موظف' END,
    jsonb_build_object('status', v_new_status, 'user_id', v_user_id)
  );

  RETURN QUERY SELECT _profile_id, v_user_id, v_new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_staff_password_reset(_profile_id uuid)
RETURNS TABLE(profile_id uuid, user_id uuid, must_change_password boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    auth.uid(), ARRAY['admin','system_admin','dean','hr_officer']
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_staff_lock','1', true);
  UPDATE public.staff_profiles
     SET must_change_password = true, updated_at = now()
   WHERE id = _profile_id
   RETURNING staff_profiles.user_id INTO v_user_id;
  PERFORM set_config('app.bypass_staff_lock','', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff profile % not found', _profile_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, actor_role, entity_type, entity_id, action_type, notes, new_values
  ) VALUES (
    auth.uid(), 'admin', 'staff', _profile_id,
    'staff_password_reset_required',
    'إعادة تعيين كلمة المرور — تم تفعيل وجوب التغيير عند الدخول',
    jsonb_build_object('must_change_password', true, 'user_id', v_user_id)
  );

  RETURN QUERY SELECT _profile_id, v_user_id, true;
END;
$$;
