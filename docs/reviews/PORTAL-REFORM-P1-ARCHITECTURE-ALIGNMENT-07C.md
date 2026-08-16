# PORTAL_REFORM_P1_ARCHITECTURE_ALIGNMENT_07C

MODE: SOURCE_ONLY — PRODUCTION_WRITES=0, MIGRATION_APPLY=0.

## 1. Correction accepted

P1 does **not** get a new workflow engine. The blocker found in 07-RESUME
(`zero transitions`) is closed by seeding the missing rows into the existing
`request_type_workflow_transitions` table and by admitting the three P1 services
into the already-proven execution path.

## 2. What the P1-07 draft does

File: `docs/migration-drafts/p1/P1-07-WORKFLOW-TRANSITIONS-AND-SPECIALIZED-ACTIONS.sql`

| Concern | Decision |
|---|---|
| Transitions | Seeded into `request_type_workflow_transitions` (start edge + one edge per `(workflow, from_step, action_result)`, terminal edge to NULL) for the three P1 workflows |
| Step execution | Reuses `act_on_b1_student_request_step_atomic`; P1 canonical codes added to its allowlist, nothing else changed |
| Authorization | Reuses `can_current_user_act_on_step`; P1 gets the **same strict branch** as B1 (active step, exactly one direct assignee, exact `(unit, role)` processing binding, runtime/config correspondence, predecessor integrity, transition must resolve). No admin/registrar/dean bypass. The B1-88 E2E actor binding stays **B1-only** |
| Payment | Reuses `record_external_university_payment_confirmation`; only the request-type allowlist widens to the two paid P1 services. No gateway, no amount, no currency |
| Custom effects | Exactly two thin specialized actions: `p1_issue_replacement_card_step` and `p1_apply_final_result_appeal_step`. The academic decision itself remains in the already-applied `p1_apply_final_result_decision` |
| Archive | For P1 = completion only. `act_on_student_request_step`'s document/issuance contract is untouched, so `enrollment_certificate` archiving is unaffected |
| Visibility | `student_visible` is never written by this migration |

### Seeded transition graphs

```text
october_exam_entry_form_v1
  (start) --submit--> student_affairs_review --reviewed--> payment_confirmation
          --payment_confirmed--> registrar_finalize --applied--> archive --archived--> (end)

replacement_student_card_v1
  (start) --submit--> student_affairs_review --reviewed--> payment_confirmation
          --payment_confirmed--> card_issuance --applied--> (end)

final_result_appeal_v1
  (start) --submit--> registrar_intake --reviewed--> department_head_review
          --reviewed--> instructor_review --reviewed--> academic_decision
          --approved--> registrar_apply_result --applied--> archive --archived--> (end)
```

All `action_result` values satisfy `workflow_action_result_matches(action_type, result)`
and the uniqueness/incoming-edge invariants enforced by
`workflow_runtime_predecessors_satisfied`.

## 3. Regression protection

- Every function edit is a byte-faithful copy of the deployed definition plus
  additive, P1-guarded branches (`v_is_p1`, `v_strict`). B1 canonical codes take
  exactly the same code path as before.
- `apply_b1_academic_effect_for_request` is explicitly **not** invoked for P1.
- `record_external_university_payment_confirmation` keeps the B1-88 binding
  escape hatch only for B1 stored types.
- `enrollment_certificate` functions, grants, and the document/archive contract
  are not referenced by the migration.

## 4. Source changes

- `src/lib/student-requests/p1/p1-staff-specialized-actions.ts` — pure routing
  (atomic / external payment / card issuance / appeal apply) + typed thin RPC
  wrappers.
- `tests/student-requests/p1-staff-specialized-actions.test.ts` — 5 assertions,
  passing.

## 5. Status

Draft is ready for a controlled production apply under a fresh explicit
authorization. Nothing was applied and no production row was written.

DECISION: **READY_FOR_CONTROLLED_APPLY_P1_07_ENGINE_REUSE**
