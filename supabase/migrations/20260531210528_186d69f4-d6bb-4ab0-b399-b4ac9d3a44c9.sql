
-- Admin CRUD policies for news
CREATE POLICY "Admins can insert news"
  ON public.news FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update news"
  ON public.news FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete news"
  ON public.news FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all news"
  ON public.news FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.news TO authenticated;

-- Storage bucket for news images
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view news images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'news-images');

CREATE POLICY "Admins can upload news images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'news-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update news images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'news-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete news images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'news-images' AND has_role(auth.uid(), 'admin'::app_role));
