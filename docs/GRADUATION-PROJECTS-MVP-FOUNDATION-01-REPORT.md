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
- Composite foreign keys bind every approval, submission, note, file,
  discussion, panel member, evaluation, correction, archive and attributed
  event to the same project. Assignment triggers bind profile owner and
  department to the authenticated identity shape required by the role.
- Student, supervisor, coordinator, department head, dean and panel member have
  explicit action sets. There is no admin/registrar/global-role bypass.
- Terminal projects are immutable except for reads and reports. State changes
  are ordered; final archival follows completion and approved final file.
- Files store a private object key and digest, never a public URL. Bucket,
  MIME/size limits, scanning and retention await separate approval.
- The SQL draft enables RLS and revokes access from `anon` and `authenticated`.
  Later atomic RPCs must authorize and audit in one transaction before grants.
- Audit events are append-only by trigger and direct table writes remain
  revoked. Every FK uses restrictive
  retention. No destructive cascade is introduced.

## Reporting foundation

The draft carries department/term/program scope, state, progress, risk,
milestone deadlines, supervisor assignments, readiness/discussion state and
evaluation state. These support project counts, supervisor load, delayed/at-risk
work and discussion-readiness reports without exposing project files.
`graduation_project_reporting`, the SQL readiness predicate and the typed
summary helper are source surfaces only; grants remain closed. A presentational
readiness card exposes explicit blockers but performs no client authorization.

## Assumptions and unresolved policy

No eligible course/program/level, team-size limit, supervisor-load limit,
rubric/quorum, file policy, notification mapping or grade writeback was invented.
Those remain configuration/academic decisions. The source model is deliberately
closed until directly authorized RPCs and storage policies are reviewed.

## Production impact

Zero. No production system was contacted; no SQL was applied; no bucket, policy,
student/employee data, `student_visible`, workflow, deployment or publication
was changed. The added UI card accepts already-authorized data and is not routed
or feature-activated.

## Files

- `src/lib/graduation-projects/domain.ts`
- `src/components/graduation-projects/ProjectReadinessCard.tsx`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
- `tests/graduation-projects/graduation-projects-foundation.test.ts`
- `tests/graduation-projects/graduation-projects-sql-draft.test.ts`
- `tests/graduation-projects/postgres-foundation-verifier.sql`

## Risks and blockers

Runtime/UI activation remains blocked on academic policy, the remaining
reviewed lifecycle RPCs, execution of the supplied positive/negative verifier
against disposable PostgreSQL with approved synthetic fixtures, private storage
policy approval and separately authorized migration application. These blockers
do not prevent this source-only foundation from review.

## Verification

- `bun test tests/graduation-projects`: PASS, 13 tests / 58 assertions.
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

## Independent review remediation

The #178 findings were addressed in source as follows:

- HIGH-01: composite same-project/discussion FKs now cover all actor and evidence
  relationships, including evaluation-to-panel membership.
- MEDIUM-01: role/subject shape, profile ownership, project department and
  active/end interval consistency are database-guarded.
- MEDIUM-02: the locked archive RPC requires exact assignment, completed state,
  optimistic version, same-project clean accepted final evidence, accepted
  corrections, atomic event insertion and correlation-id idempotency.
- MEDIUM-03: event UPDATE/DELETE is rejected by an append-only trigger and
  direct client writes stay revoked.
- MEDIUM-04: contract tests cover the boundaries and a PostgreSQL catalog plus
  positive/negative matrix verifier is supplied. Its execution remains an
  explicit pre-merge HOLD until a disposable compatible PostgreSQL fixture
  environment is available; it was not misrepresented as executed.
- LOW-01: the draft is transaction bounded and refuses ambiguous retries.
