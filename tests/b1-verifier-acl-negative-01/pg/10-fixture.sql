-- Synthetic fixture for tests/b1-verifier-acl-negative-01.
-- Minimal catalog shape the extracted ACL contract block needs:
--   * public.request_processing_assignments  -> owner reference
--   * public.student_request_workflow_steps  -> composite arg type
--   * the six order-29 functions with their EXACT signatures, correct owner,
--     pinned search_path, correct security context and explicit REVOKEs.
-- Bodies are stubs on purpose: this fixture proves the ACL/catalog contract,
-- not the lock semantics (those are proven by the concurrency harness).

-- Roles are cluster-wide, so create them idempotently: each case runs in its
-- own database on one throwaway cluster.
DO $roles$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','other_owner','acl_holder'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$roles$;
-- Role memberships are cluster-wide too; reset the N8 fixture each time.
REVOKE acl_holder FROM anon;

CREATE TABLE public.request_processing_assignments (id uuid PRIMARY KEY);
CREATE TABLE public.student_request_workflow_steps (id uuid PRIMARY KEY);

CREATE FUNCTION public.b1_assignment_identity_lock_key()
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $f$ SELECT 7346501982230114001::bigint; $f$;

CREATE FUNCTION public.b1_lock_assignment_identity_boundary()
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path TO 'public'
AS $f$ BEGIN PERFORM pg_advisory_xact_lock(public.b1_assignment_identity_lock_key()); END $f$;

CREATE FUNCTION public.b1_lock_assignment_identity_stmt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ BEGIN PERFORM public.b1_lock_assignment_identity_boundary(); RETURN NULL; END $f$;

CREATE FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  p_step public.student_request_workflow_steps)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $f$ BEGIN RETURN; END $f$;

CREATE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $f$ BEGIN RETURN; END $f$;

CREATE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ BEGIN RETURN NEW; END $f$;

-- Explicit ACL: this is what materialises proacl. Without it proacl stays NULL
-- and PostgreSQL's default EXECUTE-to-PUBLIC applies.
REVOKE ALL ON FUNCTION public.b1_assignment_identity_lock_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_boundary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  public.student_request_workflow_steps) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_b1_runtime_step_activation() FROM PUBLIC, anon, authenticated;
