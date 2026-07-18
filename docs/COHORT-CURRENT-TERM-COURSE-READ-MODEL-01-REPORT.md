# COHORT-CURRENT-TERM-COURSE-READ-MODEL-01 — SOURCE CONTRACT

## Outcome

The source-level read model returns current-term courses only from an exact
`enrolled` student-to-section binding whose section and offering are active and
whose offering matches both canonical term identifiers. Every returned row
includes source ID, source kind, section, offering, and approval reference.

The model returns `unavailable` for missing/ambiguous term, zero/multiple student
profiles, or a study-system value outside the existing Portal vocabulary
`regular | private`. It does not invent a `parallel -> private` mapping.

## Future interfaces

Typed cohort membership and individual add/exclude interfaces are present for a
future approved data source. They are ignored unless an explicit approved-policy
flag is enabled. Even then, every row needs approved status, a non-empty decision
reference, exact student, canonical term, active section/offering, and exact
`regular | private` match. Exclusions apply to an exact section only.

These interfaces are contracts, not evidence that cohort or exception tables,
governance mappings, migrations, or production data exist.

## Files and checks

- `src/lib/student-current-term-courses.ts`
- `tests/student-portal/cohort-current-term-course-read-model-01.test.ts`
- `docs/COHORT-CURRENT-TERM-COURSE-READ-MODEL-01-REPORT.md`

Gate results:

- Focused Bun test: PASS (6 tests, 17 assertions).
- TypeScript (`tsc --noEmit`): PASS.
- Focused ESLint and Prettier: PASS.
- `git diff --check`: PASS.
- Build: ENVIRONMENT HOLD. Two clean frozen Bun installs produced a truncated
  `lucide-react@0.575.0` package containing declarations and UMD output but no
  package-declared `dist/esm/lucide-react.js` or `dist/cjs/lucide-react.js`.
  Vite therefore fails while resolving that pre-existing dependency before it
  reaches this isolated, unreferenced source contract. CI must confirm the build
  in a clean runner; this branch does not alter dependencies or the lockfile.

## Assumptions, risks, and boundaries

- The caller must pass the result of the canonical current-term resolver; null
  means zero/multiple/mismatched current rows and fails closed.
- Current authority is `student_enrollments.enrollment_status='enrolled'` only;
  `completed`, `dropped`, academic status, program, or level never create group
  membership.
- The contract is pure source code and does not query with service-role breadth.
  A later RPC/server adapter requires its own authorization and direct-call matrix.
- No runtime route consumes this contract yet. No SQL, migration, RLS, storage,
  production data, `student_visible`, deploy, publish, or feature activation was
  changed.

## Decision

`PASS_SOURCE_CONTRACT_READY_FOR_INDEPENDENT_REVIEW_WITH_LOCAL_BUILD_ENVIRONMENT_HOLD`.
