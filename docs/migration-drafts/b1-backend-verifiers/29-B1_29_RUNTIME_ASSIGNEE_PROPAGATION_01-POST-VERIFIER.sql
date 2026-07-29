-- READ ONLY
-- Post-verifier for B1 order 29 (RUNTIME_ASSIGNEE_PROPAGATION_01)
-- Global identity-boundary lock revision. Catalog-driven: nothing here trusts
-- file names, comments, or draft text.
BEGIN;
DO $$
DECLARE
  v_def text;
  v_owner oid;
  v_fn record;
  v_role text;
  v_rec record;
BEGIN
  -- ------------------------------------------------------------------
  -- 0. Objects exist
  -- ------------------------------------------------------------------
  IF to_regprocedure('public.assert_b1_runtime_step_assignee_effective(uuid)') IS NULL THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assert_b1_runtime_step_assignee_effective missing';
  END IF;
  IF to_regprocedure(
       'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)'
     ) IS NULL THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: row-shaped assignee assert missing (INSERT guard body)';
  END IF;
  IF to_regprocedure('public.b1_assignment_identity_lock_key()') IS NULL
     OR to_regprocedure('public.b1_lock_assignment_identity_boundary()') IS NULL
     OR to_regprocedure('public.b1_lock_assignment_identity_stmt()') IS NULL
     OR to_regprocedure('public.guard_b1_runtime_step_activation()') IS NULL THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assignment scope lock primitive missing';
  END IF;

  -- The scoped-key and row-lock predecessor designs must be fully gone.
  IF to_regprocedure('public.b1_assignment_scope_lock_key(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.b1_lock_assignment_scopes(bigint[])') IS NOT NULL
     OR to_regprocedure('public.b1_lock_assignment_identity_row()') IS NOT NULL THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: superseded scoped/row lock objects still present';
  END IF;


  -- ------------------------------------------------------------------
  -- 1. Lock primitive is a real global transaction-scoped advisory lock
  -- ------------------------------------------------------------------
  v_def := pg_get_functiondef('public.b1_lock_assignment_identity_boundary()'::regprocedure);
  IF v_def NOT LIKE '%pg_advisory_xact_lock%'
     OR v_def NOT LIKE '%b1_assignment_identity_lock_key%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: scope lock is not an ordered transaction-scoped lock';
  END IF;
  IF pg_get_functiondef('public.b1_assignment_identity_lock_key()'::regprocedure)
       !~ '[0-9]{6,}::bigint' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: identity lock key is not a stable constant';
  END IF;
  -- The key really is one global constant (executable proof, not text).
  IF public.b1_assignment_identity_lock_key()
     IS DISTINCT FROM public.b1_assignment_identity_lock_key() THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: identity lock key is not deterministic';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Activation assert: contract, lock ordering, no bypass
  -- ------------------------------------------------------------------
  v_def := pg_get_functiondef(
    'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)'::regprocedure);
  -- The by-id wrapper must delegate to the same body, so INSERT and UPDATE
  -- guards can never diverge.
  IF pg_get_functiondef('public.assert_b1_runtime_step_assignee_effective(uuid)'::regprocedure)
       NOT LIKE '%assert_b1_runtime_step_row_assignee_effective%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: by-id assert does not delegate to the shared row body';
  END IF;

  IF v_def NOT LIKE '%is_b1_stored_request_type%'
     OR v_def NOT LIKE '%B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE%'
     OR v_def NOT LIKE '%B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH%'
     OR v_def NOT LIKE '%current_department_id%'
     OR v_def NOT LIKE '%requested_department_id%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assignee assert contract incomplete';
  END IF;
  IF v_def ILIKE '%is_current_user_admin_actor%'
     OR v_def ILIKE '%is_current_user_registrar%'
     OR v_def ILIKE '%has_role(%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: role bypass detected in assignee assert';
  END IF;
  IF v_def NOT LIKE '%b1_lock_assignment_identity_boundary%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: activation path does not take the shared scope lock';
  END IF;
  -- Lock must be taken BEFORE any identity read (TOCTOU closure).
  IF position('b1_lock_assignment_identity_boundary' in v_def)
     > position('FROM public.request_processing_assignments' in v_def)
   OR position('b1_lock_assignment_identity_boundary' in v_def)
     > position('FROM public.transfer_request_details' in v_def)
   OR position('b1_lock_assignment_identity_boundary' in v_def)
     > position('is_valid_b1_direct_assignment' in v_def) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: scope lock taken after the assignment read';
  END IF;
  -- non-B1 early return happens BEFORE the lock.
  IF position('is_b1_stored_request_type' in v_def)
     > position('b1_lock_assignment_identity_boundary' in v_def) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: non-B1 early return is not before the lock';
  END IF;
  -- Profile mutability is actually re-read under the lock, through the
  -- shared validator, which reads staff_profiles and faculty_profiles.
  IF pg_get_functiondef('public.is_valid_b1_direct_assignment(uuid,uuid,boolean)'::regprocedure)
       NOT LIKE '%staff_profiles%'
     OR pg_get_functiondef('public.is_valid_b1_direct_assignment(uuid,uuid,boolean)'::regprocedure)
       NOT LIKE '%faculty_profiles%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: profile coverage missing from the effective-identity read';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Function-level catalog checks: existence (full signature), owner,
  --    security context, pinned search_path, and FAIL-CLOSED ACL.
  --
  --    ACL contract (fail-closed): a NULL proacl is NOT evidence of denial.
  --    PostgreSQL grants EXECUTE to PUBLIC by default and only materialises
  --    proacl once an explicit GRANT/REVOKE happens. Order 29 therefore
  --    REVOKEs from PUBLIC/anon/authenticated, which MUST leave a non-NULL
  --    proacl. NULL proacl => explicit POSTVERIFY_FAIL. On top of that the
  --    effective privilege is probed directly with has_function_privilege,
  --    so inherited or role-membership paths cannot slip through.
  -- ------------------------------------------------------------------
  SELECT c.relowner INTO v_owner FROM pg_class c
   WHERE c.oid = 'public.request_processing_assignments'::regclass;

  FOR v_fn IN
    SELECT s.sig,
           s.must_secdef,
           p.oid,
           p.proname,
           p.prosecdef,
           p.proowner,
           p.proconfig,
           p.proacl
    FROM (VALUES
      ('public.b1_assignment_identity_lock_key()', false),
      ('public.b1_lock_assignment_identity_boundary()', false),
      ('public.b1_lock_assignment_identity_stmt()', true),
      ('public.guard_b1_runtime_step_activation()', true),
      ('public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)', true),
      ('public.assert_b1_runtime_step_assignee_effective(uuid)', true)
    ) AS s(sig, must_secdef)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(s.sig)
  LOOP
    -- Exact signature, not just the name.
    IF v_fn.oid IS NULL THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % missing with the exact required signature', v_fn.sig;
    END IF;
    IF v_fn.proowner <> v_owner THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % has unexpected owner', v_fn.sig;
    END IF;
    IF v_fn.proconfig IS NULL
       OR NOT ('search_path=public' = ANY(v_fn.proconfig)
               OR 'search_path="public"' = ANY(v_fn.proconfig)) THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % has no pinned search_path', v_fn.sig;
    END IF;
    IF v_fn.must_secdef AND NOT v_fn.prosecdef THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % must be SECURITY DEFINER', v_fn.sig;
    END IF;
    IF NOT v_fn.must_secdef AND v_fn.prosecdef THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % must be SECURITY INVOKER', v_fn.sig;
    END IF;

    -- FAIL-CLOSED ACL: absence of an ACL row is never proof of denial.
    IF v_fn.proacl IS NULL THEN
      RAISE EXCEPTION
        'POSTVERIFY_FAIL: % has NULL proacl (default PUBLIC EXECUTE applies; explicit REVOKE required)',
        v_fn.sig;
    END IF;
    IF has_function_privilege('public', v_fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % is EXECUTE-able by PUBLIC', v_fn.sig;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = v_role)
         AND has_function_privilege(v_role, v_fn.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'POSTVERIFY_FAIL: % is EXECUTE-able by %', v_fn.sig, v_role;
      END IF;
    END LOOP;
    -- Belt and braces: no explicit EXECUTE ACE for PUBLIC/anon/authenticated.
    IF EXISTS (
      SELECT 1 FROM aclexplode(v_fn.proacl) a
      LEFT JOIN pg_roles g ON g.oid = a.grantee
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR g.rolname IN ('anon','authenticated'))
    ) THEN
      RAISE EXCEPTION 'POSTVERIFY_FAIL: % has an explicit EXECUTE grant to PUBLIC/anon/authenticated', v_fn.sig;
    END IF;
  END LOOP;

  -- Trigger functions must return trigger.
  IF (SELECT prorettype FROM pg_proc WHERE oid = 'public.b1_lock_assignment_identity_stmt()'::regprocedure)
     <> 'pg_catalog.trigger'::regtype THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: lock trigger function does not return trigger';
  END IF;
  IF pg_get_functiondef('public.b1_lock_assignment_identity_stmt()'::regprocedure)
       NOT LIKE '%b1_lock_assignment_identity_boundary%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: mutation trigger does not take the shared lock';
  END IF;
  -- Lock-only: the statement trigger must read/write no business row.
  IF pg_get_functiondef('public.b1_lock_assignment_identity_stmt()'::regprocedure)
       ~* '(insert|update|delete)[[:space:]]' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: statement lock trigger is not lock-only';
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Trigger-level catalog checks
  --    tgtype bits: ROW=1 BEFORE=2 INSERT=4 DELETE=8 UPDATE=16
  --    Identity-boundary locks MUST be BEFORE ... FOR EACH STATEMENT (no ROW
  --    bit): the key has to be taken before the executor acquires the first
  --    row lock, otherwise multi-row DML can still build a wait-for cycle.
  --    Validation guards stay FOR EACH ROW, on INSERT (initial active step)
  --    and on UPDATE OF status (later activation).
  -- ------------------------------------------------------------------
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('public.student_request_workflow_steps', 'trg_guard_b1_runtime_step_activation',
       'public.guard_b1_runtime_step_activation()', 19, ARRAY['status']),
      ('public.student_request_workflow_steps', 'trg_guard_b1_runtime_step_activation_insert',
       'public.guard_b1_runtime_step_activation()', 7, ARRAY[]::text[]),
      ('public.student_request_workflow_steps', 'trg_b1_lock_runtime_step_identity_stmt',
       'public.b1_lock_assignment_identity_stmt()', 22, ARRAY[]::text[]),
      ('public.request_processing_assignments', 'trg_b1_lock_processing_assignment_stmt',
       'public.b1_lock_assignment_identity_stmt()', 30, ARRAY[]::text[]),
      ('public.position_assignments', 'trg_b1_lock_position_assignment_stmt',
       'public.b1_lock_assignment_identity_stmt()', 30, ARRAY[]::text[]),
      ('public.staff_profiles', 'trg_b1_lock_staff_profile_identity_stmt',
       'public.b1_lock_assignment_identity_stmt()', 26, ARRAY['user_id','status']),
      ('public.faculty_profiles', 'trg_b1_lock_faculty_profile_identity_stmt',
       'public.b1_lock_assignment_identity_stmt()', 26,
       ARRAY['user_id','status','department_id']),
      ('public.transfer_request_details', 'trg_b1_lock_transfer_department_scope_stmt',
       'public.b1_lock_assignment_identity_stmt()', 18,
       ARRAY['current_department_id','requested_department_id'])
    ) AS t(tbl, trg, fn, tgtype, cols)

  LOOP
    DECLARE
      t_row pg_trigger%ROWTYPE;
      t_def text;
      c text;
    BEGIN
      SELECT * INTO t_row FROM pg_trigger
       WHERE tgrelid = v_rec.tbl::regclass AND tgname = v_rec.trg AND NOT tgisinternal;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'POSTVERIFY_FAIL: trigger % missing on %', v_rec.trg, v_rec.tbl;
      END IF;
      IF t_row.tgfoid <> v_rec.fn::regprocedure THEN
        RAISE EXCEPTION 'POSTVERIFY_FAIL: trigger % bound to the wrong function', v_rec.trg;
      END IF;
      IF t_row.tgtype <> v_rec.tgtype THEN
        RAISE EXCEPTION 'POSTVERIFY_FAIL: trigger % has tgtype % (expected %)',
          v_rec.trg, t_row.tgtype, v_rec.tgtype;
      END IF;
      IF t_row.tgenabled <> 'O' THEN
        RAISE EXCEPTION 'POSTVERIFY_FAIL: trigger % is not enabled (%)', v_rec.trg, t_row.tgenabled;
      END IF;
      t_def := pg_get_triggerdef(t_row.oid);
      FOREACH c IN ARRAY v_rec.cols LOOP
        IF t_def NOT LIKE '%' || c || '%' THEN
          RAISE EXCEPTION 'POSTVERIFY_FAIL: trigger % does not cover column %', v_rec.trg, c;
        END IF;
      END LOOP;
    END;
  END LOOP;

  -- Explicit named coverage assertions (catalog-derived, greppable).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.request_processing_assignments'::regclass
                   AND tgname='trg_b1_lock_processing_assignment_stmt' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: assignment mutation lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.position_assignments'::regclass
                   AND tgname='trg_b1_lock_position_assignment_stmt' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: position assignment lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.staff_profiles'::regclass
                   AND tgname='trg_b1_lock_staff_profile_identity_stmt' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: staff_profiles identity lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.faculty_profiles'::regclass
                   AND tgname='trg_b1_lock_faculty_profile_identity_stmt' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: faculty_profiles identity lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.transfer_request_details'::regclass
                   AND tgname='trg_b1_lock_transfer_department_scope_stmt' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: transfer department scope lock trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_request_workflow_steps'::regclass
                   AND tgname='trg_guard_b1_runtime_step_activation_insert' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: initial active INSERT guard missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_request_workflow_steps'::regclass
                   AND tgname='trg_b1_lock_runtime_step_identity_stmt' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: runtime-step statement lock trigger missing';
  END IF;

  -- No identity-boundary lock trigger may remain FOR EACH ROW.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgfoid = 'public.b1_lock_assignment_identity_stmt()'::regprocedure
       AND (tgtype & 1) = 1
  ) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: identity lock trigger is row-level (deadlock risk)';
  END IF;
  -- The initial-INSERT guard must be conditioned on the active status.
  IF (SELECT pg_get_triggerdef(oid) FROM pg_trigger
       WHERE tgrelid='public.student_request_workflow_steps'::regclass
         AND tgname='trg_guard_b1_runtime_step_activation_insert') NOT LIKE '%active%' THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: INSERT guard has no active-status WHEN clause';
  END IF;


  -- ------------------------------------------------------------------
  -- 5. Data invariants (unchanged by this migration, re-proven)
  -- ------------------------------------------------------------------
  IF EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
    WHERE public.is_b1_stored_request_type(r.request_type)
      AND num_nonnulls(s.assigned_user_id, s.assigned_staff_profile_id,
            s.assigned_faculty_profile_id, s.assigned_position_assignment_id) <> 1
  ) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: B1 runtime step without exactly one assignee';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_requests r
    JOIN public.student_request_workflow_steps s ON s.student_request_id = r.id
    WHERE public.is_b1_stored_request_type(r.request_type)
      AND r.status IN ('submitted','in_review')
    GROUP BY r.id
    HAVING count(*) FILTER (WHERE s.status = 'active') <> 1
  ) THEN
    RAISE EXCEPTION 'POSTVERIFY_FAIL: active-step invariant broken';
  END IF;
END $$;
ROLLBACK;
