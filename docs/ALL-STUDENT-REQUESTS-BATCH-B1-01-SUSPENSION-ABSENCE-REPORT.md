# ALL-STUDENT-REQUESTS-BATCH-B1-01-SUSPENSION-ABSENCE — SOURCE-ONLY

**Batch:** `BATCH-B1-AGENT-01-SUSPENSION-ABSENCE-SOURCE-01`

**Branch:** `feat/request-b1-suspension-absence`

**Verified base:** `origin/main@682b63ef93936a5fcc275c0437df4816355c41be`
**Decision:** `PASS_SOURCE_ONLY`

## Executive summary

The authorized pre-existing report was preserved, the branch was fast-forwarded to the merged B1 shared foundation, and the suspension/absence source contract was completed. The implementation is fail-closed: exact unit, role, action, predecessor, and direct assignee are required; same-role non-assignees and admin/registrar/dean bypasses are denied. Both services remain free and document-free.

Runtime activation remains unavailable because the shared submit extension is deliberately metadata-only until an authorized migration is applied. `excused_absence` also remains activation-blocked by the secure-attachment runtime flag and service-window configuration. This does not invalidate the source-only result.

## Files changed

- `src/lib/student-requests/request-service-adapter.ts`
  - Corrected suspension detail bindings for reason, duration, and notes.
  - Required the approved duration enum and terms acknowledgment.
  - Required a real secure attachment reference for excused absence.
- `src/lib/student-requests/suspension-absence-contract.ts`
  - Added exact direct-assignment step authorization and service completion gates.
  - Encoded the no-fee/no-payment/no-document policy.
- `tests/student-requests/suspension-absence-source-01.test.ts`
  - Added positive and negative authorization, validation, and completion tests.
- `tests/student-requests/request-b1-shared-foundation-source-01.test.ts`
  - Updated the excused-absence valid fixture to include its required secure attachment.
- `docs/migration-drafts/SUSPENSION-ABSENCE-SOURCE-01.sql`
  - Draft-only validation, assignment, and completion requirements; not executable/applied.
- `docs/ALL-STUDENT-REQUESTS-BATCH-B1-01-SUSPENSION-ABSENCE-REPORT.md`
  - Updated this owned report.

## Implemented contracts

### Enrollment suspension

- Trusted academic-year and year-dependent semester references.
- Detail bindings: requested year, semester, reason, duration, and optional notes.
- Duration is restricted to `one_semester` or `full_year`; terms acknowledgment is mandatory.
- Workflow: student-affairs specialist → student-affairs manager → directly assigned registrar general.
- Completion additionally requires the academic-status operation.

### Excused absence

- Trusted caller-owned active-term enrollment reference.
- Required date, known reason type, reason detail, and real secure attachment reference.
- Workflow: student-affairs specialist → manager → specialist record application.
- Completion requires every included detail row to have `record_applied_at`.

## Authorization matrix

Every step permits only the exact direct assignee with the configured `processing_unit`, `processing_role`, action, and completed predecessor. Tests deny:

- same-role non-assignee;
- missing assignment;
- wrong unit, role, action, or predecessor state;
- broad admin, registrar, or dean bypass.

The source tests exercise the shared authorization contract directly. Live RPC/E2E execution was not run because no safe configured environment or applied B1 runtime exists.

## Tests and results

- Focused B1-01 + shared-foundation tests: **61 passed, 0 failed**.
- `bun test tests/student-requests`: **338 passed, 0 failed**.
- `bunx tsc --noEmit`: **passed**.
- `bun run build`: **passed** after 329.6 seconds; only existing bundler warnings were emitted.
- `git diff --check`: **passed**.
- Independent source review: **PASS**; runtime remains correctly **HOLD** pending authorized activation.
- Post-review latest-main rerun: **338 passed, 0 failed**; typecheck, build, and diff check passed.

## Assumptions

- `docs/request-services/enrollment_suspension.md` and `docs/request-services/excused_absence.md` are the authoritative service contracts.
- The merged shared foundation is intentionally source-only and keeps atomic submit runtime unavailable until an authorized migration apply.
- Secure attachments remain runtime-blocked until their independent security/review gate is complete.

## Risks and blockers

- The maximum prior-suspension policy remains an explicit decision; the draft fails closed and does not invent a limit.
- Excused-absence service-window activation/configuration remains an explicit operational decision.
- Applying the draft SQL/migration and activating runtime require separate authorization and are outside this source-only task.

## Production impact

None. No SQL or migration was applied; no Supabase or production write occurred; no request, document, account, assignment, bucket, policy, secret, or data was changed. No deploy/publish occurred. `request_types.student_visible` and `enrollment_certificate` were not modified.

## Final decision

`PASS_B1_01_SUSPENSION_ABSENCE_SOURCE_ONLY`
