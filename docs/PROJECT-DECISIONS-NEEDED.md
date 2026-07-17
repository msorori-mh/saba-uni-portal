# Project Decisions Needed

Updated: 2026-07-17 (Asia/Riyadh)

## Resolved functional decisions

- `department_transfer` and `final_chance` use `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.
- The portal stores no fee type, amount, currency, invoice, gateway transaction, payment reference, or internal balance.
- `final_chance` means a final exam chance only. New academic writes use `chance_type='final_chance'`; historical aliases remain read-compatible without backfill.
- The B1 source authorization matrix is complete and merged in PR #139.
- External-payment workflow migration draft 2/3 is complete and merged in PR #140. It creates inactive drafts only and does not authorize application.

## Remaining technical gates

Production migration application remains unavailable because:

- the shared atomic submit/action executable migration is missing;
- executable service workflow/validator migrations remain missing or incomplete;
- final-chance canonical-write migration 3/3 is missing;
- processing-domain staff/faculty IDs require fresh read-only identity and department verification;
- exact per-migration apply commands and evidence capture procedures are not yet pinned.

The exact dependency order, preflight, sequential application protocol, and post-verification checks are in `docs/B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md`.

| Decision | Why it is blocked | Production action proposed | Expected production effect |
|---|---|---|---|
| Apply future reviewed B1/attachment migrations | Required executable migrations, verified identity mappings, exact commands, and all per-migration gates are incomplete | Proposed later: one exact reviewed migration command at a time | Would create or alter runtime database/storage contracts |

## Safe-environment verification prerequisite

Direct RPC ALLOW/DENY matrices require an isolated, non-production Supabase environment after the relevant migration has a separately approved application path. No production credential, real user, or protected request may be used as test data.

No production command is authorized or scheduled in the current source-only cycle. A partial apply must stop only the migration chain and retain evidence; no reset or cleanup is permitted.
