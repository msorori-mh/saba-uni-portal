DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND cmd='SELECT' AND qual='true' AND roles = '{authenticated}'::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (auth.uid() IS NOT NULL)', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER POLICY "Admins can update department images" ON storage.objects
  WITH CHECK ((bucket_id = 'department-images') AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Admins can update faculty images" ON storage.objects
  WITH CHECK ((bucket_id = 'faculty-images') AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Admins can update news images" ON storage.objects
  WITH CHECK ((bucket_id = 'news-images') AND public.has_role(auth.uid(), 'admin'::public.app_role));
ALTER POLICY "Admins can update event images" ON storage.objects
  WITH CHECK ((bucket_id = 'events-images') AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));
ALTER POLICY "Admins can update research pdfs" ON storage.objects
  WITH CHECK ((bucket_id = 'research-pdfs') AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));