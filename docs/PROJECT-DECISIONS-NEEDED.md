# Project Decisions Needed

Updated: 2026-07-17 (Asia/Riyadh)

## Resolved functional decisions

The prior fee/chance decisions are resolved by the owner:

- `department_transfer` and `final_chance`: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.
- No `fee_type.code`, amount, currency, invoice, gateway transaction, payment reference, or internal balance.
- New `chance_type` writes: `final_chance` only; historical values are read compatibility only.

Remaining gate is technical runtime readiness, not a business decision: reviewed migrations, safe-environment RPC ALLOW/DENY verification, and independent security gates before any visibility change.

PR #137 supplied the initial source SQL contract; merged PR #138 fixes the compile finding discovered locally. Neither authorizes production application. The current draft checksum is `9473d07ec78ee1133ffb150a2cd8173bc27040388899a79ed0a4b935bfa1379a`. The next migration decision must specify the isolated target, exact ordered command sequence, rollback/partial-apply evidence procedure, and the complete positive/negative RPC test matrix.

| Decision | Why it is blocked | Production action proposed | Expected production effect |
|---|---|---|---|
| Apply future reviewed B1/attachment migrations | All SQL and migration application is production-impacting | Proposed later: an exact reviewed Supabase migration command, not yet selected or executed | Would create or alter runtime database/storage contracts |

## Safe-environment verification prerequisite

Direct RPC ALLOW/DENY matrices for the merged Draft contracts require a safe,
non-production Supabase environment after an explicitly approved Draft migration
apply. No production credential or real user may be used.

No production command is authorized or scheduled in the current source-only cycle.

Cycle 14 environment evidence: the host has no callable Supabase CLI and no running Docker engine. Therefore DB compile and the RPC ALLOW/DENY matrix remain unexecuted; production must not be used as a substitute test environment.
