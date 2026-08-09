-- =============================================================================
-- GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURES-01.sql
-- Mission: GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURE-PACKAGE-01
-- Marker:  TEST_ONLY_GP_LEVEL4_RECLOSURE_01
--
-- SOURCE-ONLY operator fixture package. NOT a schema migration.
-- DO NOT place under supabase/migrations.
-- DO NOT apply to production without explicit post-L4-migration gates.
--
-- Default mode: DRY RUN (validates + provisions inside a transaction, then aborts).
-- Execute mode: SET gp.l4_fixture.execute = 'true'; before running (then COMMIT).
--
-- Auth note:
--   Local disposable PG17 stub accepts INSERT INTO auth.users(id).
--   Production Supabase Auth often requires Admin-API pre-provision of the
--   deterministic user UUIDs below. Set gp.l4_fixture.auth_users_preprovisioned=true
--   after those users exist; the package then verifies and continues.
-- =============================================================================

BEGIN;

SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '15s';

DO $provision$
DECLARE
  c_marker           constant text := 'TEST_ONLY_GP_LEVEL4_RECLOSURE_01';
  -- missing GUC => NULL; coalesce so IF NOT execute cannot be skipped
  c_execute          boolean := (coalesce(current_setting('gp.l4_fixture.execute', true), '') = 'true');
  c_auth_preprov     boolean := (coalesce(current_setting('gp.l4_fixture.auth_users_preprovisioned', true), '') = 'true');

  -- Org units (TEST_ONLY deterministic)
  c_dept             constant uuid := 'a4e40100-0000-4000-a200-000000000001';
  c_prog             constant uuid := 'a4e40100-0000-4000-a200-000000000002';
  c_year             constant uuid := 'a4e40100-0000-4000-a200-000000000003';
  c_sem              constant uuid := 'a4e40100-0000-4000-a200-000000000004';

  -- Auth users
  c_u_leader         constant uuid := 'a4e40100-0000-4000-a100-000000000001';
  c_u_member         constant uuid := 'a4e40100-0000-4000-a100-000000000002';
  c_u_l1             constant uuid := 'a4e40100-0000-4000-a100-000000000003';
  c_u_l2             constant uuid := 'a4e40100-0000-4000-a100-000000000004';
  c_u_l3             constant uuid := 'a4e40100-0000-4000-a100-000000000005';
  c_u_unknown        constant uuid := 'a4e40100-0000-4000-a100-000000000006';
  c_u_ambiguous      constant uuid := 'a4e40100-0000-4000-a100-000000000007';
  c_u_dual           constant uuid := 'a4e40100-0000-4000-a100-000000000008';
  c_u_coord          constant uuid := 'a4e40100-0000-4000-a100-000000000009';
  c_u_sup            constant uuid := 'a4e40100-0000-4000-a100-00000000000a';
  c_u_unrel_sup      constant uuid := 'a4e40100-0000-4000-a100-00000000000b';
  c_u_panel1         constant uuid := 'a4e40100-0000-4000-a100-00000000000c';
  c_u_panel2         constant uuid := 'a4e40100-0000-4000-a100-00000000000d';
  c_u_unauth         constant uuid := 'a4e40100-0000-4000-a100-00000000000e';
  c_u_admin_viewer   constant uuid := 'a4e40100-0000-4000-a100-00000000000f';

  -- Student profiles
  c_sp_leader        constant uuid := 'a4e40100-0000-4000-a300-000000000001';
  c_sp_member        constant uuid := 'a4e40100-0000-4000-a300-000000000002';
  c_sp_l1            constant uuid := 'a4e40100-0000-4000-a300-000000000003';
  c_sp_l2            constant uuid := 'a4e40100-0000-4000-a300-000000000004';
  c_sp_l3            constant uuid := 'a4e40100-0000-4000-a300-000000000005';
  c_sp_unknown       constant uuid := 'a4e40100-0000-4000-a300-000000000006';
  c_sp_ambiguous     constant uuid := 'a4e40100-0000-4000-a300-000000000007';
  c_sp_dual          constant uuid := 'a4e40100-0000-4000-a300-000000000008';

  -- Faculty parent + profiles
  c_fac_coord        constant uuid := 'a4e40100-0000-4000-a410-000000000009';
  c_fac_sup          constant uuid := 'a4e40100-0000-4000-a410-00000000000a';
  c_fac_unrel        constant uuid := 'a4e40100-0000-4000-a410-00000000000b';
  c_fac_panel1       constant uuid := 'a4e40100-0000-4000-a410-00000000000c';
  c_fac_panel2       constant uuid := 'a4e40100-0000-4000-a410-00000000000d';
  c_fac_unauth       constant uuid := 'a4e40100-0000-4000-a410-00000000000e';
  c_fac_admin        constant uuid := 'a4e40100-0000-4000-a410-00000000000f';
  c_fac_dual         constant uuid := 'a4e40100-0000-4000-a410-000000000008';

  c_fp_coord         constant uuid := 'a4e40100-0000-4000-a400-000000000009';
  c_fp_sup           constant uuid := 'a4e40100-0000-4000-a400-00000000000a';
  c_fp_unrel         constant uuid := 'a4e40100-0000-4000-a400-00000000000b';
  c_fp_panel1        constant uuid := 'a4e40100-0000-4000-a400-00000000000c';
  c_fp_panel2        constant uuid := 'a4e40100-0000-4000-a400-00000000000d';
  c_fp_unauth        constant uuid := 'a4e40100-0000-4000-a400-00000000000e';
  c_fp_admin         constant uuid := 'a4e40100-0000-4000-a400-00000000000f';
  c_fp_dual          constant uuid := 'a4e40100-0000-4000-a400-000000000008';

  -- Projects
  c_p1               constant uuid := 'a4e40100-0000-4000-a500-000000000001';
  c_p2               constant uuid := 'a4e40100-0000-4000-a500-000000000002';
  c_p3               constant uuid := 'a4e40100-0000-4000-a500-000000000003';
  c_p4               constant uuid := 'a4e40100-0000-4000-a500-000000000004';

  -- Assignments
  c_a_p1_leader      constant uuid := 'a4e40100-0000-4000-a600-000000000001';
  c_a_p1_member      constant uuid := 'a4e40100-0000-4000-a600-000000000002';
  c_a_p1_coord       constant uuid := 'a4e40100-0000-4000-a600-000000000003';
  c_a_p1_sup         constant uuid := 'a4e40100-0000-4000-a600-000000000004';
  c_a_p1_panel1      constant uuid := 'a4e40100-0000-4000-a600-000000000005';
  c_a_p1_panel2      constant uuid := 'a4e40100-0000-4000-a600-000000000006';
  c_a_p2_dual_stu    constant uuid := 'a4e40100-0000-4000-a600-000000000007';
  c_a_p2_coord       constant uuid := 'a4e40100-0000-4000-a600-000000000008';
  c_a_p3_dual_coord  constant uuid := 'a4e40100-0000-4000-a600-000000000009';
  c_a_p4_leader      constant uuid := 'a4e40100-0000-4000-a600-00000000000a';
  c_a_p4_coord       constant uuid := 'a4e40100-0000-4000-a600-00000000000b';

  -- Academic status
  c_sas_leader       constant uuid := 'a4e40100-0000-4000-a510-000000000001';
  c_sas_member       constant uuid := 'a4e40100-0000-4000-a510-000000000002';
  c_sas_l1           constant uuid := 'a4e40100-0000-4000-a510-000000000003';
  c_sas_l2           constant uuid := 'a4e40100-0000-4000-a510-000000000004';
  c_sas_l3           constant uuid := 'a4e40100-0000-4000-a510-000000000005';
  c_sas_dual         constant uuid := 'a4e40100-0000-4000-a510-000000000006';
  c_sas_amb_a        constant uuid := 'a4e40100-0000-4000-a510-000000000007';
  c_sas_amb_b        constant uuid := 'a4e40100-0000-4000-a510-000000000008';

  -- Files (metadata/intents only — no storage bytes in source)
  c_f_p1_active      constant uuid := 'a4e40100-0000-4000-a700-000000000001';
  c_f_p1_pending     constant uuid := 'a4e40100-0000-4000-a700-000000000002';
  c_f_p4_final       constant uuid := 'a4e40100-0000-4000-a700-000000000003';

  c_archive_id       constant uuid := 'a4e40100-0000-4000-a800-000000000001';
  c_corr_seed        constant uuid := 'a4e40100-0000-4000-ac00-000000000001';

  c_tie_ts           constant timestamptz := timestamptz '2026-08-08 10:00:00+00';

  v_level1           uuid;
  v_level2           uuid;
  v_level3           uuid;
  v_level4           uuid;
  v_n                integer;
  v_top              integer;
  v_has_faculty_col  boolean;
  v_has_stu_name     boolean;
  v_has_stu_anum     boolean;
  v_has_fac_name     boolean;
  v_has_fac_fid      boolean;
  v_has_dept_name    boolean;
  v_has_prog_code    boolean;
  v_has_year_name    boolean;
  v_has_sem_code     boolean;
  v_auth_ok          boolean;
  v_uid              uuid;
  v_object_key       text;
  v_sha              text := repeat('a', 64);
BEGIN
  -- =========================================================================
  -- G0 — schema / GP contract gates
  -- =========================================================================
  IF to_regclass('public.graduation_projects') IS NULL THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_SCHEMA_FAIL: graduation_projects missing';
  END IF;
  IF to_regclass('public.graduation_project_assignments') IS NULL THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_SCHEMA_FAIL: graduation_project_assignments missing';
  END IF;
  IF to_regclass('public.student_academic_status') IS NULL THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_SCHEMA_FAIL: student_academic_status missing';
  END IF;
  IF to_regclass('public.academic_levels') IS NULL THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_SCHEMA_FAIL: academic_levels missing';
  END IF;
  IF to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') IS NULL THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_SCHEMA_FAIL: Level-4 predicate missing (migration not applied)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id = 'graduation-projects' AND b.public = false
  ) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_SCHEMA_FAIL: private graduation-projects bucket required';
  END IF;

  -- Fail-closed already-exists (deterministic project ids)
  SELECT count(*) INTO v_n
  FROM public.graduation_projects p
  WHERE p.id IN (c_p1, c_p2, c_p3, c_p4);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_ALREADY_EXISTS: % package project(s) already present; cleanup first', v_n;
  END IF;

  -- Collision guard: refuse if any non-package profile already owns our deterministic IDs
  -- under a different marker naming pattern (profiles without TEST_ONLY marker names).
  -- Our inserts use exclusive UUID band a4e40100-0000-4000-*.

  SELECT id INTO v_level1 FROM public.academic_levels WHERE level_number = 1 LIMIT 1;
  SELECT id INTO v_level2 FROM public.academic_levels WHERE level_number = 2 LIMIT 1;
  SELECT id INTO v_level3 FROM public.academic_levels WHERE level_number = 3 LIMIT 1;
  SELECT id INTO v_level4 FROM public.academic_levels WHERE level_number = 4 LIMIT 1;
  IF v_level1 IS NULL OR v_level2 IS NULL OR v_level3 IS NULL OR v_level4 IS NULL THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_LEVELS_FAIL: academic_levels 1..4 required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='faculty' AND column_name='employee_id'
  ) INTO v_has_faculty_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='student_profiles' AND column_name='full_name_ar'
  ) INTO v_has_stu_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='student_profiles' AND column_name='academic_number'
  ) INTO v_has_stu_anum;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='faculty_profiles' AND column_name='full_name_ar'
  ) INTO v_has_fac_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='faculty_profiles' AND column_name='faculty_id'
  ) INTO v_has_fac_fid;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='departments' AND column_name='name_ar'
  ) INTO v_has_dept_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='programs' AND column_name='code'
  ) INTO v_has_prog_code;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='academic_years' AND column_name='name'
  ) INTO v_has_year_name;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='semesters' AND column_name='code'
  ) INTO v_has_sem_code;

  -- Registry
  CREATE TABLE IF NOT EXISTS public.gp_l4_testonly_fixture_registry (
    marker text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    actor_code text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (marker, entity_type, entity_id)
  );

  CREATE TABLE IF NOT EXISTS public.gp_test_manifest_markers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    marker_tag text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.gp_test_manifest_markers(marker_tag)
  VALUES (c_marker)
  ON CONFLICT (marker_tag) DO NOTHING;

  -- =========================================================================
  -- Auth users
  -- =========================================================================
  FOREACH v_uid IN ARRAY ARRAY[
    c_u_leader, c_u_member, c_u_l1, c_u_l2, c_u_l3, c_u_unknown, c_u_ambiguous, c_u_dual,
    c_u_coord, c_u_sup, c_u_unrel_sup, c_u_panel1, c_u_panel2, c_u_unauth, c_u_admin_viewer
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
      CONTINUE;
    END IF;
    IF c_auth_preprov THEN
      RAISE EXCEPTION 'GP_L4_FIXTURE_AUTH_MISSING: expected preprovisioned auth.users %', v_uid;
    END IF;
    BEGIN
      EXECUTE 'INSERT INTO auth.users(id) VALUES ($1)' USING v_uid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION
        'GP_L4_FIXTURE_AUTH_PROVISION_FAIL: cannot insert auth.users(%). Pre-create via Auth Admin API then set gp.l4_fixture.auth_users_preprovisioned=true. detail=%',
        v_uid, SQLERRM;
    END;
  END LOOP;

  -- Collision: refuse if deterministic profile IDs exist but are not ours
  -- (already-exists projects already gated; profiles checked for foreign ownership)
  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id IN (c_sp_leader, c_sp_member, c_sp_l1, c_sp_l2, c_sp_l3, c_sp_unknown, c_sp_ambiguous, c_sp_dual)
      AND (sp.user_id IS DISTINCT FROM
        CASE sp.id
          WHEN c_sp_leader THEN c_u_leader
          WHEN c_sp_member THEN c_u_member
          WHEN c_sp_l1 THEN c_u_l1
          WHEN c_sp_l2 THEN c_u_l2
          WHEN c_sp_l3 THEN c_u_l3
          WHEN c_sp_unknown THEN c_u_unknown
          WHEN c_sp_ambiguous THEN c_u_ambiguous
          WHEN c_sp_dual THEN c_u_dual
        END)
  ) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_COLLISION: student_profiles UUID band occupied by non-package identity';
  END IF;

  -- =========================================================================
  -- Org units (TEST_ONLY)
  -- =========================================================================
  IF v_has_dept_name THEN
    EXECUTE format(
      'INSERT INTO public.departments(id, name_ar, name_en, is_active, sort_order)
       VALUES (%L::uuid, %L, %L, true, 9990)
       ON CONFLICT (id) DO NOTHING',
      c_dept,
      c_marker || ' DEPT',
      c_marker || ' DEPT'
    );
  ELSE
    INSERT INTO public.departments(id) VALUES (c_dept) ON CONFLICT DO NOTHING;
  END IF;

  IF v_has_prog_code THEN
    EXECUTE format(
      'INSERT INTO public.programs(id, code, name_ar, name_en, department_id, is_active, sort_order, status)
       VALUES (%L::uuid, %L, %L, %L, %L::uuid, true, 9990, %L)
       ON CONFLICT (id) DO NOTHING',
      c_prog,
      'GPL4T01',
      c_marker || ' PROG',
      c_marker || ' PROG',
      c_dept,
      'active'
    );
  ELSE
    INSERT INTO public.programs(id) VALUES (c_prog) ON CONFLICT DO NOTHING;
  END IF;

  IF v_has_year_name THEN
    EXECUTE format(
      'INSERT INTO public.academic_years(id, name, start_date, end_date, is_current, status)
       VALUES (%L::uuid, %L, DATE %L, DATE %L, false, %L)
       ON CONFLICT (id) DO NOTHING',
      c_year,
      c_marker || ' YEAR',
      '2025-09-01',
      '2026-08-31',
      'active'
    );
  ELSE
    INSERT INTO public.academic_years(id) VALUES (c_year) ON CONFLICT DO NOTHING;
  END IF;

  IF v_has_sem_code THEN
    EXECUTE format(
      'INSERT INTO public.semesters(id, academic_year_id, code, name, start_date, end_date, is_current, status)
       VALUES (%L::uuid, %L::uuid, %L, %L, DATE %L, DATE %L, false, %L)
       ON CONFLICT (id) DO NOTHING',
      c_sem, c_year, 'GPL4S1', c_marker || ' SEM', '2026-02-01', '2026-06-30', 'active'
    );
  ELSE
    INSERT INTO public.semesters(id) VALUES (c_sem) ON CONFLICT DO NOTHING;
  END IF;

  -- =========================================================================
  -- Student profiles (8)
  -- =========================================================================
  IF v_has_stu_name AND v_has_stu_anum THEN
    EXECUTE format(
      'INSERT INTO public.student_profiles(
         id, user_id, department_id, program_id, academic_number, full_name_ar, full_name_en, status
       ) VALUES
         (%1$L::uuid,%2$L::uuid,%3$L::uuid,%4$L::uuid,%5$L,%6$L,%7$L,%8$L),
         (%9$L::uuid,%10$L::uuid,%3$L::uuid,%4$L::uuid,%11$L,%12$L,%13$L,%8$L),
         (%14$L::uuid,%15$L::uuid,%3$L::uuid,%4$L::uuid,%16$L,%17$L,%18$L,%8$L),
         (%19$L::uuid,%20$L::uuid,%3$L::uuid,%4$L::uuid,%21$L,%22$L,%23$L,%8$L),
         (%24$L::uuid,%25$L::uuid,%3$L::uuid,%4$L::uuid,%26$L,%27$L,%28$L,%8$L),
         (%29$L::uuid,%30$L::uuid,%3$L::uuid,%4$L::uuid,%31$L,%32$L,%33$L,%8$L),
         (%34$L::uuid,%35$L::uuid,%3$L::uuid,%4$L::uuid,%36$L,%37$L,%38$L,%8$L),
         (%39$L::uuid,%40$L::uuid,%3$L::uuid,%4$L::uuid,%41$L,%42$L,%43$L,%8$L)
       ON CONFLICT (id) DO NOTHING',
      c_sp_leader, c_u_leader, c_dept, c_prog, 'GPL4-LEAD-001', c_marker || ' LEADER', 'GP_L4_TEST_LEADER', 'active',
      c_sp_member, c_u_member, 'GPL4-MEMB-002', c_marker || ' MEMBER', 'GP_L4_TEST_MEMBER',
      c_sp_l1, c_u_l1, 'GPL4-L1-003', c_marker || ' L1', 'GP_L1_NEGATIVE',
      c_sp_l2, c_u_l2, 'GPL4-L2-004', c_marker || ' L2', 'GP_L2_NEGATIVE',
      c_sp_l3, c_u_l3, 'GPL4-L3-005', c_marker || ' L3', 'GP_L3_NEGATIVE',
      c_sp_unknown, c_u_unknown, 'GPL4-UNK-006', c_marker || ' UNKNOWN', 'GP_LEVEL_UNKNOWN_NEGATIVE',
      c_sp_ambiguous, c_u_ambiguous, 'GPL4-AMB-007', c_marker || ' AMBIGUOUS', 'GP_LEVEL_AMBIGUOUS_NEGATIVE',
      c_sp_dual, c_u_dual, 'GPL4-DUAL-008', c_marker || ' DUAL', 'GP_DUAL_ROLE'
    );
  ELSE
    INSERT INTO public.student_profiles(id, user_id, department_id) VALUES
      (c_sp_leader, c_u_leader, c_dept),
      (c_sp_member, c_u_member, c_dept),
      (c_sp_l1, c_u_l1, c_dept),
      (c_sp_l2, c_u_l2, c_dept),
      (c_sp_l3, c_u_l3, c_dept),
      (c_sp_unknown, c_u_unknown, c_dept),
      (c_sp_ambiguous, c_u_ambiguous, c_dept),
      (c_sp_dual, c_u_dual, c_dept)
    ON CONFLICT DO NOTHING;
  END IF;

  -- =========================================================================
  -- Faculty catalog + profiles (7 staff + dual-role faculty seat)
  -- =========================================================================
  IF v_has_faculty_col AND v_has_fac_fid AND v_has_fac_name THEN
    EXECUTE format(
      'INSERT INTO public.faculty(id, employee_id, full_name_ar, full_name_en, category, is_active, sort_order)
       VALUES
         (%1$L::uuid,%2$L,%3$L,%4$L,%5$L,true,9990),
         (%6$L::uuid,%7$L,%8$L,%9$L,%5$L,true,9991),
         (%10$L::uuid,%11$L,%12$L,%13$L,%5$L,true,9992),
         (%14$L::uuid,%15$L,%16$L,%17$L,%5$L,true,9993),
         (%18$L::uuid,%19$L,%20$L,%21$L,%5$L,true,9994),
         (%22$L::uuid,%23$L,%24$L,%25$L,%5$L,true,9995),
         (%26$L::uuid,%27$L,%28$L,%29$L,%5$L,true,9996),
         (%30$L::uuid,%31$L,%32$L,%33$L,%5$L,true,9997)
       ON CONFLICT (id) DO NOTHING',
      c_fac_coord, 'GPL4-FAC-009', c_marker || ' COORD', 'GP_TEST_COORDINATOR', 'academic',
      c_fac_sup, 'GPL4-FAC-00A', c_marker || ' SUP', 'GP_TEST_SUPERVISOR',
      c_fac_unrel, 'GPL4-FAC-00B', c_marker || ' UNREL_SUP', 'GP_TEST_UNRELATED_SUPERVISOR',
      c_fac_panel1, 'GPL4-FAC-00C', c_marker || ' PANEL1', 'GP_TEST_PANEL_1',
      c_fac_panel2, 'GPL4-FAC-00D', c_marker || ' PANEL2', 'GP_TEST_PANEL_2',
      c_fac_unauth, 'GPL4-FAC-00E', c_marker || ' UNAUTH', 'GP_TEST_UNAUTHORIZED_STAFF',
      c_fac_admin, 'GPL4-FAC-00F', c_marker || ' ADMIN_VIEWER', 'GP_TEST_ADMIN_VIEWER',
      c_fac_dual, 'GPL4-FAC-008', c_marker || ' DUAL_FAC', 'GP_DUAL_ROLE_FACULTY'
    );

    EXECUTE format(
      'INSERT INTO public.faculty_profiles(
         id, faculty_id, user_id, department_id, program_id, full_name_ar, full_name_en, status
       ) VALUES
         (%1$L::uuid,%2$L::uuid,%3$L::uuid,%4$L::uuid,%5$L::uuid,%6$L,%7$L,%8$L),
         (%9$L::uuid,%10$L::uuid,%11$L::uuid,%4$L::uuid,%5$L::uuid,%12$L,%13$L,%8$L),
         (%14$L::uuid,%15$L::uuid,%16$L::uuid,%4$L::uuid,%5$L::uuid,%17$L,%18$L,%8$L),
         (%19$L::uuid,%20$L::uuid,%21$L::uuid,%4$L::uuid,%5$L::uuid,%22$L,%23$L,%8$L),
         (%24$L::uuid,%25$L::uuid,%26$L::uuid,%4$L::uuid,%5$L::uuid,%27$L,%28$L,%8$L),
         (%29$L::uuid,%30$L::uuid,%31$L::uuid,%4$L::uuid,%5$L::uuid,%32$L,%33$L,%8$L),
         (%34$L::uuid,%35$L::uuid,%36$L::uuid,%4$L::uuid,%5$L::uuid,%37$L,%38$L,%8$L),
         (%39$L::uuid,%40$L::uuid,%41$L::uuid,%4$L::uuid,%5$L::uuid,%42$L,%43$L,%8$L)
       ON CONFLICT (id) DO NOTHING',
      c_fp_coord, c_fac_coord, c_u_coord, c_dept, c_prog, c_marker || ' COORD', 'GP_TEST_COORDINATOR', 'active',
      c_fp_sup, c_fac_sup, c_u_sup, c_marker || ' SUP', 'GP_TEST_SUPERVISOR',
      c_fp_unrel, c_fac_unrel, c_u_unrel_sup, c_marker || ' UNREL_SUP', 'GP_TEST_UNRELATED_SUPERVISOR',
      c_fp_panel1, c_fac_panel1, c_u_panel1, c_marker || ' PANEL1', 'GP_TEST_PANEL_1',
      c_fp_panel2, c_fac_panel2, c_u_panel2, c_marker || ' PANEL2', 'GP_TEST_PANEL_2',
      c_fp_unauth, c_fac_unauth, c_u_unauth, c_marker || ' UNAUTH', 'GP_TEST_UNAUTHORIZED_STAFF',
      c_fp_admin, c_fac_admin, c_u_admin_viewer, c_marker || ' ADMIN_VIEWER', 'GP_TEST_ADMIN_VIEWER',
      c_fp_dual, c_fac_dual, c_u_dual, c_marker || ' DUAL_FAC', 'GP_DUAL_ROLE_FACULTY'
    );
  ELSE
    INSERT INTO public.faculty_profiles(id, user_id, department_id) VALUES
      (c_fp_coord, c_u_coord, c_dept),
      (c_fp_sup, c_u_sup, c_dept),
      (c_fp_unrel, c_u_unrel_sup, c_dept),
      (c_fp_panel1, c_u_panel1, c_dept),
      (c_fp_panel2, c_u_panel2, c_dept),
      (c_fp_unauth, c_u_unauth, c_dept),
      (c_fp_admin, c_u_admin_viewer, c_dept),
      (c_fp_dual, c_u_dual, c_dept)
    ON CONFLICT DO NOTHING;
  END IF;

  -- =========================================================================
  -- Academic status fixtures
  -- Canonical order: updated_at DESC NULLS LAST, created_at DESC
  -- =========================================================================
  INSERT INTO public.student_academic_status(
    id, student_profile_id, academic_year_id, semester_id, level_id, enrollment_status, created_at, updated_at
  ) VALUES
    (c_sas_leader, c_sp_leader, c_year, c_sem, v_level4, 'enrolled',
      timestamptz '2026-08-01 08:00:00+00', timestamptz '2026-08-07 12:00:00+00'),
    (c_sas_member, c_sp_member, c_year, c_sem, v_level4, 'enrolled',
      timestamptz '2026-08-01 08:00:00+00', timestamptz '2026-08-07 12:00:00+00'),
    (c_sas_l1, c_sp_l1, c_year, c_sem, v_level1, 'enrolled',
      timestamptz '2026-08-01 08:00:00+00', timestamptz '2026-08-07 12:00:00+00'),
    (c_sas_l2, c_sp_l2, c_year, c_sem, v_level2, 'enrolled',
      timestamptz '2026-08-01 08:00:00+00', timestamptz '2026-08-07 12:00:00+00'),
    (c_sas_l3, c_sp_l3, c_year, c_sem, v_level3, 'enrolled',
      timestamptz '2026-08-01 08:00:00+00', timestamptz '2026-08-07 12:00:00+00'),
    -- Dual-role student path: authoritative non-L4 (L3)
    (c_sas_dual, c_sp_dual, c_year, c_sem, v_level3, 'enrolled',
      timestamptz '2026-08-01 08:00:00+00', timestamptz '2026-08-07 12:00:00+00'),
    -- Ambiguous: two top-ranked rows truly tie on (updated_at, created_at)
    (c_sas_amb_a, c_sp_ambiguous, c_year, c_sem, v_level4, 'enrolled', c_tie_ts, c_tie_ts),
    (c_sas_amb_b, c_sp_ambiguous, c_year, c_sem, v_level3, 'enrolled', c_tie_ts, c_tie_ts)
  ON CONFLICT (id) DO NOTHING;
  -- GP_LEVEL_UNKNOWN_NEGATIVE: intentionally no student_academic_status row

  -- Ambiguity verifier (canonical ordering)
  SELECT count(*) INTO v_top
  FROM (
    SELECT dense_rank() OVER (
      ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC
    ) AS rnk
    FROM public.student_academic_status sas
    WHERE sas.student_profile_id = c_sp_ambiguous
  ) r
  WHERE r.rnk = 1;
  IF v_top <> 2 THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_AMBIGUITY_FAIL: expected 2 tied top rows, got %', v_top;
  END IF;
  IF public.student_is_current_fourth_academic_level(c_sp_ambiguous) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_AMBIGUITY_FAIL: ambiguous actor must deny L4 predicate';
  END IF;
  IF public.student_is_current_fourth_academic_level(c_sp_unknown) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_UNKNOWN_FAIL: unknown actor must deny L4 predicate';
  END IF;
  IF NOT public.student_is_current_fourth_academic_level(c_sp_leader) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_L4_POSITIVE_FAIL: leader must be L4';
  END IF;
  IF NOT public.student_is_current_fourth_academic_level(c_sp_member) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_L4_POSITIVE_FAIL: member must be L4';
  END IF;
  IF public.student_is_current_fourth_academic_level(c_sp_l1)
     OR public.student_is_current_fourth_academic_level(c_sp_l2)
     OR public.student_is_current_fourth_academic_level(c_sp_l3)
     OR public.student_is_current_fourth_academic_level(c_sp_dual) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_NEGATIVE_LEVEL_FAIL: L1/L2/L3/dual must deny';
  END IF;

  -- =========================================================================
  -- Department coordinators (coord + admin_viewer overview capability)
  -- =========================================================================
  INSERT INTO public.graduation_project_department_coordinators(
    department_id, faculty_profile_id, user_id, assigned_by
  ) VALUES
    (c_dept, c_fp_coord, c_u_coord, c_u_coord),
    (c_dept, c_fp_admin, c_u_admin_viewer, c_u_coord),
    -- Dual-role staff capability on Project B path also needs coordinator seat
    (c_dept, c_fp_dual, c_u_dual, c_u_coord)
  ON CONFLICT DO NOTHING;

  -- =========================================================================
  -- Projects
  -- P1 positive L4 lifecycle | P2 dual student deny | P3 dual staff allow | P4 archive
  -- =========================================================================
  INSERT INTO public.graduation_projects(
    id, department_id, program_id, academic_year_id, semester_id,
    title, problem_statement, objectives, summary, lifecycle_state, version
  ) VALUES
    (c_p1, c_dept, c_prog, c_year, c_sem,
      c_marker || ' P1 POSITIVE L4',
      c_marker || ' problem', c_marker || ' objectives', c_marker || ' summary',
      'draft', 1),
    (c_p2, c_dept, c_prog, c_year, c_sem,
      c_marker || ' P2 DUAL STUDENT DENY',
      c_marker || ' problem', c_marker || ' objectives', c_marker || ' summary',
      'draft', 1),
    (c_p3, c_dept, c_prog, c_year, c_sem,
      c_marker || ' P3 DUAL STAFF ALLOW',
      c_marker || ' problem', c_marker || ' objectives', c_marker || ' summary',
      'draft', 1),
    (c_p4, c_dept, c_prog, c_year, c_sem,
      c_marker || ' P4 ARCHIVE IMMUTABLE',
      c_marker || ' problem', c_marker || ' objectives', c_marker || ' summary',
      'archived', 1);

  UPDATE public.graduation_projects
  SET final_decision = 'passed',
      archived_at = timestamptz '2026-08-08 15:00:00+00',
      approved_at = timestamptz '2026-08-01 12:00:00+00'
  WHERE id = c_p4;

  -- Assignments
  INSERT INTO public.graduation_project_assignments(
    id, project_id, role, student_profile_id, faculty_profile_id, user_id,
    department_id, is_leader, supervision_status, assigned_by
  ) VALUES
    (c_a_p1_leader, c_p1, 'student', c_sp_leader, NULL, c_u_leader, c_dept, true, NULL, c_u_coord),
    (c_a_p1_member, c_p1, 'student', c_sp_member, NULL, c_u_member, c_dept, false, NULL, c_u_coord),
    (c_a_p1_coord, c_p1, 'coordinator', NULL, c_fp_coord, c_u_coord, c_dept, false, NULL, c_u_coord),
    (c_a_p1_sup, c_p1, 'supervisor', NULL, c_fp_sup, c_u_sup, c_dept, false, 'accepted', c_u_coord),
    (c_a_p1_panel1, c_p1, 'panel_member', NULL, c_fp_panel1, c_u_panel1, c_dept, false, NULL, c_u_coord),
    (c_a_p1_panel2, c_p1, 'panel_member', NULL, c_fp_panel2, c_u_panel2, c_dept, false, NULL, c_u_coord),
    -- P2: dual-role as student (non-L4) — expected DENY on student path
    (c_a_p2_dual_stu, c_p2, 'student', c_sp_dual, NULL, c_u_dual, c_dept, true, NULL, c_u_coord),
    (c_a_p2_coord, c_p2, 'coordinator', NULL, c_fp_coord, c_u_coord, c_dept, false, NULL, c_u_coord),
    -- P3: dual-role as coordinator — expected ALLOW on staff path
    (c_a_p3_dual_coord, c_p3, 'coordinator', NULL, c_fp_dual, c_u_dual, c_dept, false, NULL, c_u_coord),
    -- P4 archived evidence actors
    -- Leader seat is historical (inactive): one_active_student_team forbids a second
    -- active student assignment for the same user who already leads P1.
    (c_a_p4_coord, c_p4, 'coordinator', NULL, c_fp_coord, c_u_coord, c_dept, false, NULL, c_u_coord);

  INSERT INTO public.graduation_project_assignments(
    id, project_id, role, student_profile_id, faculty_profile_id, user_id,
    department_id, is_leader, supervision_status, active, assigned_at, ended_at, assigned_by
  ) VALUES (
    c_a_p4_leader, c_p4, 'student', c_sp_leader, NULL, c_u_leader, c_dept, true, NULL,
    false, timestamptz '2026-07-01 10:00:00+00', timestamptz '2026-08-08 14:00:00+00', c_u_coord
  );

  -- Storage intents / file metadata (NO fake bytes in storage.objects)
  -- Keys embed marker for safe cleanup identification.
  v_object_key := 'graduation-projects/' || c_p1::text || '/proposal/' || c_marker || '-' || c_f_p1_active::text || '-signed-download.pdf';
  INSERT INTO public.graduation_project_files(
    id, project_id, category, object_key, original_name, media_type, byte_size, sha256,
    upload_status, scan_state, is_current, uploaded_by_assignment_id, finalized_at
  ) VALUES (
    c_f_p1_active, c_p1, 'proposal', v_object_key,
    c_marker || '-signed-download.pdf', 'application/pdf', 2048, v_sha,
    'active', 'clean', true, c_a_p1_leader, timestamptz '2026-08-07 12:00:00+00'
  );

  v_object_key := 'graduation-projects/' || c_p1::text || '/proposal/' || c_marker || '-' || c_f_p1_pending::text || '-pending-demotion.pdf';
  INSERT INTO public.graduation_project_files(
    id, project_id, category, object_key, original_name, media_type, byte_size,
    upload_status, scan_state, is_current, uploaded_by_assignment_id
  ) VALUES (
    c_f_p1_pending, c_p1, 'proposal', v_object_key,
    c_marker || '-pending-demotion.pdf', 'application/pdf', 1024,
    'pending', 'pending', false, c_a_p1_member
  );

  v_object_key := 'graduation-projects/' || c_p4::text || '/final/' || c_marker || '-' || c_f_p4_final::text || '-archived-final.pdf';
  INSERT INTO public.graduation_project_files(
    id, project_id, category, object_key, original_name, media_type, byte_size, sha256,
    upload_status, scan_state, is_current, uploaded_by_assignment_id, finalized_at
  ) VALUES (
    c_f_p4_final, c_p4, 'final', v_object_key,
    c_marker || '-archived-final.pdf', 'application/pdf', 4096, v_sha,
    'active', 'clean', true, c_a_p4_leader, timestamptz '2026-08-08 13:00:00+00'
  );

  INSERT INTO public.graduation_project_final_archives(
    id, project_id, final_file_id, archived_by_assignment_id, snapshot,
    average_score, final_decision, correlation_id, archived_at
  ) VALUES (
    c_archive_id, c_p4, c_f_p4_final, c_a_p4_coord,
    jsonb_build_object('marker', c_marker, 'project', 'P4', 'purpose', 'archive_immutability'),
    88.50, 'passed', c_corr_seed, timestamptz '2026-08-08 15:00:00+00'
  );

  -- Marker events (append-only; correlation unique per project/event_type)
  INSERT INTO public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
    reason, correlation_id, payload
  ) VALUES
    (c_p1, c_u_coord, c_a_p1_coord, 'test_only_fixture_seed', 'project', c_p1,
      c_marker, 'a4e40100-0000-4000-ac00-000000000011',
      jsonb_build_object('marker', c_marker, 'project', 'P1')),
    (c_p2, c_u_coord, c_a_p2_coord, 'test_only_fixture_seed', 'project', c_p2,
      c_marker, 'a4e40100-0000-4000-ac00-000000000012',
      jsonb_build_object('marker', c_marker, 'project', 'P2')),
    (c_p3, c_u_dual, c_a_p3_dual_coord, 'test_only_fixture_seed', 'project', c_p3,
      c_marker, 'a4e40100-0000-4000-ac00-000000000013',
      jsonb_build_object('marker', c_marker, 'project', 'P3')),
    (c_p4, c_u_coord, c_a_p4_coord, 'test_only_fixture_seed', 'project', c_p4,
      c_marker, 'a4e40100-0000-4000-ac00-000000000014',
      jsonb_build_object('marker', c_marker, 'project', 'P4', 'archived', true));

  -- Registry inventory
  INSERT INTO public.gp_l4_testonly_fixture_registry(marker, entity_type, entity_id, actor_code, meta)
  VALUES
    (c_marker, 'department', c_dept, NULL, jsonb_build_object('code','ORG_DEPT')),
    (c_marker, 'program', c_prog, NULL, jsonb_build_object('code','ORG_PROG')),
    (c_marker, 'academic_year', c_year, NULL, jsonb_build_object('code','ORG_YEAR')),
    (c_marker, 'semester', c_sem, NULL, jsonb_build_object('code','ORG_SEM')),
    (c_marker, 'auth_user', c_u_leader, 'GP_L4_TEST_LEADER', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_member, 'GP_L4_TEST_MEMBER', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_l1, 'GP_L1_NEGATIVE', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_l2, 'GP_L2_NEGATIVE', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_l3, 'GP_L3_NEGATIVE', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_unknown, 'GP_LEVEL_UNKNOWN_NEGATIVE', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_ambiguous, 'GP_LEVEL_AMBIGUOUS_NEGATIVE', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_dual, 'GP_DUAL_ROLE', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_coord, 'GP_TEST_COORDINATOR', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_sup, 'GP_TEST_SUPERVISOR', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_unrel_sup, 'GP_TEST_UNRELATED_SUPERVISOR', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_panel1, 'GP_TEST_PANEL_1', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_panel2, 'GP_TEST_PANEL_2', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_unauth, 'GP_TEST_UNAUTHORIZED_STAFF', '{}'::jsonb),
    (c_marker, 'auth_user', c_u_admin_viewer, 'GP_TEST_ADMIN_VIEWER', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_leader, 'GP_L4_TEST_LEADER', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_member, 'GP_L4_TEST_MEMBER', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_l1, 'GP_L1_NEGATIVE', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_l2, 'GP_L2_NEGATIVE', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_l3, 'GP_L3_NEGATIVE', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_unknown, 'GP_LEVEL_UNKNOWN_NEGATIVE', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_ambiguous, 'GP_LEVEL_AMBIGUOUS_NEGATIVE', '{}'::jsonb),
    (c_marker, 'student_profile', c_sp_dual, 'GP_DUAL_ROLE', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_coord, 'GP_TEST_COORDINATOR', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_sup, 'GP_TEST_SUPERVISOR', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_unrel, 'GP_TEST_UNRELATED_SUPERVISOR', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_panel1, 'GP_TEST_PANEL_1', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_panel2, 'GP_TEST_PANEL_2', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_unauth, 'GP_TEST_UNAUTHORIZED_STAFF', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_admin, 'GP_TEST_ADMIN_VIEWER', '{}'::jsonb),
    (c_marker, 'faculty_profile', c_fp_dual, 'GP_DUAL_ROLE', '{}'::jsonb),
    (c_marker, 'project', c_p1, 'P1', jsonb_build_object('purpose','positive_l4_lifecycle')),
    (c_marker, 'project', c_p2, 'P2', jsonb_build_object('purpose','dual_role_student_deny')),
    (c_marker, 'project', c_p3, 'P3', jsonb_build_object('purpose','dual_role_staff_allow')),
    (c_marker, 'project', c_p4, 'P4', jsonb_build_object('purpose','archive_immutability')),
    (c_marker, 'file', c_f_p1_active, 'STORAGE_SIGNED_DOWNLOAD_POSITIVE', '{}'::jsonb),
    (c_marker, 'file', c_f_p1_pending, 'STORAGE_PENDING_DEMOTION', '{}'::jsonb),
    (c_marker, 'file', c_f_p4_final, 'STORAGE_ARCHIVED_FINAL', '{}'::jsonb),
    (c_marker, 'archive', c_archive_id, 'P4_ARCHIVE', '{}'::jsonb)
  ON CONFLICT DO NOTHING;

  -- Dual-role topology assertion
  IF NOT EXISTS (
    SELECT 1 FROM public.graduation_project_assignments a
    WHERE a.id = c_a_p2_dual_stu AND a.role = 'student' AND a.active
      AND a.user_id = c_u_dual AND a.project_id = c_p2
  ) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_DUAL_ROLE_FAIL: P2 student assignment missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.graduation_project_assignments a
    WHERE a.id = c_a_p3_dual_coord AND a.role = 'coordinator' AND a.active
      AND a.user_id = c_u_dual AND a.project_id = c_p3
  ) THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_DUAL_ROLE_FAIL: P3 coordinator assignment missing';
  END IF;

  RAISE NOTICE 'GP_L4_FIXTURE_PROVISION_BUILT marker=% actors=15 projects=4 execute=%', c_marker, c_execute;

  IF NOT c_execute THEN
    RAISE EXCEPTION 'GP_L4_FIXTURE_DRY_RUN: provisioning validated; transaction will roll back. Set gp.l4_fixture.execute=true to commit.';
  END IF;

  RAISE NOTICE 'GP_L4_FIXTURE_PROVISION_COMMIT marker=%', c_marker;
END;
$provision$;

COMMIT;
