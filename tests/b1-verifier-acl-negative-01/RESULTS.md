# RESULTS — B1 verifier ACL negative harness (order 29)

Mission: `PORTAL-B1-RUNTIME-ASSIGNEE-POST-VERIFIER-ACL-FAIL-CLOSED-REMEDIATION-05`
Mode: SOURCE-ONLY. No production connection, no migration applied.

```
python3 tests/b1-verifier-acl-negative-01/run-harness.py
=> 20/20 cases passed   (exit 0)
```

10 cases x 2 verifiers (full post-verifier + structural 0-4 subset).

| Case | Full verifier | Structural 0-4 |
| ---- | ------------- | -------------- |
| A1 exact contract shape accepted | PASS | PASS |
| N1 NULL proacl rejected | PASS | PASS |
| N2 PUBLIC EXECUTE rejected | PASS | PASS |
| N3 anon EXECUTE rejected | PASS | PASS |
| N4 authenticated EXECUTE rejected | PASS | PASS |
| N5 wrong signature rejected | PASS | PASS |
| N6 wrong owner rejected | PASS | PASS |
| N7 unpinned search_path rejected | PASS | PASS |
| N8 inherited PUBLIC EXECUTE via role grant rejected | PASS | PASS |
| N9 missing SECURITY DEFINER rejected | PASS | PASS |

Every negative additionally asserts the `POSTVERIFY_FAIL` reason fragment, so no
case can pass because of an unrelated error.

Closes: `HOLD_B1_RUNTIME_ASSIGNEE_CODEX_POST_VERIFIER_DEFAULT_PUBLIC_EXECUTE_BLIND_SPOT`.

Production impact: none.
