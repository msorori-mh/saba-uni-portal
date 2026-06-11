
-- 1) Table
CREATE TABLE public.rate_limit_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  action text NOT NULL,
  actor_identifier text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  blocked_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 2) Grants — NO access to anon/authenticated; only service_role and SECURITY DEFINER funcs
GRANT ALL ON public.rate_limit_attempts TO service_role;

-- 3) RLS — enabled, no policies => fully locked from Data API
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- 4) Indexes
CREATE INDEX idx_rl_key_action_created ON public.rate_limit_attempts (key, action, created_at DESC);
CREATE INDEX idx_rl_expires_at ON public.rate_limit_attempts (expires_at);
CREATE INDEX idx_rl_blocked_until ON public.rate_limit_attempts (blocked_until) WHERE blocked_until IS NOT NULL;

-- 5) Atomic check+record RPC
CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(
  p_key text,
  p_action text,
  p_max_attempts int,
  p_window_minutes int,
  p_block_minutes int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(mins => p_window_minutes);
  v_block_until timestamptz;
  v_attempts int;
  v_remaining int;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR p_action IS NULL OR length(p_action) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'invalid_input');
  END IF;

  -- Existing active block?
  SELECT MAX(blocked_until) INTO v_block_until
  FROM public.rate_limit_attempts
  WHERE key = p_key AND action = p_action AND blocked_until IS NOT NULL AND blocked_until > v_now;

  IF v_block_until IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'blocked_until', v_block_until,
      'reason', 'blocked'
    );
  END IF;

  -- Count attempts in window
  SELECT COUNT(*) INTO v_attempts
  FROM public.rate_limit_attempts
  WHERE key = p_key AND action = p_action AND created_at >= v_window_start;

  IF v_attempts >= p_max_attempts THEN
    v_block_until := v_now + make_interval(mins => p_block_minutes);

    INSERT INTO public.rate_limit_attempts(key, action, blocked_until, expires_at, metadata)
    VALUES (
      p_key, p_action, v_block_until,
      v_block_until + interval '1 hour',
      jsonb_build_object('event','blocked','attempts', v_attempts)
    );

    BEGIN
      PERFORM public.log_audit(
        'security', NULL, 'rate_limit_triggered',
        NULL,
        jsonb_build_object('key', p_key, 'action', p_action,
                           'attempts', v_attempts, 'blocked_until', v_block_until),
        'Rate limit exceeded'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'blocked_until', v_block_until,
      'reason', 'exceeded'
    );
  END IF;

  -- Record this attempt
  INSERT INTO public.rate_limit_attempts(key, action, expires_at)
  VALUES (p_key, p_action, v_now + make_interval(mins => p_window_minutes) + interval '10 minutes');

  v_remaining := GREATEST(p_max_attempts - v_attempts - 1, 0);
  RETURN jsonb_build_object('allowed', true, 'remaining', v_remaining, 'reason', 'ok');
END;
$$;

-- 6) Cleanup helper
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_attempts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.rate_limit_attempts
  WHERE expires_at < now() - interval '1 hour'
    AND (blocked_until IS NULL OR blocked_until < now());
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 7) Execute privileges
REVOKE ALL ON FUNCTION public.check_and_record_rate_limit(text, text, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit(text, text, int, int, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cleanup_rate_limit_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_attempts() TO service_role;
