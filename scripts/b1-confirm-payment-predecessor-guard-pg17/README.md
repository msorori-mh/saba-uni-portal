# b1-confirm-payment-predecessor-guard-pg17

Isolated PostgreSQL 17 proof harness for
`docs/migration-drafts/B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql`.

Apply order (`02-run.ps1`):

1. `00-harness-schema.sql` — synthetic schema + finance binding stub
2. `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql` — unguarded baseline RPC
3. Preflight `19-…-PREFLIGHT.sql` — proves guard not yet installed
4. `02-reproduce-bypass.sql` — Codex cell: `final_chance` / `incomplete_predecessor` ALLOW
5. Promoted migration `20260725120000_b1_confirm_payment_predecessor_guard_01.sql`
6. Post-verifier `19-…-POST-VERIFIER.sql`
7. `01-cases.sql` — DENY/ALLOW + zero-mutation for both paid services

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/b1-confirm-payment-predecessor-guard-pg17/02-run.ps1
```

Success prints `PG17_CONFIRM_PAYMENT_PREDECESSOR_GUARD_PASS` and a NOTICE summary with `failed: 0`.
