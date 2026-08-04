# B1 E2E 88 — Cleanup Manifest (design + callable RPC; NOT auto-applied)

Marker: `TEST_ONLY_B1_E2E_88`  
Cleanup RPC: `public.cleanup_b1_e2e_88_package(correlation_id, restore_assignees)`  
Draft SQL: `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql`

## A) Operational cleanup (ordered)

1. **CAS preflight** for every active binding: current runtime assignee/unit/role/request/workflow identity must equal `applied_assignee_snapshot`; request/execution/binding correlations must align. Drift raises `B1_E2E_88_CLEANUP_ASSIGNEE_DRIFT` and aborts with zero partial mutation.
2. Restore prior runtime assignee columns from `prior_assignee_snapshot` only when `mutated_assignees=true` and CAS passed (`b1.atomic_action` GUC).
3. Deactivate all matching `b1_e2e_88_actor_bindings` (`active=false`).
4. Close matching `b1_e2e_88_executions` (`status=closed`, set `closed_at`).
5. Preserve `student_requests`, workflow events, and append-only `b1_e2e_88_audit_events` until a separately authorized evidence purge.
6. Remove temporary `staff_profiles` / `faculty_profiles` / `user_roles` **only** when a follow-up mission proves they are unused.

## B) Package decommission (NOT_APPLIED draft)

Refuses unless open executions = 0 and active bindings = 0. Restores pre-package function bodies from base `092ba053`, revokes operational entry points, keeps audit evidence locked/non-operational, leaves five services hidden, fixtures 19/19, enrollment_certificate, and RPA untouched.

## Hard prohibitions

- Never touch real `request_processing_assignments` (13 production rows fingerprint must match).
- Never touch the 19 authoritative fixtures (`SR-20260801-13******`).
- Never set `student_visible` on any of the five services or `enrollment_certificate`.
- Never delete or rewrite `enrollment_certificate` rows/workflows.
- No automatic destructive cleanup; RPC is explicit and service_role-only.

## Pre/post fingerprint targets

| Surface | Expectation |
|---|---|
| Active `request_processing_assignments` | identical 13-row fingerprint |
| Authoritative fixtures | 19/19 unchanged |
| Five services `student_visible` | false ×5 |
| `enrollment_certificate.student_visible` | true |
| Authorization function graph | pre-package fingerprint restored after cleanup + function rollback migration (separate) |

## Authorization fingerprint restore

Cleanup deactivates bindings and closes executions so E2E authorization branches fail-closed immediately. Restoring the pre-package function bodies (`can_current_user_act_on_step`, `create_student_request`, `user_matches_workflow_runtime_step`, `current_user_matches_transfer_department_scope`) requires the separate forward-only cleanup draft — not this source mission.
