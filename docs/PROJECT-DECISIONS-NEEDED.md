# Project Decisions Needed

Updated: 2026-07-17 (Asia/Riyadh)

## Resolved functional decisions

- `department_transfer` and `final_chance` use `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.
- The portal stores no fee type, amount, currency, invoice, gateway transaction, payment reference, or internal balance.
- `final_chance` means a final exam chance only. New academic writes use `chance_type='final_chance'`; historical aliases remain read-compatible without backfill.
- The B1 source authorization matrix is complete and merged in PR #139.
- External-payment workflow migration draft 2/3 is complete and merged in PR #140. It creates inactive drafts only and does not authorize application.
- Final-chance canonical-write migration draft 3/3 is complete and merged in PR #141. It does not authorize application.

## Remaining technical gates

Production migration application remains unavailable because:

- the shared atomic submit/action executable draft is complete, independently reviewed, and merged in PR #142;
- the five-service detail dispatcher is source-complete and reviewed; executable workflow drafts and the caller/ACL cutover remain missing or incomplete;
- item 6 readiness found applied-schema contracts that must be reconciled source-only before executable draft 05A: excused-absence reason values, secure attachment binding, exact transfer FKs, final-chance trusted academic inputs, and file-withdrawal detail creation;
- processing-domain staff/faculty IDs require fresh read-only identity and department verification;
- exact per-migration apply commands and evidence capture procedures are not yet pinned.
- the detail-table write boundary is source-complete and reviewed, but its primitive must only be invoked inside the future atomic dispatcher/caller cutover migration; that executable cutover unit is not yet complete.
- the earlier atomic-draft HOLD is resolved: all six HIGH and two MEDIUM findings are closed, with final independent review PASS and Web CI PASS.

The exact dependency order, preflight, sequential application protocol, and post-verification checks are in `docs/B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md`.

| Decision | Why it is blocked | Production action proposed | Expected production effect |
|---|---|---|---|
| Apply future reviewed B1/attachment migrations | Required executable migrations, verified identity mappings, exact commands, and all per-migration gates are incomplete | Proposed later: one exact reviewed migration command at a time | Would create or alter runtime database/storage contracts |

## Safe-environment verification prerequisite

Direct RPC ALLOW/DENY matrices require an isolated, non-production Supabase environment after the relevant migration has a separately approved application path. No production credential, real user, or protected request may be used as test data.

No production command is authorized or scheduled in the current source-only cycle. A partial apply must stop only the migration chain and retain evidence; no reset or cleanup is permitted.

## Enrollment-certificate UX delivery

The availability-banner source fix is merged in PR #143. A Deploy/Publish is still required for production visibility and remains outside the completed source-only phase.
