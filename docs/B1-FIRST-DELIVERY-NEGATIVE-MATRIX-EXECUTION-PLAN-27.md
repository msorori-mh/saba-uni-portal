# B1 First Delivery Negative Authorization Matrix Execution Plan 27

> **Mode**: SOURCE-ONLY Execution Plan (No Live RPC Execution)
> **Baseline Commit**: `d35612906b2d3ad4d059623b02e5862aa42ab9db`
> **Migration Head**: `20260801021541`
> **Matrix Scope**: 267 Registered Negative Authorization Scenarios (267 Executable / 0 Blocked)
> **Plan Status**: PASS_NEGATIVE_MATRIX_EXECUTION_PLAN_READY

---

## 1. Executive Summary & Architecture

This document presents the complete execution plan for the **267 Negative Authorization Cases** across the five B1 student request services:
1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

### Three-Gate Execution Requirements
The negative matrix launcher (`scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1`) enforces three mandatory fail-closed gates BEFORE firing any RPC call:
1. **Fresh PINNED Non-Self-Authorizing Baseline**: Verified `AUTHORITATIVE-BASELINE.json` with `execution_authorized = false` (a baseline carrying `true` is contract drift and fails closed).
2. **Successful Read-Only Operator Preflight**: `00-preflight.sql` executes in the same session, ends in `ROLLBACK`, and emits session marker `b1.operator_preflight_passed`.
3. **Explicit Owner-Approved Execution Authorization**: `scripts/b1-rpc-principal-harness-01/authorization/EXECUTION-AUTHORIZATION.json` must be status `GRANTED` and bound to the active baseline. Currently status is `NOT_GRANTED`.

> **NO SINGLE FLAG BYPASS**: No CLI flag can grant execution. Execution authorization is controlled exclusively by the separate bound owner-approved artifact `EXECUTION-AUTHORIZATION.json`.

---

## 2. Case Breakdown & Denial Exceptions

The 267 negative authorization test cases (240 core + 24 illegal-action + 3 transfer-scope = 267 defined, 267 executable, 0 blocked) cover all potential unauthorized access vectors:

| Negative Case Class | Case Count | Target Caller Context | Expected PostgreSQL Error / SQLSTATE |
|---|---|---|---|
| Unassigned Student | 45 | Student caller attempting to act on another student's request | `UNAUTHORIZED_STEP_ACTION` / `P0001` |
| Unassigned Staff | 58 | Staff member with no unit/role assignment to the step | `ACTOR_NOT_ASSIGNED` / `P0001` |
| Wrong Processing Role | 52 | Staff in correct unit but lacking designated processing role | `STEP_ACTION_NOT_ALLOWED` / `P0001` |
| Wrong Processing Unit | 44 | Staff in wrong department/unit attempting action | `UNAUTHORIZED_STEP_ACTION` / `P0001` |
| Invalid Action Code | 24 | Valid actor calling unconfigured or illegal action code | `STEP_ACTION_NOT_ALLOWED` / `P0001` |
| Transfer Scope Mismatch | 3 | Department head calling transfer action outside department scope | `UNAUTHORIZED_STEP_ACTION` / `P0001` |
| Admin / General Bypass | 41 | Admin/Registrar/Dean role attempting direct RPC bypass | `UNAUTHORIZED_RPC_CALLER` / `P0001` |
| **Total Negative Cases** | **267** | **Complete Authorization Boundary Spectrum** | **100% Zero-Mutation Denials** |

---

## 3. Per-Case Zero-Mutation Protocol

For every individual test case (Case 0001 to Case 0267):
1. **Pre-State Fingerprint**: Capture SHA-256 state fingerprint of `student_requests`, `student_request_workflow_steps`, `student_request_workflow_events`, and related tables.
2. **RPC Invocation**: Execute target RPC (`act_on_b1_student_request_step_atomic` or `record_external_university_payment_confirmation`) within an isolated test harness transaction.
3. **Denial Assert**: Confirm exact expected SQLSTATE (`P0001`) and exception message family (`denial_class_contract`).
4. **Post-State Fingerprint**: Capture post-execution SHA-256 fingerprint.
5. **Zero-Mutation Verification**: Assert `pre_fingerprint == post_fingerprint`. Confirm 0 modified rows in database.

---

## 4. Recovery & Stop Protocols

- **Immediate Stop Condition**: If any negative case returns success (`allowed = true`), modifies a row, or throws an unexpected SQLSTATE, the harness stops instantly and logs `HOLD_NEGATIVE_MATRIX_CASE_FAILURE`.
- **Resume Protocol**: After fixing the underlying source guard, the harness resumes cleanly from the failed case after re-attesting Operator Preflight.

---

## 5. Verification Harness Reference

- Harness script: `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts`
- Matrix specification: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
- Test suite: `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts`
- Gate test suite: `tests/b1-five-services-rpc-authorization-preflight-01/execution-authorization-fail-closed-26.test.ts`

---

## 6. Final Execution Plan Decision

```
PASS_NEGATIVE_MATRIX_EXECUTION_PLAN_READY
```
