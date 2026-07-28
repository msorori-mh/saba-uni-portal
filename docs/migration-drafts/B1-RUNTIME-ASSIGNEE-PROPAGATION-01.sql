-- ============================================================================
-- B1-RUNTIME-ASSIGNEE-PROPAGATION-01
-- Forward-only. NOT APPLIED. Source-only draft.
--
-- Purpose
--   Generic fail-closed re-validation of the effective direct assignee at the
--   moment ANY B1 runtime step becomes 'active', regardless of which engine
--   performs the activation (act_on_b1_student_request_step_atomic,
--   apply_student_request_workflow_transition, specialized action RPCs,
--   or resubmit resume inside initialize_b1_request_workflow_strict).
--
--   Assignment identities are already resolved and stored at initialization
--   time by initialize_b1_request_workflow_strict (one identity per step,
--   department-scoped for the two department_transfer head steps). The
--   remaining gap is temporal: an assignment may be deactivated, ended,
--   re-scoped, duplicated, or detached — or the PRINCIPAL PROFILE behind it may
--   be disabled, re-pointed to another auth user, or moved to another
--   department — between submit and activation, and no engine re-checks it
--   before flipping pending -> active. This migration closes that gap.
--
-- TOCTOU root cause (why re-reading alone is NOT sufficient)
--   The rows the assert depends on are mutated by direct table DML through
--   PostgREST under RLS (admin surfaces) AND by a small set of SECURITY DEFINER
--   RPCs (admin_set_staff_status, admin_set_faculty_status,
--   admin_unlink_portal_login, link_staff_profile_account,
--   link_faculty_profile_account, apply_b1_department_transfer_effect, …).
--   None of those writers takes a lock the activation path could observe.
--   Under READ COMMITTED (the PostgREST default), the assert's SELECTs take a
--   fresh snapshot, so a concurrent transaction can COMMIT a deactivate /
--   delete / second INSERT / department re-scope / profile disable / user_id
--   swap AFTER the assert reads and BEFORE the activating transaction commits.
--   MVCC gives the reader a consistent snapshot; it does NOT give it a
--   predicate lock. Without SERIALIZABLE (which this database does not
--   enforce) the "exactly one effective identity" predicate is therefore not
--   stable across the activation commit.
--
-- Mutable identity surface covered (every field the effective-identity
-- predicate reads, directly or through is_valid_b1_direct_assignment):
--   request_processing_assignments : unit_id, role_id, assignment_type,
--     user_id, staff_profile_id, faculty_profile_id, position_assignment_id,
--     department_id, is_active, starts_at, ends_at  (+ row INSERT/DELETE)
--   staff_profiles                 : user_id, status                (+ DELETE)
--   faculty_profiles               : user_id, status, department_id (+ DELETE)
--   position_assignments           : user_id, is_active, assigned_from,
--     assigned_to, position_id                                      (+ I/U/D)
--   transfer_request_details       : current_department_id, requested_department_id
--   student_request_workflow_steps : the activating row itself, on BOTH the
--     initial INSERT with status='active' (initialize_b1_request_workflow_strict
--     creates the first step already active — it never performs a
--     pending -> active UPDATE) and the later pending -> active UPDATE
--
-- Remedy below: ONE global transaction-scoped advisory lock ("B1 assignment
--   identity boundary"), acquired by BEFORE STATEMENT lock-only triggers —
--   i.e. before the executor takes any row lock — on every identity table and
--   on the runtime-step table, plus TWO row-level validation guards
--   (BEFORE INSERT active, BEFORE UPDATE OF status to active) sharing one
--   validation body. A single key taken before any row lock cannot participate
--   in a lock cycle, so multi-row / opposite-order statements are deadlock-free
--   by construction and no phantom row can appear inside the window.

--
-- Legacy impact
--   The activation guard is a strict no-op for every non-B1 request type,
--   including enrollment_certificate: the trigger function returns immediately
--   — before taking the lock — when is_b1_stored_request_type(request_type) is
--   false. Administrative profile/assignment maintenance keeps its exact
--   functional contract; the only observable change is that two concurrent
--   identity-boundary writers now serialize on one advisory lock. These are
--   rare, low-volume admin operations, so the added wait is bounded by the
--   duration of a single admin statement. No legacy function, policy, grant,
--   or row is modified.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Shared GLOBAL lock primitive
--    One constant key for the whole B1 assignment-identity boundary. Every
--    path that can change an effective identity, and the activation path that
--    depends on it, take the SAME key in the SAME transaction-scoped mode.
--    Single key => no lock ordering, no cycle, no phantom gap.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_assignment_identity_lock_key()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- Constant, namespaced to B1 assignment identity. Never derive it from row
  -- data: a single global key is what makes the contract deadlock-free.
  SELECT 7346501982230114001::bigint;
$function$;

CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_boundary()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(public.b1_assignment_identity_lock_key());
END;
$function$;

REVOKE ALL ON FUNCTION public.b1_assignment_identity_lock_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_assignment_identity_lock_key() FROM anon;
REVOKE ALL ON FUNCTION public.b1_assignment_identity_lock_key() FROM authenticated;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_boundary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_boundary() FROM anon;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_boundary() FROM authenticated;

-- ----------------------------------------------------------------------------
-- 0b. Statement-level lock-only trigger function
--     FOR EACH STATEMENT, BEFORE. It runs once, before the executor takes ANY
--     row lock of the statement, so multi-row DML in opposite row order can
--     never build a wait-for cycle: every identity-boundary writer is already
--     serialized on the single global key before the first tuple is touched.
--     It reads no business row, writes nothing, emits no event, and uses no
--     dynamic SQL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.b1_lock_assignment_identity_boundary();
  RETURN NULL; -- BEFORE STATEMENT triggers ignore the return value.
END;
$function$;

REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_stmt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_stmt() FROM anon;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_stmt() FROM authenticated;

-- ----------------------------------------------------------------------------
-- 1. Effective-identity re-resolver (lock-then-read, fail-closed)
--
--    Row-shaped entry point: the guard must also run from a BEFORE INSERT
--    trigger, where the runtime row does NOT yet exist in the table and cannot
--    be re-selected by id. Both entry points share ONE body, so the INSERT and
--    the UPDATE activation guards can never diverge.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  p_step public.student_request_workflow_steps
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$

DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical text;
  v_department_id uuid;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_count integer;
  v_assignment_id uuid;
BEGIN
  v_step := p_step;
  IF v_step.id IS NULL OR v_step.student_request_id IS NULL THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;


  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Legacy / non-B1: untouched behaviour. Early return BEFORE the lock.
  IF NOT public.is_b1_stored_request_type(v_request_type) THEN
    RETURN;
  END IF;

  -- LOCK BEFORE READ. Everything below observes an identity boundary that no
  -- concurrent assignment, profile, position or transfer-scope mutation can
  -- change until this transaction commits or aborts.
  PERFORM public.b1_lock_assignment_identity_boundary();

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  -- Department scope: source head resolves ONLY the head of
  -- current_department_id, target head ONLY the head of requested_department_id.
  IF v_canonical = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
    SELECT CASE v_step.step_key
             WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id
           END
      INTO v_department_id
    FROM public.transfer_request_details d
    WHERE d.request_id = v_step.student_request_id;
    IF v_department_id IS NULL THEN
      RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING:%', v_step.step_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Exactly one effective assignment for (unit, role, department scope).
  -- is_valid_b1_direct_assignment re-reads staff_profiles.status/user_id,
  -- faculty_profiles.status/user_id/department_id and
  -- position_assignments.user_id/is_active/assigned_from/assigned_to under the
  -- lock, so a disabled profile or a swapped user_id is seen here.
  SELECT count(*) INTO v_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, v_count
      USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  -- Exactly one identity kind stored on the resolved assignment.
  IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
       v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_NOT_SINGULAR:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Exactly one identity kind stored on the runtime step.
  IF num_nonnulls(v_step.assigned_user_id, v_step.assigned_staff_profile_id,
       v_step.assigned_faculty_profile_id, v_step.assigned_position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, 0
      USING ERRCODE = '42501';
  END IF;

  -- Stored runtime identity must still equal the effective identity.
  IF v_step.assigned_user_id IS DISTINCT FROM v_assignment.user_id
     OR v_step.assigned_staff_profile_id IS DISTINCT FROM v_assignment.staff_profile_id
     OR v_step.assigned_faculty_profile_id IS DISTINCT FROM v_assignment.faculty_profile_id
     OR v_step.assigned_position_assignment_id IS DISTINCT FROM v_assignment.position_assignment_id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;

  -- Provenance pin, when recorded at initialization.
  v_assignment_id := (v_step.metadata ->> 'direct_assignment_id')::uuid;
  IF v_assignment_id IS NOT NULL AND v_assignment_id IS DISTINCT FROM v_assignment.id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_PROVENANCE_MISMATCH:%', v_step.step_key
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  public.student_request_workflow_steps) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  public.student_request_workflow_steps) FROM anon;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  public.student_request_workflow_steps) FROM authenticated;

-- By-id entry point, kept for callers/tests that address a persisted step.
-- It only fetches the row and delegates: one body, no divergence.
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(v_step);
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2. Activation guards (generic, engine-agnostic)
--
--    Two row-level guards share one validation body:
--      * BEFORE INSERT  WHEN NEW.status = 'active'
--          The FIRST runtime step of every B1 request is created ALREADY
--          active by initialize_b1_request_workflow_strict
--          (status = CASE WHEN step_order = first_order THEN 'active' ...),
--          so it never performs a pending -> active UPDATE and the UPDATE
--          guard alone would never see it. The same hole exists for any direct
--          INSERT of an active row through PostgREST DML.
--      * BEFORE UPDATE OF status WHEN NEW.status = 'active'
--          AND OLD.status IS DISTINCT FROM 'active'
--
--    Both run AFTER the BEFORE STATEMENT lock trigger below has already taken
--    the global identity boundary, so every identity read they perform is
--    inside the boundary and no row lock was acquired before it.
--
--    Failure of either aborts the whole calling transaction: for the INSERT
--    case that means NO runtime step of the request is created at all, no
--    workflow event exists, and no partial request survives.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(NEW);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_b1_runtime_step_activation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_b1_runtime_step_activation() FROM anon;
REVOKE ALL ON FUNCTION public.guard_b1_runtime_step_activation() FROM authenticated;

-- Statement-level lock for the runtime-step table itself: taken once, before
-- the executor locks any runtime row, for BOTH the initial active INSERT path
-- and every activation UPDATE path (RPC engines and direct DML alike).
DROP TRIGGER IF EXISTS trg_b1_lock_runtime_step_identity_stmt
  ON public.student_request_workflow_steps;

CREATE TRIGGER trg_b1_lock_runtime_step_identity_stmt
BEFORE INSERT OR UPDATE ON public.student_request_workflow_steps
FOR EACH STATEMENT
EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();

DROP TRIGGER IF EXISTS trg_guard_b1_runtime_step_activation_insert
  ON public.student_request_workflow_steps;

CREATE TRIGGER trg_guard_b1_runtime_step_activation_insert
BEFORE INSERT ON public.student_request_workflow_steps
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION public.guard_b1_runtime_step_activation();


DROP TRIGGER IF EXISTS trg_guard_b1_runtime_step_activation
  ON public.student_request_workflow_steps;

-- Name is intentionally ordered AFTER trg_guard_b1_runtime_mutation_boundary
-- so the atomic-boundary guard still runs first.
CREATE TRIGGER trg_guard_b1_runtime_step_activation
BEFORE UPDATE OF status ON public.student_request_workflow_steps
FOR EACH ROW
WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
EXECUTE FUNCTION public.guard_b1_runtime_step_activation();

-- ----------------------------------------------------------------------------
-- 3. Mutation side of the SAME global lock contract — STATEMENT LEVEL
--
--    Why statement level and not row level:
--      A BEFORE ROW trigger fires per tuple, and by the time it fires for the
--      SECOND tuple of a multi-row statement the executor already holds the
--      row lock of the FIRST tuple. Two transactions updating the same set of
--      rows in opposite order can therefore each hold a row lock and then
--      block on the advisory key / on each other — the row-level design could
--      not guarantee deadlock freedom for multi-row DML.
--      A BEFORE STATEMENT trigger fires exactly once, before the executor
--      touches any tuple, so the single global key is always acquired BEFORE
--      the first row lock. With one key and no row lock held at acquisition
--      time, no wait-for cycle can be constructed, whatever the row order or
--      row count.
--
--    Every trigger below only takes the lock. It reads no business row, writes
--    nothing, emits no event, performs no backfill and uses no dynamic SQL.
--
--    Covered writer paths (both plain PostgREST DML under RLS and the
--    SECURITY DEFINER admin RPCs — triggers cover both, which is why the
--    contract does not depend on an RPC inventory being complete):
--      a. request_processing_assignments  INSERT / UPDATE / DELETE
--      b. staff_profiles                  UPDATE OF user_id, status / DELETE
--         (admin_set_staff_status, admin_unlink_portal_login,
--          link_staff_profile_account, admin surfaces)
--      c. faculty_profiles                UPDATE OF user_id, status,
--         department_id / DELETE (admin_set_faculty_status,
--          admin_unlink_portal_login, link_faculty_profile_account)
--      d. position_assignments            INSERT / UPDATE / DELETE
--      e. transfer_request_details        UPDATE OF current_department_id,
--         requested_department_id (apply_b1_department_transfer_effect, admin)
--
--    Note on UPDATE OF <cols> at statement level: the column list still gates
--    which statements fire the trigger; it is deliberately kept so unrelated
--    profile edits (name, phone, …) never take the boundary lock.
-- ----------------------------------------------------------------------------

-- The superseded row-lock-only design is removed, not left behind.
DROP TRIGGER IF EXISTS trg_b1_lock_processing_assignment_scope
  ON public.request_processing_assignments;
DROP TRIGGER IF EXISTS trg_b1_lock_position_assignment_scope
  ON public.position_assignments;
DROP TRIGGER IF EXISTS trg_b1_lock_staff_profile_identity
  ON public.staff_profiles;
DROP TRIGGER IF EXISTS trg_b1_lock_staff_profile_identity_delete
  ON public.staff_profiles;
DROP TRIGGER IF EXISTS trg_b1_lock_faculty_profile_identity
  ON public.faculty_profiles;
DROP TRIGGER IF EXISTS trg_b1_lock_faculty_profile_identity_delete
  ON public.faculty_profiles;
DROP TRIGGER IF EXISTS trg_b1_lock_transfer_department_scope
  ON public.transfer_request_details;
DROP FUNCTION IF EXISTS public.b1_lock_assignment_identity_row();

DROP TRIGGER IF EXISTS trg_b1_lock_processing_assignment_stmt
  ON public.request_processing_assignments;

CREATE TRIGGER trg_b1_lock_processing_assignment_stmt
BEFORE INSERT OR UPDATE OR DELETE ON public.request_processing_assignments
FOR EACH STATEMENT
EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();

DROP TRIGGER IF EXISTS trg_b1_lock_position_assignment_stmt
  ON public.position_assignments;

CREATE TRIGGER trg_b1_lock_position_assignment_stmt
BEFORE INSERT OR UPDATE OR DELETE ON public.position_assignments
FOR EACH STATEMENT
EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();

DROP TRIGGER IF EXISTS trg_b1_lock_staff_profile_identity_stmt
  ON public.staff_profiles;

CREATE TRIGGER trg_b1_lock_staff_profile_identity_stmt
BEFORE UPDATE OF user_id, status OR DELETE ON public.staff_profiles
FOR EACH STATEMENT
EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();

DROP TRIGGER IF EXISTS trg_b1_lock_faculty_profile_identity_stmt
  ON public.faculty_profiles;

CREATE TRIGGER trg_b1_lock_faculty_profile_identity_stmt
BEFORE UPDATE OF user_id, status, department_id OR DELETE ON public.faculty_profiles
FOR EACH STATEMENT
EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();

DROP TRIGGER IF EXISTS trg_b1_lock_transfer_department_scope_stmt
  ON public.transfer_request_details;

CREATE TRIGGER trg_b1_lock_transfer_department_scope_stmt
BEFORE UPDATE OF current_department_id, requested_department_id
  ON public.transfer_request_details
FOR EACH STATEMENT
EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();



COMMIT;

-- ============================================================================
-- Fail-closed semantics
--   Any RAISE above aborts the whole calling transaction. Therefore:
--     * for the INITIAL ACTIVE INSERT path, NO runtime step row of the request
--       is created at all (the whole initialize transaction rolls back): no
--       partial workflow, no event, no half-built request,
--     * for the activation UPDATE path, the predecessor step is NOT completed,
--     * no workflow event row is created,
--     * the active-step count stays exactly as it was (never 0, never >1),
--     * no partial mutation persists,
--     * a retry after the assignment data is corrected is idempotent.
--   Pre-existing 'pending' steps (including SR-20260727-88D885F0 steps 2 and 3)
--   are covered without any backfill: the guard runs at their activation.
--
-- Concurrency semantics
--   * The advisory key is global and transaction-scoped: it is released only at
--     COMMIT or ROLLBACK, so the "exactly one effective identity" predicate
--     proven by the assert still holds at the instant the activation commits.
--   * The key is acquired by BEFORE STATEMENT triggers, i.e. before the
--     executor takes the first row lock of the statement, on both the identity
--     tables and the runtime-step table itself.
--   * A concurrent deactivate / delete / second INSERT / department re-scope /
--     staff or faculty profile disable / user_id swap / department move BLOCKS
--     until the activating transaction finishes; the mirror case (mutation
--     first) makes activation block and then re-read the committed state, so it
--     can never act on a stale snapshot.
--   * Deadlock freedom: exactly ONE key for the whole boundary, taken before
--     any row lock, so no wait-for cycle between two identity-boundary
--     transactions can be built — regardless of how many rows a statement
--     touches or in which row order.
--   * Phantom freedom: the predicate is protected by the boundary lock rather
--     than by per-row locks, so a newly INSERTed second assignment cannot slip
--     into the window.
--   * Both outcomes are total: either activation with exactly one valid
--     assignee, or a fully rejected transaction. Retry is safe.
--
-- Legacy scope of the runtime-step statement lock
--   trg_b1_lock_runtime_step_identity_stmt is lock-only and unconditional on
--   student_request_workflow_steps. It changes no functional behaviour for
--   enrollment_certificate or any non-B1 flow (the row guards still return
--   before validating them); the only effect is that two concurrent workflow
--   statements serialize on one advisory key for the duration of a single
--   statement's transaction.
--
-- Proof
--   tests/b1-runtime-assignee-lock-concurrency-01/run-harness.py executes this
--   exact file against a throwaway Postgres 17 cluster with real concurrent
--   sessions (initial active INSERT accept/reject, disabled profile, user_id
--   swap, phantom assignment, multi-row reversed order on assignments and on
--   profiles, activation vs multi-row mutation, deactivate, department
--   re-scope, legacy control, retry). Results:
--   tests/b1-runtime-assignee-lock-concurrency-01/RESULTS.md
-- ============================================================================

