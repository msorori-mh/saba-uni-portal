
-- 1. Fix mutable search_path on three IMMUTABLE helper functions
ALTER FUNCTION public.is_valid_actor_request_action(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.student_request_ineligible_status_message() SET search_path = public, pg_temp;
ALTER FUNCTION public.student_request_type_is_eligible(text, text) SET search_path = public, pg_temp;

-- 2. Prevent self-escalation via faculty_profiles.department_id changes.
-- Non-admins may update their own profile but cannot change department_id.
CREATE OR REPLACE FUNCTION public.protect_faculty_department_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    IF NOT public.has_any_role(auth.uid(), ARRAY['admin','system_admin']) THEN
      RAISE EXCEPTION 'Only admins can change department_id on faculty_profiles'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_faculty_department_id ON public.faculty_profiles;
CREATE TRIGGER trg_protect_faculty_department_id
  BEFORE UPDATE ON public.faculty_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_faculty_department_id();

-- 3. Public image buckets: match SELECT policy to bucket's public status.
DROP POLICY IF EXISTS "Authenticated can list news images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list faculty images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list department images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list event images" ON storage.objects;

CREATE POLICY "Public can view news images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'news-images');

CREATE POLICY "Public can view faculty images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'faculty-images');

CREATE POLICY "Public can view department images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'department-images');

CREATE POLICY "Public can view event images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'events-images');

-- 4. Defense-in-depth explicit admin-only policies on the private
-- database_export_09_07_26 bucket. Bucket is private and had zero policies
-- (fails closed), but explicit policies document intent and ensure no
-- accidental permissive rule ever grants access to non-admins.
DROP POLICY IF EXISTS "database_export_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "database_export_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "database_export_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "database_export_admin_delete" ON storage.objects;

CREATE POLICY "database_export_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'database_export_09_07_26'
    AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE POLICY "database_export_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'database_export_09_07_26'
    AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE POLICY "database_export_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'database_export_09_07_26'
    AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  )
  WITH CHECK (
    bucket_id = 'database_export_09_07_26'
    AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE POLICY "database_export_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'database_export_09_07_26'
    AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );
