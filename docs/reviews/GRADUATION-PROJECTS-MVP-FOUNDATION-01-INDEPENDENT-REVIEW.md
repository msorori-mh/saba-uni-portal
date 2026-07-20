# GRADUATION-PROJECTS-MVP-FOUNDATION-01 — Independent Review

## Review target

- Draft PR: `#174` (`b2938c1de3c1e1e1b5be535674f1768348034cfa`)
- Base: `427b7eb48f8771f31bd08a46fc4590cf883ab7e2`
- Scope: domain model, SQL draft, tests, RLS/default-deny posture, fail-closed behavior, and requested MVP coverage.
- Review branch does not modify the reviewed PR.

## Decision

**HOLD_GRADUATION_PROJECTS_MVP_FOUNDATION_SOURCE_REMEDIATION_REQUIRED**

Finding counts: **CRITICAL 0 / HIGH 1 / MEDIUM 4 / LOW 1**.

The default-deny posture is useful and no production action is present, but the
required PASS threshold (`CRITICAL/HIGH/MEDIUM=0`) is not met.

## Findings

### HIGH-01 — Cross-project evidence and authority can be assembled from unrelated rows

The SQL uses independent foreign keys for a project's `project_id` and its
actor/evidence assignment. It never enforces that both belong to the same
project. This recurs in approvals (lines 31–35), submissions (43–47), supervisor
notes (49–53), files (55–60), discussion requests (63–65), discussion coordinator
(69–72), panel members (74–77), corrections (90–93), final archives (95–99), and
events (101–105). Evaluations similarly carry both `discussion_id` and
`panel_member_id` without proving that the panel member belongs to that
discussion (79–83).

Impact: a later RPC can create apparently valid approval, submission, panel,
evaluation, or final archive records using an assignment/file from another
project. This breaks exact-project authorization, attribution, audit, and final
archive integrity even though every individual FK exists.

Required remediation: introduce composite candidate keys and composite FKs (or
locked trigger/RPC assertions) that bind every child actor/evidence row to the
same project/discussion/milestone. Add direct PostgreSQL negative tests for each
cross-project attempt.

### MEDIUM-01 — Assignment rows do not bind roles to subjects or identities

`graduation_project_assignments.one_subject` (lines 21–27) permits zero subjects,
permits `role='student'` with a faculty profile, permits supervisor/panel roles
with a student profile, and does not prove that `user_id` owns the referenced
profile. The domain authorizer trusts the resulting role/project/department
claims (domain lines 40–50).

Required remediation: enforce role-to-subject shape, profile-to-user identity,
assignment department equal to project department, and active/ended timestamp
consistency at the atomic database boundary. Test every wrong-role and
wrong-identity case.

### MEDIUM-02 — Final archival does not enforce clean, same-project final evidence

`graduation_project_final_archives` (lines 95–99) accepts any file and assignment
FK. It does not require the file to belong to the project, have `scan_state =
'clean'`, represent the accepted final submission, or require the project to be
`completed`. The report's assertion that final archival follows completion and
an approved final file is therefore not implemented in SQL.

Required remediation: provide one locked archive RPC with optimistic version,
same-project composite bindings, completed/corrections-accepted preconditions,
clean-scan enforcement, exact authorized assignment, and an audit event.

### MEDIUM-03 — Audit events are not append-only at the authoritative boundary

The draft calls `graduation_project_events` append-only, but only revokes `anon`
and `authenticated`. There is no append-only trigger, no ownership strategy, and
no revocation from the runtime/service writer that will necessarily insert
events. A privileged runtime path can update/delete historical events, so the
claimed immutable audit property is not encoded.

Required remediation: separate an event writer function from table ownership,
revoke direct mutation from runtime principals, and reject UPDATE/DELETE with a
trigger or equivalent database boundary. Add mutation-denial tests.

### MEDIUM-04 — Tests prove strings and pure helpers, not database authorization or integrity

The SQL tests only count RLS statements, look for revoke text, and check table
names. They do not execute the draft or test positive/negative access for
student, supervisor, coordinator, target department head, dean, or panel member.
They also miss cross-project FKs, role/profile mismatch, terminal mutation,
unsafe archive, event mutation, total milestone weight, and discussion/evaluation
state prerequisites. The draft intentionally creates no policies or RPCs, so
there is currently no usable authorized runtime path to validate.

Required remediation: add direct RPC authorization matrices and SQL integrity
tests before claiming source-ready. Keep all client table writes denied.

### LOW-01 — Migration draft is not transaction bounded or idempotence guarded

The draft has neither `begin/commit` nor catalog preconditions. If separately
authorized later, an error can leave a partial schema and retries can fail
ambiguously. Add an explicit transaction and fail-closed catalog verifier before
any application authorization.

## Coverage and scope assessment

- Present: proposals, team/supervisor assignment metadata, approvals,
  milestones, versioned submissions, notes, progress fields, private-key file
  metadata, discussion requests/schedules/panels, evaluations, corrections,
  archives, and event metadata.
- Missing as executable source: authorized runtime RPCs/RLS policies, project
  comparison/management UI, report queries/views for project status, supervisor
  load, delay, and discussion readiness, and an enforced readiness predicate.
- Safe scope: no production SQL, deployment, bucket creation, `student_visible`,
  workflow activation, protected document, or production-data mutation appears.

## Positive observations

- New tables use restrictive deletion FKs and enable RLS.
- `anon` and `authenticated` receive no direct mutation grants.
- File metadata avoids public URLs and records digest/scan state.
- Pure domain authorization denies absent/inactive/non-direct/wrong-scope actors
  and terminal-state mutations.
- No global admin/registrar bypass is introduced.

## Verification performed

- Read and reviewed every PR file at the pinned head SHA.
- Compared the SQL relationships against domain assumptions and requested roles.
- Reviewed focused tests for negative authorization and integrity coverage.
- `git diff --check` on this independent report: PASS.
- No production/staging connection, SQL application, deployment, publication,
  workflow activation, or data write was performed.

## Production impact

Zero. This is a source-only independent review report.
