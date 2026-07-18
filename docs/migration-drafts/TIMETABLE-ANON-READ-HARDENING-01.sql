-- TIMETABLE-ANON-READ-HARDENING-01
-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- Forward-only correction for anonymous timetable metadata exposure introduced
-- by 20260531232114_d62ab13e-9bf1-4ecc-844e-839f5168e916.sql.
-- The applied migration is intentionally not edited.

BEGIN;

-- Fail closed unless the live policy inventory is exactly the reviewed state.
-- Policies granted to PUBLIC or to a role inherited by anon are effective for
-- anon too; an unexpected applicable policy must never be silently preserved.
DO $preflight$
DECLARE
  v_missing integer;
  v_unexpected integer;
  v_table text;
  v_privilege text;
BEGIN
  WITH expected(policyname, tablename) AS (
    VALUES
      ('sch_select_anon', 'class_schedule'),
      ('cs_select_anon', 'course_sections'),
      ('co_select_anon', 'course_offerings')
  )
  SELECT count(*) INTO v_missing
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = e.tablename
      AND p.policyname = e.policyname
      AND p.cmd = 'SELECT'
      AND p.roles = ARRAY['anon']::name[]
  );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'TIMETABLE_ANON_POLICY_INVENTORY_MISSING_OR_RENAMED';
  END IF;

  WITH expected(policyname, tablename) AS (
    VALUES
      ('sch_select_anon', 'class_schedule'),
      ('cs_select_anon', 'course_sections'),
      ('co_select_anon', 'course_offerings')
  ), applicable AS (
    SELECT p.policyname, p.tablename
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('class_schedule', 'course_sections', 'course_offerings')
      AND p.cmd IN ('ALL', 'SELECT')
      AND EXISTS (
        SELECT 1
        FROM unnest(p.roles) AS granted_role(role_name)
        WHERE lower(granted_role.role_name::text) = 'public'
           OR lower(granted_role.role_name::text) = 'anon'
           OR (
             lower(granted_role.role_name::text) <> 'public'
             AND pg_catalog.pg_has_role('anon', granted_role.role_name::text, 'MEMBER')
           )
      )
  )
  SELECT count(*) INTO v_unexpected
  FROM applicable a
  LEFT JOIN expected e USING (policyname, tablename)
  WHERE e.policyname IS NULL;

  IF v_unexpected <> 0 THEN
    RAISE EXCEPTION 'TIMETABLE_ANON_UNEXPECTED_APPLICABLE_POLICY';
  END IF;

  -- These direct grants are the compatibility boundary this focused draft must
  -- preserve while removing PUBLIC/anon access.
  FOREACH v_table IN ARRAY ARRAY['class_schedule', 'course_sections', 'course_offerings'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT has_table_privilege('authenticated', format('public.%I', v_table), v_privilege) THEN
        RAISE EXCEPTION 'TIMETABLE_AUTHENTICATED_BASELINE_MISMATCH: %.%', v_table, v_privilege;
      END IF;
    END LOOP;
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', v_table), v_privilege) THEN
        RAISE EXCEPTION 'TIMETABLE_SERVICE_ROLE_BASELINE_MISMATCH: %.%', v_table, v_privilege;
      END IF;
    END LOOP;
  END LOOP;
END
$preflight$;

-- Table privileges and RLS policies are independent gates. PUBLIC is revoked
-- as well as anon because PUBLIC grants are effective for anon through role
-- membership. Any other inherited grant is detected by post-verification.
REVOKE ALL ON TABLE public.class_schedule FROM anon;
REVOKE ALL ON TABLE public.course_sections FROM anon;
REVOKE ALL ON TABLE public.course_offerings FROM anon;
REVOKE ALL ON TABLE public.class_schedule FROM PUBLIC;
REVOKE ALL ON TABLE public.course_sections FROM PUBLIC;
REVOKE ALL ON TABLE public.course_offerings FROM PUBLIC;

DROP POLICY sch_select_anon ON public.class_schedule;
DROP POLICY cs_select_anon ON public.course_sections;
DROP POLICY co_select_anon ON public.course_offerings;

DO $postverify$
DECLARE
  v_table text;
  v_privilege text;
  v_applicable_policy_count integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['class_schedule', 'course_sections', 'course_offerings'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('anon', format('public.%I', v_table), v_privilege) THEN
        RAISE EXCEPTION 'TIMETABLE_ANON_EFFECTIVE_PRIVILEGE_REMAINS: %.%', v_table, v_privilege;
      END IF;
    END LOOP;
  END LOOP;

  SELECT count(*) INTO v_applicable_policy_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('class_schedule', 'course_sections', 'course_offerings')
    AND p.cmd IN ('ALL', 'SELECT')
    AND EXISTS (
      SELECT 1
      FROM unnest(p.roles) AS granted_role(role_name)
      WHERE lower(granted_role.role_name::text) = 'public'
         OR lower(granted_role.role_name::text) = 'anon'
         OR (
           lower(granted_role.role_name::text) <> 'public'
           AND pg_catalog.pg_has_role('anon', granted_role.role_name::text, 'MEMBER')
         )
    );
  IF v_applicable_policy_count <> 0 THEN
    RAISE EXCEPTION 'TIMETABLE_ANON_EFFECTIVE_SELECT_POLICY_REMAINS';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['class_schedule', 'course_sections', 'course_offerings'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT has_table_privilege('authenticated', format('public.%I', v_table), v_privilege) THEN
        RAISE EXCEPTION 'TIMETABLE_AUTHENTICATED_PRIVILEGE_CHANGED: %.%', v_table, v_privilege;
      END IF;
    END LOOP;
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', v_table), v_privilege) THEN
        RAISE EXCEPTION 'TIMETABLE_SERVICE_ROLE_PRIVILEGE_CHANGED: %.%', v_table, v_privilege;
      END IF;
    END LOOP;
  END LOOP;
END
$postverify$;

COMMIT;

-- Authenticated access is intentionally unchanged in this focused correction.
-- The existing authenticated SELECT policies are broad (USING (true)); they are
-- not evidence of student enrollment, faculty ownership, or administrative
-- scope. A separate reviewed migration must replace them with least-privilege
-- policies based on exact student_enrollments.course_section_id, direct faculty
-- assignment, and explicitly authorized administrative roles. Do not restore
-- anonymous access as a compatibility fallback.
