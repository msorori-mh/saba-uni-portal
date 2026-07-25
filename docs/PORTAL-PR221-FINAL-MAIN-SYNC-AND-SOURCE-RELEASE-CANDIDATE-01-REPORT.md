# PORTAL-PR221-FINAL-MAIN-SYNC-AND-SOURCE-RELEASE-CANDIDATE-01

## Decision

`PASS_PR221_FINAL_SOURCE_RELEASE_CANDIDATE_READY_FOR_MERGE`

No CRITICAL, HIGH, or MEDIUM source-release finding remains.

## Revision record

- PR #221 head before synchronization: `b68565360f4f0673c05d80bca5c9b59e18ec9357`
- `origin/main` before synchronization: `92d51faa9bcdc9fd99e89579f6a498b463264246`
- Pre-sync merge base: `19a4d9dcd7c9fbf5437597f47b6a18196f96a422`
- Local main synchronization merge: `63146429f734bb8e16c88e70689e3b54b0af47b0`

Integrated release inputs:

- PR #222 authorization matrix merge: `92d51faa9bcdc9fd99e89579f6a498b463264246`
- PR #224 Kimi UI/RTL/accessibility merge: `ce4afaa13355c2659317c81fc5b3ffca22d764a5`
- PR #225 secure-download and authoritative-results merge:
  `d8ea87e03abe614316d5163fd30445ee56d2684d`
- PR #223 backend integration merge into PR #221:
  `b68565360f4f0673c05d80bca5c9b59e18ec9357`

## Synchronization and conflicts

The branch was created from the latest PR #221 head and `origin/main` was merged with
`--no-ff`. Git's `ort` strategy completed without conflicts. The main-side addition
was the source-only PR #222 authorization verification package:

- Authorization report.
- Complete five-service authorization matrix.
- Transactional RPC authorization harness and runner.
- Source contract regression test.

No manual conflict choice, generated-route edit, historical migration edit, or test
assertion removal was needed.

## Preserved UI and integration behavior

Kimi behavior remains present: corrected draft/save-failure vocabulary,
`requirementsAlertAr`, `feePolicyNoteAr`, `serviceTitleAr`, real department/program
labels, semantic fieldsets and grids, accessible invalid/required relationships,
`useId`, RTL logical styling, touch targets, visible focus, attachment headings, and
acknowledgments.

Cursor backend integration remains present:

- `submit_b1_student_request_atomic`
- `act_on_b1_student_request_step_atomic`
- `record_external_university_payment_confirmation`
- Secure attachment intent, upload, completion, list, remove/reject, and download wrappers
- Backend-derived visibility
- `BACKEND_CONTRACT_PENDING` for unsupported reads
- `runtimeAvailable: false`

Codex security remediation remains present:

- Browser download input is `attachmentId` only.
- Storage bucket and object path stay in server-side authorization/signing code.
- Authorization occurs before `createSignedUrl`.
- Signed URL expiry is server-fixed to 300 seconds.
- No `getPublicUrl`, public storage URL, or client-controlled expiry.
- Staff action/payment results are limited acknowledgments without local workflow
  timestamps, optimistic status, optimistic step transition, or actor identity.
- `confirm_payment` remains a specialized `stepId` plus optional `note` payload and
  is rejected by the general action path.

## Authorization and protected scope

The PR #222 matrix covers all five services and all 24 staff steps, including the
complete negative universe for unassigned admin, registrar outside the active step,
dean outside the active step, wrong role/unit/department, predecessor violations,
cross-request attachment access, and direct RPC bypass attempts.

The matrix and source tests retain exact direct-assignee precedence and predecessor
guards. No broad admin, registrar, or dean bypass exists. `enrollment_certificate`
routes and implementation remain unaffected.

## Functional and security review

- Services remain hidden while `runtimeAvailable` is false.
- `studentVisible` is derived only from backend-returned service codes.
- Mock selection remains restricted to development/test opt-in with
  `VITE_B1_UI_MOCK=1`.
- B1 React components do not import Supabase directly.
- Client DTOs and the live adapter contain no storage bucket/path identifiers,
  `getPublicUrl`, or service-role credential.
- `confirm_payment` is not a student action and cannot use the general action wrapper.
- Revenue UI contains no amount, currency, invoice, gateway, or payment reference.
- Mutation acknowledgments do not claim workflow state or timestamps.
- Student summaries render Arabic labels instead of UUIDs.
- File withdrawal requires acknowledgment.
- Department transfer rejects the current department as target.
- User-facing validation messages remain Arabic and non-technical.

The only storage bucket/path occurrences are in the server-side RPC/storage
implementation. The only `new Date().toISOString()` occurrence in the server module
is the pre-existing submit fallback, not an action/payment workflow result; action and
payment handlers contain no locally synthesized timestamps.

## Verification

| Gate | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS — no changes |
| `bun test tests/student-requests/b1-ui` | PASS — 101 passed, 0 failed |
| `bun test tests/student-requests` | PASS — 706 passed, 0 failed |
| `bun test tests/b1-rpc-matrix` | PASS — 22 passed, 0 failed |
| `bun test tests` | PASS — 1643 passed, 0 failed |
| `bunx tsc --noEmit` | PASS |
| ESLint on all B1 TypeScript/TSX files changed by PR #221 | PASS — 0 errors |
| `bun run build` | PASS — exit code 0 |
| `git diff --check` | PASS |

The initial Windows lint pass found 2342 CRLF-only Prettier errors. Prettier was run
only on the B1 files in the PR diff. Git confirmed that the canonical content was
already identical, so no formatting-only source diff was committed. The scoped lint
then passed with zero errors.

## CI and PR #221 status

Remote CI, final head SHA, mergeability, comments, and review-thread state are
recorded after the source-release-candidate head is pushed.

## Assumptions, remaining risks, blockers, and production impact

- Assumption: merged PRs #222, #223, #224, and #225 are the authoritative release inputs.
- Remaining risk: intentionally unsupported live read/draft/inbox surfaces remain
  fail-closed until reviewed backend read contracts exist.
- Blockers: none in source, tests, type checking, lint, build, or security review.
- Production impact: none. No Production or Staging access, migration application,
  deploy/publish, workflow activation, or `student_visible` change was performed.
