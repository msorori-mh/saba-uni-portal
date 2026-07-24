# DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01 — REPORT

## Result

Academic affiliation remains in `faculty_profiles.department_id`; department
head authority is modeled through named organizational positions, active
position assignments, and department-scoped processing assignments.

The two historical chair packages are explicitly
`NEVER_APPLY — SEMANTICALLY_INVALID`. The replacement is a source-only draft:
no SQL was applied, no production data changed, no migration was promoted, and
no deploy, publish, workflow activation, or `student_visible` change occurred.

Runtime construction and authorization drafts now require a direct
`assigned_position_assignment_id` for transfer chair steps and fail closed on
missing, duplicate, expired, mismatched, faculty-profile, or broad-role paths.

## Verification

- PG17 isolated authorization matrix: PASS (12 required cases).
- Phase source regression: PASS (4/4).
- TypeScript `tsc --noEmit`: PASS.
- Production build: PASS.
- `git diff --check`: PASS.
- Full `tests/student-requests`: 576 PASS, 3 unrelated baseline failures in
  M3-02 source-extraction expectations and the generated TanStack route hash;
  none of their source inputs are changed by this branch.
- `security:test`: not run because it targets a configured staging environment;
  this source-only phase did not use external credentials.

## Scope and risk

- Modified files are limited to source drafts, source tests, design/report
  documentation, and the isolated PG17 harness.
- Assumption: the supplied faculty-profile and department UUIDs are
  authoritative; each `user_id` is resolved at apply time.
- Risk: the forward SQL remains unapplied and requires independent review plus
  explicit production authorization.
- Blockers: none for Draft PR review.
- Production impact: zero.

## Decision

`PASS_DEPARTMENT_ADMINISTRATIVE_POSITIONS_SEPARATION_SOURCE_PR_READY`
