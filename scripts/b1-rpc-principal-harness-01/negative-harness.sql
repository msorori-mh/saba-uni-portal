-- ============================================================================
-- OPERATOR NEGATIVE HARNESS — B1 RPC PRINCIPAL MATRIX
-- DO NOT RUN AUTOMATICALLY. Manual operator execution only.
--
-- Equivalence proof (why this is authenticated-equivalent):
--   auth.uid()  = (current_setting('request.jwt.claims')::jsonb ->> 'sub')::uuid
--   auth.role() = (current_setting('request.jwt.claims')::jsonb ->> 'role')
--   Both read ONLY the GUC, exactly like a PostgREST request. Setting
--   `SET LOCAL ROLE authenticated` additionally drops superuser/bypassrls and
--   forces the same GRANT + RLS surface PostgREST uses. Nothing in the B1
--   authorization chain (can_current_user_act_on_step,
--   user_matches_workflow_runtime_step, current_user_has_exact_processing_binding,
--   current_user_matches_transfer_department_scope) reads current_user or
--   session_user, so the principal seen by the function is identical.
--
-- Every case below runs inside its own transaction that ENDS IN ROLLBACK.
-- Expected outcome for every negative case: false / exception, and zero
-- persistent mutation. Any unauthorized success => STOP THE MATRIX.
-- ============================================================================

\set ON_ERROR_STOP off
\timing off

-- --------------------------------------------------------------------------
-- Snapshot helper (run before and after the whole harness, compare output)
-- --------------------------------------------------------------------------
-- SELECT r.request_number, s.step_order, s.step_key, s.status, s.decision,
--        s.completed_by, s.completed_at,
--        (SELECT count(*) FROM public.student_request_workflow_events e
--          WHERE e.student_request_id = r.id) AS events
-- FROM public.student_requests r
-- JOIN public.student_request_workflow_steps s ON s.student_request_id = r.id
-- WHERE r.request_number IN (
--   'SR-20260727-42393846','SR-20260727-50BEDCE2','SR-20260727-3C550070',
--   'SR-20260727-88D885F0','SR-20260727-695EC35B')
-- ORDER BY r.request_number, s.step_order;

-- --------------------------------------------------------------------------
-- Template: one negative case = one transaction = one ROLLBACK
--   :'principal_user_id'  auth user id under test (NEVER the real assignee)
--   :'step_id'            runtime step id under test
--   :'action'             configured action_type for that step
-- --------------------------------------------------------------------------
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', :'principal_user_id', 'role', 'authenticated')::text,
    true
  );

  -- Principal equivalence assertions (must all be true before any RPC call).
  SELECT auth.uid()::text = :'principal_user_id' AS uid_ok,
         auth.role() = 'authenticated'           AS role_ok,
         current_role = 'authenticated'          AS db_role_ok,
         NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_role)
                                                 AS no_bypass_ok;

  -- Read-only authorization probe (no mutation).
  SELECT public.can_current_user_act_on_step(:'step_id'::uuid, :'action') AS expect_false;

  -- Mutating probe: MUST raise. Kept inside the rolled-back transaction.
  SELECT public.act_on_b1_student_request_step_atomic(:'step_id'::uuid, :'action', NULL, '{}'::jsonb);
ROLLBACK;

-- --------------------------------------------------------------------------
-- Required negative coverage (repeat the template per row)
--   * every B1 step  x  every non-assigned staff principal
--   * admin / system_admin / registrar / dean principals on steps they are not
--     directly assigned to  (must be denied — no bypass)
--   * the request owner (student) on every staff step
--   * department_transfer source head principal on the TARGET head step
--   * department_transfer target head principal on the SOURCE head step
--   * a third department head on both head steps
--   * pending (not yet active) steps for the correct assignee
--   * confirm_payment via act_on_b1_student_request_step_atomic
--     (must raise B1_SPECIALIZED_ACTION_RPC_REQUIRED)
--
-- FORBIDDEN in this harness:
--   calling any RPC as postgres/service_role, relying on current_user instead
--   of auth.uid(), bypassing GRANTs or ownership, using employee passwords,
--   modifying auth.users, COMMIT.
-- ============================================================================
