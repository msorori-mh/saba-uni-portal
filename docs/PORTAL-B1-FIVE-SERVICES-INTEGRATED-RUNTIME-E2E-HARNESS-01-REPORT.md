# PORTAL-B1-FIVE-SERVICES-INTEGRATED-RUNTIME-E2E-HARNESS-01

## Decision

**PASS_B1_FIVE_SERVICES_INTEGRATED_RUNTIME_E2E_SOURCE_READY**

Local disposable PostgreSQL 17 harness completed **5/5** student services end-to-end (draft → read → submit → staff actions → payment where required → final), with fail_rows=0. No Production/Staging apply, Deploy/Publish, merge, workflow activation on real envs, or `student_visible` mutation.

## Baseline SHAs

| Ref | SHA |
|---|---|
| Branch tip (stacked on draft mutations) | `a60fcff2378e51c0f2a9d95f7c6a0f6a5c35d6b9` |
| `origin/feat/b1-five-services-secure-draft-mutations-01` | `a60fcff2378e51c0f2a9d95f7c6a0f6a5c35d6b9` |
| `origin/feat/b1-five-services-secure-read-contracts-01` | `ce0151836ee56bd43d85320749b79c4d6bb6090c` |
| `origin/main` (fetch baseline) | `92d51faa9bcdc9fd99e89579f6a498b463264246` |
| Secure-read draft blob | `f07823e1bdb242ae5138a5206b7dffff013fc395` |
| Secure-draft draft blob | `324044df1f26f6d66c04421a525efc697deeed46` |
| Transfer-scope remediation blob | `c80e74efe9761e9efe352dce4f208b6e73c579f4` |
| Withdrawal-ack null-guard blob | `b1cc3d0fd48ac2b92e485136c5e1600f763592e6` |

Harness branch: `test/b1-five-services-integrated-runtime-e2e-01`  
PR base (stacked): `feat/b1-five-services-secure-draft-mutations-01`  
Namespace: `TEST_ONLY_B1_FIVE_SERVICES_INTEGRATED_RUNTIME`

## Migration sequence

Applied from `tests/b1-rpc-matrix/pg/20-draft-apply-order.txt` with byte pins (`git hash-object`).

- Manifest sequences 01–21 applied in order (seq20 = payment predecessor guard; seq21 = secure draft mutations).
- **PROMOTION-MAP order 20** secure-read contracts inserted immediately before secure-draft (not a sequential-manifest filename).
- seq22 = actor/action assignment hardening (post-manifest F1/F2).
- seq23 = `B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01` (forward-only remediation).
- seq24 = `B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01` (forward-only remediation).
- Activation gate remains **gate 22** in manifest policy text (local-only activation file used for harness; not production).
- No duplicate sequence numbers in the apply-order list.
- Stale pins for seq 05/07/11/15 refreshed to current branch draft blobs before PIN check.
- Preflight/post-verifier objects covered by rpc-matrix chain + remediation postchecks.
- No historical applied migration rewritten.

## Services (5/5 completed)

| # | Service | Final status | Notes |
|---|---|---|---|
| 1 | `enrollment_suspension` | completed | partial save → final save → submit → review/approve/apply |
| 2 | `excused_absence` | completed | attachment intent/complete + staff walk |
| 3 | `department_transfer` | completed | position_assignment chairs + specialized payment RPC |
| 4 | `final_chance` | completed | no financial form fields; payment via specialized RPC |
| 5 | `file_withdrawal` | completed | ackless submit DENY; clearances → apply → archive |

## Lifecycle coverage (per service)

1. Test student + exact staff assignments (rpc-matrix fixtures + position_assignment chairs).
2. Create/retrieve draft via `create_b1_request_draft_for_student`.
3. Partial save where allowed; reread via secure-read draft RPC.
4. Final correct save; submit via `submit_b1_student_request_atomic`.
5. Assert draft creates no runtime steps; submit creates expected steps.
6. Assigned inbox/details for current assignee only.
7. Every stage via legal RPCs only (`act_on_b1_student_request_step_atomic` / `record_external_university_payment_confirmation`).
8. Reread after actions; final status with no illegal active/pending steps.
9. Payment services: specialized confirmation only; general `confirm_payment` DENY; no amount/currency/invoice/client actor/timestamp.
10. Attachments: intent → storage stub object → complete; metadata opaque (`att:`); no bucket/path/key leakage; authorize-before-sign asserted from function source (no live network signed URL claimed).

## Harness counts (PASS run)

| Counter | Value |
|---|---:|
| services_completed | **5** |
| draft_creates | 5 |
| draft_saves | 6 |
| read_allows | 18 |
| read_denials | 4 |
| action_allows | 24 |
| action_denials | 7 |
| zero_mutation | 13 |
| attachment_assertions | 4 |
| idempotency | 3 |
| concurrency | 1 |
| fail_rows | **0** |
| final completed requests (lifecycle) | **5** |

PG: `17.10` · Result marker: `B1_INTEGRATED_RUNTIME_E2E_PASS`

## Authorization / draft / read

- Positive: owner student reads; exact assignee acts; finance assignee confirms payment.
- Negative samples (with zero-mutation snapshots): other student, anon, unassigned admin/dean/registrar, wrong-step staff, other dept head, save-after-terminal.
- Draft: create, save partial/final, idempotency mismatch DENY, stale `expected_updated_at` DENY, same-department transfer DENY, withdrawal without ack DENY, final_chance money fields DENY.
- Nine secure-read RPCs exercised in cycle (form options, draft, student details/list, assigned inbox/details, actions, attachments, capability). Capability ≠ activation; no `student_visible` write.

## Defects found and forward-only remediations

### 1) Transfer department scope vs position_assignment

- **Symptom:** `act_on_b1_student_request_step_atomic` → `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` for source/target chairs after submit required `position_assignment`.
- **Cause:** `current_user_matches_transfer_department_scope` still matched only `assigned_faculty_profile_id`.
- **Fix:** `docs/migration-drafts/B1-TRANSFER-DEPARTMENT-SCOPE-POSITION-ASSIGNMENT-01.sql` (apply-order seq23).
- **Regression:** source + apply-order pin tests; lifecycle transfer completed.

### 2) file_withdrawal impact acknowledgment NULL bypass

- **Symptom:** submit without `impact_acknowledgment` succeeded (`NULL <> 'true'::jsonb`), then subsequent draft save opaque-denied.
- **Cause:** null-unsafe JSON comparison in `persist_validated_b1_request_details`.
- **Fix:** `docs/migration-drafts/B1-FILE-WITHDRAWAL-IMPACT-ACK-NULL-GUARD-01.sql` (apply-order seq24); also hardens suspension `terms_acknowledgment` with `IS DISTINCT FROM`.
- **Regression:** lifecycle `file_withdrawal/submit_without_ack` expects `B1_WITHDRAWAL_INPUT_INVALID`; bun source test on function body.

## enrollment_certificate regression

- Legacy `submit_student_request` still present; B1 submit is separate.
- No active `enrollment_certificate` workflow in local activation set.
- Draft RPCs do not assign `student_visible`.
- No anon EXECUTE grants for enrollment_certificate routines.

## Container

- Image: `postgres:17-alpine`
- Disposable name prefix `b1-integrated-e2e-*`
- Always stopped in `finally` (PASS and FAIL paths).

## Tests run

- `bun install --frozen-lockfile` — ok
- `powershell -ExecutionPolicy Bypass -File tests/b1-integrated-runtime/pg/run-harness.ps1` → **PASS 5/5**, fail_rows=0
- `bun test tests/student-requests` — **635 pass / 0 fail**
- `bun test tests/b1-rpc-matrix` — **22 pass / 0 fail**
- `bun test` — **1572 pass / 0 fail**
- `bunx tsc --noEmit` — exit 0
- `bunx eslint` on owned `b1-integrated-runtime-e2e-01.test.ts` — clean
- `bun run build` — success
- `git diff --check` — clean

## Deliverables

- `tests/b1-integrated-runtime/pg/*` (runner, fixtures, lifecycle, authz, draft/read, attachments, EC regression, summarize)
- `tests/student-requests/b1-integrated-runtime-e2e-01.test.ts`
- Forward-only drafts seq23/seq24 + apply-order pin refresh
- This report

## Production / Deploy / activation confirmation

- No cloud migration apply.
- No Staging/Production data.
- No Deploy/Publish.
- No merge of PR #227 / #229 / this PR.
- Workflow activation only inside disposable local harness (`35-activate-workflows-local-only.sql`).
- `student_visible` unchanged.

## Remote CI note

If GitHub Actions fails before job steps due to billing, document `HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS` and rely on this local verification (do not thrash reruns).
