
CREATE POLICY "Admins can insert faculty"
  ON public.faculty FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update faculty"
  ON public.faculty FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete faculty"
  ON public.faculty FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all faculty"
  ON public.faculty FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('faculty-images', 'faculty-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view faculty images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'faculty-images');

CREATE POLICY "Admins can upload faculty images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faculty-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update faculty images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'faculty-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete faculty images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'faculty-images' AND has_role(auth.uid(), 'admin'::app_role));
