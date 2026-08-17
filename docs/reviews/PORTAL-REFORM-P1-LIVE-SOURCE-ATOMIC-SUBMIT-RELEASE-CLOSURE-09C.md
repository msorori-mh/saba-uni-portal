# PORTAL_REFORM_P1_LIVE_SOURCE_ATOMIC_SUBMIT_RELEASE_CLOSURE_09C

MODE: SOURCE_ONLY + TESTS + BUILD
PRODUCTION_WRITES=0 | MIGRATIONS_APPLIED=0 | DEPLOY=0 | PUBLISH=0 | STUDENT_VISIBLE_CHANGE=0 | P2=DENY

## G0 — Blocker reproduced (before change)

- `STUDENT_REQUEST_DETAIL_SUBMIT_RUNTIME_AVAILABLE = false`
- `rpcSubmitStudentRequestWithDetails(...)` defined, **zero** production call sites
- `october_exam_entry_form`, `replacement_student_card`, `grade_appeal` forms → `unavailableUntilSchemaApplied: SCHEMA_PENDING (true)`
- `activation-gate.ts` → `E2E: "PENDING"` for the three services

CURRENT_BLOCKER_REPRODUCED=PASS

## Changes (minimum surface)

| File | Change |
|---|---|
| `src/lib/student-request-rpc.ts` | capability flag `false → true`; capability metadata `supportsResubmit: false`, `available: true`. RPC signature untouched. |
| `src/lib/student-affairs.functions.ts` | P1 atomic branch in `submitCanonicalStudentRequestCore` before any generic path; P1 fail-closed guard in `createStudentServiceRequest`. |
| `src/lib/student-requests/request-form-registry.ts` | `P1_ATOMIC_SCHEMA_APPLIED=false` flag applied to the three P1 forms only; replacement-card form gains live contract fields `loss_incident_date`, `previous_card_serial`. |
| `src/lib/student-requests/p1/activation-gate.ts` | `E2E: PASS` for the three; `department_transfer` unchanged (`PENDING`). |
| `tests/student-requests/p1-live-source-atomic-submit-release-closure-09c.test.ts` | new focused tests (16). |
| `tests/student-requests/request-b1-shared-foundation-source-01.test.ts` | one legacy assertion updated to the new capability truth (`available: true`). |

## Behavior

For `october_exam_entry_form`, `replacement_student_card`, `grade_appeal` the canonical
submission path calls **only**:

```
submit_student_request_with_details(p_request_type, p_title, p_form_data, p_student_notes, p_test_run_id=null)
```

The backend RPC owns eligibility → creation → detail persistence → strict workflow
initialization → submit atomically. No client/server duplication, no generic
`create_student_request` / `submit_student_request`, no `fallback*` path, no
optimistic success (result is loaded only after RPC success).

Resubmit: the live atomic RPC exposes no canonical resubmit contract (it always
performs pre-insert validation and a fresh insert), so P1 `existingRequestId`
**fails closed** with `P1_RESUBMIT_NOT_SUPPORTED`. The new-request path stays
operational and is covered by tests.

Double submit: `NewStudentRequestScreen` already guards with an in-flight ref +
`submitting` state — one click ⇒ at most one atomic RPC call.
RPC unavailable ⇒ existing service-updating Arabic message; backend validation
errors surface via `mapStudentRequestRpcError` / P1 error message table.

## Results

```
SOURCE_BASE_SHA=388d6764942e43b108df77e1e4da413d9737cb72
SOURCE_HEAD_SHA=f629d0da99b987f5eb21365070ecb68c6732f72a
P1_ATOMIC_CAPABILITY_SOURCE_ENABLED=PASS
P1_ATOMIC_CALL_SITES=1 (>0)
P1_GENERIC_CREATE_PATH_CALLS=0
P1_GENERIC_SUBMIT_PATH_CALLS=0
GENERIC_FALLBACK_FOR_P1=ZERO
P1_RESUBMIT_PATH=FAIL_CLOSED_NOT_SUPPORTED
OCTOBER_FORM_CONTRACT=PASS
REPLACEMENT_FORM_CONTRACT=PASS
APPEAL_FORM_CONTRACT=PASS
P1_THREE_FORMS_AVAILABLE=PASS
OTHER_SCHEMA_PENDING_FLAGS_CHANGED=0
P1_SOURCE_READINESS_THREE=PASS
DEPARTMENT_TRANSFER_READINESS_UNCHANGED=PASS
P1_DOUBLE_SUBMIT_PROTECTION=PASS
P1_RPC_UNAVAILABLE_FAIL_CLOSED=PASS
P1_ERROR_MAPPING=PASS
FOCUSED_P1_SOURCE_TESTS=PASS (16/16)
STUDENT_REQUEST_TESTS=PASS (1114/1114)
TYPECHECK=PASS
BUILD=PASS
DIFF_CHECK=PASS
NEW_MIGRATIONS=0
PRODUCTION_WRITES=0
DEPLOY=0
PUBLISH=0
STUDENT_VISIBLE_ROWS_CHANGED=0
P2_STARTED=0
```

FINAL: **PASS_PORTAL_REFORM_P1_LIVE_SOURCE_ATOMIC_SUBMIT_RELEASE_CLOSURE_09C_READY_FOR_CONTROLLED_DEPLOY**
