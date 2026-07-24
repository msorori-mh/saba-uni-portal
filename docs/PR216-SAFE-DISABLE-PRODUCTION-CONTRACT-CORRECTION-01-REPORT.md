# PR216-SAFE-DISABLE-PRODUCTION-CONTRACT-CORRECTION-01 — REPORT

## Result

- Corrected the safe-disable contract so
  `request_types.is_active=true` is not treated as operational activation.
- The safe-disable draft does not update `request_types`, workflows, or
  `student_visible`.
- Final fail-closed verification now requires:
  - `student_visible=false` for existing `department_transfer` and `transfer`
    request types;
  - zero active workflows for either type;
  - zero active/pending runtime steps for requests of either type;
  - `current_user_matches_transfer_department_scope(uuid,text)` to return
    `false`;
  - zero active phase-created chair position or processing assignments.
- The PostgreSQL 17 fixture models the production-shaped pre-activation state:
  `is_active=true`, `student_visible=false`, zero active workflows, and zero
  executable runtime steps.
- Negative PostgreSQL 17 cases prove STOP for visible request types, active
  workflows, active/pending runtime, and a permissive authorization function.
  The positive fixture proves `is_active=true` alone is not a blocker.

## Files changed

- `docs/migration-drafts/DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01-ROLLBACK-BY-FORWARD.sql`
- `scripts/department-administrative-positions-separation-01-pg17/00-setup-legacy.sql`
- `scripts/department-administrative-positions-separation-01-pg17/02-run.ps1`
- `scripts/department-administrative-positions-separation-01-pg17/02-safe-disable-postconditions.sql`
- `scripts/department-administrative-positions-separation-01-pg17/README.md`
- `tests/student-requests/department-administrative-positions-separation-01.test.ts`

## Verification

- Focused remediation test: PASS, 7/7.
- Isolated PostgreSQL 17 stage verifier: PASS, including the production fixture
  and all required negative cases.
- `bun test tests/student-requests`: PASS, 583/583.
- `bun test tests`: PASS, 1517/1517.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS.
- `git diff --check`: PASS.
- GitHub Web CI: PASS, 10/10 jobs in run `30058499676`, including Bun tests,
  lint/typecheck/build, and all eight repository PostgreSQL 17 verifier jobs.

## Assumptions and risk

- Runtime rows in `active` or `pending` state for either transfer request type
  are treated conservatively as executable/future-executable and block
  safe-disable.
- Existing aliases are limited to the approved codes `department_transfer`
  and `transfer`.
- Residual risk is limited to independent review; no production execution was
  attempted.

## Blockers

- None for source completion.

## Production impact

- Zero. No SQL or migration was applied.
- No production database, workflow, request type, runtime row, assignment,
  account, document, storage object, or policy was written.
- No deploy, publish, activation, `student_visible` change, Merge, or Ready
  transition occurred.

## Decision

`PASS_PR216_SAFE_DISABLE_PRODUCTION_CONTRACT_CORRECTED_READY_FOR_FINAL_REVIEW`
