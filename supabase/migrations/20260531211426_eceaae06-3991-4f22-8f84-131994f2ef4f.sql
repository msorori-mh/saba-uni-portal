-- Events admin policies
CREATE POLICY "Admins can view all events" ON public.events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert events" ON public.events FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update events" ON public.events FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete events" ON public.events FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

-- Events images bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('events-images', 'events-images', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public can view event images" ON storage.objects FOR SELECT USING (bucket_id = 'events-images');
CREATE POLICY "Admins can upload event images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'events-images' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update event images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'events-images' AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete event images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'events-images' AND has_role(auth.uid(), 'admin'));

-- Contact messages: add status column
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';
UPDATE public.contact_messages SET status = CASE WHEN is_read THEN 'read' ELSE 'new' END WHERE status = 'new';