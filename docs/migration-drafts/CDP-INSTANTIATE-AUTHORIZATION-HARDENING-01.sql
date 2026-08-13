-- CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01
-- Forward-only. NOT APPLIED — awaiting production gate approval.
--
-- FINDING (production read-only preflight):
--   public.cdp_instantiate_from_syllabus(uuid) is SECURITY DEFINER (owner: postgres),
--   mutates course_delivery_plans / course_delivery_plan_sessions, performs NO
--   auth.uid()/role check, and currently has EXECUTE granted to `authenticated`.
--   => any signed-in student/faculty/staff can regenerate delivery plans directly.
--
-- CALLER SAFETY (verified in production catalog):
--   public.syllabus_approve_version(uuid)     SECURITY DEFINER, owner postgres, admin-gated
--   public.cdp_regenerate_section_plan(uuid)  SECURITY DEFINER, owner postgres, admin-gated
--   public.cdp_section_autoplan()             SECURITY DEFINER, owner postgres (AFTER INSERT trigger)
--   All three execute as `postgres`, which keeps EXECUTE after this revoke,
--   so no legitimate internal path breaks. No generic authenticated bypass is kept.

REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM authenticated;

-- Owner/service execution only; administrative regeneration stays available
-- through the authorized public.cdp_regenerate_section_plan(uuid) RPC.
GRANT EXECUTE ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) TO service_role;

-- Post-apply verification (expected: no `authenticated=X`, no `anon=X`, no `=X/` PUBLIC entry):
--   SELECT p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'cdp_instantiate_from_syllabus';
