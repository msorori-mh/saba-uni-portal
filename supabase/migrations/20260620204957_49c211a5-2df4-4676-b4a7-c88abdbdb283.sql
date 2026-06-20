ALTER POLICY "Admins can view all roles"
  ON public.user_roles
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can insert roles"
  ON public.user_roles
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can update roles"
  ON public.user_roles
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));

ALTER POLICY "Admins can delete roles"
  ON public.user_roles
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'system_admin']));