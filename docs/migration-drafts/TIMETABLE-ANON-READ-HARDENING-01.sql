-- TIMETABLE-ANON-READ-HARDENING-01
-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- Forward-only correction for anonymous timetable metadata exposure introduced
-- by 20260531232114_d62ab13e-9bf1-4ecc-844e-839f5168e916.sql.
-- The applied migration is intentionally not edited.

BEGIN;

-- Table privileges and permissive RLS policies are independent gates. Revoke
-- the privileges and remove the policies so anonymous access fails closed even
-- if either layer is inspected or changed independently later.
REVOKE ALL ON TABLE public.class_schedule FROM anon;
REVOKE ALL ON TABLE public.course_sections FROM anon;
REVOKE ALL ON TABLE public.course_offerings FROM anon;

DROP POLICY IF EXISTS sch_select_anon ON public.class_schedule;
DROP POLICY IF EXISTS cs_select_anon ON public.course_sections;
DROP POLICY IF EXISTS co_select_anon ON public.course_offerings;

COMMIT;

-- Authenticated access is intentionally unchanged in this focused correction.
-- The existing authenticated SELECT policies are broad (USING (true)); they are
-- not evidence of student enrollment, faculty ownership, or administrative
-- scope. A separate reviewed migration must replace them with least-privilege
-- policies based on exact student_enrollments.course_section_id, direct faculty
-- assignment, and explicitly authorized administrative roles. Do not restore
-- anonymous access as a compatibility fallback.
