DROP POLICY IF EXISTS "Authenticated can list research pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Public can view research pdfs" ON storage.objects;

CREATE POLICY "Published research pdfs are listable"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'research-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.research_papers rp
    WHERE rp.is_published = true
      AND rp.pdf_url IS NOT NULL
      AND rp.pdf_url LIKE '%/research-pdfs/' || storage.objects.name
  )
);

CREATE POLICY "Admins can list research pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'research-pdfs'
  AND has_any_role(auth.uid(), ARRAY['admin','system_admin'])
);