# PORTAL-PR229 Independent Secure Draft Review

## Decision

`PASS_PR229_INDEPENDENT_SECURE_DRAFT_MUTATIONS_REVIEW`

PR #229 was reviewed independently, synchronized with the PR #227 base after
PR #230, remediated forward-only, and verified locally. No CRITICAL, HIGH, or
MEDIUM finding remains open.

## Baseline SHAs

| Baseline | SHA |
| --- | --- |
| PR #229 head before review | `a60fcff2378e51c0f2a9d95f7c6a0f6a5c35d6b9` |
| Updated Secure Read base / PR #230 merge | `ce0151836ee56bd43d85320749b79c4d6bb6090c` |
| Original merge-base before synchronization | `879e8ab5af28c91db08d1fd1de607e65bd0ca68c` |
| `origin/main` at review start | `92d51faa9bcdc9fd99e89579f6a498b463264246` |

The updated Secure Read base was merged with `--no-ff` into the independent
review branch. Conflicts were resolved semantically; neither side was dropped.

## Sequence before and after

Before synchronization, Secure Read and Secure Draft each occupied
`sequence_order 21` in their separate branch versions of the canonical
manifest. That would have produced a duplicate after stacking.

| Item | Before | Final |
| --- | --- | --- |
| Payment predecessor guard | manifest 20 / promotion 19 | unchanged |
| Secure Read | manifest 21 / promotion 20 | unchanged |
| Secure Draft | manifest 21 / promotion 21 | **manifest 22 / promotion 21** |
| Activation gate | gate 22 | **gate 23** |
| Actor/action harness-only remediation | apply-order 22 | apply-order 23 |

The final manifest contains exactly 22 entries with the contiguous unique
sequence `1..22`. Secure Draft depends directly on Secure Read. The promotion
map remains independently contiguous through order 21. No migration rename was
needed: `b1_21` is the promotion-map namespace, while the canonical manifest
slot is 22. The PR #229 migration is new and unapplied; no historical applied
migration was changed.

Draft/migration LF pins, manifest blob/source pin, byte size, apply-order file,
preflight/post-verifier references, source report, and dependent tests were
updated consistently.

## RPC signatures

| RPC | Exact signature | Identity | Grant |
| --- | --- | --- | --- |
| Create | `create_b1_request_draft_for_student(text,text) → jsonb` | `auth.uid()` → exactly one active student profile | authenticated only; PUBLIC/anon revoked |
| Save | `save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text) → jsonb` | `auth.uid()` → active owner profile | authenticated only; PUBLIC/anon revoked |

Both are `SECURITY DEFINER` with fixed `search_path = public, pg_temp`. Neither
accepts a user, student, actor, role, department scope, status, or client
timestamp of authorship. The save version is a backend-read `updated_at`
concurrency token, not a client-created timestamp.

## Findings and remediation

### HIGH — duplicate canonical sequence slot

Secure Read and Secure Draft both claimed manifest slot 21 when the branches
were stacked. Secure Read remains 21; Secure Draft moved to 22; activation moved
to 23. Manifest, promotion notes, apply order, source reports, tests, and pins
now prove uniqueness, continuity, and predecessor closure.

### HIGH — Secure Draft regressed Secure Read readiness

PR #229 replaced the reviewed capability with hardcoded `available=true`,
returned the viewer UUID, and advertised draft writes even while services were
hidden. The replacement now preserves PR #230 behavior:

- availability is derived from all five active, backend-visible request types;
- each service must have exactly one active workflow;
- missing or ambiguous configuration fails closed;
- no viewer identity is returned;
- create/save appear in `writes_fail_closed` until readiness is complete.

The create RPC itself enforces the same per-service visibility and exact active
workflow condition, so direct RPC use cannot bypass a hidden service.

### HIGH — optimistic-concurrency null bypass and retry ordering

`p_expected_updated_at` was optional, allowing callers to skip stale-write
protection. The token is now mandatory in the TypeScript public wrapper and SQL
guard. Null and stale tokens fail with `B1_STALE_REQUEST_VERSION`.

The original save checked staleness before idempotency, so an exact network
retry using the original authoritative timestamp could fail after its first
successful save. Exact-key/exact-payload retries are now resolved first; new
mutations then pass the stale guard before any detail/request write.

### HIGH — idempotency race could silently reuse a conflicting key

The existing-open-draft create branch used `ON CONFLICT DO NOTHING` and returned
without rechecking the stored hash/request. A concurrent same-key/different-
payload operation could be accepted silently. It now rechecks hash and request
identity after the conflict and denies mismatch. A real two-session PostgreSQL
test confirms two simultaneous creates for the same student/service return the
same request and leave exactly one draft.

### MEDIUM — raw backend error propagation

Unknown RPC/SQL errors were returned to the caller from both wrapper layers.
Unknown errors now map to the generic localized updating/unavailable message.
Only explicit stable contract codes are mapped. Table names and SQL detail are
not exposed.

### LOW — owned-file CRLF lint debt

The first scoped ESLint pass reported 1707 Prettier errors, overwhelmingly
CRLF-only, in the B1 TypeScript files involved in the merge. Prettier was
applied only to the owned B1 TypeScript/test files. The final scoped ESLint pass
has zero errors. No repository-wide formatting or configuration change was
made.

## Authorization matrix

The PostgreSQL 17 draft harness completed **35/35 named cells**, plus one
separate real two-session concurrency assertion:

- **12 positive draft cells**: five service creates with exact retries, open-
  draft dedupe, partial and complete suspension saves, valid absence/transfer/
  final-chance saves, and exact save retry.
- **19 negative draft cells**: anon, missing/inactive profile, registrar, dean,
  admin, exact assigned employee, other student, hidden service, outside-five
  type, extra payload, same-department transfer, invalid future absence,
  idempotency mismatch, submitted/completed/cancelled state, stale token, and
  null token.
- **4 contract/side-effect cells**: readiness false/true, authenticated-only
  grants, and absence of added runtime/event/notification/attachment effects.
- **5/5 services** exercised for legal create and service-specific save paths.

Faculty/staff/general-role users obtain no student identity from role. Exact
assignment does not grant draft ownership. There is no admin, dean, registrar,
or service-role bypass. Owner/status/type denials remain opaque.

## Idempotency and concurrency

- Five service create retries return the same draft.
- A retry without a key also reuses the unique open draft.
- An exact save retry returns the authoritative stored DTO even with the
  original version token.
- Same idempotency key with different payload is denied with zero form change.
- A post-conflict hash/request check closes the concurrent conflicting-key race.
- Two actual concurrent PostgreSQL sessions created exactly one draft.
- No raw unique violation was exposed.
- Null and stale concurrency tokens are denied; a matching backend timestamp is
  accepted; mutation occurs only after the guard.

## Service allowlists

- `enrollment_suspension`: academic period, suspension reason/duration, notes,
  and acknowledgment only; no payment data.
- `excused_absence`: the frozen contract uses one `absence_date`, enrolled
  course-section reference, reason type/detail, and attachment IDs. It has no
  start/end pair; future/invalid dates and untrusted enrollments are denied.
- `department_transfer`: current department/program come only from the active
  student profile; target department/program are trusted active references;
  current department as target is denied.
- `final_chance`: academic period, reason, and fixed final-chance type only;
  amount/currency/invoice/payment references are forbidden.
- `file_withdrawal`: reason and impact acknowledgment only. Partial draft save
  may omit acknowledgment; no code promotes omission to true, and existing
  submit validation remains authoritative.

Every extra form key is rejected. Create/save never submit, initialize workflow
runtime, assign staff, notify, attach, or create events.

## DTO and wrapper privacy

Public DTOs expose only request ID, canonical service, form data, safe attachment
metadata, draft status, and backend `updatedAt`. They do not expose storage
bucket/path/key, actor IDs, audit internals, SQL errors, client-controlled
status, or client-generated timestamps. Storage-coordinate occurrences in
client code are limited to defensive leak rejection. `adapter.live` was not
modified.

## Secure Read integration

- All nine Secure Read RPC remediations from PR #230 remain present.
- Runtime availability is dynamic and identity-free.
- Active student profile requirements remain in student reads.
- Advertised staff actions remain guarded by exact assignment/current step.
- Secure Read occurs once at manifest 21 and Secure Draft once at 22.
- Draft DTOs are built from backend state and are compatible with `getDraft`.
- Secure Read PostgreSQL 17 harness: **25/25 PASS**.

## Zero-mutation denial proof

Denied operations run inside PostgreSQL exception subtransactions and are
checked against request form/timestamp or relevant row counts. They create no
draft/detail on denial, runtime step, event, notification, assignment, or
attachment. The only runtime step in the expanded harness is an explicit
pre-existing exact-assignee fixture; its count remains one.

## Enrollment certificate regression

No legacy `submit_student_request`, enrollment-certificate RPC, enrollment-
certificate implementation, official-document ACL, storage policy, or generated
route source is changed. The outside-five create probe denies
`enrollment_certificate`. Full student-request and repository tests passed.

## Files changed by remediation

- Secure Draft source draft and its new unapplied migration.
- Secure Draft post-verifier and promotion-map metadata.
- Canonical manifest, apply-order file, and sequence-dependent tests/reports.
- Secure Draft server/RPC wrapper and DTO source formatting.
- Secure Draft PostgreSQL minimal schema, 35-cell verifier, and two-session
  concurrency fixture/verifier.
- Independent Secure Draft regression test.
- Secure Read merged-base files and regression expectations needed to preserve
  PR #230 at the new gate.
- This report.

No visual component, `adapter.live`, protected service implementation,
historical applied migration, generated route file, production configuration,
or unrelated project file is included.

## Verification

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS; lockfile unchanged |
| Focused Secure Draft/Read/manifest/matrix tests | PASS, 82 |
| Secure Draft PostgreSQL 17 harness | PASS, 35/35 plus concurrent-create assertion |
| Secure Read PostgreSQL 17 harness | PASS, 25/25 |
| `bun test tests/student-requests` | PASS, 645 |
| `bun test tests/b1-rpc-matrix` | PASS, 22 |
| `bun test tests` | PASS, 1582 |
| `bunx tsc --noEmit` | PASS |
| Scoped ESLint before | 1707 errors, CRLF/Prettier dominated |
| Scoped ESLint after | PASS, 0 errors |
| `bun run build` | PASS |
| `git diff --check` | PASS |

All disposable PostgreSQL containers were removed. Existing unrelated
containers were not touched.

## Residual risks

- Runtime remains deliberately fail-closed until backend visibility and exactly
  one active workflow exist for each service.
- Submit remains the separate authoritative
  `submit_b1_student_request_atomic` contract.
- Remote CI and review-thread status are verified after publication of the
  stacked remediation PR; the repository's known billing restriction may
  prevent jobs from starting.

## Production impact

Source-only. No Production or Staging access, migration apply, deploy, publish,
workflow activation, `student_visible` mutation, production/test data change,
account creation, or PR merge occurred.
