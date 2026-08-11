-- Behavioral verifier for mobile push token RPCs (disposable PG17).
\set ON_ERROR_STOP on

-- search_path fixed on SECURITY DEFINER functions
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'register_mobile_push_token',
      'revoke_mobile_push_token',
      'touch_mobile_push_token'
    )
    AND (
      p.prosecdef IS NOT TRUE
      OR p.proconfig IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%public%'
          AND cfg LIKE '%pg_temp%'
      )
    );
  IF bad <> 0 THEN
    RAISE EXCEPTION 'SECURITY DEFINER search_path/grant envelope failed (% bad)', bad;
  END IF;
END $$;

DO $$
DECLARE
  v jsonb;
  v_count int;
BEGIN
  -- Anonymous deny
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.register_mobile_push_token('token-aaaaaaaaaaaaaaaa', 'android', 'dev-a', '1.0.0');
    RAISE EXCEPTION 'expected AUTH_REQUIRED for anonymous register';
  EXCEPTION WHEN SQLSTATE '28000' THEN
    NULL;
  END;

  -- Own-user allow (user A)
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v := public.register_mobile_push_token('token-aaaaaaaaaaaaaaaa', 'android', 'dev-a', '1.0.0');
  IF (v->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'register own user failed: %', v;
  END IF;
  IF (v->>'user_id') <> '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'register bound wrong user: %', v;
  END IF;

  -- Update / replace same device
  v := public.register_mobile_push_token('token-bbbbbbbbbbbbbbbb', 'android', 'dev-a', '1.0.1');
  IF (v->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'replace token failed: %', v;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.mobile_device_push_tokens
  WHERE user_id = '11111111-1111-1111-1111-111111111111'
    AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 active token for user A after replace, got %', v_count;
  END IF;

  -- Touch last_seen
  v := public.touch_mobile_push_token('token-bbbbbbbbbbbbbbbb');
  IF (v->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'touch failed: %', v;
  END IF;

  -- Cross-user cannot revoke another user's token by using their JWT against foreign row
  -- (revoke is scoped to auth.uid(); attempting foreign token simply revokes 0)
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.revoke_mobile_push_token('token-bbbbbbbbbbbbbbbb', NULL, false);
  IF (v->>'revoked_count')::int <> 0 THEN
    RAISE EXCEPTION 'cross-user revoke should be 0, got %', v;
  END IF;

  -- User B cannot SELECT user A tokens via RLS (as authenticated role)
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  SELECT count(*)::int INTO v_count
  FROM public.mobile_device_push_tokens
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS leaked other user tokens: %', v_count;
  END IF;

  -- Owner revoke
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v := public.revoke_mobile_push_token(NULL, NULL, true);
  IF (v->>'revoked_count')::int < 1 THEN
    RAISE EXCEPTION 'owner revoke all failed: %', v;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.mobile_device_push_tokens
  WHERE user_id = '11111111-1111-1111-1111-111111111111'
    AND is_active = true;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'active tokens remain after revoke: %', v_count;
  END IF;
END $$;

SELECT 'PASS_MOBILE_PUSH_TOKEN_PG17' AS result;
