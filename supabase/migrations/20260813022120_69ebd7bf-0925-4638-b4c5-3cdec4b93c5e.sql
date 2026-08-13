-- CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01
-- Forward-only ACL hardening. No function body change, no data change.
--
-- FINDING: public.cdp_instantiate_from_syllabus(uuid) is SECURITY DEFINER (owner postgres),
-- mutates course_delivery_plans / course_delivery_plan_sessions, performs NO auth.uid()/role
-- check, and had EXECUTE granted to `authenticated`.
--
-- CALLER SAFETY (verified in production catalog, read-only preflight):
--   syllabus_approve_version(uuid)    SECURITY DEFINER, owner postgres, admin-gated
--   cdp_regenerate_section_plan(uuid) SECURITY DEFINER, owner postgres, admin-gated
--   cdp_section_autoplan()            SECURITY DEFINER, owner postgres (AFTER INSERT trigger)
-- All three execute as postgres and keep EXECUTE after this revoke.
-- No generic authenticated bypass is kept.

REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM authenticated;

-- Owner/service execution only; administrative regeneration stays available
-- through the authorized public.cdp_regenerate_section_plan(uuid) RPC.
GRANT EXECUTE ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) TO service_role;