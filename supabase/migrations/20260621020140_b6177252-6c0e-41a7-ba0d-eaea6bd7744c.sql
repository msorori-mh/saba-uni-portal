-- PR #25 migration 1/2: Remove anon execute on check_and_record_rate_limit
REVOKE ALL ON FUNCTION public.check_and_record_rate_limit(text, text, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit(text, text, int, int, int) TO authenticated, service_role;

-- PR #25 migration 2/2: Unify has_any_role with user_role_assignments + roles_catalog.app_role_mapping
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = ANY(_roles)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    LEFT JOIN public.roles_catalog rc ON rc.code = ura.role_code
    WHERE ura.user_id = _user_id
      AND (
        ura.role_code = ANY(_roles)
        OR rc.app_role_mapping::text = ANY(_roles)
      )
  )
$$;