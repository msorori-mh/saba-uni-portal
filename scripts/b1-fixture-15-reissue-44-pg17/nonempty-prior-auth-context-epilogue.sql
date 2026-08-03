-- Shared Fixture-15 PG17 harness epilogue.
-- Runs immediately after the real migration body, still inside the same
-- session and transaction, before COMMIT. Fail-closed if either prior
-- non-empty auth GUC was not restored exactly.
DO $b1_44_assert_nonempty_prior_auth_restored$
DECLARE
  k_prior_jwt constant text := 'c8a94548-4782-4252-86f9-23559d3b95bd';
  k_prior_atomic constant text := 'prior-auth-context-marker';
  v_jwt text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_atomic text := coalesce(current_setting('b1.atomic_action', true), '');
BEGIN
  IF v_jwt IS DISTINCT FROM k_prior_jwt THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PG17_NONEMPTY_PRIOR_JWT_NOT_RESTORED',
      DETAIL = format('expected=%s actual=%s', k_prior_jwt, v_jwt);
  END IF;

  IF v_atomic IS DISTINCT FROM k_prior_atomic THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PG17_NONEMPTY_PRIOR_ATOMIC_ACTION_NOT_RESTORED',
      DETAIL = format('expected=%s actual=%s', k_prior_atomic, v_atomic);
  END IF;
END
$b1_44_assert_nonempty_prior_auth_restored$;

-- Surface exact restored values for host-side log correlation (same txn).
SELECT
  coalesce(current_setting('request.jwt.claim.sub', true), '') AS restored_jwt_sub,
  coalesce(current_setting('b1.atomic_action', true), '') AS restored_atomic_action;
