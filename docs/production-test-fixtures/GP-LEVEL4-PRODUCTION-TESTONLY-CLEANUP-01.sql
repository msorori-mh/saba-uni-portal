-- =============================================================================
-- GP-LEVEL4-PRODUCTION-TESTONLY-CLEANUP-01.sql
-- Mission: GP-LEVEL4-PRODUCTION-TESTONLY-FIXTURE-PACKAGE-01
-- Marker:  TEST_ONLY_GP_LEVEL4_RECLOSURE_01
--
-- SOURCE-ONLY operator cleanup. NOT a schema migration.
-- Default: DRY RUN (inventory only). Requires explicit execute switch to delete.
--
--   SET gp.l4_fixture.execute = 'true';  -- independent cleanup-session gate
--   SET gp.l4_fixture.cleanup_marker  = 'TEST_ONLY_GP_LEVEL4_RECLOSURE_01'; -- optional override refuse
--
-- Safety:
--   - refuses any marker other than TEST_ONLY_GP_LEVEL4_RECLOSURE_01
--   - refuses broad / unmarked deletion
--   - deletes only registry-listed + deterministic UUID-band artifacts
--   - never touches enrollment_certificate / request_types.student_visible
--   - never deletes non-TEST_ONLY / Package D unmarked projects
-- =============================================================================

BEGIN;

SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '15s';

DO $cleanup$
DECLARE
  c_marker_required constant text := 'TEST_ONLY_GP_LEVEL4_RECLOSURE_01';
  v_marker          text := coalesce(
    nullif(current_setting('gp.l4_fixture.cleanup_marker', true), ''),
    c_marker_required
  );
  v_execute         boolean := (coalesce(current_setting('gp.l4_fixture.execute', true), '') = 'true');

  c_p1 constant uuid := 'a4e40100-0000-4000-a500-000000000001';
  c_p2 constant uuid := 'a4e40100-0000-4000-a500-000000000002';
  c_p3 constant uuid := 'a4e40100-0000-4000-a500-000000000003';
  c_p4 constant uuid := 'a4e40100-0000-4000-a500-000000000004';
  c_dept constant uuid := 'a4e40100-0000-4000-a200-000000000001';
  c_prog constant uuid := 'a4e40100-0000-4000-a200-000000000002';
  c_year constant uuid := 'a4e40100-0000-4000-a200-000000000003';
  c_sem  constant uuid := 'a4e40100-0000-4000-a200-000000000004';

  v_projects uuid[];
  v_files    uuid[];
  v_students uuid[];
  v_faculty  uuid[];
  v_faculty_parent uuid[];
  v_status   uuid[];
  v_users    uuid[];
  v_n        integer;
  v_deleted  jsonb := '{}'::jsonb;
  v_inv      jsonb;
BEGIN
  IF v_marker IS DISTINCT FROM c_marker_required THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_MARKER_REFUSED: only % allowed, got %',
      c_marker_required, v_marker;
  END IF;

  IF to_regclass('public.gp_l4_testonly_fixture_registry') IS NULL THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_REGISTRY_MISSING: refuse unmarked cleanup';
  END IF;

  -- Inventory from registry (authoritative allowlist)
  SELECT coalesce(array_agg(entity_id), '{}'::uuid[]) INTO v_projects
  FROM public.gp_l4_testonly_fixture_registry
  WHERE marker = v_marker AND entity_type = 'project';

  SELECT coalesce(array_agg(entity_id), '{}'::uuid[]) INTO v_files
  FROM public.gp_l4_testonly_fixture_registry
  WHERE marker = v_marker AND entity_type = 'file';

  SELECT coalesce(array_agg(entity_id), '{}'::uuid[]) INTO v_students
  FROM public.gp_l4_testonly_fixture_registry
  WHERE marker = v_marker AND entity_type = 'student_profile';

  SELECT coalesce(array_agg(entity_id), '{}'::uuid[]) INTO v_faculty
  FROM public.gp_l4_testonly_fixture_registry
  WHERE marker = v_marker AND entity_type = 'faculty_profile';

  SELECT coalesce(array_agg(entity_id), '{}'::uuid[]) INTO v_users
  FROM public.gp_l4_testonly_fixture_registry
  WHERE marker = v_marker AND entity_type = 'auth_user';

  -- Fail closed if registry empty but deterministic projects exist without marker registry
  IF cardinality(v_projects) = 0 THEN
    SELECT count(*) INTO v_n FROM public.graduation_projects
    WHERE id IN (c_p1, c_p2, c_p3, c_p4);
    IF v_n > 0 THEN
      RAISE EXCEPTION 'GP_L4_CLEANUP_REGISTRY_EMPTY_BUT_PROJECTS_PRESENT: refuse unmarked delete';
    END IF;
  END IF;

  -- Hard allowlist intersection: registry projects must be exactly the deterministic band
  IF EXISTS (
    SELECT 1 FROM unnest(v_projects) p(id)
    WHERE p.id NOT IN (c_p1, c_p2, c_p3, c_p4)
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_ALLOWLIST_DRIFT: registry project outside deterministic band';
  END IF;

  -- Refuse deleting any project whose title does not carry the marker (when present)
  IF EXISTS (
    SELECT 1 FROM public.graduation_projects p
    WHERE p.id = ANY (v_projects)
      AND coalesce(p.title, '') NOT LIKE '%' || v_marker || '%'
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_TITLE_MARKER_MISSING: refuse delete of unmarked project title';
  END IF;

  -- Refuse file keys that do not embed marker
  IF EXISTS (
    SELECT 1 FROM public.graduation_project_files f
    WHERE (f.id = ANY (v_files) OR f.project_id = ANY (v_projects))
      AND position(v_marker in f.object_key) = 0
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_OBJECT_KEY_MARKER_MISSING: refuse unmarked storage keys';
  END IF;

  -- Protected surfaces must remain untouched (read-only assertion counts captured)
  v_inv := jsonb_build_object(
    'marker', v_marker,
    'dry_run', NOT v_execute,
    'projects', to_jsonb(v_projects),
    'files', to_jsonb(v_files),
    'student_profiles', to_jsonb(v_students),
    'faculty_profiles', to_jsonb(v_faculty),
    'auth_users', to_jsonb(v_users),
    'project_count', cardinality(v_projects),
    'file_count', (
      SELECT count(*) FROM public.graduation_project_files f
      WHERE f.project_id = ANY (v_projects) OR f.id = ANY (v_files)
    ),
    'assignment_count', (
      SELECT count(*) FROM public.graduation_project_assignments a
      WHERE a.project_id = ANY (v_projects)
    ),
    'event_count', (
      SELECT count(*) FROM public.graduation_project_events e
      WHERE e.project_id = ANY (v_projects)
    ),
    'status_count', (
      SELECT count(*) FROM public.student_academic_status s
      WHERE s.student_profile_id = ANY (v_students)
    ),
    'storage_object_candidates', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)), '[]'::jsonb)
      FROM storage.objects o
      WHERE o.bucket_id = 'graduation-projects'
        AND position(v_marker in o.name) > 0
        AND (
          o.name LIKE 'graduation-projects/' || c_p1::text || '/%'
          OR o.name LIKE 'graduation-projects/' || c_p2::text || '/%'
          OR o.name LIKE 'graduation-projects/' || c_p3::text || '/%'
          OR o.name LIKE 'graduation-projects/' || c_p4::text || '/%'
        )
    )
  );

  RAISE NOTICE 'GP_L4_CLEANUP_INVENTORY %', v_inv;

  IF NOT v_execute THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_DRY_RUN: inventory captured; no deletes. In an independent cleanup session set gp.l4_fixture.execute=true to delete.';
  END IF;

  -- Live delete (FK-safe order). Bypass append-only event trigger for allowlisted projects only.
  PERFORM set_config('session_replication_role', 'replica', true);

  DELETE FROM public.graduation_project_evaluations e WHERE e.project_id = ANY (v_projects);
  DELETE FROM public.graduation_project_panel_members pm WHERE pm.project_id = ANY (v_projects);
  DELETE FROM public.graduation_project_discussions d WHERE d.project_id = ANY (v_projects);
  DELETE FROM public.graduation_project_progress_entries pe WHERE pe.project_id = ANY (v_projects);
  DELETE FROM public.graduation_project_approvals ap WHERE ap.project_id = ANY (v_projects);
  DELETE FROM public.graduation_project_final_archives fa WHERE fa.project_id = ANY (v_projects);

  DELETE FROM public.graduation_project_files f
  WHERE f.project_id = ANY (v_projects) OR f.id = ANY (v_files);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('files', v_n);

  DELETE FROM public.graduation_project_events e WHERE e.project_id = ANY (v_projects);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('events', v_n);

  DELETE FROM public.graduation_project_assignments a WHERE a.project_id = ANY (v_projects);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('assignments', v_n);

  DELETE FROM public.graduation_projects p WHERE p.id = ANY (v_projects);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('projects', v_n);

  DELETE FROM public.graduation_project_department_coordinators c
  WHERE c.department_id = c_dept
    AND c.user_id = ANY (v_users);

  DELETE FROM public.student_academic_status s
  WHERE s.student_profile_id = ANY (v_students);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('academic_status', v_n);

  DELETE FROM public.student_profiles sp WHERE sp.id = ANY (v_students);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('student_profiles', v_n);

  DELETE FROM public.faculty_profiles fp WHERE fp.id = ANY (v_faculty);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('faculty_profiles', v_n);

  -- Faculty parent rows (production-shaped only)
  IF to_regclass('public.faculty') IS NOT NULL THEN
    DELETE FROM public.faculty f
    WHERE f.id IN (
      'a4e40100-0000-4000-a410-000000000008'::uuid,
      'a4e40100-0000-4000-a410-000000000009'::uuid,
      'a4e40100-0000-4000-a410-00000000000a'::uuid,
      'a4e40100-0000-4000-a410-00000000000b'::uuid,
      'a4e40100-0000-4000-a410-00000000000c'::uuid,
      'a4e40100-0000-4000-a410-00000000000d'::uuid,
      'a4e40100-0000-4000-a410-00000000000e'::uuid,
      'a4e40100-0000-4000-a410-00000000000f'::uuid
    )
    AND coalesce(f.full_name_ar, '') LIKE '%' || v_marker || '%';
  END IF;

  -- Storage objects with marker under package project prefixes only
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DELETE FROM storage.objects o
    WHERE o.bucket_id = 'graduation-projects'
      AND position(v_marker in o.name) > 0
      AND (
        o.name LIKE 'graduation-projects/' || c_p1::text || '/%'
        OR o.name LIKE 'graduation-projects/' || c_p2::text || '/%'
        OR o.name LIKE 'graduation-projects/' || c_p3::text || '/%'
        OR o.name LIKE 'graduation-projects/' || c_p4::text || '/%'
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('storage_objects', v_n);
  END IF;

  -- Org units last (only if unused)
  DELETE FROM public.semesters s WHERE s.id = c_sem;
  DELETE FROM public.academic_years y WHERE y.id = c_year;
  DELETE FROM public.programs p WHERE p.id = c_prog;
  DELETE FROM public.departments d WHERE d.id = c_dept;

  -- Synthetic auth identities: exact registry UUIDs intersected with the fixed
  -- TEST_ONLY auth allowlist. No email/name/domain predicate is permitted.
  IF EXISTS (
    SELECT 1 FROM unnest(v_users) u(id)
    WHERE u.id NOT IN (
      'a4e40100-0000-4000-a100-000000000001'::uuid, 'a4e40100-0000-4000-a100-000000000002'::uuid,
      'a4e40100-0000-4000-a100-000000000003'::uuid, 'a4e40100-0000-4000-a100-000000000004'::uuid,
      'a4e40100-0000-4000-a100-000000000005'::uuid, 'a4e40100-0000-4000-a100-000000000006'::uuid,
      'a4e40100-0000-4000-a100-000000000007'::uuid, 'a4e40100-0000-4000-a100-000000000008'::uuid,
      'a4e40100-0000-4000-a100-000000000009'::uuid, 'a4e40100-0000-4000-a100-00000000000a'::uuid,
      'a4e40100-0000-4000-a100-00000000000b'::uuid, 'a4e40100-0000-4000-a100-00000000000c'::uuid,
      'a4e40100-0000-4000-a100-00000000000d'::uuid, 'a4e40100-0000-4000-a100-00000000000e'::uuid,
      'a4e40100-0000-4000-a100-00000000000f'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_AUTH_ALLOWLIST_DRIFT: refuse auth delete';
  END IF;
  DELETE FROM auth.users u WHERE u.id = ANY (v_users);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('auth_users', v_n);

  DELETE FROM public.gp_l4_testonly_fixture_registry r WHERE r.marker = v_marker;
  DELETE FROM public.gp_test_manifest_markers m WHERE m.marker_tag = v_marker;

  PERFORM set_config('session_replication_role', 'origin', true);

  -- Zero-residue verifier
  IF EXISTS (SELECT 1 FROM public.graduation_projects WHERE id IN (c_p1, c_p2, c_p3, c_p4)) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_RESIDUE: projects remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graduation_project_files f
    WHERE f.id IN (
      'a4e40100-0000-4000-a700-000000000001'::uuid,
      'a4e40100-0000-4000-a700-000000000002'::uuid,
      'a4e40100-0000-4000-a700-000000000003'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_RESIDUE: files remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE id IN (
      'a4e40100-0000-4000-a300-000000000001'::uuid,
      'a4e40100-0000-4000-a300-000000000002'::uuid,
      'a4e40100-0000-4000-a300-000000000003'::uuid,
      'a4e40100-0000-4000-a300-000000000004'::uuid,
      'a4e40100-0000-4000-a300-000000000005'::uuid,
      'a4e40100-0000-4000-a300-000000000006'::uuid,
      'a4e40100-0000-4000-a300-000000000007'::uuid,
      'a4e40100-0000-4000-a300-000000000008'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_RESIDUE: student_profiles remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gp_l4_testonly_fixture_registry WHERE marker = v_marker
  ) THEN
    RAISE EXCEPTION 'GP_L4_CLEANUP_RESIDUE: registry rows remain';
  END IF;

  RAISE NOTICE 'GP_L4_CLEANUP_SUCCESS marker=% deleted=%', v_marker, v_deleted;
END;
$cleanup$;

COMMIT;
