-- Harden site_settings direct writes.
-- Uses ALTER POLICY (no DROP) for Migration Review compliance.

REVOKE INSERT, UPDATE, DELETE ON public.site_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.site_settings FROM anon;

GRANT ALL ON public.site_settings TO service_role;

ALTER POLICY "Admins can insert settings"
  ON public.site_settings
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can update settings"
  ON public.site_settings
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can delete settings"
  ON public.site_settings
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));
