# b1-runtime-predecessor-guard-scoped-pg17

Isolated PostgreSQL 17 proof harness for
`docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql`
(the scoped successor of -01 for chain slot M3).

Apply order (`02-run.ps1`):

1. `scripts/b1-local-pg-compile/01-minimal-compatible-schema.sql` (synthetic schema)
2. `docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql`
   (provides the currently applied `can_current_user_act_on_step`,
   `user_matches_workflow_runtime_step`, `current_user_has_exact_processing_binding`,
   `current_user_matches_transfer_department_scope`, `is_valid_b1_runtime_step_contract`)
3. `docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql` (the draft under test)
4. `01-cases.sql` (fixtures + assertions)

Harness-only adaptations in `01-cases.sql` (no existing file modified):

- `is_owner_of_request` is redefined with real semantics because the minimal
  schema stubs it to `SELECT false` (needed for the owner-deny cases).
- The two synthetic CHECK constraints on `action_type` / `action_result` are
  dropped because the minimal schema's vocabulary lists predate the LIVE
  enrollment_certificate legacy vocabulary (`assess_fee`, `approve`,
  `payment_required`, `fee_not_required`) that production already runs.

Run (Git Bash):

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\projects\saba-uni-portal-first-handover\scripts\b1-runtime-predecessor-guard-scoped-pg17\02-run.ps1"
```

Success prints `scoped_summary: {"total": 13, "failed": 0, "passed": 13}`;
any failure raises inside psql and the script exits non-zero.
