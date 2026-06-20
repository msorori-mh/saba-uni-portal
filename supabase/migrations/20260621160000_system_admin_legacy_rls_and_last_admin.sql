-- SECURITY-RBAC-04: Add system_admin to legacy admin-only RLS + last system_admin guard.
-- ALTER POLICY only (no DROP). Matches server-side *_ADMIN_ROLES constants.

-- contact_messages
ALTER POLICY "Admins can view messages"
  ON public.contact_messages
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can update messages"
  ON public.contact_messages
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can delete messages"
  ON public.contact_messages
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

-- research_papers
ALTER POLICY "Admins can view all research"
  ON public.research_papers
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can insert research"
  ON public.research_papers
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can update research"
  ON public.research_papers
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can delete research"
  ON public.research_papers
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

-- events
ALTER POLICY "Admins can view all events"
  ON public.events
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can insert events"
  ON public.events
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can update events"
  ON public.events
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can delete events"
  ON public.events
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

-- storage: research PDFs
ALTER POLICY "Admins can upload research pdfs"
  ON storage.objects
  WITH CHECK (
    bucket_id = 'research-pdfs'
    AND public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin'])
  );

ALTER POLICY "Admins can update research pdfs"
  ON storage.objects
  USING (
    bucket_id = 'research-pdfs'
    AND public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin'])
  );

ALTER POLICY "Admins can delete research pdfs"
  ON storage.objects
  USING (
    bucket_id = 'research-pdfs'
    AND public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin'])
  );

-- storage: event images
ALTER POLICY "Admins can upload event images"
  ON storage.objects
  WITH CHECK (
    bucket_id = 'events-images'
    AND public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin'])
  );

ALTER POLICY "Admins can update event images"
  ON storage.objects
  USING (
    bucket_id = 'events-images'
    AND public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin'])
  );

ALTER POLICY "Admins can delete event images"
  ON storage.objects
  USING (
    bucket_id = 'events-images'
    AND public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin'])
  );

-- Never allow removing the last system_admin (mirrors last admin protection).
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' THEN
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'لا يمكن إزالة آخر حساب مدير في النظام';
    END IF;
  ELSIF OLD.role = 'system_admin' THEN
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'system_admin') <= 1 THEN
      RAISE EXCEPTION 'لا يمكن إزالة آخر system_admin في النظام';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
