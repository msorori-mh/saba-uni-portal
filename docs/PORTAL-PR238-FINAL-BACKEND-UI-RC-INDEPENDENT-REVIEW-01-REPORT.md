# PORTAL-PR238-FINAL-BACKEND-UI-RC-INDEPENDENT-REVIEW-01

## Scope and pinned baseline

- Repository: `msorori-mh/saba-uni-portal`
- Pull request: `#238`
- Target branch: `integration/b1-final-backend-ui-contracts-01`
- Live PR head at review start: `2254fe88febeca902c12c44a63810da462f1f1f0`
- Live PR head after the mandatory final refresh: `945da82ec0be44c98649e1bc152bad4249354f77`
- PR base: `feat/b1-five-services-ui-kimi-01`
- Base OID: `8c6e092c591be3d10bdfa159e86f61bc30ad0d05`
- PR #241 merge commit: `1c085a97b6a1ad6f6da99f2ad09120bafaef4468`
- Review branch: `review/pr238-final-backend-ui-rc-codex-01`

The first fetched PR head did not contain PR #241. The review branch therefore
merged the reviewed backend head forward-only. Before the final decision,
GitHub showed a newer PR #238 head, `945da82`, which contains PR #241 and its
publication update. That live head was merged into the review branch without
conflict. No result in this report relies only on the stale head.

## Findings and remediation

### HIGH — readiness could expose a read-ready but write-closed service

`resolveB1RuntimeAvailable` accepted a capability with `available=true` even
when `create_draft` was absent from `writesAvailable`. Secure Read readiness
alone could therefore make a student service visible before Secure Draft was
ready.

Remediation: runtime availability now requires an explicit `create_draft`
write capability and rejects a capability that lists `create_draft` in
`writesFailClosed`. Backend `studentVisible` remains an independent mandatory
condition in the final availability filter.

### HIGH — submit result could fabricate an authoritative timestamp

The submit wrapper fell back to `new Date().toISOString()` when the
post-mutation reread did not provide `submitted_at`. This could turn a
successful mutation followed by an incomplete refresh into locally invented
workflow data.

Remediation: submit now fails closed with
`B1_SUBMIT_AUTHORITATIVE_REFRESH_REQUIRED` unless the authoritative reread
returns `request_number`, `submitted_at`, and `updated_at`. No local timestamp
or optimistic workflow state is returned.

### MEDIUM — injected backend visibility source was ignored

The live adapter dependency exposed `getAvailableRows`, but
`getAvailableB1RequestTypes` called the global function instead. This weakened
the adapter boundary and prevented deterministic proof that availability came
only from the injected backend contract.

Remediation: the adapter now consumes only `deps.getAvailableRows()` and fails
closed to an empty list on read failure.

All CRITICAL/HIGH/MEDIUM findings are closed. No LOW finding remains open.

## Unified contract review

- Secure Read requires an active student profile for student reads and exact
  active assignment for staff reads. DTOs omit viewer identity, raw actor IDs,
  contact data, and storage coordinates.
- Secure Draft derives the student identity from `auth.uid()`, requires the
  five-service allowlists, enforces idempotency and optimistic concurrency,
  and denies hidden services or missing workflow readiness.
- `expectedUpdatedAt` is chained from the backend draft read/save result into
  save and submit; null or stale values remain denied by the backend.
- General workflow actions reject `confirm_payment`.
  `record_external_university_payment_confirmation` receives only `stepId`
  and an optional `note`; no amount, currency, invoice, gateway, reference,
  actor identity, status, or client timestamp is accepted.
- Mutation results are acknowledgments or authoritative rereads. They contain
  no optimistic status, step transition, actor identity, or fabricated time.
- Transfer department-chair authorization requires an exact active
  `position_assignment` in the exact source or target department. Generic
  admin, dean, registrar, role-only, and `faculty_profiles.department_id`
  bypasses remain denied.
- File withdrawal accepts only boolean `true` for
  `impact_acknowledgment`; missing, JSON null, SQL NULL, and false are denied
  with zero mutation.

## Attachments and privacy

- Browser calls send only `attachmentId` for download authorization.
- Bucket and object path remain inside the server-only implementation.
- Authorization completes before `createSignedUrl`.
- Signed URLs use the server-owned 300-second expiry.
- No `getPublicUrl`, client-controlled expiry, public storage URL, or durable
  signed-URL cache exists.
- Public DTOs and React components contain no `storage_bucket`,
  `storage_object_path`, `objectPath`, or `object_key`.
- Cross-request, cross-student, and unassigned-staff reads are denied by the
  authoritative attachment RPC before signing.

## Sequence and production-preparation package

| Order | Item | Result |
| --- | --- | --- |
| 21 | Secure Read Contracts | pinned and verified |
| 22 | Secure Draft Mutations | pinned and verified |
| 23 | transfer position-assignment scope | pinned and verified |
| 24 | withdrawal NULL guard | pinned and verified |
| 25 | activation gate, local/non-migration only | documented and not applied |

Promotion Map, sequential manifest, source names, and SHA-256 pins agree. There
is no duplicate or missing order. The production-preparation package remains
documentation and verification material only; this review did not execute an
apply, activation, deploy, or publication.

## PostgreSQL 17 evidence

All disposable harnesses completed on PostgreSQL 17.10 and removed their
containers:

- Secure Read: 25/25 PASS; zero-mutation assertions PASS.
- Secure Draft: 35/35 PASS plus concurrent-create/idempotency checks.
- Full RPC authorization matrix: `RESULTS=65|12|0`.
- Integrated Runtime: 5/5 services completed; 50 displayed PASS rows;
  24 action allows, 9 action denials, 18 read allows, 4 read denials,
  18 zero-mutation assertions, 4 attachment assertions, 3 idempotency
  assertions, and 0 failures.

The matrix directly covers wrong role, wrong phase, wrong department,
unassigned privileged roles, predecessor guards, attachment authorization,
withdrawal NULL semantics, and enrollment-certificate regressions.

## Source and build verification

- `bun install --frozen-lockfile`: PASS, no dependency changes.
- `bun test tests/student-requests/b1-ui`: 161 pass, 0 fail,
  1,647 expectations.
- `bun test tests/student-requests`: 823 pass, 0 fail,
  6,397 expectations.
- `bun test tests/b1-rpc-matrix`: 22 pass, 0 fail,
  1,210 expectations.
- `bun test tests`: 1,760 pass, 0 fail, 16,065 expectations.
- Independent unified-backend guard: 5 pass, 0 fail, 47 expectations.
- `bunx tsc --noEmit`: PASS.
- ESLint on all review-owned/modified TypeScript files: PASS.
- `bun run build`: PASS (`BUILD_EXIT=0`).
- `git diff --check`: PASS.

The final PR-head refresh added only the already-exercised PR #241 backend
guards and documentation. The affected UI and RPC guard suites were rerun
after that refresh.

## Enrollment-certificate regression

The legacy `submit_student_request`, enrollment-certificate RPCs, official
document ACL/storage rules, and protected fixtures were not modified.
PostgreSQL and source guards confirm the existing service remains unaffected.

## Files modified by this review

- `src/lib/student-requests/b1-ui/availability.ts`
- `src/lib/student-requests/b1-ui/adapter.live.ts`
- `src/lib/student-requests/b1-ui/b1-ui.functions.ts`
- `tests/student-requests/b1-ui/adapter-live-integration.test.ts`
- `docs/PORTAL-PR238-FINAL-BACKEND-UI-RC-INDEPENDENT-REVIEW-01-REPORT.md`

An EOL-only normalization was applied to the PR #241 independent backend guard
test so scoped ESLint could verify it; its content hash after Git
normalization is unchanged.

## Assumptions, risks, blockers, and production impact

- PR #238 was checked immediately before publication and remained pinned to
  live head `945da82ec0be44c98649e1bc152bad4249354f77`.
- Remaining risk: remote GitHub Actions may be unavailable because of the
  repository billing condition. Local PostgreSQL and source gates are complete.
- Blockers: none in source or local verification.
- Production impact: none. No Production or Staging access, migration apply,
  deploy, publish, workflow activation, `student_visible` change, or real-data
  mutation occurred.

## Publication

- Stacked review PR: `#242`
- Base: `integration/b1-final-backend-ui-contracts-01`
- Head: `review/pr238-final-backend-ui-rc-codex-01`
- Initial review commit: `99bcfa04ef8ec095912dfa3c62bfbd8f7ec1aa4a`
- GitHub status: OPEN, DRAFT, MERGEABLE, CLEAN.
- Comments/reviews/unresolved threads: none at inspection time.
- Remote checks: `NO_REMOTE_CI_REPORTED`; no job was available to inspect or
  retry. This is not treated as a source failure because all mandatory local
  gates completed successfully.

## Decision

`PASS_PR238_FINAL_BACKEND_UI_RC_INDEPENDENT_REVIEW`
