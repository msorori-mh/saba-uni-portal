# B1 PR #277 — Real PG17 RPC Harness Remediation Report (#40)

## Executive Summary
This report documents the completion of mission **PORTAL-B1-PR277-POST-PR276-SYNC-AND-REAL-PG17-RPC-HARNESS-40**.
The fake/textual SQL check in `tests/b1-authoritative-positive-fixture-matrix-19` has been replaced with a **real disposable PostgreSQL 17 container harness** that initializes the schema, applies all draft and post-draft B1 migrations, seeds the authoritative 19-case fixture matrix, and executes **all 19 declared RPCs** in a live PostgreSQL 17 runtime environment.

Required Token: `PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19`

---

## 1. Branch Sync & Manifest Preservation
- **Branch Sync**: Confirmed normal merge with current `origin/main` commit (`a7423ad618c4ea61527bf1b2e560347f3fe7930e`). No rebase or force push was performed.
- **19-Case Manifest**: Preserved the authoritative 19-case manifest in `tests/b1-authoritative-positive-fixture-matrix-19/MANIFEST.json` and `generate-manifest.ts`.

---

## 2. Real PostgreSQL 17 Disposable Harness Architecture
- **Harness SQL Script**: `tests/b1-authoritative-positive-fixture-matrix-19/pg17-disposable-harness.sql`
- **Harness Test Launcher**: `tests/b1-authoritative-positive-fixture-matrix-19/pg17-disposable-harness.test.ts`
- **Container Lifecycle**:
  1. Dynamically launches a disposable `postgres:17-alpine` Docker container.
  2. Applies `10-minimal-schema.sql` and all 27 draft B1 migrations in sequence.
  3. Applies post-draft B1 migrations (`20260729014518` & `20260730175527`).
  4. Activates workflows, sets up position assignments and seeds baseline profiles/entities.
  5. Applies fixture seed migration `20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql`.
  6. Executes `pg17-disposable-harness.sql` inside the live container via `psql`.
  7. Tears down container reliably in `finally` / `afterAll`.

---

## 3. Verification of 19 Fixture Cases via Real RPC Executions

For every one of the 19 authoritative fixture cases, the harness establishes the exact principal context (`request.jwt.claim.sub` AND `e_rpcmatrix.uid`) and verifies:
1. **Wrong Actor Rejection**: Attempting action as unauthorized actor (`00000000-0000-4000-8000-0000000000ff`) raises exception.
2. **Wrong Action Rejection**: Attempting invalid alternative action as authorized actor raises exception.
3. **Exact Declared RPC Invocation**: Right actor + right action invokes `act_on_b1_student_request_step_atomic` or `record_external_university_payment_confirmation` and receives `{"success": true}`.
4. **Workflow Transition**: Runtime step status transitions to `'completed'`.
5. **Workflow Event**: New event recorded in `student_request_workflow_events`.
6. **Next Active Step / Request Approval**: Next step activated or request status updated to `'approved'` / `'completed'`.
7. **Business Effects**:
   - Case 5 (department transfer): student profile `department_id` updated to target department CS.
   - Case 7 (enrollment suspension): `student_academic_status.enrollment_status` updated to `'suspended'`.
8. **Zero Unrelated Mutation**: Non-B1 request step counts remain unchanged.
9. **RPC Execution Counter**: Verified exactly 19 RPC executions occurred (`v_rpc_execution_count = 19`).
10. **Enrollment Certificate Immutability**: Verified `enrollment_certificate` requests (4), document details (2), and official documents (2) remain untouched.

---

## 4. Verification Suite Results

All mandatory verification commands passed cleanly:

| Command | Status | Details |
| :--- | :--- | :--- |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | **PASS** | 14 tests passed (10 manifest + 4 PG17 harness contract) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **PASS** | 201 tests passed |
| `bunx tsc --noEmit` | **PASS** | Zero TypeScript compilation errors |
| `bun run build` | **PASS** | Vite + Nitro production build succeeded cleanly |
| `git diff --check` | **PASS** | Zero whitespace or formatting issues |

---

## 5. Decision & PR Status
- **PR Status**: Draft PR #277 updated (`feat/b1-positive-fixture-matrix-19-36`).
- **Production Impact**: Zero. SOURCE-ONLY changes restricted to test files and generated route tree.
- **Decision**: **PASS** — `PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19` verified.
