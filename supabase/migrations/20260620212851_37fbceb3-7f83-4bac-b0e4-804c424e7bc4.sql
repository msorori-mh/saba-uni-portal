ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_attempts FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_attempts FROM authenticated;

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