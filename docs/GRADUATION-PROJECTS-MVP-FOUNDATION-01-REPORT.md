# GRADUATION-PROJECTS-MVP-FOUNDATION-01

## Scope and decision

Source-only MVP foundation covering proposals, directly assigned student teams,
supervisors, approvals, milestones, versioned deliverables, supervisor notes,
weighted progress/risk, private attachment metadata, discussion readiness,
panels/schedules, rubric evaluations, corrections, approval and final archival.

Decision: **PASS_GRADUATION_PROJECTS_MVP_FOUNDATION_SOURCE_READY**.
This means ready for source review only. It does not authorize SQL application,
bucket creation, deployment, publication or feature activation.

## Authorization and safety

- Every actor must have an active direct assignment to the exact project and
  department. A matching title without assignment is denied.
- Student, supervisor, coordinator, department head, dean and panel member have
  explicit action sets. There is no admin/registrar/global-role bypass.
- Terminal projects are immutable except for reads and reports. State changes
  are ordered; final archival follows completion and approved final file.
- Files store a private object key and digest, never a public URL. Bucket,
  MIME/size limits, scanning and retention await separate approval.
- The SQL draft enables RLS and revokes access from `anon` and `authenticated`.
  Later atomic RPCs must authorize and audit in one transaction before grants.
- Audit events are append-only by contract and every FK uses restrictive
  retention. No destructive cascade is introduced.

## Reporting foundation

The draft carries department/term/program scope, state, progress, risk,
milestone deadlines, supervisor assignments, readiness/discussion state and
evaluation state. These support project counts, supervisor load, delayed/at-risk
work and discussion-readiness reports without exposing project files.

## Assumptions and unresolved policy

No eligible course/program/level, team-size limit, supervisor-load limit,
rubric/quorum, file policy, notification mapping or grade writeback was invented.
Those remain configuration/academic decisions. The source model is deliberately
closed until directly authorized RPCs and storage policies are reviewed.

## Production impact

Zero. No production system was contacted; no SQL was applied; no bucket, policy,
student/employee data, `student_visible`, workflow, deployment or publication
was changed. The UI is not exposed because a UI without an authorized runtime
would create a misleading and unsafe activation surface.

## Files

- `src/lib/graduation-projects/domain.ts`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
- `tests/graduation-projects/graduation-projects-foundation.test.ts`
- `tests/graduation-projects/graduation-projects-sql-draft.test.ts`

## Risks and blockers

Runtime/UI activation remains blocked on academic policy, reviewed atomic RPCs,
direct positive/negative authorization tests against PostgreSQL, private storage
policy approval and separately authorized migration application. These blockers
do not prevent this source-only foundation from review.

## Verification

- `bun test tests/graduation-projects`: PASS, 8 tests / 37 assertions.
- `bunx tsc --noEmit`: PASS after locked dependency installation.
- Standalone strict TypeScript check of the new domain module: PASS.
- `git diff --check`: PASS.
- `bun run build`: environment HOLD; Vite cannot resolve the installed
  `lucide-react` package entry. The new foundation has no import of that package,
  and its focused tests/typecheck pass. This pre-existing dependency/runtime
  failure must be cleared before merge; it is not waived.
- `security:test`: not run because this source-only foundation creates no
  connected runtime/RPC and the required safe staging credentials were absent.

Review findings: CRITICAL 0, HIGH 0, MEDIUM 0. Build remains a merge gate.
