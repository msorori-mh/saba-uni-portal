-- =============================================================================
-- GP-LEVEL4-PRODUCTION-TESTONLY-FINGERPRINT-01.sql
-- Mission: GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURE-PACKAGE-01
-- Marker:  TEST_ONLY_GP_LEVEL4_RECLOSURE_01
--
-- Read-only fingerprint verifier for PRE_E2E / POST_E2E / POST_CLEANUP phases.
--
--   SET gp.l4_fixture.fingerprint_phase = 'PRE_E2E';      -- default
--   SET gp.l4_fixture.fingerprint_phase = 'POST_E2E';
--   SET gp.l4_fixture.fingerprint_phase = 'POST_CLEANUP';
--
-- Emits notice JSON and raises on contract mismatch.
-- NO writes. NO production mutation.
-- =============================================================================

BEGIN;

DO $fp$
DECLARE
  c_marker constant text := 'TEST_ONLY_GP_LEVEL4_RECLOSURE_01';
  v_phase  text := coalesce(
    nullif(current_setting('gp.l4_fixture.fingerprint_phase', true), ''),
    'PRE_E2E'
  );

  c_p1 constant uuid := 'a4e40100-0000-4000-a500-000000000001';
  c_p2 constant uuid := 'a4e40100-0000-4000-a500-000000000002';
  c_p3 constant uuid := 'a4e40100-0000-4000-a500-000000000003';
  c_p4 constant uuid := 'a4e40100-0000-4000-a500-000000000004';
  c_u_dual constant uuid := 'a4e40100-0000-4000-a100-000000000008';
  c_sp_ambiguous constant uuid := 'a4e40100-0000-4000-a300-000000000007';
  c_sp_unknown constant uuid := 'a4e40100-0000-4000-a300-000000000006';
  c_sp_leader constant uuid := 'a4e40100-0000-4000-a300-000000000001';
  c_sp_member constant uuid := 'a4e40100-0000-4000-a300-000000000002';
  c_sp_l1 constant uuid := 'a4e40100-0000-4000-a300-000000000003';
  c_sp_l2 constant uuid := 'a4e40100-0000-4000-a300-000000000004';
  c_sp_l3 constant uuid := 'a4e40100-0000-4000-a300-000000000005';
  c_sp_dual constant uuid := 'a4e40100-0000-4000-a300-000000000008';

  v_actor_count integer;
  v_project_count integer;
  v_active_assign integer;
  v_level_pos integer;
  v_level_neg integer;
  v_amb_top integer;
  v_events integer;
  v_files integer;
  v_storage_intents integer;
  v_archived integer;
  v_dual_student boolean;
  v_dual_staff boolean;
  v_collision integer;
  v_fp jsonb;
BEGIN
  IF v_phase NOT IN ('PRE_E2E', 'POST_E2E', 'POST_CLEANUP') THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_PHASE_INVALID: %', v_phase;
  END IF;

  IF v_phase = 'POST_CLEANUP' THEN
    SELECT count(*) INTO v_project_count
    FROM public.graduation_projects WHERE id IN (c_p1, c_p2, c_p3, c_p4);
    SELECT count(*) INTO v_actor_count
    FROM public.student_profiles
    WHERE id IN (c_sp_leader, c_sp_member, c_sp_l1, c_sp_l2, c_sp_l3, c_sp_unknown, c_sp_ambiguous, c_sp_dual);
    IF to_regclass('public.gp_l4_testonly_fixture_registry') IS NOT NULL THEN
      SELECT count(*) INTO v_events
      FROM public.gp_l4_testonly_fixture_registry WHERE marker = c_marker;
    ELSE
      v_events := 0;
    END IF;

    v_fp := jsonb_build_object(
      'phase', v_phase,
      'marker', c_marker,
      'project_count', v_project_count,
      'student_profile_residue', v_actor_count,
      'registry_residue', v_events,
      'status', CASE
        WHEN v_project_count = 0 AND v_actor_count = 0 AND v_events = 0
          THEN 'POST_CLEANUP_ZERO_RESIDUE_PASS'
        ELSE 'POST_CLEANUP_RESIDUE_FAIL'
      END
    );
    RAISE NOTICE 'GP_L4_FINGERPRINT %', v_fp;
    IF v_fp->>'status' <> 'POST_CLEANUP_ZERO_RESIDUE_PASS' THEN
      RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: %', v_fp;
    END IF;
    RETURN;
  END IF;

  -- PRE_E2E / POST_E2E: package must be present
  SELECT count(*) INTO v_actor_count
  FROM (
    SELECT entity_id FROM public.gp_l4_testonly_fixture_registry
    WHERE marker = c_marker AND entity_type = 'auth_user'
  ) a;
  IF v_actor_count = 0 THEN
    -- fallback count from deterministic band
    SELECT count(*) INTO v_actor_count
    FROM auth.users
    WHERE id::text LIKE 'a4e40100-0000-4000-a100-%';
  END IF;

  SELECT count(*) INTO v_project_count
  FROM public.graduation_projects WHERE id IN (c_p1, c_p2, c_p3, c_p4);

  SELECT count(*) INTO v_active_assign
  FROM public.graduation_project_assignments a
  WHERE a.project_id IN (c_p1, c_p2, c_p3, c_p4) AND a.active AND a.ended_at IS NULL;

  SELECT count(*) INTO v_level_pos
  FROM (VALUES (c_sp_leader), (c_sp_member)) s(id)
  WHERE public.student_is_current_fourth_academic_level(s.id);

  SELECT count(*) INTO v_level_neg
  FROM (VALUES (c_sp_l1), (c_sp_l2), (c_sp_l3), (c_sp_unknown), (c_sp_ambiguous), (c_sp_dual)) s(id)
  WHERE NOT public.student_is_current_fourth_academic_level(s.id);

  SELECT count(*) INTO v_amb_top
  FROM (
    SELECT dense_rank() OVER (
      ORDER BY sas.updated_at DESC NULLS LAST, sas.created_at DESC
    ) AS rnk
    FROM public.student_academic_status sas
    WHERE sas.student_profile_id = c_sp_ambiguous
  ) r WHERE r.rnk = 1;

  SELECT count(*) INTO v_events
  FROM public.graduation_project_events e
  WHERE e.project_id IN (c_p1, c_p2, c_p3, c_p4)
    AND e.reason = c_marker;

  SELECT count(*) INTO v_files
  FROM public.graduation_project_files f
  WHERE f.project_id IN (c_p1, c_p2, c_p3, c_p4)
    AND position(c_marker in f.object_key) > 0;

  SELECT count(*) INTO v_storage_intents
  FROM public.graduation_project_files f
  WHERE f.id = 'a4e40100-0000-4000-a700-000000000002'::uuid
    AND f.upload_status = 'pending';

  SELECT count(*) INTO v_archived
  FROM public.graduation_projects p
  WHERE p.id = c_p4 AND p.lifecycle_state = 'archived' AND p.final_decision = 'passed';

  SELECT EXISTS (
    SELECT 1 FROM public.graduation_project_assignments a
    WHERE a.project_id = c_p2 AND a.user_id = c_u_dual AND a.role = 'student' AND a.active
  ) INTO v_dual_student;

  SELECT EXISTS (
    SELECT 1 FROM public.graduation_project_assignments a
    WHERE a.project_id = c_p3 AND a.user_id = c_u_dual AND a.role = 'coordinator' AND a.active
  ) INTO v_dual_staff;

  -- Zero collision with non-test identities (production-shaped names only).
  v_collision := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='student_profiles' AND c.column_name='full_name_ar'
  ) THEN
    EXECUTE format(
      $q$SELECT count(*) FROM public.student_profiles sp
         WHERE sp.id::text LIKE 'a4e40100-0000-4000-a300-%%'
           AND coalesce(sp.full_name_ar, '') NOT LIKE %L$q$,
      '%' || c_marker || '%'
    ) INTO v_collision;
  END IF;

  v_fp := jsonb_build_object(
    'phase', v_phase,
    'marker', c_marker,
    'actor_count', v_actor_count,
    'project_count', v_project_count,
    'active_assignments', v_active_assign,
    'positive_l4_fixtures', v_level_pos,
    'negative_level_fixtures', v_level_neg,
    'ambiguous_top_rank_count', v_amb_top,
    'event_marker_counts', v_events,
    'marked_files', v_files,
    'pending_demotion_intents', v_storage_intents,
    'archived_projects', v_archived,
    'dual_role_student_deny_topology', v_dual_student,
    'dual_role_staff_allow_topology', v_dual_staff,
    'non_test_collision_count', v_collision,
    'expected', jsonb_build_object(
      'actor_count', 15,
      'project_count', 4,
      'positive_l4_fixtures', 2,
      'negative_level_fixtures', 6,
      'ambiguous_top_rank_count', 2,
      'event_marker_counts_min', 4,
      'marked_files', 3,
      'pending_demotion_intents', 1,
      'archived_projects', 1,
      'dual_role_student_deny_topology', true,
      'dual_role_staff_allow_topology', true,
      'non_test_collision_count', 0
    )
  );

  RAISE NOTICE 'GP_L4_FINGERPRINT %', v_fp;

  IF v_actor_count < 15 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: actor_count=% expected 15', v_actor_count;
  END IF;
  IF v_project_count <> 4 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: project_count=% expected 4', v_project_count;
  END IF;
  IF v_level_pos <> 2 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: positive_l4_fixtures=%', v_level_pos;
  END IF;
  IF v_level_neg <> 6 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: negative_level_fixtures=%', v_level_neg;
  END IF;
  IF v_amb_top <> 2 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: ambiguous top rows=%', v_amb_top;
  END IF;
  IF NOT v_dual_student OR NOT v_dual_staff THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: dual-role topology invalid';
  END IF;
  IF v_files <> 3 OR v_storage_intents <> 1 OR v_archived <> 1 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: storage/archive fingerprint drift';
  END IF;
  IF v_events < 4 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: event marker counts=%', v_events;
  END IF;
  IF v_collision <> 0 THEN
    RAISE EXCEPTION 'GP_L4_FINGERPRINT_FAIL: non-test identity collision';
  END IF;

  RAISE NOTICE 'GP_L4_FINGERPRINT_PASS phase=%', v_phase;
END;
$fp$;

ROLLBACK;
