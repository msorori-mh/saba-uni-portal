# B1_FIVE_SERVICES_OPERATIONAL_E2E_STAGE_2_START-74 — Pre-check Report

MODE: production READ-ONLY pre-check only. No writes, no RPC, no migration, no deploy/publish.

Production ref: wpmicqriltrowwonknox — migration head 20260730175527 (Package 66 baseline).

## 1. Final decision

HOLD_B1_STAGE2_OPERATIONAL_E2E_EXCUSED_ABSENCE_NO_AUTHENTICATED_ASSIGNEE_SESSION_AVAILABLE_ONLY_REAL_STUDENT_SESSION_INJECTED

Stage 2 stopped at step (A/D) before any execution. Zero production writes performed.

## 2. Pre-check results (A) — all five services

| service | exists | student_visible | is_active | submitted TEST_ONLY request | active step | configured action |
|---|---|---|---|---|---|---|
| excused_absence | yes | false | true | SR-20260727-78427CC5 | student_affairs_intake | review |
| enrollment_suspension | yes | false | true | SR-20260727-F67CF366 / SR-20260727-50BEDCE2 | initial_review | review |
| department_transfer | yes | false | true | SR-20260727-88D885F0 | student_affairs_intake | review |
| final_chance | yes | false | true | SR-20260727-3C550070 | student_affairs_intake | review |
| file_withdrawal | yes | false | true | SR-20260727-42393846 | student_affairs_intake | review |

- Configured steps/actions are visible and literal after Package 66 (`review`, `approve`,
  `clear`, `apply_decision`, `confirm_payment`, `archive`). No alias folding observed.
- Assigned actors exist: every active step (6/6) has a non-null assignee; 0 active steps
  without an assignee. All six active steps resolve to a single staff profile
  `06f48015-bb18-461e-b818-cfd1a31a8e0d` (student affairs specialist).
- No generic bypass present: `act_on_b1_student_request_step_atomic` and
  `submit_b1_student_request_atomic` both require `auth.uid()`; there is no
  admin/system_admin/registrar/dean bypass branch.
- enrollment_certificate unaffected: `student_visible=true`, `is_active=true`, untouched.

## 3. Exact blocker

Step D of this mission requires calling `act_on_b1_student_request_step_atomic` as the
**exact direct assignee**. The function derives the actor from `auth.uid()`:

- Service-role / SQL-tool execution yields `auth.uid() = NULL` → fail-closed, cannot execute.
- The only authenticated browser session available in this environment belongs to
  `reema@usr.edu.ye`, whose only role is `student` and who is **not** a TEST_ONLY identity.
  The mission forbids using real students and forbids admin/registrar/dean bypass.
- No session exists for staff profile `06f48015-...` (the assignee of all five first steps),
  nor for the downstream assignees (library, labs, activities, finance, registrar, archive,
  source/target department heads, dean).

Therefore Stage 2 operational E2E cannot begin without an owner-provided authenticated
session for each TEST_ONLY assignee. Proceeding by any other route would require one of the
explicitly forbidden actions (direct DML on runtime steps, assignee reassignment, admin
bypass, or workflow config change).

## 4. Global confirmations (verified read-only)

- student_visible unchanged = false for all five B1 services ✔
- enrollment_certificate untouched ✔
- deploy = 0 ✔
- publish = 0 ✔
- migrations_applied = 0 (head still 20260730175527) ✔
- workflow config changes = 0 ✔
- real student requests processed = 0 ✔
- admin/system_admin/registrar/dean bypass used = none ✔
- Package 66 literal action contract still enforced (no `approve` alias for
  `clear`/`apply_decision`/`archive`) ✔

## 5. Artifacts

- Report: `docs/B1-STAGE2-OPERATIONAL-E2E-74-PRECHECK-REPORT.md`
- Evidence: read-only queries against `request_types`, `student_requests`,
  `student_request_workflow_steps`, `request_type_workflow_steps`, `pg_proc`, `user_roles`.
- Requests inspected (not modified): SR-20260727-78427CC5, SR-20260727-F67CF366,
  SR-20260727-50BEDCE2, SR-20260727-88D885F0, SR-20260727-3C550070, SR-20260727-42393846.
- Data delta: none. No row created, updated, or deleted in this mission.

## 6. Unblock requirement

To resume Stage 2, provide authenticated portal sessions (owner-driven sign-in) for the
TEST_ONLY staff assignees in workflow order, starting with the student-affairs specialist
holding staff profile `06f48015-bb18-461e-b818-cfd1a31a8e0d`, plus a TEST_ONLY student
session if a fresh request must be created instead of using the existing submitted fixtures.
