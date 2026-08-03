-- Shared Fixture-15 PG17 harness prologue.
-- Sets distinct non-empty prior auth GUCs transaction-locally before the
-- real migration body runs in the same session/transaction.
--
-- request.jwt.claim.sub must be a valid UUID and must differ from the
-- archive actor aec1303e-de6a-4580-94cf-7205c17b5535.
SELECT set_config(
  'request.jwt.claim.sub',
  'c8a94548-4782-4252-86f9-23559d3b95bd',
  true
);
SELECT set_config(
  'b1.atomic_action',
  'prior-auth-context-marker',
  true
);
