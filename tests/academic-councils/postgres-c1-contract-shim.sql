-- Disposable TEST_ONLY C1 transition contract shim for local PG17 verifier execution.
-- NOT FOR PRODUCTION USE.

CREATE OR REPLACE FUNCTION public.can_transition_council_meeting_state(
  p_meeting_id uuid,
  p_target_status text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_transition_council_meeting_state(uuid, text) TO authenticated, service_role;
