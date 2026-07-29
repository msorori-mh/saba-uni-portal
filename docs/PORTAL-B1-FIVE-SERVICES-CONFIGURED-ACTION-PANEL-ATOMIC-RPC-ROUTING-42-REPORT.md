# PORTAL-B1-FIVE-SERVICES-CONFIGURED-ACTION-PANEL-ATOMIC-RPC-ROUTING-42 — REPORT

MODE: SOURCE REMEDIATION + OFFLINE TESTS ONLY
BASE SOURCE SHA: `69de4473740149ea3d0586fddf613db474973e6c`
REPOSITORY: `msorori-mh/saba-uni-portal`

## 1. Root cause

`StaffRequestDetailPanel` mounted the generic `StaffRequestActionPanel` for every
request type whose active step was not `sign`/`archive`. That panel derives its
buttons from `getAllowedActionsForStepContext()` — a static per-`step_key` list
that ignores the configured `request_type_workflow_steps.action_type` — and maps
«موافقة» through `mapToReviewRpcAction()` to `approve`, executed by
`executeStudentRequestStaffAction` → `act_on_student_request_step`.

For the five B1 services the backend contract requires
`p_action = config.action_type` (currently `review`), so the UI action could only
fail closed with `42501`, and the generic RPC has no `review` mapping (`22023`).

## 2. Wrong path (before)

`StaffRequestDetailPanel.tsx` → `StaffRequestActionPanel.tsx` →
`getAllowedActionsForStepContext()` → `mapToReviewRpcAction()` →
`executeStudentRequestStaffAction()` → `act_on_student_request_step(...)`.

## 3. Correct path (after)

`StaffRequestDetailPanel.tsx`
→ `isB1StaffRoutedRequestType(detail.requestTypeCode)`
→ `B1StaffStepActionSection.tsx`
→ `resolveB1StaffActionContract()` (fail-closed, single configured action)
→ `B1EmployeeActionPanel` (exactly one button, label from configured action)
→ `getB1UiAdapter().actOnB1RequestStep(stepId, action, comment?)`
→ `actOnB1UiRequestStepFn` (server fn, `requireSupabaseAuth`)
→ `resolveB1ActOnRpcAction()` (re-checks configured action server-side)
→ `rpcActOnB1StudentRequestStepAtomic()`
→ `act_on_b1_student_request_step_atomic(...)`.

## 4. Canonical request-type mapping

Membership is decided only by `normalizeStudentRequestTypeCode()` +
`B1_CANONICAL_CODES` (`src/lib/student-requests/request-service-adapter.ts`):

| input code | canonical | B1 routed |
|---|---|---|
| `enrollment_suspension` | `enrollment_suspension` | yes |
| `excused_absence` | `excused_absence` | yes |
| `absence_excuse` (legacy alias) | `excused_absence` | yes |
| `department_transfer` | `department_transfer` | yes |
| `final_chance` | `final_chance` | yes |
| `file_withdrawal` | `file_withdrawal` | yes |
| `enrollment_certificate` | `enrollment_certificate` | **no** |

## 5. UI configured-action contract

`resolveB1StaffActionContract({ requestTypeCode, stepId, configuredActionType,
allowedAction, isActionable })` returns exactly one executable action or a
fail-closed Arabic message. Executable set: `review | approve | return | reject`.

- `action_type = review` → label «مراجعة», payload `action = "review"` (literal).
- `action_result` values (`reviewed`, `approved`, …) are rejected, never sent.
- Specialized types (`confirm_payment`, `issue_document`, `sign`, `archive`,
  `clear`, `apply_decision`) route to their own panels.

Fail-closed cases (no RPC issued): missing action, empty action, ambiguous
action, action_result as action, unsupported action, specialized action,
`allowedAction` mismatch, missing step id, `is_actionable = false`, non-B1 code,
and any B1 request reaching the generic executor.

## 6. Exact atomic RPC signature

```
act_on_b1_student_request_step_atomic(
  p_step_id  uuid,
  p_action   text,   -- review | approve | clear | apply_decision | archive | reject | return
  p_comment  text,   -- nullable
  p_payload  jsonb   -- always {}
)
```
Source of truth: `src/lib/student-requests/b1-ui/b1-rpc.ts`
(`ACT_ON_B1_ATOMIC_ARG_KEYS`, `rpcActOnB1StudentRequestStepAtomic`). No parameter
name or order was guessed.

## 7. Changed files

- `src/lib/student-requests/b1-staff-action-routing.ts` (new — canonical routing +
  configured-action contract + generic-executor guard)
- `src/components/student-requests/b1/B1StaffStepActionSection.tsx` (new)
- `src/components/student-requests/b1/index.ts` (export)
- `src/components/student-requests/b1/B1EmployeeActionPanel.tsx` (review label «مراجعة»)
- `src/components/student-requests/StaffRequestDetailPanel.tsx` (B1 routing branch)
- `src/components/student-requests/StaffRequestActionPanel.tsx` (B1 fail-closed
  render guard + pre-call `assertGenericStaffExecutorAllowed`)
- `src/lib/student-requests/staff-inbox.functions.ts` (input validator rejects B1
  before any DB access)
- `tests/b1-configured-action-panel-routing-42/routing.test.ts` (new, 29 tests)
- `tests/student-requests/b1-ui/{components.test.tsx,journeys-staff.test.ts}` and
  `tests/student-requests/staff-inbox-{sign,archive}-action.test.ts` (assertions
  updated for the new label and the added routing guard)

## 8. Tests

`bun test` → **2121 passed / 2 failed / 0 skipped** (181 files).
The 2 failures are the same pre-existing, environment-only assertion
(`PORTAL-D02-READONLY-PRODUCTION-EXECUTION-01` expects an operator SQL artifact
that lives outside git and is only present on CI). Unrelated to this mission.

`bunx tsc --noEmit` → clean. `bun run build` → success. `git diff --check` → clean.

## 9. enrollment_certificate regression verdict

**PASS** — not classified as B1, never routed to `B1StaffStepActionSection`, keeps
the generic panel/executor and its dedicated issue-document path unchanged. No
visibility or workflow configuration was touched.

## 10. Operational counters

- production operations = 0
- production connections = 0
- workflow RPC actions = 0
- migrations = 0
- deploys = 0
