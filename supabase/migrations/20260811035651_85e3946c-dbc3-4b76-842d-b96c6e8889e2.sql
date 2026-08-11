CREATE OR REPLACE FUNCTION public.graduate_affairs_list_assignable_staff()
 RETURNS TABLE(user_id uuid, full_name text, role_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_NOT_AUTHENTICATED';
  END IF;
  IF NOT (public.graduate_affairs_is_manager() OR public.graduate_affairs_is_specialist()) THEN
    RAISE EXCEPTION 'GRADUATE_AFFAIRS_ACCESS_DENIED';
  END IF;

  RETURN QUERY
  SELECT DISTINCT sp.user_id,
         COALESCE(NULLIF(btrim(sp.full_name), ''), 'موظف شؤون الخريجين') AS full_name,
         r.code AS role_code
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u
    ON u.id = a.unit_id AND u.code = 'graduate_affairs' AND u.is_active
  JOIN public.request_processing_roles r
    ON r.id = a.role_id AND r.is_active
   AND r.code IN ('graduate_affairs_manager', 'graduate_affairs_specialist')
  JOIN public.staff_profiles sp
    ON sp.status = 'active'
   AND (
     (a.assignment_type = 'staff_profile' AND sp.id = a.staff_profile_id)
     OR (a.assignment_type = 'user' AND sp.user_id = a.user_id)
   )
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND sp.user_id IS NOT NULL
  ORDER BY 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.graduate_affairs_list_assignable_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.graduate_affairs_list_assignable_staff() TO authenticated;