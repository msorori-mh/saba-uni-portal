# B1 First Delivery Negative Authorization Matrix Execution Plan 27

> **Mode**: SOURCE-ONLY Execution Plan (No Live RPC Execution)  
> **Baseline Commit**: `87449f85b95d927436e7607ae3c2b6a73245eb0d`  
> **Matrix Scope**: 267 Registered Negative Authorization Scenarios (247 Executable / 20 Rebound-Blocked)  
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
The negative matrix launcher (`scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1`) enforces three mandatory gates BEFORE firing the first RPC call:
1. **Fresh PINNED Baseline**: Verified baseline commit `87449f85b95d927436e7607ae3c2b6a73245eb0d`.
2. **Successful Operator Preflight**: Read-only preflight passes with zero errors.
3. **Separate Explicit Execution Authorization**: Explicit CLI flag `--authorize-execution` provided.

If ANY gate is missing or fails, execution terminates immediately with zero RPC invocations.

---

## 2. Case Breakdown & Denial Exceptions

The 267 negative authorization test cases cover all potential unauthorized access vectors:

| Negative Case Class | Case Count | Target Caller Context | Expected PostgreSQL Error / SQLSTATE |
|---|---|---|---|
| Unassigned Student | 45 | Student caller attempting to act on another student's request | `UNAUTHORIZED_STEP_ACTION` / `P0001` |
| Unassigned Staff | 58 | Staff member with no unit/role assignment to the step | `ACTOR_NOT_ASSIGNED` / `P0001` |
| Wrong Processing Role | 52 | Staff in correct unit but lacking designated processing role | `STEP_ACTION_NOT_ALLOWED` / `P0001` |
| Wrong Processing Unit | 44 | Staff in wrong department/unit attempting action | `UNAUTHORIZED_STEP_ACTION` / `P0001` |
| Invalid Action Code | 28 | Valid actor calling unconfigured or illegal action code | `STEP_ACTION_NOT_ALLOWED` / `P0001` |
| Predecessor State Violation | 20 (Rebound) | Valid actor attempting action out of sequence | `INVALID_PREDECESSOR_STATE` / `P0001` |
| Admin Bypass Attempt | 20 | Admin role attempting direct RPC bypass | `UNAUTHORIZED_RPC_CALLER` / `P0001` |
| **Total Negative Cases** | **267** | **Complete Authorization Boundary Spectrum** | **100% Zero-Mutation Denials** |

---

## 3. Per-Case Zero-Mutation Protocol

For every individual test case (Case 0001 to Case 0267):
1. **Pre-State Fingerprint**: Capture SHA-256 state fingerprint of `student_requests`, `student_request_steps`, `student_request_events`, and `student_request_notifications`.
2. **RPC Invocation**: Execute target RPC within isolated test harness session.
3. **Denial Assert**: Confirm exact expected SQLSTATE (`P0001`) and exception message family.
4. **Post-State Fingerprint**: Capture post-execution SHA-256 fingerprint.
5. **Zero-Mutation Verification**: Assert `pre_fingerprint == post_fingerprint`. Confirm 0 modified rows in database.

---

## 4. Recovery & Stop Protocols

- **Immediate Stop Condition**: If any negative case returns success (`allowed = true`), modifies a row, or throws an unexpected SQLSTATE (e.g. `23505` unique violation), the harness stops instantly and logs `HOLD_NEGATIVE_MATRIX_CASE_FAILURE`.
- **Resume Protocol**: After fixing the underlying source guard, the harness resumes cleanly from the failed case after re-attesting Operator Preflight.

---

## 5. Verification Harness Reference

- Harness script: `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts`
- Matrix specification: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
- Test suite: `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts`

---

## 6. Final Execution Plan Decision

```
PASS_NEGATIVE_MATRIX_EXECUTION_PLAN_READY
```
