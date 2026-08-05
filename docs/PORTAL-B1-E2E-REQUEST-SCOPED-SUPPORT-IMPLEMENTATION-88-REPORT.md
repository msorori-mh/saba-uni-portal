# PORTAL_B1_E2E_REQUEST_SCOPED_SUPPORT_IMPLEMENTATION_88

Decision: **PASS_B1_E2E_REQUEST_SCOPED_SUPPORT_SOURCE_READY**

Base HEAD: `092ba053d8a0ede536b619c0ff01c39a5ca9ba0a`  
Branch: `feat/b1-e2e-request-scoped-support-88`  
Mode: SOURCE AND LOCAL TESTING ONLY  
Production access: NONE · Production writes: ZERO · Migration apply: NONE · Deploy/Publish: NONE

## Modified files

| Path | Role |
|---|---|
| `supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql` | Forward-only package (NOT applied) |
| `tests/b1-e2e-request-scoped-support-88/*` | Bun contracts + PG17 harness |
| `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` | Cleanup draft |
| `docs/PORTAL-B1-E2E-REQUEST-SCOPED-SUPPORT-IMPLEMENTATION-88-REPORT.md` | This report |

## Architecture

- **E2E execution table:** `b1_e2e_88_executions` — correlation_id unique, marker fixed `TEST_ONLY_B1_E2E_88`, student/service/status/expiry/close/audit metadata.
- **Actor-binding table:** `b1_e2e_88_actor_bindings` — exact request + runtime step + actor + unit/role + optional department side + action; unique active tuple.
- **Normal authorization unchanged:** non-marked requests still require exact assignee + exact `request_processing_assignments` binding; no admin/registrar/dean bypass.
- **TEST_ONLY authorization:** marked requests may satisfy the processing-binding check via an exact live actor-binding; assignee match remains required (E2E binding also satisfies identity for department-head steps).
- **Department-head handling:** no `assigned_user_id` pinning; E2E department binding recognized by `current_user_matches_transfer_department_scope` + `user_matches_workflow_runtime_step`.
- **Creation while hidden:** real `create_student_request` allows five hidden services only under a live matching execution; stamps immutable marker; one request per execution.
- **Expiry/close:** expired or closed executions always deny bindings and create gate.
- **Audit:** append-only `b1_e2e_88_audit_events` with deny-mutate trigger.
- **Cleanup:** `cleanup_b1_e2e_88_package` + NOT_APPLIED draft; never touches RPA/fixtures/`student_visible`.

## Security

| Control | Result |
|---|---|
| Request scope | exact request_id + marker |
| Step scope | exact runtime_step_id + workflow_step_id |
| Actor scope | exact actor_user_id |
| Unit/role scope | exact processing_unit_id / processing_role_id |
| Department scope | source/target side + department_id |
| Admin / registrar / dean bypass | none |
| Fixture rejection | authoritative_fixture + `SR-20260801-13%` |
| Enrollment-certificate rejection | explicit |

## Tests

| Gate | Result |
|---|---|
| `bun test tests/b1-e2e-request-scoped-support-88` | PASS (contract + PG17) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS |
| `bun test tests/b1-authoritative-positive-fixture-matrix-19` | PASS |
| `bun test tests/student-requests` | PASS (suite aggregate 1065 pass / 0 fail across focused runs) |
| PG17 disposable harness | PASS (`PASS_B1_E2E_88_PG17_DISPOSABLE_HARNESS`) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| `routeTree.gen.ts` | unchanged |

## Assumptions

- Marker lives in `student_requests.form_data.e2e_marker` / `e2e_correlation_id`.
- Existing TEST_ONLY Auth shells are reused later; this mission creates no Auth users.
- Faculty-only and admin-role TEST_ONLY negatives remain unresolved (see `IDENTITIES.md`).

## Risks

- Package replaces production authorization/create function bodies; apply requires dual security review.
- Department-head E2E identity relies on binding OR-branch in `user_matches_workflow_runtime_step` without mutating `assigned_user_id`.
- Cleanup restores assignees but does not by itself restore pre-package function fingerprint (separate forward-only rollback draft).

## Blockers

None for source readiness.

## Production impact

NONE while unapplied. After apply (future mission only): temporary E2E tables/RPCs + narrowed create/authz exceptions for marked requests only.

## Final recommendation

**READY_FOR_DUAL_INDEPENDENT_REVIEW**
