# EXTERNAL UNIVERSITY PAYMENT CONFIRMATION — MIGRATION 01 REPORT

## Scope

- Draft SQL only; not copied into `supabase/migrations` and not applied.
- Extends workflow vocabulary for `confirm_payment`, `payment_confirmed` and `payment_not_confirmed`.
- Adds a specialized SECURITY DEFINER RPC with no client payload and no financial fields.
- Reuses runtime step fields for confirmer, confirmation time, optional note and status; reuses workflow events for audit.

## Authorization

- Locks the runtime step before authorization.
- Requires active `payment_confirmation`, finance unit, `revenue_finance_officer` role and matching `confirm_payment` action.
- Requires exactly one direct assignee and exact authenticated-user match.
- Does not call role-pool authorization helpers and has no admin, registrar or dean bypass.

## State behavior

- Active payment step represents `awaiting_payment_confirmation`.
- `payment_not_confirmed` is audited and leaves the step active without transition.
- `payment_confirmed` records `completed_by`, `completed_at`, optional note, audit event and activates only the configured `payment_confirmed` transition atomically.

## Verification

- Source-contract tests: 5 PASS, 0 fail.
- Full student-request suite: 360 PASS, 0 fail.
- TypeScript (`bunx tsc --noEmit`): PASS.
- Production build (`bun run build`): PASS (existing non-blocking bundler/chunk warnings only).
- `git diff --check`: PASS.
- Independent source/security review: PASS; CRITICAL 0, HIGH 0.
- SHA-256: `674fcbb319f0399015b76a5685a8125d13f9b465b123de8cc40fc35de4388aa5`.
- Exactly one `payment_confirmed` transition is required; ambiguity fails closed.
- The request remains `under_review` on this non-terminal transition, matching the generic workflow executor; only the active runtime step changes.

## Pre-apply gates still required

- Compile the SQL in an isolated, non-production database that matches the target schema.
- Run the direct RPC authorization matrix: the exact assigned finance officer must pass; every other role and user must fail.
- Verify positive, negative, replay, stale-step and ambiguous-transition behavior transactionally.
- Recalculate and approve the SQL checksum immediately before any separately authorized apply sequence.

## Production impact

None. No SQL/migration apply, Supabase connection, production write, `student_visible` change, deploy or publish.
