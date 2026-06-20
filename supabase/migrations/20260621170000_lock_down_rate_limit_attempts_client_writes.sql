-- SECURITY: Lock down direct client writes to rate_limit_attempts.
-- Addresses scanner finding: rate_limit_attempts_no_insert_policy
-- Writes remain via check_and_record_rate_limit / cleanup_rate_limit_attempts (SECURITY DEFINER).

ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Strip direct write privileges from API roles (defense-in-depth; service_role unchanged).
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_attempts FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_attempts FROM authenticated;

-- Explicit deny write policies for security linter + RLS clarity.
-- (SELECT for admin/system_admin remains via existing rla_admin_select policy.)
CREATE POLICY rla_deny_client_insert
  ON public.rate_limit_attempts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY rla_deny_client_update
  ON public.rate_limit_attempts
  FOR UPDATE
  TO anon, authenticated
  USING (false);

CREATE POLICY rla_deny_client_delete
  ON public.rate_limit_attempts
  FOR DELETE
  TO anon, authenticated
  USING (false);
