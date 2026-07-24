# DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01-PR216-REMEDIATION-01 — REPORT

## Result

- Applied Migration 2 source was restored byte-for-byte. Its LF-normalized
  canonical SHA-256 is
  `0627b142b10307e72ba0c9ffd09dc4db5c02059791273f101b71463704e4f6c0`.
- The new forward draft is the only source that replaces
  `current_user_matches_transfer_department_scope(uuid,text)`.
- The forward draft now validates exact faculty identity, account, status, and
  Osama's IT academic affiliation before writes; uses advisory and table locks;
  admits only `KNOWN_LEGACY_PRESTATE` or `EXACT_FINAL_STATE`; disables only the
  three exact historical assignment IDs; and fails closed on conflicts.
- Preflight and post-verifier were expanded to per-department and protected
  invariants. Safe-disable-by-forward retains history and installs a temporary
  authorization function that always returns false.
- Atomic runtime construction remains position-assignment-only. Its current
  LF-normalized SHA-256 is
  `473528c5c49c14a486e5ca34afca1cda7a678dc86373555580fadc04e03080fd`.
- The stale TanStack semantic pin that failed PR CI was reconciled to the
  current generated route tree, and text-contract tests now normalize CRLF/LF.

## Verification

- Isolated PG17: PASS; first apply, exact-final-state reapply, and 12-case
  authorization matrix.
- Focused remediation tests: PASS, 85/85.
- `bun test tests/student-requests`: PASS.
- `bun test tests`: PASS.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS.
- `git diff --check`: PASS.
- GitHub CI before remediation: one failure, `Bun tests (tests/)`, caused by
  the stale TanStack semantic hash.
- GitHub CI after remediation: PASS, 10/10 jobs in Web CI run
  `30056439616`, including Bun tests, lint/typecheck/build, and all eight
  repository PG17 verifier jobs.

## Scope and production impact

- Source/tests/docs only. No SQL or migration was applied.
- No production data, request, document, storage, RLS, notification, audit,
  workflow activation, or `student_visible` value changed.
- PR #216 remains Draft. It was not merged or marked Ready.

## Decision

`PASS_PR216_REMEDIATION_READY_FOR_INDEPENDENT_REVIEW`

## Follow-up correction

The production-shaped safe-disable contract is corrected and verified in
`PR216-SAFE-DISABLE-PRODUCTION-CONTRACT-CORRECTION-01-REPORT.md`.
