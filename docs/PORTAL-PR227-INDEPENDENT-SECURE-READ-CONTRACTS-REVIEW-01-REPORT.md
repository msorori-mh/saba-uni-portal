# PORTAL-PR227 Independent Secure Read Contracts Review

## Decision

`PASS_PR227_INDEPENDENT_SECURE_READ_CONTRACTS_REVIEW`

The independent review found four material contract defects in PR #227. They
were remediated forward-only on
`review/pr227-secure-read-contracts-codex-01`, covered by regression tests, and
validated locally. No CRITICAL, HIGH, or MEDIUM finding remains open.

## Baseline

| Item | SHA |
| --- | --- |
| PR #227 head reviewed | `879e8ab5af28c91db08d1fd1de607e65bd0ca68c` |
| `origin/main` | `92d51faa9bcdc9fd99e89579f6a498b463264246` |
| merge-base | `92d51faa9bcdc9fd99e89579f6a498b463264246` |

The review covered the complete diff from `origin/main` through the PR #227
head: the new SQL migration and draft, promotion map, sequential manifest,
preflight/post-verifier, PostgreSQL 17 harness, TypeScript server wrappers and
DTOs, focused tests, and the PR report.

## RPC inventory

All nine functions are `SECURITY DEFINER`, `STABLE`, have a fixed
`search_path = public, pg_temp`, require `auth.uid()`, revoke `PUBLIC` and
`anon`, and grant only `authenticated`. No function accepts an actor, student
profile, department scope, role, or storage coordinate from the caller.

| RPC | Purpose | Allowed user / scope source | Student identity | Assignment and current-step condition | Returned fields | Deliberately withheld | anon / unassigned / general-role-only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_b1_secure_read_runtime_capability()` | Runtime/readiness capability | Any authenticated user; readiness derived from database configuration | None | None | contract version, aggregate availability, five service readiness rows, supported reads, fail-closed writes | viewer UUID, configuration internals | DENY / not applicable / no extra capability |
| `get_b1_request_form_options(text)` | Form reference options | Active student; requested canonical service plus backend-visible/active type | `auth.uid()` → active `student_profiles` | None | service metadata and label/value option sets | contacts, actor IDs, storage, internal workflow | DENY / DENY / DENY without active student profile |
| `get_b1_request_draft_for_student(uuid)` | Current draft | Active owning student; request ownership | `auth.uid()` → active profile | Student ownership and draft status | request/form state and safe attachment metadata | staff internals, storage coordinates, URLs | DENY / DENY / role cannot substitute for student identity |
| `get_b1_request_details_for_student(uuid)` | Student request detail | Active owning student | `auth.uid()` → active profile | Student ownership | safe request/workflow summary; only student-visible return/reject comments | internal notes, assignments, actor/contact/storage data | DENY / DENY / DENY |
| `list_b1_requests_for_student(text,int,int)` | Student request list | Active student | `auth.uid()` → active profile | Own requests only | paginated safe summaries | other students, staff internals | DENY / DENY / DENY |
| `get_b1_assigned_inbox_for_actor(text,int,int)` | Assigned staff inbox | Exact active assignee | `auth.uid()` only for actor resolution | Active assignment on current active step; each advertised action rechecked by authoritative guard | safe inbox summary and nullable allowed action | student contacts, unrelated stages/requests, broad role capabilities | DENY / DENY / DENY |
| `get_b1_assigned_request_details_for_actor(uuid)` | Assigned request detail | Exact active assignee | `auth.uid()` only for actor resolution | Active assignment equals request current active step; each action guard checked | safe request/step detail and guarded actions | contacts, other-step details, storage coordinates | DENY / DENY / DENY |
| `get_b1_step_allowed_actions(uuid)` | Legal available actions | Exact active assignee | None | Requested step must be current and active; every action calls `can_current_user_act_on_step` | allowlisted legal actions only | role-derived or status-guessed capability | DENY / DENY / DENY |
| `list_b1_request_attachments_for_viewer(uuid)` | Authorized attachment metadata | Active owner or exact active current-step assignee | Owner resolved through `auth.uid()` → active profile | Staff path requires exact active current-step assignment | attachment ID, filename, MIME type, size, state and timestamps | bucket, object path/key, signed/public URL | DENY / DENY / DENY |

Denials are contract-generic and do not reveal whether a target record exists.
There is no dynamic SQL, service-role branch, direct table grant, recursive RLS
dependency, or admin/dean/registrar bypass.

## Authorization and mutation matrix

The PostgreSQL 17 disposable harness passed **25/25** named cases. It covers
authenticated student ownership, cross-student denial, anonymous denial,
missing/inactive student denial, exact active staff assignment, unassigned and
wrong-stage denial, guarded action advertisement, attachment metadata privacy,
and readiness false/true/ambiguous states. Existing five-service RPC matrix
tests provide the per-service positive and negative role/assignment coverage,
including wrong role, previous/next stage, other department, other service,
inactive assignment, and unassigned admin/dean/registrar.

The harness snapshots relevant row counts and timestamps before all reads and
asserts afterward that reads created or modified no request, step, event,
notification, attachment, or runtime workflow data. No read function emits an
event or changes `updated_at`.

## Findings and remediation

### HIGH — runtime capability was hardcoded open

The capability RPC returned `available: true` merely because the function
existed and also exposed the viewer UUID. It now derives readiness entirely
from backend state: all five canonical B1 request types must be active and
student-visible and each must have exactly one active workflow. Missing or
ambiguous configuration returns unavailable. The viewer field was removed.
This does not change `student_visible` and does not activate a workflow.

### HIGH — action advertisement could exceed authoritative authorization

Inbox/detail/action reads could advertise workflow actions from step metadata
without consistently applying the authoritative action guard. Each returned
action, including return/reject and `confirm_payment`, now requires
`can_current_user_act_on_step` for the current active step and exact assignment.
The inbox DTO makes `allowedAction` nullable instead of inventing capability.

### MEDIUM — inactive student profiles retained an ownership read path

Draft, student detail, and student-side attachment ownership joins now require
`student_profiles.status = 'active'`. An academic user or inactive/missing
student profile cannot be treated as an active student.

### HIGH — secure-read migration absent from sequential manifest

The promotion map contained the migration, but the canonical sequential
manifest did not. The secure read contract is now unique sequence **21** after
the predecessor guard; the conceptual activation gate moved to **22**. Apply
order and dependent tests were updated, pins were recalculated, preflight is
read-only, and post-verification now checks all nine objects, exact signatures,
ACLs, volatility, `SECURITY DEFINER`, fixed search paths, helper ACL, and the
absence of hardcoded readiness/viewer output.

No historical applied migration was edited. The only SQL migration modified is
PR #227's new, unapplied migration, with its source draft and pins kept in sync.

## DTO, privacy, attachments, and integration

- Public TypeScript DTOs contain no storage bucket/path/key, service-role
  metadata, email, phone, internal audit payload, unnecessary actor ID, or SQL
  detail.
- Textual hits for storage-coordinate names are limited to comments, defensive
  response validation, and regression-test forbidden-word assertions.
- Attachment reads return metadata only. They return neither a signed URL nor a
  public URL and remain compatible with the server-authorized download path
  introduced by PR #223.
- The browser cannot provide identity, department, assignment, or storage
  coordinates to these reads.
- Form options, draft, student detail/list, assigned inbox/detail, available
  actions, attachments, and refresh reads have explicit wrapper/DTO coverage.
- Create/save draft remain intentionally fail-closed and were not implemented.
- `adapter.live` was not modified.

## Migration and source integrity

- Promotion-map draft/migration SHA-256 pins match normalized LF content.
- Manifest sequence numbers are unique and dependency ordering is valid.
- Secure-read manifest sequence is 21; conceptual activation remains later at
  22.
- Preflight performs catalog checks only and writes no state.
- Post-verifier covers every RPC signature and executable ACL.
- The disposable secure-read PostgreSQL 17 container was removed after the run.
  Pre-existing unrelated Docker containers were not touched.

The repository-wide legacy RPC matrix harness was also attempted. It stops
before reaching PR #227 at the pre-existing sequence-05 SHA pin mismatch
(`expected 90bad45…`, worktree `9010fbc…`, HEAD blob `4d04b030…`). The same
stale expectation exists on the untouched PR #227 baseline; it is not caused by
this remediation. The focused PostgreSQL 17 secure-read harness completed
successfully.

## Enrollment certificate regression

No enrollment-certificate implementation, legacy
`submit_student_request` RPC, official-document read/download path, storage
policy, historical document grant, or generated route file is changed by this
branch. The full student-request and repository suites passed.

## Files changed

- Secure-read migration draft and new PR #227 migration.
- Secure-read preflight, post-verifier, promotion map, and sequential manifest.
- Secure-read TypeScript DTO (`allowedAction` nullable).
- Secure-read PostgreSQL schema/verifier/harness fixtures.
- Manifest/RPC-matrix/predecessor-guard source tests.
- Independent secure-read regression test.
- This report.

No visual component, live adapter, enrollment certificate implementation,
historical migration, generated route file, production/staging configuration,
or unrelated source was changed.

## Verification results

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS; lockfile unchanged |
| PR #227 focused source tests | PASS |
| PostgreSQL 17 secure-read disposable harness | PASS, 25/25 |
| `bun test tests/student-requests` | PASS, 627 tests |
| `bun test tests/b1-rpc-matrix` | PASS, 22 tests |
| `bun test tests` | PASS, 1564 tests |
| `bunx tsc --noEmit` | PASS |
| ESLint on all owned/modified TypeScript files | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

Stacked PR #230 was published with head
`fe42bae7a0df74c18a1e5f20cacaac44431a30b4`. GitHub reports it open,
non-draft, `MERGEABLE` / `CLEAN`, with no comments, reviews, or review threads.
No remote checks were registered for the stacked-base branch:
`NO_REMOTE_CI_FOR_STACKED_BASE`. No billing-failed job was present to rerun.

## Residual risks

- The five services remain deliberately unavailable until backend request-type
  visibility and exactly one active workflow per service are configured.
- Draft creation/save contracts remain fail-closed pending their separate
  authorized implementation.
- The repository-wide legacy harness pin drift should be repaired in its owning
  baseline task; it did not prevent executable verification of this migration.

## Production impact and safeguards

This was source-only work. There was no Production or Staging access, migration
apply, deploy, publish, workflow activation, `student_visible` mutation,
service-role use, test account creation, or PR merge.
