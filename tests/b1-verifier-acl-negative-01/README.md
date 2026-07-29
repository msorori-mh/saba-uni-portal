# B1 verifier ACL negative harness (order 29)

Proves the fail-closed ACL/catalog contract shared by:

- `docs/migration-drafts/B1-RUNTIME-ASSIGNEE-PROPAGATION-01.sql` (in-migration
  `DO $acl$` block, section 4)
- `.../29-B1_29_RUNTIME_ASSIGNEE_PROPAGATION_01-POST-VERIFIER.sql` (section 3)
- `.../29-B1_29_RUNTIME_ASSIGNEE_PROPAGATION_01-POST-VERIFIER-STRUCTURAL-0-4.sql`
  (section 3)

```
python3 tests/b1-verifier-acl-negative-01/run-harness.py
```

- The ACL block is **extracted verbatim** between the `BEGIN/END B1_29_ACL_CONTRACT`
  markers in each verifier, so drift between the verifier and this proof is
  impossible.
- Creates a throwaway PostgreSQL cluster in a temp dir, one database per case,
  and removes it afterwards. Never touches production, needs no credentials.
- Exit code 0 = every case passed. Latest recorded run: `RESULTS.md`
  (20 passed, 0 failed — 10 cases x 2 verifiers).

## Why this exists

PostgreSQL leaves `proacl` **NULL** until an explicit GRANT/REVOKE, and NULL
means the built-in default: `EXECUTE` to `PUBLIC`. A verifier that only inspects
`proacl` entries therefore *passes* on the most dangerous state. Every case here
is rejected with an explicit `POSTVERIFY_FAIL` message, and each negative also
asserts the *reason* text, so a case can never pass for an incidental error.

## Case map

| Case | Contract asserted |
| ---- | ----------------- |
| A1 | The exact, correct contract shape is accepted (no false positive) |
| N1 | `proacl IS NULL` (DROP+CREATE, no REVOKE) is rejected |
| N2 | `EXECUTE` to `PUBLIC` is rejected |
| N3 | `EXECUTE` to `anon` is rejected |
| N4 | `EXECUTE` to `authenticated` is rejected |
| N5 | A wrong/renamed signature is rejected |
| N6 | A function owned by the wrong role is rejected |
| N7 | A function without a pinned `search_path` is rejected |
| N8 | `EXECUTE` inherited by `anon` through a role grant is rejected |
| N9 | A guard/assert function missing `SECURITY DEFINER` is rejected |

`pg/10-fixture.sql` builds the minimal correct catalog shape (the six order-29
functions with exact signatures, owner, pinned `search_path`, security context
and explicit REVOKEs). Each negative case mutates exactly one property of it.

Not wired into CI (it needs local `initdb`/`pg_ctl`).
