ALTER FUNCTION public.gp_proposal_complete(graduation_projects) SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_graduation_project_assignment() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_safe_graduation_project_object_key(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.reject_graduation_project_event_mutation() SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Public can view settings" ON public.site_settings;
CREATE POLICY "Public can view public settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (setting_group IN ('general','contact','social','about'));

CREATE POLICY "Admins can view all settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::text, 'system_admin'::text]));