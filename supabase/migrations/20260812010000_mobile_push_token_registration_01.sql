-- MOBILE PUSH TOKEN REGISTRATION FOUNDATION
-- Mission: PORTAL-MOBILE-PUBLIC-BACKEND-BRIDGE-LONGRUN-04
-- SOURCE-ONLY: DO NOT APPLY TO PRODUCTION FROM THIS MISSION.
-- Outbound FCM/APNs delivery is OUT OF SCOPE.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mobile_device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL
    CHECK (platform IN ('android', 'ios', 'web')),
  token text NOT NULL,
  device_id text NULL,
  app_version text NULL,
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_device_push_tokens_token_len
    CHECK (char_length(token) BETWEEN 16 AND 4096),
  CONSTRAINT mobile_device_push_tokens_device_id_len
    CHECK (device_id IS NULL OR char_length(device_id) BETWEEN 1 AND 256)
);

COMMENT ON TABLE public.mobile_device_push_tokens IS
  'Sensitive operational push device tokens. Client SELECT must remain own-row only; mutations via SECURITY DEFINER RPCs bound to auth.uid().';

-- One active token value globally (re-registration revokes prior owner via RPC).
CREATE UNIQUE INDEX IF NOT EXISTS mobile_device_push_tokens_token_uidx
  ON public.mobile_device_push_tokens (token);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_device_push_tokens_user_device_active_uidx
  ON public.mobile_device_push_tokens (user_id, device_id)
  WHERE is_active = true AND device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mobile_device_push_tokens_user_active_idx
  ON public.mobile_device_push_tokens (user_id)
  WHERE is_active = true;

ALTER TABLE public.mobile_device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Fail-closed: no broad client SELECT of other users' tokens.
DROP POLICY IF EXISTS mobile_device_push_tokens_select_own ON public.mobile_device_push_tokens;
CREATE POLICY mobile_device_push_tokens_select_own
  ON public.mobile_device_push_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE from clients — RPCs only.
REVOKE ALL ON TABLE public.mobile_device_push_tokens FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.mobile_device_push_tokens TO authenticated;
GRANT ALL ON TABLE public.mobile_device_push_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- register_mobile_push_token
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_mobile_push_token(
  p_token text,
  p_platform text,
  p_device_id text DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.mobile_device_push_tokens%ROWTYPE;
  v_platform text := lower(btrim(COALESCE(p_platform, '')));
  v_token text := btrim(COALESCE(p_token, ''));
  v_device_id text := NULLIF(btrim(COALESCE(p_device_id, '')), '');
  v_app_version text := NULLIF(btrim(COALESCE(p_app_version, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF v_token IS NULL OR char_length(v_token) < 16 OR char_length(v_token) > 4096 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR:token' USING ERRCODE = '22023';
  END IF;

  IF v_platform NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR:platform' USING ERRCODE = '22023';
  END IF;

  IF v_device_id IS NOT NULL AND char_length(v_device_id) > 256 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR:device_id' USING ERRCODE = '22023';
  END IF;

  -- If token already exists for another user, revoke it (device transferred).
  UPDATE public.mobile_device_push_tokens t
  SET is_active = false,
      revoked_at = now(),
      updated_at = now()
  WHERE t.token = v_token
    AND t.user_id <> v_uid
    AND t.is_active = true;

  -- Free the (user_id, device_id) active slot before upsert to honor unique index.
  IF v_device_id IS NOT NULL THEN
    UPDATE public.mobile_device_push_tokens t
    SET is_active = false,
        revoked_at = now(),
        updated_at = now()
    WHERE t.user_id = v_uid
      AND t.device_id = v_device_id
      AND t.token <> v_token
      AND t.is_active = true;
  END IF;

  -- Upsert by token for current user
  INSERT INTO public.mobile_device_push_tokens AS t (
    user_id, platform, token, device_id, app_version, is_active, revoked_at, last_seen_at, updated_at
  ) VALUES (
    v_uid, v_platform, v_token, v_device_id, v_app_version, true, NULL, now(), now()
  )
  ON CONFLICT (token) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      device_id = COALESCE(EXCLUDED.device_id, t.device_id),
      app_version = COALESCE(EXCLUDED.app_version, t.app_version),
      is_active = true,
      revoked_at = NULL,
      last_seen_at = now(),
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'user_id', v_row.user_id,
    'platform', v_row.platform,
    'device_id', v_row.device_id,
    'is_active', v_row.is_active,
    'last_seen_at', v_row.last_seen_at,
    'created_at', v_row.created_at
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- revoke_mobile_push_token
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_mobile_push_token(
  p_token text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_all boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := NULLIF(btrim(COALESCE(p_token, '')), '');
  v_device_id text := NULLIF(btrim(COALESCE(p_device_id, '')), '');
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF COALESCE(p_all, false) IS NOT TRUE
     AND v_token IS NULL
     AND v_device_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR:target' USING ERRCODE = '22023';
  END IF;

  WITH updated AS (
    UPDATE public.mobile_device_push_tokens t
    SET is_active = false,
        revoked_at = now(),
        updated_at = now()
    WHERE t.user_id = v_uid
      AND t.is_active = true
      AND (
        COALESCE(p_all, false) IS TRUE
        OR (v_token IS NOT NULL AND t.token = v_token)
        OR (v_device_id IS NOT NULL AND t.device_id = v_device_id)
      )
    RETURNING t.id
  )
  SELECT count(*)::integer INTO v_count FROM updated;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked_count', v_count
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- touch_mobile_push_token (last_seen heartbeat)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_mobile_push_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := btrim(COALESCE(p_token, ''));
  v_row public.mobile_device_push_tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF v_token IS NULL OR char_length(v_token) < 16 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR:token' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mobile_device_push_tokens t
  SET last_seen_at = now(),
      updated_at = now()
  WHERE t.user_id = v_uid
    AND t.token = v_token
    AND t.is_active = true
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'last_seen_at', v_row.last_seen_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_mobile_push_token(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_mobile_push_token(text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_mobile_push_token(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_mobile_push_token(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_mobile_push_token(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_mobile_push_token(text) TO authenticated;

COMMIT;
