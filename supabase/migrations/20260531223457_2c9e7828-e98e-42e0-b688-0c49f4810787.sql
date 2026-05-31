
-- Trigger to lock sensitive fields against student-initiated updates
CREATE OR REPLACE FUNCTION public.protect_student_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow trusted server-side flows (e.g. complete_student_password_change RPC)
  IF current_setting('app.bypass_student_lock', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- Admins / registrar / student affairs bypass the lock
  IF public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  -- Otherwise (student updating own row), silently revert sensitive fields
  NEW.user_id              := OLD.user_id;
  NEW.academic_number      := OLD.academic_number;
  NEW.full_name_ar         := OLD.full_name_ar;
  NEW.department_id        := OLD.department_id;
  NEW.program_id           := OLD.program_id;
  NEW.status               := OLD.status;
  NEW.must_change_password := OLD.must_change_password;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_sensitive ON public.student_profiles;
CREATE TRIGGER trg_protect_student_sensitive
BEFORE UPDATE ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_student_sensitive_fields();

-- RPC: complete password change (only safe path to clear must_change_password)
CREATE OR REPLACE FUNCTION public.complete_student_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Bypass the protection trigger only for this scoped update
  PERFORM set_config('app.bypass_student_lock', '1', true);

  UPDATE public.student_profiles
     SET must_change_password = false,
         updated_at = now()
   WHERE user_id = v_uid;

  PERFORM set_config('app.bypass_student_lock', '0', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_student_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_student_password_change() TO authenticated;
