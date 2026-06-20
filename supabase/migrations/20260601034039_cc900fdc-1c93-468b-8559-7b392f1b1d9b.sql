-- ============================================================
-- Phase 8A-H: Production Hardening
-- Storage bucket hardening + hardening-status read function
-- ============================================================

-- 1) Storage buckets: file size + MIME type restrictions
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/svg+xml','image/gif']
 WHERE id IN ('department-images','events-images','faculty-images','news-images');

UPDATE storage.buckets
   SET file_size_limit = 20971520,
       allowed_mime_types = ARRAY['application/pdf']
 WHERE id = 'research-pdfs';

UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
 WHERE id IN ('payment-receipts','student-request-attachments');

-- 2) Read-only hardening status function (admin/system_admin/dean only)
CREATE OR REPLACE FUNCTION public.get_hardening_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count int;
  v_system_admin_count int;
  v_buckets jsonb;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean']) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO v_admin_count
    FROM public.user_roles WHERE role = 'admin';
  SELECT count(*) INTO v_system_admin_count
    FROM public.user_roles WHERE role = 'system_admin';

  SELECT jsonb_agg(jsonb_build_object(
           'id', id,
           'public', public,
           'file_size_limit', file_size_limit,
           'allowed_mime_types', allowed_mime_types
         ) ORDER BY id)
    INTO v_buckets
    FROM storage.buckets;

  RETURN jsonb_build_object(
    'admin_count', v_admin_count,
    'system_admin_count', v_system_admin_count,
    'buckets', COALESCE(v_buckets, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_hardening_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hardening_status() TO authenticated;