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
--   re-scoped, duplicated, or detached between submit and activation, and no
--   engine re-checks it before flipping pending -> active. This migration
--   closes that gap.
--
-- TOCTOU root cause (why re-reading alone is NOT sufficient)
--   The assignment rows the assert depends on are mutated exclusively by
--   direct table DML through PostgREST under RLS (admin surfaces) — verified
--   against pg_proc: no SECURITY DEFINER RPC writes
--   public.request_processing_assignments. Therefore the writers take no lock
--   the activation path could observe. Under READ COMMITTED (the PostgREST
--   default), the assert's SELECTs take a fresh snapshot, so a concurrent
--   transaction can COMMIT a deactivate / delete / second INSERT / department
--   re-scope AFTER the assert reads and BEFORE the activating transaction
--   commits. MVCC gives the reader a consistent snapshot; it does NOT give it
--   a predicate lock. Without SERIALIZABLE (which this database does not
--   enforce) the "exactly one effective identity" predicate is therefore not
--   stable across the activation commit.
--
--   Remedy below: ONE transaction-scoped advisory lock, keyed on the
--   (processing_unit_id, processing_role_id) scope, shared by BOTH sides —
--   the activation path and every assignment-mutation path that can change
--   the effective identity for that scope. Keys are always acquired in
--   ascending order, so no lock-ordering deadlock is possible.
--
-- Legacy impact
--   The guard is a strict no-op for every non-B1 request type, including
--   enrollment_certificate: the trigger function returns immediately when
--   is_b1_stored_request_type(request_type) is false. No legacy function,
--   policy, grant, or row is modified.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Shared lock primitive
--    One stable key per (unit, role) processing scope. Every path that can
--    change the effective identity for a scope, and the activation path that
--    depends on it, take the SAME key in the SAME transaction-scoped mode.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_assignment_scope_lock_key(
  p_unit_id uuid,
  p_role_id uuid
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT hashtextextended(
    'b1_assignment_scope:' || coalesce(p_unit_id::text, '-') || ':' ||
    coalesce(p_role_id::text, '-'), 0);
$function$;

-- Deterministic ordered acquisition: sorting the keys inside the single
-- entry point makes lock ordering global and identical for every caller,
-- which removes any deadlock window between activation and mutation paths.
CREATE OR REPLACE FUNCTION public.b1_lock_assignment_scopes(p_keys bigint[])
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_key bigint;
BEGIN
  IF p_keys IS NULL THEN
    RETURN;
  END IF;
  FOR v_key IN
    SELECT DISTINCT k FROM unnest(p_keys) AS k WHERE k IS NOT NULL ORDER BY k
  LOOP
    PERFORM pg_advisory_xact_lock(v_key);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.b1_lock_assignment_scopes(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_scopes(bigint[]) FROM anon;

-- ----------------------------------------------------------------------------
-- 1. Effective-identity re-resolver (lock-then-read, fail-closed)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
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
  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Legacy / non-B1: untouched behaviour. No lock is taken either.
  IF NOT public.is_b1_stored_request_type(v_request_type) THEN
    RETURN;
  END IF;

  -- LOCK BEFORE READ. Everything below observes a scope that no concurrent
  -- assignment mutation can change until this transaction commits or aborts.
  PERFORM public.b1_lock_assignment_scopes(
    ARRAY[public.b1_assignment_scope_lock_key(
      v_step.processing_unit_id, v_step.processing_role_id)]);

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

REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2. Activation guard trigger (generic, engine-agnostic)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_b1_runtime_step_assignee_effective(NEW.id);
  RETURN NEW;
END;
$function$;

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
-- 3. Mutation-side of the SAME lock contract
--    Covered writer paths (all of them are plain table DML through PostgREST
--    under RLS; none of them is wrapped in a SECURITY DEFINER RPC):
--      a. request_processing_assignments  INSERT / UPDATE / DELETE
--         (deactivate via is_active, expire via ends_at, re-scope via
--          department_id/unit_id/role_id, identity swap, phantom second row)
--      b. position_assignments            INSERT / UPDATE / DELETE
--         (provenance behind assignment_type = 'position_assignment')
--      c. transfer_request_details        department scope change
--         (moves which department the two head steps must resolve)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_lock_processing_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_keys bigint[] := ARRAY[]::bigint[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_keys := v_keys || public.b1_assignment_scope_lock_key(OLD.unit_id, OLD.role_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_keys := v_keys || public.b1_assignment_scope_lock_key(NEW.unit_id, NEW.role_id);
  END IF;
  PERFORM public.b1_lock_assignment_scopes(v_keys);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_b1_lock_processing_assignment_scope
  ON public.request_processing_assignments;

CREATE TRIGGER trg_b1_lock_processing_assignment_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.request_processing_assignments
FOR EACH ROW
EXECUTE FUNCTION public.b1_lock_processing_assignment_scope();

CREATE OR REPLACE FUNCTION public.b1_lock_position_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_keys bigint[];
BEGIN
  SELECT coalesce(array_agg(public.b1_assignment_scope_lock_key(a.unit_id, a.role_id)),
                  ARRAY[]::bigint[])
    INTO v_keys
  FROM public.request_processing_assignments a
  WHERE a.position_assignment_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
     OR (TG_OP = 'UPDATE' AND a.position_assignment_id = OLD.id);

  PERFORM public.b1_lock_assignment_scopes(v_keys);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_b1_lock_position_assignment_scope
  ON public.position_assignments;

CREATE TRIGGER trg_b1_lock_position_assignment_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.position_assignments
FOR EACH ROW
EXECUTE FUNCTION public.b1_lock_position_assignment_scope();

CREATE OR REPLACE FUNCTION public.b1_lock_transfer_department_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_keys bigint[];
BEGIN
  SELECT coalesce(array_agg(public.b1_assignment_scope_lock_key(
           s.processing_unit_id, s.processing_role_id)), ARRAY[]::bigint[])
    INTO v_keys
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id = NEW.request_id
    AND s.step_key IN ('source_department_head_approval','target_department_head_approval');

  PERFORM public.b1_lock_assignment_scopes(v_keys);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_b1_lock_transfer_department_scope
  ON public.transfer_request_details;

CREATE TRIGGER trg_b1_lock_transfer_department_scope
BEFORE UPDATE OF current_department_id, requested_department_id
  ON public.transfer_request_details
FOR EACH ROW
WHEN (NEW.current_department_id IS DISTINCT FROM OLD.current_department_id
   OR NEW.requested_department_id IS DISTINCT FROM OLD.requested_department_id)
EXECUTE FUNCTION public.b1_lock_transfer_department_scope();

COMMIT;

-- ============================================================================
-- Fail-closed semantics
--   Any RAISE above aborts the whole calling transaction. Therefore:
--     * the predecessor step is NOT completed,
--     * no workflow event row is created,
--     * the active-step count stays exactly as it was (never 0, never >1),
--     * no partial mutation persists,
--     * a retry after the assignment data is corrected is idempotent.
--   Pre-existing 'pending' steps (including SR-20260727-88D885F0 steps 2 and 3)
--   are covered without any backfill: the guard runs at their activation.
--
-- Concurrency semantics
--   * The advisory key is transaction-scoped: it is released only at COMMIT or
--     ROLLBACK, so the "exactly one effective identity" predicate proven by the
--     assert still holds at the instant the activation commits.
--   * A concurrent deactivate / delete / second INSERT / department re-scope
--     for the same scope BLOCKS until the activating transaction finishes; the
--     mirror case (mutation first) makes activation block and then re-read the
--     committed state, so it can never act on a stale snapshot.
--   * Deadlock freedom: every production path takes the scope keys through the
--     single entry point b1_lock_assignment_scopes, which acquires them in
--     ascending key order, so a multi-scope caller can never build a cyclic
--     order against another multi-scope caller. Activation transactions touch
--     exactly one scope, and a per-row assignment statement takes at most the
--     OLD and NEW scope of that row in the same sorted call.
--   * Both outcomes are total: either activation with exactly one valid
--     assignee, or a fully rejected transaction. Retry is safe.
--
-- Proof
--   tests/b1-runtime-assignee-lock-concurrency-01/run-harness.py executes this
--   exact file against a throwaway Postgres 17 cluster with two real
--   concurrent sessions (deactivate, phantom insert, department re-scope,
--   reversed lock order, legacy control, retry). Results:
--   tests/b1-runtime-assignee-lock-concurrency-01/RESULTS.md
-- ============================================================================

