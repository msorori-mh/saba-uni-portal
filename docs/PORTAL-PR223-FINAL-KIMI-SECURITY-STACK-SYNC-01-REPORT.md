# PORTAL-PR223-FINAL-KIMI-SECURITY-STACK-SYNC-01

## Decision

`PASS_PR223_FINAL_KIMI_SECURITY_STACK_SYNC_READY_FOR_MERGE`

No CRITICAL, HIGH, or MEDIUM finding remains in the reviewed final stack.

## Combined revisions

- Original PR #223 backend integration: `175fbf8eca76f2b82442ef2f5f1097c8df79faaa`
- PR #225 secure-download and authoritative-results merge: `d8ea87e03abe614316d5163fd30445ee56d2684d`
- PR #224 Kimi UI/RTL/accessibility merge: `ce4afaa13355c2659317c81fc5b3ffca22d764a5`
- Local final synchronization merge: `35d8c31`

The final synchronization branch was created from the latest PR #223 head and merged
the latest Kimi base with `--no-ff`. Git completed the merge without conflicts, so no
manual conflict resolution or side selection was required.

## Preserved Kimi UI work

The merged source retains:

- Correct draft and save-failure vocabulary.
- `requirementsAlertAr`, `feePolicyNoteAr`, and `serviceTitleAr`.
- Arabic department, program, year, and semester labels.
- Authoritative current-department and current-program labels instead of UUID display.
- Semantic `fieldset` structure and responsive grids.
- Attachment and acknowledgment headings.
- `aria-invalid`, `aria-describedby`, required-state handling, and `useId`.
- RTL logical layout, minimum touch target sizing, and visible keyboard focus.

The B1 component and page-contract suites cover runtime rendering, warnings, the fee
note, label-based summaries, RTL/accessibility behavior, and the unchanged
`enrollment_certificate` route.

## Preserved secure attachment download

The browser submits only `{ attachmentId }`. The authenticated server function first
calls the existing attachment-download authorization RPC with the current user session.
Only after successful authorization does server-only code consume
`storage_bucket`/`storage_object_path` and call `createSignedUrl`.

The public result is the minimal `B1AttachmentDownload` DTO containing the signed URL
and the server-fixed expiry value. Storage bucket/path identifiers do not occur in the
public adapter types or client wrapper. Expiry is fixed server-side at 300 seconds.
There is no `getPublicUrl`, client-selected expiry, manual URL construction, or
service-role bypass.

Regression tests prove authorization precedes signing, denial never signs, storage
internals remain server-only, React components have no Supabase Storage import, and
no public storage URL path is used.

## Preserved authoritative mutation results

`actOnB1RequestStep` and `confirmB1RevenueReceipt` return limited acknowledgments:
`accepted`, `stepId`, optional `requestId`, and `action`. They do not fabricate workflow
status, current step, actor identity, or timestamps. No `new Date`, `Date.now`, or
`toISOString` is used to manufacture these action results.

`confirm_payment` remains rejected by the general action path. Its specialized RPC is
`record_external_university_payment_confirmation(uuid,text)`, and its payload remains
strictly `stepId` plus optional `note`. No amount, currency, invoice, gateway, payment
reference, client status, actor ID, `confirmed_by`, or `confirmed_at` crosses the
client boundary.

Unsupported draft, form-options, details, and inbox reads remain fail-closed with
`BACKEND_CONTRACT_PENDING`; no optimistic workflow transition was added.

## Preserved backend contracts and activation posture

- `submit_b1_student_request_atomic` remains the submission boundary.
- `act_on_b1_student_request_step_atomic` remains the general staff-action boundary.
- `record_external_university_payment_confirmation` remains the specialized finance boundary.
- Secure attachment intent, upload, completion, list, rejection/removal, and download wrappers remain intact.
- Available services continue to derive `studentVisible` from backend visibility.
- Final availability requires both backend visibility and runtime availability.
- `runtimeAvailable` remains `false`; the five B1 services remain hidden until explicit backend activation.
- No broad administrator, registrar, dean, or role bypass was introduced.

## Files changed by final synchronization

- `src/components/student-requests/b1/B1AttachmentUploader.tsx`
- `src/components/student-requests/b1/B1EmployeeActionPanel.tsx`
- `src/components/student-requests/b1/B1StaffWorkspace.tsx`
- `src/components/student-requests/b1/B1StudentRequestForm.tsx`
- `src/components/student-requests/b1/B1StudentServiceList.tsx`
- `src/components/student-requests/b1/B1WorkflowTimeline.tsx`
- `tests/student-requests/b1-ui/pages-contract.test.ts`
- `docs/PORTAL-B1-FIVE-SERVICES-UI-VISUAL-UX-QA-01-REPORT.md`
- This report

The seven TypeScript/TSX working copies introduced by the merge were normalized from
CRLF to LF only for the changed-file lint run. Git confirmed their canonical content
was already identical, so no formatting-only source diff was committed and no
repository-wide formatting was performed.

## Verification results

| Gate | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/student-requests/b1-ui` | PASS — 101 passed, 0 failed |
| `bun test tests/student-requests` | PASS — 699 passed, 0 failed |
| `bun test tests` | PASS — 1636 passed, 0 failed |
| `bunx tsc --noEmit` | PASS |
| ESLint on all B1 files changed by this synchronization | PASS — 0 errors |
| `bun run build` | PASS — exit code 0 |
| `git diff --check` | PASS |

The first broad B1 lint diagnostic reported 3491 Prettier errors caused by CRLF in
both changed and pre-existing files. Scope was narrowed to the files changed by this
synchronization, those seven files were safely normalized to LF, and the required
changed-file lint then passed with zero errors. Unrelated files were not formatted.

## Regression and protected-scope review

- The student form renders and its contracts pass.
- Service warnings and fee-policy note remain rendered.
- Summaries display labels rather than UUIDs.
- Attachment storage internals do not cross public/client DTOs.
- Authorization precedes signed-URL creation; expiry is 300 seconds.
- No public URL API or direct Supabase import exists in B1 React components.
- No local mutation timestamps or optimistic workflow transitions exist.
- `confirm_payment` remains a strict specialized payload.
- `runtimeAvailable` remains false and B1 services remain hidden.
- No `enrollment_certificate` implementation, fee machinery, migration, generated
  Supabase type, generated route tree, SQL definition, or workflow activation changed.

## PR #223 remote verification

- State: `OPEN`
- Draft: `false`
- Head after the first final-sync push: `e0556ba08205b531c039fe93fa3cb54a282fc9e4`
- Base: `ce4afaa13355c2659317c81fc5b3ffca22d764a5`
- Mergeability: `MERGEABLE`
- Merge state: `CLEAN`
- Checks: none reported for the stacked feature branch;
  `NO_REMOTE_CI_FOR_STACKED_BASE`
- Issue comments: 0
- Reviews: 0
- Review threads: 0

The PR description was updated with the final stack SHAs, test counts, security
posture, and final decision. PR #223 remains open and was not merged.

## Assumptions, risks, blockers, and production impact

- Assumption: the merged PR #224 and PR #225 heads are the authoritative approved inputs.
- Remaining risk: unsupported read surfaces intentionally remain unavailable until a
  reviewed backend read contract exists.
- Blockers: none in local source, tests, type checking, lint, or build.
- Production impact: none. No Production or Staging access, migration application,
  deploy/publish, workflow activation, or `student_visible` change was performed.
