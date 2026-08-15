CREATE OR REPLACE FUNCTION public.protect_faculty_department_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    IF current_setting('app.bypass_faculty_department_lock', true) = '1'
       AND current_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    IF NOT public.has_any_role(auth.uid(), ARRAY['admin','system_admin']) THEN
      RAISE EXCEPTION 'Only admins can change department_id on faculty_profiles'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;