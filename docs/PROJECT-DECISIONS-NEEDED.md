# Project Decisions Needed

Updated: 2026-07-17 (Asia/Riyadh)

## Functional decisions requiring explicit owner approval

| Decision | Why it is blocked | Production action proposed | Expected production effect |
|---|---|---|---|
| Approve whether `transfer_between_departments` and `final_chance` are free or require external manual payment confirmation; if required, provide the authoritative existing `fee_type.code` | Inventing or approving a fee code, amount or currency is prohibited | No command; provide the authoritative business value first. Any later migration/apply needs separate approval | Would allow the currently fail-closed services to pass their financial activation gate |
| Approve the authoritative persisted `chance_type` mapping for `final_chance` | The repository must not invent academic semantics | No command; provide the authoritative academic mapping first. Any later migration/apply needs separate approval | Would allow final-chance details to be persisted with an approved classification |
| Apply future reviewed B1/attachment migrations | All SQL and migration application is production-impacting | Proposed later: an exact reviewed Supabase migration command, not yet selected or executed | Would create or alter runtime database/storage contracts |

## Safe-environment verification prerequisite

Direct RPC ALLOW/DENY matrices for the merged Draft contracts require a safe,
non-production Supabase environment after an explicitly approved Draft migration
apply. No production credential or real user may be used.

No production command is authorized or scheduled in the current source-only cycle.
