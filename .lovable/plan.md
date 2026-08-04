# PORTAL_B1_E2E_REQUEST_SCOPED_TEST_ONLY_ACCELERATION_PLAN_87

Mode: strict read-only design. Production writes: ZERO. No source file was modified.

## Decision

HOLD_B1_REQUEST_SCOPED_TEST_ONLY_PLAN_NOT_READY
(Section 1 outcome: HOLD_B1_REQUEST_SCOPED_ASSIGNMENT_UNAVAILABLE)

Request-scoped pinning cannot be proved safe as a stand-alone acceleration mechanism. It is necessary but not sufficient: production authorization requires a **global** processing binding in addition to the request-step assignee, and the two department-head steps structurally forbid `assigned_user_id`.

## 1 — Request-scoped assignment semantics (proved from production)

Path: `act_on_b1_student_request_step_atomic` -> `can_current_user_act_on_step` -> `user_matches_workflow_runtime_step` + `current_user_has_exact_processing_binding` + `current_user_matches_transfer_department_scope`.

- Field/mechanism: `student_request_workflow_steps.assigned_user_id` (siblings: `assigned_staff_profile_id`, `assigned_faculty_profile_id`, `assigned_position_assignment_id`). Exactly one of the four must be non-null for a B1 step.
- Authorization precedence: when `assigned_user_id` is non-null, `user_matches_workflow_runtime_step` returns `assigned_user_id = auth.uid()` and ignores the other three columns. Identity is therefore request-and-step scoped.
- Role still required: YES. For B1 the step then also requires `current_user_has_exact_processing_binding(processing_unit_id, processing_role_id)`, which reads **global** `request_processing_assignments`. A pinned actor with no such active row is denied.
- Same-role unassigned actor: DENIED — the assignee match runs first and fails.
- Admin / registrar / dean bypass: NONE. No role bypass exists on this path; `is_owner_of_request` is an additional denial.
- Scope: the assignee columns live on one runtime step row of one request; no cross-request effect.
- Global assignment changes required: YES for the binding check. `current_user_has_exact_processing_binding` cannot be satisfied without a `request_processing_assignments` row for the exact unit/role.
- Real-person assignment impact: adding an extra active row for the same unit/role breaks `initialize_b1_request_workflow_strict` at `B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE` (line-level `count(*) <> 1` guard), so every subsequent submit — including the 19 fixtures and any real request — would fail. Time-boxing the TEST_ONLY row instead requires ending the real row for the window, which is an explicit prohibition of this mission.

Additional blockers found:

- `current_user_matches_transfer_department_scope` (department_transfer `source_/target_department_head_approval`) requires `assigned_user_id IS NULL`, `assigned_staff_profile_id IS NULL`, `assigned_faculty_profile_id IS NULL` and a valid `position_assignment`. These two steps can never be pinned by `assigned_user_id`.
- `trg_guard_b1_runtime_mutation_boundary` rejects any INSERT/UPDATE/DELETE on B1 runtime steps unless `b1.atomic_init` / `b1.atomic_action` / `b1.specialized_action` GUC is set. Any pinning control must be a SECURITY DEFINER RPC that sets the boundary flag; direct DML is impossible.
- `initialize_b1_request_workflow_strict` stores `metadata.direct_assignment_id` and the resubmit path re-verifies that assignee columns equal that assignment row. Pinned steps would fail a later return/resubmit.

## 2 — TEST_ONLY identity inventory (production, read-only)

Existing TEST_ONLY auth users (all `@testonly.quboolye.com` unless noted):
sa_spec, sa_mgr, registrar, library, labs, finance, archive, dean, dh_src, dh_tgt, unassigned, student, e2e02, plus `test-only.b1.e2e03@usr.edu.ye`.

State: the ten staff-shaped accounts have **zero** `staff_profiles`, **zero** `faculty_profiles`, **zero** `user_roles`. They are auth shells only.

- Existing positive accounts: 10 shells (usable identities, unusable authorization).
- Existing admin-negative: `unrelated.admin.test.01d@quboolye.test` holds role `hr_officer`, **not** admin — it is NOT a valid admin-negative actor. An admin-negative case needs a different identity decision.
- Existing faculty-negative: NONE — no TEST_ONLY account has a `faculty_profiles` row.
- Truly missing auth identities: 1 admin-negative (or an owner decision to reuse an existing admin), 1 faculty-only negative.
- Profile rows required: 10 staff profiles (+1 faculty profile for the faculty-negative case).
- Role rows required: 10 `user_roles` rows minimum, plus negatives.
- Password resets required: all 14 TEST_ONLY accounts (no known credentials).
- True minimum distinct accounts: 13 (1 owner student + 10 staff + 1 admin-negative + 1 faculty-negative), assuming `unassigned`/`student` shells cover the remaining negatives.

## 3-6 — Why the single support package is not yet designable

A one-package design can carry: TEST_ONLY profiles, role rows, a marker-gated (`TEST_ONLY_B1_E2E_87`) step-pinning RPC restricted to the five service codes and non-completed steps, a one-service `student_visible` TTL window RPC (never `is_active`, never `enrollment_certificate`), and canonical audit rows.

It cannot, under this mission's prohibitions, satisfy `current_user_has_exact_processing_binding` for the pinned TEST_ONLY actors, and it cannot pin the two department-head steps at all. Any package written now would ship a control that still denies every positive actor.

## Required owner decision before a package can be designed

One of:

1. **Request-scoped binding override** — extend `current_user_has_exact_processing_binding` (or add a B1 E2E branch) to accept a request-scoped TEST_ONLY binding row for requests marked `TEST_ONLY_B1_E2E_87` only, fail-closed for every other request. This changes a production authorization function and needs an explicit security review.
2. **Department-scoped TEST_ONLY units/roles** — create new `request_processing_units` / `request_processing_roles` rows dedicated to E2E, so TEST_ONLY `request_processing_assignments` never collide with the 13 real rows. This requires new workflow config, so the E2E would no longer exercise the production workflow.
3. **Windowed swap** (PLAN_86) — rejected by this mission.

## Cleanup manifest (design only, not implemented)

Inserted rows would be: TEST_ONLY staff/faculty profiles, user_roles, E2E requests + runtime steps, pinning/visibility audit rows. Removal order: audit -> runtime steps -> request details -> requests -> role rows -> profile rows. Pre/post proof: the negative-matrix fingerprint plus `19/19` fixture count and the 13-row active `request_processing_assignments` snapshot must be identical before and after.

## Local PG17 proof (still required for any future package)

pinned actor passes; same-role unassigned fails; wrong-department fails; admin/dean/registrar bypass false; real assignments untouched; fixtures 19/19; visibility TTL + fail-closed close; non-TEST_ONLY request rejected; cleanup restores exact fingerprint.

## Final recommendation

DO_NOT_PROCEED until the owner picks one of the three unblock options above.
