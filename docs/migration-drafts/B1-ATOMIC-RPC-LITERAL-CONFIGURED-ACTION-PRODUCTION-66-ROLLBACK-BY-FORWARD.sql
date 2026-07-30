-- PORTAL-B1-...-66 — ROLLBACK BY FORWARD (recovery template, NOT a DROP)
--
-- There is no destructive rollback: the package replaces four function bodies
-- inside ONE transaction, so a failed apply leaves production byte-identical.
-- Use this file ONLY if an applied migration must be reverted operationally.
--
-- PROCEDURE
--   1. Take the pre-image captured by preflight query P2 (and the equivalent
--      pg_get_functiondef output for the three reader functions).
--   2. Paste each captured definition verbatim between BEGIN; and COMMIT; below.
--   3. Re-run the post-verifier; V1/V2 will then report the pre-migration state.
--
-- STOP CONDITIONS DURING ROLLBACK
--   * pre-image text unavailable or not byte-identical to the preflight capture
--   * owner / SECURITY DEFINER / search_path / ACL differ from the P1 record
--   * any B1 runtime step transitioned between apply and rollback
--     (check student_request_workflow_events for events after the apply timestamp)
--   In any of these cases: DO NOT roll back. Escalate; remediate forward-only.

BEGIN;

-- <<< PASTE PRE-IMAGE: public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) >>>
-- <<< PASTE PRE-IMAGE: public.get_b1_step_allowed_actions(uuid) >>>
-- <<< PASTE PRE-IMAGE: public.get_b1_assigned_request_details_for_actor(uuid) >>>
-- <<< PASTE PRE-IMAGE: public.get_b1_assigned_inbox_for_actor(integer,integer) >>>

DO $guard$
BEGIN
  RAISE EXCEPTION 'B1_66_ROLLBACK_TEMPLATE_NOT_FILLED — paste the captured pre-images before running';
END
$guard$;

COMMIT;
