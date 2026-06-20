
REVOKE EXECUTE ON FUNCTION public.user_can_see_announcement(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_send_internal_message(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_see_announcement(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_send_internal_message(uuid, uuid) TO authenticated, service_role;
