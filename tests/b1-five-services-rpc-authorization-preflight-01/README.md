# PORTAL-B1-FIVE-SERVICES-RPC-AUTHORIZATION-MATRIX-PRODUCTION-READONLY-PREFLIGHT-01

Read-only preflight package. **Nothing in this directory was executed against production.**

| File | Purpose | Status |
|---|---|---|
| `MATRIX.json` | 24 positive + 267 negative case definitions, principals, runtime step ids | prepared |
| `01-negative-rollback-harness.sql` | authorization-only, `BEGIN` … `ROLLBACK`, direct RPC, zero-mutation proof | prepared, not executed |
| `02-positive-harness.HELD_BACK.sql` | operational workflow execution | HELD_BACK, aborts on run |
| `PAYMENT-BLOCKERS.md` | the two payment steps + TEST_ONLY fee plan | prepared |

## Separation

- **Authorization-only matrix** = `01-negative-rollback-harness.sql`. Never commits. Proves deny + zero mutation.
- **Operational workflow execution** = `02-positive-harness.HELD_BACK.sql`. Commits real transitions. Requires a separate explicit write approval.

## Case counts

| Class | Count |
|---|---|
| positive (one per configured staff step) | 24 |
| negative core (10 classes × 24 steps) | 240 |
| illegal action by the exact assignee | 24 |
| supplemental transfer department-scope | 3 |
| **negative total** | **267** (264 executable + 3 BLOCKED_PENDING_ACTIVE_TEST_ONLY_FIXTURE) |

The previously planned figure was 240 negative cases (10 × 24). This package keeps those
240 unchanged and adds 27 explicitly, hiding no role:

- **+24** `illegal_action_by_exact_assignee` — the correct assignee invoking a non-configured
  action. Post-Migration-29 the B1 action gate is a distinct predicate from the identity gate,
  so it needs its own cell per step.
- **+3** department-scope cases for `department_transfer`: source head on the target step,
  target head on the source step, and an unrelated third department head
  (قسم علوم الحاسوب) — these cannot be expressed by the generic
  `wrong_unit_principal` class because all three share unit `department` and role
  `department_head`.

## Negative classes (each × 24 steps)

`anonymous_no_jwt`, `request_owner_student`, `unassigned_admin`, `unassigned_system_admin`,
`registrar_outside_step`, `dean_outside_step`, `wrong_role_same_unit_or_peer`,
`wrong_unit_principal`, `next_step_assignee_early`, `previous_step_assignee_replay`.

Every case expects `DENY` plus an unchanged snapshot of `student_requests`,
`student_request_workflow_steps`, `student_request_workflow_events`,
`student_request_fee_assessments`, `student_request_attachment_uploads`,
`audit_logs`, `notifications`, `official_documents`.
