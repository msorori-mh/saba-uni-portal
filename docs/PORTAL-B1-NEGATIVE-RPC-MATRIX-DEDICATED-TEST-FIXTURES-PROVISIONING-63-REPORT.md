# PORTAL-B1-NEGATIVE-RPC-MATRIX-DEDICATED-TEST-FIXTURES-PROVISIONING-63 — Report

MODE: CONTROLLED PRODUCTION TEST-DATA PROVISIONING ONLY
Input HOLD: `HOLD_B1_NEGATIVE_RPC_MATRIX_BLOCKED_FIXTURES_ACTIVE_STEP_FIXTURE_REQUIRES_FORBIDDEN_WORKFLOW_TRANSITION`
Source report consumed: `docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-BLOCKED-FIXTURES-CLOSURE-62-REPORT.md`

## FINAL DECISION

**HOLD_B1_NEGATIVE_RPC_MATRIX_TEST_FIXTURE_PROVISIONING_RUNTIME_STEP_INSERT_REQUIRES_ATOMIC_BOUNDARY_GUARD_BYPASS_AND_DEPARTMENT_SCOPED_POSITION_ASSIGNMENT_CREATION**

No production write was performed. Provisioning was analysed against the live
schema first (read-only), and it cannot be executed inside the mandate given.

## Unique fixture set derived from Package 62 (19 fixtures would be required)

| # | service | target step_key | configured action | unit/role | dept scope | fee state | covers cases |
|---|---|---|---|---|---|---|---|
| F01 | department_transfer | source_department_head_approval | approve | department/department_head | source dept | n/a | 1, 21, 22 |
| F02 | department_transfer | target_department_head_approval | approve | department/department_head | target dept | n/a | 2, 20 |
| F03 | department_transfer | dean_approval | approve | dean/dean | — | n/a | 3 |
| F04 | department_transfer | payment_confirmation | confirm_payment | finance/revenue_finance_officer | — | external payment pending | 4 |
| F05 | department_transfer | registrar_apply | apply_decision | registrar/registrar_general | — | paid | 5 |
| F06 | enrollment_suspension | manager_approval | approve | student_affairs/student_affairs_manager | — | free | 6 |
| F07 | enrollment_suspension | registrar_apply | apply_decision | registrar/registrar_general | — | free | 7 |
| F08 | excused_absence | manager_review | approve | student_affairs/student_affairs_manager | — | free | 8 |
| F09 | excused_absence | record_apply | apply_decision | student_affairs/student_affairs_specialist | — | free | 9 |
| F10 | file_withdrawal | library_clearance | clear | library/library_officer | — | free | 10 |
| F11 | file_withdrawal | labs_clearance | clear | labs/labs_manager | — | free | 11 |
| F12 | file_withdrawal | activities_clearance | clear | student_affairs/student_affairs_manager | — | free | 12 |
| F13 | file_withdrawal | finance_clearance | clear | finance/revenue_finance_officer | — | free | 13 |
| F14 | file_withdrawal | registrar_apply | apply_decision | registrar/registrar_general | — | free | 14 |
| F15 | file_withdrawal | archive | archive | archive/archive_officer | — | free | 15 |
| F16 | final_chance | manager_review | approve | student_affairs/student_affairs_manager | — | free | 16 |
| F17 | final_chance | dean_decision | approve | dean/dean | — | n/a | 17 |
| F18 | final_chance | payment_confirmation | confirm_payment | finance/revenue_finance_officer | — | external payment pending | 18 |
| F19 | final_chance | registrar_apply | apply_decision | registrar/registrar_general | — | paid | 19 |

`SR-20260727-695EC35B` was neither read for mutation nor modified; F08/F09 were
planned as brand-new TEST_ONLY excused_absence requests.

## Exact technical blocker (verified against live schema, read-only)

Creating a fixture requires INSERTing rows into
`public.student_request_workflow_steps` with the target step already `active`.
Three production guards make that impossible without actions this mission
forbids:

1. `trg_guard_b1_runtime_mutation_boundary` (BEFORE INSERT/UPDATE/DELETE, row) →
   `guard_b1_runtime_mutation_boundary()` raises `B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED`
   (`42501`) for every B1 request type unless the session GUC
   `b1.atomic_init` / `b1.atomic_action` / `b1.specialized_action` equals `'1'`.
   Those GUCs are set only inside the atomic RPCs. Setting them by hand from a
   provisioning transaction is a deliberate bypass of a production integrity
   guard — not covered by the granted permission list (which authorises row
   inserts, not disabling the boundary control).
2. `trg_guard_b1_runtime_step_activation_insert` (BEFORE INSERT WHEN
   `status='active'`) → `assert_b1_runtime_step_row_assignee_effective()`
   requires that exactly one effective `request_processing_assignments` row
   resolves for `(unit, role, department scope)`, and for
   `source_department_head_approval` / `target_department_head_approval` it
   additionally requires an assignment of type `position_assignment` scoped to
   the transfer's `current_department_id` / `requested_department_id`.
   Satisfying F01/F02 for a *new* request therefore needs new department-scoped
   assignments/position assignments — forbidden by `NO_ROLE_CHANGE` and by the
   standing rule against creating fictitious staff assignments.
3. `trg_b1_lock_runtime_step_identity_stmt` +
   `trg_b1_lock_transfer_department_scope_stmt` take the identity boundary lock
   on every statement, i.e. the same assertion path is re-entered for the
   `transfer_request_details` rows F01–F05 would need.

There is no sanctioned non-RPC path that yields an `active` step beyond
step 1: the student-side `create_student_request` / `submit_student_request`
initialisation only ever activates the first runtime step
(`student_affairs_intake` / `initial_review`), which is already active on the
existing TEST_ONLY requests and is not targeted by any of the 22 blocked cases.
Every one of the 19 fixtures targets step_order ≥ 2.

Consequently `executable cases = 267` / `blocked cases = 0` is unreachable
without either (a) Workflow RPC transitions (`ZERO_WORKFLOW_RPC_ACTIONS`
forbids), or (b) a boundary-guard bypass plus new department-scoped assignments
(forbidden). Package state is left exactly as reviewed.

## Results

- New fixtures created: **0**
- Request numbers / UUIDs: none
- Assignment inventory: unchanged (0 created, 0 modified)
- Inserted-table deltas: `student_requests` 0, `student_request_workflow_steps` 0,
  `student_request_workflow_events` 0, `request_processing_assignments` 0,
  detail tables 0, `student_request_fee_assessments` 0
- Existing-row UPDATE deltas: **0** · DELETE deltas: **0**
- executable cases: **245** · blocked cases: **22** · total: **267** (unchanged)
- Authoritative Baseline: untouched — `PINNED` / `be5040a4fd34fc1fbab235e118c509d0`
- Migration delta: **0** (head `20260729173359`, expected `20260729173359`)
- Workflow RPC calls: **0** · Operator Preflight: **0** · Deploy: **none**
- Production reads: 5 SELECT-only queries (schema columns, triggers, guard
  function bodies, request/step state, visibility + migration head)

## Visibility verdict

| code | is_active | student_visible |
|---|---|---|
| enrollment_suspension | true | false |
| excused_absence | true | false |
| department_transfer | true | false |
| final_chance | true | false |
| file_withdrawal | true | false |
| enrollment_certificate | true | true (protected, untouched) |

## Cleanup identifiers

None — no TEST_ONLY fixture rows were created, so no cleanup surface exists.

## Changed source files

- `docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-DEDICATED-TEST-FIXTURES-PROVISIONING-63-REPORT.md` (this report only)

## What would unblock provisioning (requires a new explicit mandate)

Either:
- **A —** authorise the legitimate forward transitions on the four submitted
  TEST_ONLY requests via `act_on_b1_student_request_step_atomic` with each
  step's real direct assignee (Workflow RPC + production write), or
- **B —** authorise an explicit, audited fixture-provisioning path (a reviewed
  migration exposing a `SECURITY DEFINER` TEST_ONLY seeding function that sets
  `b1.atomic_init` internally) plus the department-scoped assignments needed by
  F01/F02.
