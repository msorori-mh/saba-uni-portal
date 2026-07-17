# Project Decisions Needed

Updated: 2026-07-17 (Asia/Riyadh)

## Resolved functional decisions

The prior fee/chance decisions are resolved by the owner:

- `department_transfer` and `final_chance`: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.
- No `fee_type.code`, amount, currency, invoice, gateway transaction, payment reference, or internal balance.
- New `chance_type` writes: `final_chance` only; historical values are read compatibility only.

Remaining gate is technical runtime readiness, not a business decision: reviewed migrations, safe-environment RPC ALLOW/DENY verification, and independent security gates before any visibility change.

Draft PR #137 now supplies the reviewed source SQL contract. It does not authorize application. The next migration decision must specify the isolated target, exact ordered command sequence, approved checksum (`674fcbb319f0399015b76a5685a8125d13f9b465b123de8cc40fc35de4388aa5` while the draft is unchanged), rollback/partial-apply evidence procedure, and the complete positive/negative RPC test matrix.

| Decision | Why it is blocked | Production action proposed | Expected production effect |
|---|---|---|---|
| Apply future reviewed B1/attachment migrations | All SQL and migration application is production-impacting | Proposed later: an exact reviewed Supabase migration command, not yet selected or executed | Would create or alter runtime database/storage contracts |

## Safe-environment verification prerequisite

Direct RPC ALLOW/DENY matrices for the merged Draft contracts require a safe,
non-production Supabase environment after an explicitly approved Draft migration
apply. No production credential or real user may be used.

No production command is authorized or scheduled in the current source-only cycle.
