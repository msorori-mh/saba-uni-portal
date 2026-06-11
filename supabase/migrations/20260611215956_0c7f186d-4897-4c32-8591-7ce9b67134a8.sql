
DROP POLICY IF EXISTS "Public can view department images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view event images"      ON storage.objects;
DROP POLICY IF EXISTS "Public can view faculty images"    ON storage.objects;
DROP POLICY IF EXISTS "Public can view news images"       ON storage.objects;
DROP POLICY IF EXISTS "Public can read research pdfs"     ON storage.objects;

CREATE POLICY "Authenticated can list department images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'department-images');

CREATE POLICY "Authenticated can list event images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'events-images');

CREATE POLICY "Authenticated can list faculty images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faculty-images');

CREATE POLICY "Authenticated can list news images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'news-images');

CREATE POLICY "Authenticated can list research pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'research-pdfs');
