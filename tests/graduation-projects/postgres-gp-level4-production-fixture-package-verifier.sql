-- Local disposable PG17 verifier for Level-4 production TEST_ONLY fixture package.
-- Requires: minimal-schema + U1..U4 + L4 migration + fixtures (execute=true already applied).
-- Ends with ROLLBACK for the probe transaction only when wrapped by caller; this file COMMITs
-- nothing destructive beyond using package cleanup with explicit execute in controlled steps.
-- Marker: TEST_ONLY_GP_LEVEL4_RECLOSURE_01

BEGIN;

SELECT set_config('gp.verify.skip_storage_object_check', 'on', true);

CREATE OR REPLACE FUNCTION pg_temp.set_uid(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(p_sql text, p_frag text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_frag in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'expected failure containing %, got %', p_frag, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected failure containing % but statement succeeded', p_frag;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.full_fingerprint() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'projects', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.graduation_projects p WHERE p.id::text LIKE 'a4e40100-0000-4000-a500-%'),
    'assignments', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM public.graduation_project_assignments a WHERE a.project_id::text LIKE 'a4e40100-0000-4000-a500-%'),
    'files', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id),'[]') FROM public.graduation_project_files f WHERE f.project_id::text LIKE 'a4e40100-0000-4000-a500-%'),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM public.graduation_project_events e WHERE e.project_id::text LIKE 'a4e40100-0000-4000-a500-%'),
    'all_projects', (SELECT count(*) FROM public.graduation_projects),
    'all_assignments', (SELECT count(*) FROM public.graduation_project_assignments),
    'all_files', (SELECT count(*) FROM public.graduation_project_files),
    'all_events', (SELECT count(*) FROM public.graduation_project_events),
    'all_progress', (SELECT count(*) FROM public.graduation_project_progress_entries),
    'all_evaluations', (SELECT count(*) FROM public.graduation_project_evaluations),
    'all_approvals', (SELECT count(*) FROM public.graduation_project_approvals),
    'all_archives', (SELECT count(*) FROM public.graduation_project_final_archives),
    'package_status', (SELECT count(*) FROM public.student_academic_status WHERE id::text LIKE 'a4e40100-0000-4000-a510-%'),
    'package_registry', (SELECT count(*) FROM public.gp_l4_testonly_fixture_registry WHERE marker='TEST_ONLY_GP_LEVEL4_RECLOSURE_01')
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail_zs(p_case text, p_sql text, p_frag text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_fp jsonb; after_fp jsonb;
BEGIN
  before_fp := pg_temp.full_fingerprint();
  PERFORM pg_temp.expect_fail(p_sql, p_frag);
  after_fp := pg_temp.full_fingerprint();
  IF before_fp IS DISTINCT FROM after_fp THEN
    RAISE EXCEPTION 'ZERO_MUTATION_FAILED case=% before=% after=%', p_case, before_fp, after_fp;
  END IF;
  RAISE NOTICE 'NEGATIVE_ZERO_MUTATION_PASS case=%', p_case;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_false_zs(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_fp jsonb; after_fp jsonb; denied boolean;
BEGIN
  before_fp := pg_temp.full_fingerprint();
  EXECUTE p_sql INTO denied;
  IF coalesce(denied, false) THEN RAISE EXCEPTION 'expected false denial case=%', p_case; END IF;
  after_fp := pg_temp.full_fingerprint();
  IF before_fp IS DISTINCT FROM after_fp THEN
    RAISE EXCEPTION 'ZERO_MUTATION_FAILED case=% before=% after=%', p_case, before_fp, after_fp;
  END IF;
  RAISE NOTICE 'NEGATIVE_ZERO_MUTATION_PASS case=%', p_case;
END $$;

DO $$
DECLARE
  c_marker text := 'TEST_ONLY_GP_LEVEL4_RECLOSURE_01';
  c_p1 uuid := 'a4e40100-0000-4000-a500-000000000001';
  c_p2 uuid := 'a4e40100-0000-4000-a500-000000000002';
  c_p3 uuid := 'a4e40100-0000-4000-a500-000000000003';
  c_p4 uuid := 'a4e40100-0000-4000-a500-000000000004';
  c_dept uuid := 'a4e40100-0000-4000-a200-000000000001';
  c_prog uuid := 'a4e40100-0000-4000-a200-000000000002';
  c_year uuid := 'a4e40100-0000-4000-a200-000000000003';
  c_sem uuid := 'a4e40100-0000-4000-a200-000000000004';
  c_u_l1 uuid := 'a4e40100-0000-4000-a100-000000000003';
  c_u_l2 uuid := 'a4e40100-0000-4000-a100-000000000004';
  c_u_l3 uuid := 'a4e40100-0000-4000-a100-000000000005';
  c_u_unknown uuid := 'a4e40100-0000-4000-a100-000000000006';
  c_u_ambiguous uuid := 'a4e40100-0000-4000-a100-000000000007';
  c_u_dual uuid := 'a4e40100-0000-4000-a100-000000000008';
  c_u_leader uuid := 'a4e40100-0000-4000-a100-000000000001';
  c_sp_l1 uuid := 'a4e40100-0000-4000-a300-000000000003';
  c_sp_l2 uuid := 'a4e40100-0000-4000-a300-000000000004';
  c_sp_l3 uuid := 'a4e40100-0000-4000-a300-000000000005';
  c_fid uuid := 'a4e40100-0000-4000-a700-000000000001';
  c_pending_fid uuid := 'a4e40100-0000-4000-a700-000000000002';
  before_p bigint;
  after_p bigint;
  payload jsonb;
  found_p2 boolean := false;
  found_p3 boolean := false;
  elem jsonb;
BEGIN
  -- Preconditions: package present
  IF (SELECT count(*) FROM public.graduation_projects WHERE id IN (c_p1,c_p2,c_p3,c_p4)) <> 4 THEN
    RAISE EXCEPTION 'LOCAL_FIXTURE_PRECONDITION_FAIL: expected 4 package projects';
  END IF;

  -- Negative creates: coordinator attempts to create teams for non-L4 leaders
  -- (create_graduation_project_team requires department coordinator capability).
  before_p := (SELECT count(*) FROM public.graduation_projects);
  PERFORM pg_temp.set_uid('a4e40100-0000-4000-a100-000000000009'); -- coordinator

  -- NEGATIVE_CASE: L1_CREATE
  PERFORM pg_temp.expect_fail_zs('L1_CREATE',
    format(
      $q$SELECT public.create_graduation_project_team(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
      c_dept, c_sp_l1, c_u_l1, c_prog, c_year, c_sem, 'a4e40100-0000-4000-ac00-000000000101'
    ),
    'fourth-level student eligibility required'
  );

  -- NEGATIVE_CASE: L2_CREATE
  PERFORM pg_temp.expect_fail_zs('L2_CREATE',
    format(
      $q$SELECT public.create_graduation_project_team(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
      c_dept, c_sp_l2, c_u_l2, c_prog, c_year, c_sem, 'a4e40100-0000-4000-ac00-000000000102'
    ),
    'fourth-level student eligibility required'
  );

  -- NEGATIVE_CASE: L3_CREATE
  PERFORM pg_temp.expect_fail_zs('L3_CREATE',
    format(
      $q$SELECT public.create_graduation_project_team(%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
      c_dept, c_sp_l3, c_u_l3, c_prog, c_year, c_sem, 'a4e40100-0000-4000-ac00-000000000103'
    ),
    'fourth-level student eligibility required'
  );

  -- Student-self denials on list
  PERFORM pg_temp.set_uid(c_u_unknown);
  -- NEGATIVE_CASE: UNKNOWN_LIST
  PERFORM pg_temp.expect_fail_zs('UNKNOWN_LIST',
    $q$SELECT public.list_my_graduation_projects()$q$,
    'fourth-level student eligibility required'
  );

  PERFORM pg_temp.set_uid(c_u_ambiguous);
  -- NEGATIVE_CASE: AMBIGUOUS_LIST
  PERFORM pg_temp.expect_fail_zs('AMBIGUOUS_LIST',
    $q$SELECT public.list_my_graduation_projects()$q$,
    'fourth-level student eligibility required'
  );

  PERFORM pg_temp.set_uid(c_u_l1);
  -- NEGATIVE_CASE: L1_LIST
  PERFORM pg_temp.expect_fail_zs('L1_LIST',
    $q$SELECT public.list_my_graduation_projects()$q$,
    'fourth-level student eligibility required'
  );

  after_p := (SELECT count(*) FROM public.graduation_projects);
  IF after_p <> before_p THEN
    RAISE EXCEPTION 'ZERO_SIDE_EFFECT_DENIAL_FAILED: projects % -> %', before_p, after_p;
  END IF;

  -- Dual-role topology behavioral proof
  PERFORM pg_temp.set_uid(c_u_dual);
  -- NEGATIVE_CASE: DUAL_ROLE_P2_STUDENT
  PERFORM pg_temp.expect_fail_zs('DUAL_ROLE_P2_STUDENT',
    format($q$SELECT public.get_graduation_project_detail(%L::uuid)$q$, c_p2),
    'fourth-level student eligibility required'
  );
  payload := public.get_graduation_project_detail(c_p3);
  IF payload->>'project_id' IS DISTINCT FROM c_p3::text THEN
    RAISE EXCEPTION 'DUAL_ROLE_STAFF_ALLOW_FAILED';
  END IF;
  payload := public.list_my_graduation_projects();
  FOR elem IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    IF elem->>'project_id' = c_p2::text THEN found_p2 := true; END IF;
    IF elem->>'project_id' = c_p3::text THEN found_p3 := true; END IF;
  END LOOP;
  IF found_p2 THEN RAISE EXCEPTION 'DUAL_ROLE_CROSS_PROJECT_LEAK_P2'; END IF;
  IF NOT found_p3 THEN RAISE EXCEPTION 'DUAL_ROLE_STAFF_LIST_MISSING_P3'; END IF;

  -- Positive L4 leader detail
  PERFORM pg_temp.set_uid(c_u_leader);
  payload := public.get_graduation_project_detail(c_p1);
  IF payload->>'project_id' IS DISTINCT FROM c_p1::text THEN
    RAISE EXCEPTION 'POSITIVE_L4_LEADER_DETAIL_FAILED';
  END IF;

  -- Signed download positive + cross-actor replay deny
  payload := public.create_graduation_project_signed_download(
    c_fid, 'a4e40100-0000-4000-ac00-000000000201'
  );
  IF payload->>'storage_bucket' IS DISTINCT FROM 'graduation-projects' THEN
    RAISE EXCEPTION 'SIGNED_DOWNLOAD_POSITIVE_FAILED';
  END IF;

  PERFORM pg_temp.set_uid('a4e40100-0000-4000-a100-000000000002'); -- member
  -- NEGATIVE_CASE: SIGNED_DOWNLOAD_CROSS_ACTOR_REPLAY
  PERFORM pg_temp.expect_fail_zs('SIGNED_DOWNLOAD_CROSS_ACTOR_REPLAY',
    format(
      $q$SELECT public.create_graduation_project_signed_download(%L::uuid,%L::uuid)$q$,
      c_fid, 'a4e40100-0000-4000-ac00-000000000201'
    ),
    'idempotent replay actor mismatch'
  );

  -- NEGATIVE_CASE: UNAUTHORIZED_PATH
  PERFORM pg_temp.set_uid('a4e40100-0000-4000-a100-00000000000e');
  PERFORM pg_temp.expect_fail_zs('UNAUTHORIZED_PATH',
    format($q$SELECT public.create_graduation_project_signed_download(%L::uuid,%L::uuid)$q$,
      c_fid, 'a4e40100-0000-4000-ac00-000000000202'),
    'exact project assignment required'
  );

  -- NEGATIVE_CASE: CROSS_PROJECT_REPLAY
  PERFORM pg_temp.set_uid(c_u_leader);
  PERFORM pg_temp.expect_fail_zs('CROSS_PROJECT_REPLAY',
    format($q$SELECT public.create_graduation_project_file_upload_intent(%L::uuid,'proposal','cross-project.pdf',100,%L::uuid,NULL)$q$,
      c_p2, 'a4e40100-0000-4000-ac00-000000000201'),
    'exact team leader assignment required'
  );

  -- NEGATIVE_CASE: PENDING_DEMOTION_UPLOAD
  UPDATE public.graduation_project_assignments SET active=false, ended_at=clock_timestamp()
  WHERE user_id='a4e40100-0000-4000-a100-000000000002'::uuid AND project_id=c_p1 AND role='student';
  PERFORM pg_temp.set_uid('a4e40100-0000-4000-a100-000000000002');
  PERFORM pg_temp.expect_false_zs('PENDING_DEMOTION_UPLOAD',
    format($q$SELECT public.can_upload_graduation_project_object((SELECT object_key FROM public.graduation_project_files WHERE id=%L::uuid))$q$, c_pending_fid));
  UPDATE public.graduation_project_assignments SET active=true, ended_at=NULL
  WHERE user_id='a4e40100-0000-4000-a100-000000000002'::uuid AND project_id=c_p1 AND role='student';

  -- Archive immutability (coordinator path hits gp_assert_version)
  PERFORM pg_temp.set_uid('a4e40100-0000-4000-a100-000000000009'); -- coordinator
  -- NEGATIVE_CASE: ARCHIVED_PROJECT_MUTATION
  PERFORM pg_temp.expect_fail_zs('ARCHIVED_PROJECT_MUTATION',
    format(
      $q$SELECT public.conclude_graduation_project_result(%L::uuid,'passed',1::bigint,%L::uuid)$q$,
      c_p4,
      'a4e40100-0000-4000-ac00-000000000301'
    ),
    'archived project is immutable'
  );

  -- Cleanup predicates must not select ordinary harness projects (10000000 / 00000000 bands)
  IF EXISTS (
    SELECT 1
    FROM public.graduation_projects p
    WHERE p.id NOT IN (c_p1, c_p2, c_p3, c_p4)
      AND coalesce(p.title, '') LIKE '%' || c_marker || '%'
  ) THEN
    RAISE EXCEPTION 'CLEANUP_PREDICATE_LEAK: non-package project carries marker unexpectedly';
  END IF;

  RAISE NOTICE 'GP_L4_PRODUCTION_FIXTURE_PACKAGE_LOCAL_VERIFIER_PASS marker=%', c_marker;
END $$;

ROLLBACK;
