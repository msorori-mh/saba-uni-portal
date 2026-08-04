# PORTAL_PR281_B1_E2E_SUPPORT_CODEX_REMEDIATION_91

Decision: **PASS_PR281_B1_E2E_SUPPORT_REMEDIATION** (pending post-push verification block below)

Starting HEAD: `85a8512da43f717ec26a325e1756b610dcd391be`  
PR: https://github.com/msorori-mh/saba-uni-portal/pull/281  
Mode: SOURCE AND LOCAL TESTING ONLY

## CI root cause (run 30869302022)

- Failed job: `Bun tests (tests/)` → `bun test tests/`
- Failed test: `B1 Fixture-15 forward-only reissue 44 — source contract > ships exactly one forward-only migration after 20260802225131`
- Cause: assertion required the Fixture-15 migration to be the absolute last `supabase/migrations/*.sql` file; PR #281 added `20260804120000_b1_88_…` after it (and main already had `20260804004546`).
- Deterministic: yes (reproduced locally).
- Fix: pin exactly one Fixture-15 reissue carrier after the managed-channel baseline without requiring absolute last-file ordering.

## Codex remediations

1. **False-positive PG17 denials** — removed `RAISE SHOULD_DENY` swallowed by `WHEN others`; denials now set `v_denied` on expected SQLSTATE/`B1_E2E_88%` and raise `B1_E2E_88_HARNESS_UNEXPECTED_SUCCESS` outside the handler.
2. **Correlation closure** — `b1_e2e_88_correlations_aligned` requires request `e2e_correlation_id` = execution = binding; create stamps immutable marker+correlation; rewrite denied by trigger.
3. **Cleanup CAS** — `applied_assignee_snapshot` + phase-1 compare-and-swap; drift raises `B1_E2E_88_CLEANUP_ASSIGNEE_DRIFT` with zero partial mutation; PG17 proves later reassignment preserved.
4. **Cleanup/decommission** — NOT_APPLIED draft distinguishes operational cleanup vs decommission; decommission refuses open/active state and documents base `092ba053` function restore sources.

## Scope

- `supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql`
- `tests/b1-e2e-request-scoped-support-88/*`
- `tests/b1-fixture-15-forward-only-reissue-44.test.ts` (CI pin only)
- cleanup draft + manifests + this report

Production access: NONE · writes: ZERO · migration apply: NONE · deploy: NONE
