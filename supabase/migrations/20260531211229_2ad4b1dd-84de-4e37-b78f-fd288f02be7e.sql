-- Admin CRUD policies for research_papers
CREATE POLICY "Admins can view all research" ON public.research_papers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert research" ON public.research_papers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update research" ON public.research_papers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete research" ON public.research_papers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_papers TO authenticated;
GRANT ALL ON public.research_papers TO service_role;

-- Storage policies for research-pdfs (bucket already exists)
CREATE POLICY "Public can view research pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'research-pdfs');
CREATE POLICY "Admins can upload research pdfs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'research-pdfs' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update research pdfs" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'research-pdfs' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete research pdfs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'research-pdfs' AND has_role(auth.uid(), 'admin'));