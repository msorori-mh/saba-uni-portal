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
- `tests/b1-configured-action-panel-routing-42/excused-absence-review-ui-integration.test.tsx`
  (new — single local UI integration test: `excused_absence` + configured
  `review` renders «مراجعة», executes `review` via B1 atomic adapter only,
  generic executor unreachable, pending guard blocks double-click)
- `tests/student-requests/b1-ui/{components.test.tsx,journeys-staff.test.ts}` and
  `tests/student-requests/staff-inbox-{sign,archive}-action.test.ts` (assertions
  updated for the new label and the added routing guard)

## 8. Tests (finalization run — package 43 / SHA-44 immutable review)

- `bunx tsc --noEmit` → exit 0, clean.
- `bun test tests/b1-configured-action-panel-routing-42` (includes
  `routing.test.ts` + `excused-absence-review-ui-integration.test.tsx`) →
  **32 pass / 0 fail**, 109 assertions, 2 files, exit 0 (SHA-44 final
  targeted suite).
- `bun test` (full) → **2121 pass / 2 fail / 0 skipped**, 181 files, exit 1.
- `bun run build` → exit 0, success.
- `git diff --check` → exit 0, clean.

### 8.1 `src/routeTree.gen.ts` verdict

Package 42 adds no route files and changes no route. The build regenerates the
file with a non-semantic footer/order drift only. It was restored **byte-for-byte
to BASE SHA `69de4473740149ea3d0586fddf613db474973e6c`**; `git diff
src/routeTree.gen.ts` is empty. It is **excluded** from the package.

### 8.2 PORTAL-D02 BASE vs candidate comparison

A clean tree of BASE SHA was extracted to a temporary directory and the exact
test was run in the same environment.

| item | BASE `69de4473` | candidate |
|---|---|---|
| failing test | `PORTAL-D02-READONLY-PRODUCTION-EXECUTION-01 > outside-git SQL exists and passes static forbid check` | identical |
| file:line | `tests/docs/portal-d02-readonly-production-execution-01.test.ts:55` | identical |
| assertion | `expect(onCi).toBe(true)` — Expected true, Received false | identical |
| cause | `SQL_ABS` operator artifact lives outside git; absent off-CI | identical |
| exit code | 1 | 1 |

Counted twice in the full run because the suite resolves that spec through two
matched paths — one distinct failing assertion.

`git diff --name-only BASE -- tests/docs scripts docs/PORTAL-D02*` → empty:
Package 42 touched **no** PORTAL-D02 file. All Package 42 tests and every
affected test pass. Zero new failures.

**Baseline exception verdict: ACCEPTED** (pre-existing, environment-only,
semantically identical on BASE and candidate).

### 8.3 Proven behaviours

Five services use the B1 panel; `enrollment_certificate` does not; `review`
stays `review` in both label and payload; `reviewed` (action_result) is rejected,
never sent; the generic executor throws before any DB access; the atomic RPC is
the only B1 execution path; missing / unsupported / mismatched actions fail
closed; `is_actionable = false` blocks the RPC; the `inFlightRef` pending guard
blocks repeated clicks.

## 8.4 Migration delta

`supabase/migrations` file count: BASE 264, candidate 264 → **delta = 0**.

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
