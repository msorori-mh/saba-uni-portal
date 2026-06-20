-- SECURITY-RLS-05: Harden site_settings against direct client writes.
-- Public SELECT (SEC-004) unchanged. Admin UI uses service_role via server functions.

REVOKE INSERT, UPDATE, DELETE ON public.site_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.site_settings FROM anon;

GRANT ALL ON public.site_settings TO service_role;

DROP POLICY IF EXISTS "Admins can insert settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can delete settings" ON public.site_settings;

CREATE POLICY "Admins can insert settings" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

CREATE POLICY "Admins can update settings" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

CREATE POLICY "Admins can delete settings" ON public.site_settings
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));
