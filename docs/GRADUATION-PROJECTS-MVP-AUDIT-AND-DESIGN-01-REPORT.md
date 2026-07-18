# GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01

## Decision

**Audit artifact: PASS_AUDIT_COMPLETE.**

**Implementation/activation: HOLD_PENDING_ACADEMIC_DECISIONS.** This report is a
source-only design artifact. It adds no runtime, schema, SQL, migration, UI,
feature activation, deployment, production read/write, or academic mapping.

## Repository inventory

No `graduation_projects`, `student_projects`, or equivalent graduation-project
domain exists in the generated database types or runtime. The following are
adjacent capabilities, not authorization to overload or reinterpret them:

| Capability | Existing evidence | Safe design conclusion |
|---|---|---|
| Student identity | `student_profiles` has program, department, study system and status | Reuse the profile identity; none of these fields alone proves project eligibility |
| Exact academic participation | `student_enrollments -> course_sections -> course_offerings` supplies section, course, program, level, academic year and semester provenance | Any course-bound eligibility must use the exact enrollment chain and a canonical current-term resolver; never infer a cohort from program/level similarity |
| Faculty and departments | `faculty_profiles` links department/program and optional authenticated user; `departments` is canonical | Supervisor eligibility and load remain policy decisions; department membership is not assignment |
| Graduate-affairs titles | `graduate_affairs_manager` and `graduate_affairs_specialist` exist as staff titles under `student_affairs` | Do not grant either title project authority until an explicit permission/assignment contract is approved |
| Secure files | Request, council and course-material paths demonstrate private-object, signed-download and audit patterns | A project-specific private bucket/prefix and policies require separate approval; do not reuse an adjacent bucket by assumption |
| Notifications | Generic `notifications` supports user/reference delivery | Project event vocabulary, recipients, idempotency and timing require an approved contract |
| Audit | `audit_logs`/`log_audit` patterns exist | Every mutation, transition, assignment, submission, evaluation and file read/download must emit a durable event |
| Requests and documents | `student_requests`, workflow steps and `official_documents` solve service requests and formal issuance | Do not use `student_requests` or `official_documents` as the project store. A document is created only if a later approved lifecycle explicitly requires formal issuance |
| Council artifacts | Council topics, votes and secure attachments exist | They are not a project, team, milestone or evaluation model and confer no implicit project access |

## Decisions that must be supplied, not inferred

Before schema or runtime work, the academic owner must approve:

1. Eligible programs, levels, terms and exact eligible course(s), including the
   authoritative canonical-term rule.
2. Minimum/maximum team size; team leader semantics; cross-section,
   cross-program, cross-department and regular/private mixing rules.
3. Treatment of transferred, suspended, withdrawn, inactive and incomplete
   students after team formation.
4. Proposal approval authority and department isolation.
5. Supervisor eligibility, direct-assignment mechanism, maximum load,
   co-supervision and replacement rules.
6. Lifecycle states, transition owners, deadlines, cancellation and archival.
7. Milestones, required artifacts, resubmission/late policy and versioning.
8. Evaluation panel composition, conflicts of interest, rubric, weights,
   rounding, quorum, appeals and whether/how an approved score is written to
   grades.
9. Allowed file types, limits, malware scanning, retention and legal deletion.
10. Visibility among teammates, supervisors, evaluators, departments and
    graduate affairs; notification recipients and templates.

No academic mapping in this report is approved merely because it is proposed.

## Proposed MVP data contract (design only)

Names are provisional and must be reviewed before a migration draft:

- `graduation_projects`: immutable identity plus approved term/program/
  department/course provenance, title, lifecycle state and optimistic version.
- `graduation_project_members`: exact `student_profile_id`, membership role and
  state, with immutable source `student_enrollment_id` when course-bound.
- `graduation_project_supervisors`: exact `faculty_profile_id`, assignment type,
  assignment state and effective interval.
- `graduation_project_milestones`: approved milestone definition, deadline,
  ordering and submission policy snapshot.
- `graduation_project_submissions`: milestone attempt/version, submitter,
  timestamps, state and immutable content metadata.
- `graduation_project_submission_files`: private object key, safe metadata,
  digest, scan state and retention state; never a public URL.
- `graduation_project_evaluations`: evaluator direct assignment, rubric version,
  conflict declaration, evaluation state and finalization metadata.
- `graduation_project_evaluation_scores`: criterion snapshot, score and comment;
  final results are server-computed and immutable after finalization.
- `graduation_project_events`: append-only domain audit events with actor,
  action, target, reason and correlation metadata.

Use foreign keys with deliberate `RESTRICT`/soft-archive behavior rather than
destructive cascades. Enforce uniqueness for active membership, active direct
assignments and submission versions. Store no grade writeback contract until it
is separately approved.

## Proposed roles and lifecycle

Student member/team-lead, supervisor and evaluator are domain assignments, not
global application-role bypasses. A project coordinator or department committee
is an unresolved policy role. Existing graduate-affairs titles are not mapped
automatically.

A candidate lifecycle for discussion is `draft -> submitted -> under_review ->
approved|revision_required|rejected -> active -> completed|cancelled -> archived`.
It is **not approved**. Each transition needs an explicit actor, preconditions,
idempotency rule, concurrency lock, audit event and negative authorization
matrix before implementation.

## Security contract required for implementation

- Default deny with RLS plus atomic server/RPC mutation checks.
- Student access requires exact active project membership; faculty/staff access
  requires exact direct assignment and applicable department scope.
- Same role without assignment is DENY. Wrong department, wrong project,
  inactive assignment, anonymous access and completed/archived mutation are DENY.
- No admin, registrar, dean or graduate-affairs bypass.
- Failure of authorization must cause no project, transition, submission,
  evaluation, notification or storage mutation.
- Private storage only; short-lived signed reads/downloads after the same
  request-time authorization check. Never persist public URLs.
- Audit all assignment changes, lifecycle transitions, submissions,
  evaluations, result finalization and attachment read/download.
- Evaluators need direct assignment, conflict-of-interest handling and
  separation from score finalization according to the approved academic policy.
- Client code must never receive a service-role credential or become the
  authorization boundary.

## Precise MVP roadmap and gates

1. **Academic contract gate:** resolve every decision above and publish a signed
   canonical specification. HOLD until complete.
2. **Threat/data-model gate:** approve state machine, role-to-assignment matrix,
   department isolation, retention and grade boundary; independently review it.
3. **Migration-draft gate:** create dependency-ordered drafts only, including
   constraints, RLS, private storage policies, RPCs, audit and rollback/
   partial-apply evidence. No application in this phase.
4. **Authorization-test gate:** direct SQL/RPC tests for assigned ALLOW and every
   unassigned/wrong-scope/anonymous/inactive/other-project/bypass DENY case;
   prove authorization failure has zero side effects.
5. **Runtime gate:** server read/mutation adapters using authenticated identity,
   exact assignments, canonical term and optimistic concurrency; typecheck,
   unit/integration/security tests and independent review must pass.
6. **UI gate:** feature flag defaults OFF; UI reflects server authority but is
   never the authority. Accessibility/build/lint tests must pass.
7. **Synthetic staging gate:** provision only approved synthetic identities and
   exercise lifecycle, concurrency, secure files, notification idempotency and
   audit completeness.
8. **Release gate:** migration application, storage changes, deploy/publish and
   feature activation each require their separately authorized, ordered command
   and preflight/post-verification plan. Production remains closed until then.

## Source-only migration bundle dependency sequence

This is an implementation inventory and dependency order, not SQL. Every item
below remains **DRAFTS_ONLY_NO_APPLY**. A bundle may move from HOLD to PASS only
after its named decisions, source drafts, direct authorization tests and
independent review are complete. PASS means ready for the next source-only
bundle; it never authorizes applying a migration.

| Priority / bundle | Depends on | Source-only contents and gate | Current decision |
|---|---|---|---|
| **P0 — core project authority** | Approved academic contract and threat/data model | Draft root project, team/member, supervisor/evaluator direct-assignment, immutable provenance, state/version, uniqueness/retention and append-only audit constraints; draft default-deny RLS and atomic RPC foundations; prove exact member/assignee ALLOW plus wrong project/department, same-role-unassigned, inactive, anonymous and admin/registrar/dean/graduate-affairs bypass DENY with zero side effects | **HOLD_PENDING_ACADEMIC_DECISIONS** |
| **P1 — milestones, submissions and evaluation** | P0 source review PASS | Draft milestone and versioned-submission contracts; rubric/version snapshots, evaluator assignment, conflict declarations, quorum/finalization, resubmission and immutable-score rules; prove transition ownership, deadline/concurrency/idempotency and conflict separation | **HOLD_DEPENDS_ON_P0_AND_EVALUATION_POLICY** |
| **P2 — private project files** | P0 authority PASS and P1 submission identity PASS | Draft project-specific private bucket/prefix inventory, object-key contract, upload/finalize/scan/retention state, RLS/storage policies and signed read/download RPC authorization; prove exact project membership/direct assignment, object-to-submission binding, traversal resistance, expiry and audited access | **HOLD_DEPENDS_ON_P0_P1_AND_STORAGE_POLICY_APPROVAL** |
| **P2 — notifications and idempotency** | P0 event identity PASS; P1 lifecycle PASS | Draft event-to-recipient vocabulary, reference identity, unique idempotency keys and retry semantics; prove no notification on denied/rolled-back mutation, no duplicates and no unauthorized data disclosure | **HOLD_DEPENDS_ON_P0_P1_AND_NOTIFICATION_POLICY** |
| **Later — runtime/UI/staging/release** | All source bundles PASS, full CI and independent security review | Implement server adapters, then feature-flagged UI default OFF, then synthetic staging. Prepare exact ordered migration commands with preflight, partial-apply stop rule and post-verification evidence; migration apply, storage creation, deployment, publication and activation remain separate release approvals | **HOLD_NO_RELEASE_AUTHORIZATION** |

The mandatory order is P0 core authority, then P1 lifecycle/evaluation, then P2
files and notifications (parallel only after their dependencies), and only then
runtime/UI/staging/release gates. No bundle may reference a later bundle to make
its own authorization complete, and no partial bundle is activation-ready.

## Acceptance and no-go conditions

MVP is acceptable only with approved academic mappings, complete positive and
negative authorization matrices, private-file verification, immutable audit,
zero-side-effect denial tests, concurrency/idempotency tests, CI PASS and an
independent review with zero CRITICAL/HIGH findings. Any missing mapping,
ambiguous authority, public storage, role bypass, client-only check, implicit
grade writeback or destructive retention behavior is a release HOLD.

## Production impact

Zero. No SQL or migration was created or applied; no production system was
contacted; no `student_visible`, runtime, UI, storage, deployment or publication
was changed.
