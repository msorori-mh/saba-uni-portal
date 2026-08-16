REVOKE ALL ON public.p1_e2e_07_executions FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.p1_e2e_07_allows_hidden_submit(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.p1_is_atomic_submit_service(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.p1_e2e_07_marker() FROM anon;
REVOKE EXECUTE ON FUNCTION public.p1_actor_is_test_only(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.p1_request_has_canonical_detail(uuid, text) FROM anon;