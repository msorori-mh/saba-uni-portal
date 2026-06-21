-- P0-A: Remove anon execute on check_and_record_rate_limit (SECURITY DEFINER).
-- Pre-auth flows use server function checkPublicRateLimit instead.
REVOKE ALL ON FUNCTION public.check_and_record_rate_limit(text, text, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit(text, text, int, int, int) TO authenticated, service_role;
