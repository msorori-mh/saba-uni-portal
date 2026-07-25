# PORTAL-PR227 Final Unified Backend Stack Independent Review 01

## Decision

`PASS_PR227_FINAL_UNIFIED_BACKEND_STACK_REVIEW`

This is a source-integration readiness decision for the later UI integration. It is
not Production, migration-apply, deployment, workflow-activation, or
`student_visible` authorization.

## Fixed baseline

- Repository: `msorori-mh/saba-uni-portal`
- PR: `#227`
- Reviewed PR HEAD: `41311950872672a8e326b1712dd1f16475cc4877`
- Reviewed base: `main@92d51faa9bcdc9fd99e89579f6a498b463264246`
- Review branch: `review/pr227-final-unified-backend-codex-01`
- GitHub state at final local verification: `OPEN`, `MERGEABLE`,
  `mergeStateStatus=BLOCKED`.

The final fetch check must continue to show the exact PR HEAD above before this
review is published.

## Files and surfaces reviewed

- The four final source migrations and promoted migrations for sequence 21–24.
- `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`.
- `docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json`.
- Preflight and post-verifier scripts for sequence 21–24.
- `tests/b1-rpc-matrix/pg/20-draft-apply-order.txt`.
- Secure Read, Secure Draft, full RPC matrix, and Integrated Runtime PostgreSQL
  harnesses.
- Secure Read and Secure Draft TypeScript contracts/wrappers.
- Existing secure attachment authorization/signing server wrapper.
- Enrollment-certificate regression guards.

No UI, React component, or `adapter.live` file was changed by this review.

## Migration sequence and pins

| Sequence | Contract | Source SHA-256 (LF) | Promoted migration SHA-256 (LF) | Result |
|---:|---|---|---|---|
| 21 | Secure Read Contracts | `0470e807fe3733658930b7916524c36e0f00b96ea5f48d962ea582144ecdd027` | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` | MATCH |
| 22 | Secure Draft Mutations | `e8610fbe35c166af1c0552990566fd3eb5e295de582e4e59f0fabf8483110fa6` | `da6754dc3b9e6830f666321447558227612e616ec592f312d092fff0f009d242` | MATCH |
| 23 | Transfer Department Scope Position Assignment | `85d6a256127584f4e8793d2db7ed0a5925e7787dea36d0d255a76e11a45271d2` | `4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85` | MATCH |
| 24 | File Withdrawal Impact Acknowledgment NULL Guard | `684aac3bc3801e7e50bb9c65ff041489afb3d9bf91083b28b97b63faa0434425` | `67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b` | MATCH |
| 25 | Activation gate | No migration; local/non-migration gate only | N/A | MATCH |

The manifest contains exactly one entry for each integer 1–24, with no missing
or duplicate `sequence_order`. Sequence 25 is documented as a separate
non-migration activation gate. Promotion Map, manifest, apply-order, source
SHA-256 pins, promoted migration SHA-256 pins, and Git blob pins agree for
21–24. No historical migration was edited.

Promotion Map orders 19 and 20 intentionally name the same predecessor-guard
artifact as a documented namespace bridge; their order numbers are unique, and
the authoritative manifest has the artifact once at sequence 20. This does not
duplicate a manifest application.

## Authorization matrix summary

All five services were exercised:

1. `enrollment_suspension`
2. `excused_absence`
3. `department_transfer`
4. `final_chance`
5. `file_withdrawal`

The PostgreSQL evidence covers the exact active assignee, all wrong-step and
wrong-role cases, unassigned admin/dean/registrar denials, other-department
denials, predecessor guards, specialized payment confirmation, and
zero-mutation rejection snapshots. The general action RPC continues to reject
`confirm_payment`; the specialized confirmation remains step ID plus optional
note and contains no amount, currency, invoice, or payment reference.

The full RPC matrix completed with `65 PASS`, `12 STATIC`, and `0 FAIL`. The
Integrated Runtime matrix recorded `24` action allows, `9` action denials,
`18` read allows, `4` read denials, and `18` zero-mutation assertions.

## Secure Read findings

- Active student profile is mandatory.
- Student ownership is derived from `auth.uid()` and cannot be supplied by the
  caller.
- Staff details, inbox, actions, and attachments require the authoritative
  exact active runtime assignment.
- Advertised actions are rechecked through the backend action guard.
- No viewer identity or raw actor UUID is returned.
- Public DTO contracts exclude storage bucket/path/object key and unnecessary
  contact data.
- Attachment metadata is authorized by request ownership or current exact
  assignment and contains only an opaque attachment reference.
- The existing download server function accepts only `attachmentId`, calls the
  authorization RPC first using the user session, and only then creates a
  server-side 300-second signed URL. It does not use `getPublicUrl`.
- Runtime capability remains fail-closed and does not itself activate any
  service.

Secure Read PostgreSQL result: `25/25 PASS`, including zero mutation.

## Secure Draft findings

- Create/save identity derives exclusively from `auth.uid()` and an active
  student profile.
- A hidden service or missing/ambiguous active workflow denies create.
- Service-specific payload allowlists reject authority, workflow, financial,
  storage, and client timestamp fields.
- Save requires non-null `expected_updated_at`; null and stale versions deny.
- Exact idempotent retry returns the authoritative existing result, while a
  reused key with different payload denies.
- The unique open-draft invariant plus the locked/idempotent create path
  produces one draft under concurrent create.
- Draft operations do not submit, initialize runtime steps, assign staff,
  create notifications/events/attachments, or activate workflows.
- Public errors are sanitized by the TypeScript server boundary.

Secure Draft PostgreSQL result: `35/35 PASS`, plus
`B1_CONCURRENT_CREATE_ONE_DRAFT_PASS`.

## Sequence 23 finding

`current_user_matches_transfer_department_scope` requires exactly one active,
time-valid `position_assignment` tied to the runtime step's exact processing
unit and role. It matches the source or target department according to the
exact step key. Direct user/staff/faculty alternatives must be null, and
`faculty_profiles.department_id` is not a substitute. Wrong, expired,
duplicated, and other-department assignments deny. No broad admin, registrar,
dean, or department-chair bypass was found.

## Sequence 24 finding

The submit persistence function uses:

`p_form_data->'impact_acknowledgment' IS DISTINCT FROM 'true'::jsonb`

Therefore missing key, JSON `null`, SQL `NULL`, and `false` deny; only JSON
`true` passes. The integrated negative cases prove denial before request,
detail, step, event, assignment, or timestamp mutation.

## PostgreSQL 17 evidence

All current-review containers were disposable (`docker run --rm`) and were
removed by their `finally` blocks.

| Harness | Result |
|---|---|
| Secure Read | PostgreSQL 17.10; 25 PASS; 0 FAIL |
| Secure Draft | PostgreSQL 17.10; 35 PASS; concurrency PASS; 0 FAIL |
| Full RPC matrix | PostgreSQL 17.10; 65 PASS; 12 STATIC; 0 FAIL |
| Integrated Runtime | PostgreSQL 17.10; services completed 5/5; 50 displayed PASS rows; 0 FAIL |

Integrated summary:

`services_completed=5 action_allows=24 action_denials=9 attachment_assertions=4 concurrency=1 draft_creates=5 draft_saves=6 idempotency=3 read_allows=18 read_denials=4 zero_mutation=18 fail_rows=0`

## Review remediation

One review-harness defect was found and fixed:

- **MEDIUM — full RPC matrix incompatibility with the unified stack.** The
  legacy matrix created several simultaneous same-student/same-service draft
  fixtures, conflicting with sequence 22's production unique-open-draft
  invariant. It also lacked sequence 23's exact position-assignment fixtures.
- The matrix now first proves that the production index exists, removes it only
  inside the disposable legacy fixture database, and reuses the integrated
  exact department position-assignment fixture. The dedicated Secure Draft
  harness remains unmodified and proves the real index and concurrent-create
  behavior against the production-equivalent schema.
- After remediation the full matrix completed `65 PASS / 12 STATIC / 0 FAIL`.

An independent five-test/47-assertion source guard now pins the final SHA
chain, manifest order, verifier presence, harness isolation, DTO privacy,
seq23/seq24 semantics, and absence of protected production identifiers.

Final finding classification:

- CRITICAL: none.
- HIGH: none.
- MEDIUM: one, remediated and regression-tested.
- LOW: namespace-bridge documentation complexity at Promotion Map order 20;
  no duplicate manifest application or source defect.

## Enrollment-certificate regression

- Legacy `submit_student_request(uuid)` remains present.
- The B1 atomic submit remains separate.
- No enrollment-certificate workflow was activated by the local B1 activation
  fixture.
- No new anonymous enrollment-certificate execute grant exists.
- The four stack SQL sources contain none of the protected identifiers:
  `SR-20260716-26BAD4C8`, `SR-20260715-FEDCB3E1`,
  `SR-20260713-2DE64041`, `USR-2026-000001`, or `USR-2026-000002`.
- No production or staging read/write was performed; these identifiers were
  checked only as forbidden source literals.

## Test results

- Focused independent guard: `5 pass`, `0 fail`, `47 expect calls`.
- `bun test tests/student-requests`: `662 pass`, `0 fail`,
  `4692 expect calls`.
- `bun test tests/b1-rpc-matrix`: `22 pass`, `0 fail`,
  `1210 expect calls`.
- `bun test tests`: `1599 pass`, `0 fail`, `14360 expect calls`.
- `bunx tsc --noEmit`: PASS.
- ESLint on the owned TypeScript test: PASS.
- `bun run build`: PASS. Only existing bundler/chunk warnings were emitted.
- `git diff --check`: PASS before report publication; repeated in the final
  gate.

## CI billing status

PR #227's remote jobs failed in 1–2 seconds before job steps and exposed no
logs. This matches the repository's known GitHub Actions billing block:

`HOLD_REMOTE_CI_BILLING_NO_JOB_STEPS`

It is not classified as a source failure. The remote run was not retried.
Complete local Bun, TypeScript, build, and PostgreSQL 17 evidence is recorded
above.

The independent review was published as stacked PR #241 against
`feat/b1-five-services-secure-read-contracts-01`. At publication it was
`OPEN`, `MERGEABLE`, and `CLEAN`, with no comments, reviews, unresolved review
threads, or remote checks reported. It was not merged.

## Assumptions, residual risks, and blockers

- Review conclusions apply only to the pinned source HEAD and base.
- Local harness activation is test-only and occurred only in disposable
  PostgreSQL containers.
- Production migration state, real assignments, and deployment configuration
  were neither accessed nor inferred.
- GitHub Actions billing remains an external merge-policy blocker if remote
  green checks are mandatory.
- This PASS means ready to integrate with the UI branch after normal review. It
  does not mean ready for Production.

## Production impact

Zero. No Production or Staging access, migration apply, deploy, publish,
workflow activation, `student_visible` change, backfill, cleanup, or real-data
mutation occurred.
