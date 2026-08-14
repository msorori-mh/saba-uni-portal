CREATE TABLE IF NOT EXISTS public.student_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  public_key text NOT NULL,
  algorithm text NOT NULL DEFAULT 'SHA256withECDSA',
  platform text NOT NULL DEFAULT 'android',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

GRANT SELECT ON public.student_trusted_devices TO authenticated;
GRANT ALL ON public.student_trusted_devices TO service_role;
ALTER TABLE public.student_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_trusted_devices_read"
  ON public.student_trusted_devices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.step_up_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  action_code text NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.step_up_challenges TO service_role;
ALTER TABLE public.step_up_challenges ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated: reachable only through SECURITY DEFINER RPCs.

CREATE TABLE IF NOT EXISTS public.step_up_proofs (
  proof_token text PRIMARY KEY,
  challenge_id uuid REFERENCES public.step_up_challenges (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  action_code text NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.step_up_proofs TO service_role;
ALTER TABLE public.step_up_proofs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- devices ---

CREATE OR REPLACE FUNCTION public.register_student_device(
  p_device_id text,
  p_public_key text,
  p_algorithm text,
  p_platform text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF coalesce(length(p_public_key), 0) < 32 THEN
    RAISE EXCEPTION 'INVALID_PUBLIC_KEY';
  END IF;

  INSERT INTO public.student_trusted_devices (
    user_id, device_id, public_key, algorithm, platform, revoked_at, updated_at
  )
  VALUES (auth.uid(), p_device_id, p_public_key, coalesce(p_algorithm, 'SHA256withECDSA'),
          coalesce(p_platform, 'android'), NULL, now())
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET public_key = EXCLUDED.public_key,
        algorithm  = EXCLUDED.algorithm,
        platform   = EXCLUDED.platform,
        revoked_at = NULL,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_student_device(p_device_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  UPDATE public.student_trusted_devices
     SET revoked_at = now(), updated_at = now()
   WHERE user_id = auth.uid() AND device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_all_student_devices()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  UPDATE public.student_trusted_devices
     SET revoked_at = now(), updated_at = now()
   WHERE user_id = auth.uid() AND revoked_at IS NULL;
END;
$$;

-- ------------------------------------------------------------- challenges ---

CREATE OR REPLACE FUNCTION public.issue_step_up_challenge(
  p_device_id text,
  p_action_code text,
  p_request_id uuid,
  p_payload_hash text
) RETURNS TABLE (challenge_id uuid, nonce text, expires_at timestamptz, device_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_nonce text := encode(gen_random_bytes(24), 'hex');
  v_expires timestamptz := now() + interval '120 seconds';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_action_code NOT IN (
    'submit_file_withdrawal', 'submit_enrollment_suspension',
    'submit_department_transfer', 'submit_final_chance', 'submit_excused_absence'
  ) THEN
    RAISE EXCEPTION 'UNSUPPORTED_STEP_UP_ACTION';
  END IF;
  IF p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD_HASH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_trusted_devices d
     WHERE d.user_id = v_user AND d.device_id = p_device_id AND d.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'DEVICE_NOT_TRUSTED';
  END IF;

  INSERT INTO public.step_up_challenges (
    user_id, device_id, action_code, request_id, payload_hash, nonce, expires_at
  )
  VALUES (v_user, p_device_id, p_action_code, p_request_id, p_payload_hash, v_nonce, v_expires)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_nonce, v_expires, p_device_id;
END;
$$;

-- Minting requires server-side ECDSA verification, therefore service_role only.
CREATE OR REPLACE FUNCTION public.mint_step_up_proof(p_challenge_id uuid)
RETURNS TABLE (proof_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.step_up_challenges%ROWTYPE;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + interval '120 seconds';
BEGIN
  -- Columns are alias-qualified: this function has OUT parameters named
  -- `proof_token`/`expires_at`, so unqualified references would be ambiguous.
  UPDATE public.step_up_challenges AS ch
     SET consumed_at = now()
   WHERE ch.id = p_challenge_id
     AND ch.consumed_at IS NULL
     AND ch.expires_at > now()
  RETURNING ch.* INTO c;

  IF c.id IS NULL THEN
    RAISE EXCEPTION 'CHALLENGE_INVALID';
  END IF;

  INSERT INTO public.step_up_proofs (
    proof_token, challenge_id, user_id, device_id, action_code,
    request_id, payload_hash, expires_at
  )
  VALUES (v_token, c.id, c.user_id, c.device_id, c.action_code,
          c.request_id, c.payload_hash, v_expires);

  RETURN QUERY SELECT v_token, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_step_up_proof(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_step_up_proof(uuid) TO service_role;

-- Trust enrollment is server-authoritative: device registration and challenge
-- issuance run only through Server Functions (fresh password re-authentication
-- + server-built payload hash) using the privileged server client. No client
-- role may reach them directly through the Data API.
REVOKE ALL ON FUNCTION public.issue_step_up_challenge(text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_step_up_challenge(text, text, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.register_student_device(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_student_device(text, text, text, text)
  TO service_role;

-- Device revocation stays directly callable by the signed-in student only.
REVOKE ALL ON FUNCTION public.revoke_student_device(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_all_student_devices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_student_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_student_devices() TO authenticated;

-- ------------------------------------------------- atomic proof consumption --
--
-- Overload: identical semantics to the existing 5-argument function, plus the
-- proof. Consumption happens BEFORE the delegated submit, inside the SAME
-- transaction, so a failed submit rolls the consumption back and a successful
-- one can never reuse the proof.

CREATE OR REPLACE FUNCTION public.consume_step_up_proof(
  p_proof_token text,
  p_action_code text,
  p_request_id uuid,
  p_payload_hash text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.step_up_proofs%ROWTYPE;
BEGIN
  UPDATE public.step_up_proofs
     SET consumed_at = now()
   WHERE proof_token = p_proof_token
     AND consumed_at IS NULL
     AND expires_at > now()
     AND user_id = auth.uid()
     AND action_code = p_action_code
     AND request_id = p_request_id
     AND payload_hash = p_payload_hash
   RETURNING * INTO p;

  IF p.proof_token IS NULL THEN
    RAISE EXCEPTION 'STEP_UP_PROOF_INVALID';
  END IF;

  -- Web channel proofs are bound to a fresh server-side password re-auth; no
  -- device row exists for them. Native channel proofs must still prove the
  -- device is trusted (not revoked) at consumption time.
  IF p.device_id != 'web' AND NOT EXISTS (
    SELECT 1 FROM public.student_trusted_devices d
     WHERE d.user_id = p.user_id AND d.device_id = p.device_id AND d.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STEP_UP_DEVICE_REVOKED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_step_up_proof(text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ------------------------------------------- legacy 5-arg bypass closure ----
--
-- The pre-existing 5-argument RPC stays REACHABLE for non-sensitive services
-- (other callers depend on it), but it can no longer be used to submit any of
-- the five sensitive services without a step-up proof consumed in the SAME
-- transaction. The original implementation is renamed to a private core
-- function that is NOT granted to anon/authenticated; only the guarded
-- wrappers (SECURITY DEFINER, owner-executed) can reach it.

ALTER FUNCTION public.submit_b1_student_request_atomic(
  uuid, text, jsonb, timestamptz, uuid[]
) RENAME TO submit_b1_student_request_atomic_core;

REVOKE ALL ON FUNCTION public.submit_b1_student_request_atomic_core(
  uuid, text, jsonb, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic(
  p_request_id uuid,
  p_canonical_code text,
  p_form_data jsonb,
  p_expected_updated_at timestamptz,
  p_attachment_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sensitive boolean := p_canonical_code IN (
    'file_withdrawal', 'enrollment_suspension', 'department_transfer',
    'final_chance', 'excused_absence'
  );
BEGIN
  -- A direct client call to this signature carries no proof. The only way the
  -- check below can pass is when public.consume_step_up_proof() already ran in
  -- THIS transaction (consumed_at = now() = transaction_timestamp), which only
  -- the 7-argument guarded overload does.
  IF v_sensitive AND NOT EXISTS (
    SELECT 1
      FROM public.step_up_proofs p
     WHERE p.user_id = auth.uid()
       AND p.request_id = p_request_id
       AND p.action_code = 'submit_' || p_canonical_code
       AND p.consumed_at = now()
  ) THEN
    RAISE EXCEPTION 'STEP_UP_PROOF_REQUIRED';
  END IF;

  RETURN public.submit_b1_student_request_atomic_core(
    p_request_id, p_canonical_code, p_form_data, p_expected_updated_at, p_attachment_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_b1_student_request_atomic(
  uuid, text, jsonb, timestamptz, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_b1_student_request_atomic(
  uuid, text, jsonb, timestamptz, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic(
  p_request_id uuid,
  p_canonical_code text,
  p_form_data jsonb,
  p_expected_updated_at timestamptz,
  p_attachment_ids uuid[],
  p_step_up_proof text,
  p_step_up_payload_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sensitive boolean := p_canonical_code IN (
    'file_withdrawal', 'enrollment_suspension', 'department_transfer',
    'final_chance', 'excused_absence'
  );
BEGIN
  -- Sensitive services cannot be submitted without a server-issued step-up proof.
  IF v_sensitive AND p_step_up_proof IS NULL THEN
    RAISE EXCEPTION 'STEP_UP_PROOF_REQUIRED';
  END IF;

  IF p_step_up_proof IS NOT NULL THEN
    -- Payload binding: `p_step_up_payload_hash` is recomputed server-side (in
    -- the authenticated server function, from the persisted draft payload) with
    -- the SAME canonicalization the device signed. A mutated payload therefore
    -- produces a different hash and the proof no longer matches.
    IF p_step_up_payload_hash IS NULL THEN
      RAISE EXCEPTION 'STEP_UP_PAYLOAD_HASH_REQUIRED';
    END IF;
    PERFORM public.consume_step_up_proof(
      p_step_up_proof, 'submit_' || p_canonical_code, p_request_id, p_step_up_payload_hash
    );
  END IF;

  RETURN public.submit_b1_student_request_atomic(
    p_request_id, p_canonical_code, p_form_data, p_expected_updated_at, p_attachment_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_b1_student_request_atomic(
  uuid, text, jsonb, timestamptz, uuid[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_b1_student_request_atomic(
  uuid, text, jsonb, timestamptz, uuid[], text, text) TO authenticated;