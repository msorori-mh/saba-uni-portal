# PORTAL-B1-FIVE-SERVICES-INTEGRATED-RUNTIME-E2E-HARNESS-01

## Decision

**PASS_PR232_FINAL_REVIEWED_STACK_RUNTIME_5_OF_5**

PR #232 synced onto reviewed Secure Draft base after PR #233 merge (`b9d6acc`), final sequence **21–25** locked, and disposable PostgreSQL 17 integrated runtime re-verified **5/5** with `fail_rows=0`.

No Production/Staging apply, Deploy/Publish, merge of #232, or `student_visible` mutation.

## Sync baseline

| Ref | SHA / state |
|---|---|
| PR #233 | MERGED `2026-07-25T06:46:32Z` mergeCommit `b9d6acca7a36c1ca19365179740095cbedf0cd1e` |
| Base after sync | `origin/feat/b1-five-services-secure-draft-mutations-01` @ `b9d6acc` |
| PR #232 branch | `test/b1-five-services-integrated-runtime-e2e-01` |
| Namespace | `TEST_ONLY_B1_FIVE_SERVICES_INTEGRATED_RUNTIME` |

## Final sequence (binding)

| # | Item |
|---|---|
| **21** | Secure Read Contracts |
| **22** | Secure Draft Mutations |
| **23** | Transfer Department Scope Position Assignment |
| **24** | File Withdrawal Impact Acknowledgment NULL Guard |
| **25** | Activation Gate (non-migration; local harness only) |

Post-manifest F1/F2 actor/action hardening remains apply-order `90` (not the activation gate).

### Pins / filenames

| Seq | Draft | Promoted migration (NOT APPLIED) |
|---|---|---|
| 21 | `B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql` | `supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql` |
| 22 | `B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql` | `supabase/migrations/20260725140000_b1_22_secure_draft_mutations_01.sql` |
| 23 | `B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql` | `supabase/migrations/20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` |
| 24 | `B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql` | `supabase/migrations/20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` |

- PROMOTION-MAP orders **21–24** align with sequence_order; order **19** payment; order **20** namespace bridge (documents sequence_order 20 payment stays at promotion-map 19).
- Activation gate text is **gate 25** (not 22/23/24).
- Apply-order SHA pins refreshed to reviewed draft tip blobs.
- No duplicate `sequence_order`; contiguous **1..24**.

## Re-verification counts (required PASS)

| Counter | Required | Result |
|---|---|---|
| services_completed | 5/5 | **5/5** |
| fail_rows | 0 | **0** |
| Secure Read regression | PASS | **PASS** (`B1_SECURE_READ_PG17_PASS`) |
| Secure Draft PG regression | 35/35 | **PASS** (`B1_SECURE_DRAFT_PG17_PASS`, 35 rows) |
| transfer position_assignment | PASS | **PASS** (`department_transfer/submit` + lifecycle final) |
| withdrawal NULL guard | PASS | **PASS** (`file_withdrawal/submit_without_ack` → `B1_WITHDRAWAL_INPUT_INVALID`) |
| read/action negative authz | PASS | **PASS** (read_denials=4, action_denials=7) |
| zero mutation on denials | PASS | **PASS** (`zero_mutation=13`) |
| idempotency/concurrency | PASS | **PASS** (idempotency=3, concurrency=1) |
| enrollment_certificate regression | PASS | **PASS** (all `ec/*` cases) |
| container removed | yes | **yes** (`docker run --rm` + `docker stop` in harness `finally`) |

Integrated summary line:

`services_completed=5 action_allows=24 action_denials=7 attachment_assertions=4 concurrency=1 draft_creates=5 draft_saves=6 idempotency=3 read_allows=18 read_denials=4 zero_mutation=13 fail_rows=0`

Harness alignment after reviewed #233 create gate:

- `request_types.student_visible` stubbed read-only in e2e helpers (no production write).
- All draft saves pass required `p_expected_updated_at` from create/save DTO.

## Production / Deploy / activation confirmation

- No cloud migration apply.
- No Staging/Production data.
- No Deploy/Publish.
- No merge of PR #232.
- Workflow activation only inside disposable local harness (`35-activate-workflows-local-only.sql`).
- `student_visible` unchanged.

## Remote CI

- After push: GitHub reports **no checks** on `test/b1-five-services-integrated-runtime-e2e-01`.
- Record once: `HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS` (do not thrash reruns). Local stack reverify remains authoritative for this decision.
- PR mergeability after sync push: `MERGEABLE` / `CLEAN` vs `feat/b1-five-services-secure-draft-mutations-01`.
