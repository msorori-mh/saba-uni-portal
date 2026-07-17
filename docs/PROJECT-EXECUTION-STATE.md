# Project Execution State

Updated: 2026-07-17 (Asia/Riyadh)

## Cycle 23 — service runtime item 6 started

- Created isolated worktree/branch `codex/b1-service-runtime-drafts-05` from `main@5b8d0ef`.
- Completed and committed the executable-readiness map as `6aaf6e2`; the branch is pushed but no PR is opened before executable source and review gates exist.
- Proven historical persistence aliases were mapped for all five B1 services.
- Identified fail-closed schema gates: excused-absence reason vocabulary mismatch, secure attachment binding, exact transfer detail FKs, final-chance trusted academic inputs, and the draft-only withdrawal detail relation.
- Split item 6 into detail persistence 05A and inactive workflow drafts 05B; the existing dispatcher remains closed until 05A is complete and independently reviewed.
- No SQL/migration apply, production access/write, `student_visible` change, deploy, publish, or protected-record action occurred.

### Cycle 23 continuation — transfer persistence binding fixed

- Proved the applied historical relation is `transfer_request_details`, not the adapter's previous nonexistent `department_transfer_details` value.
- Corrected the source adapter and readiness map and added a regression assertion; commit `7e1c994` is pushed on the isolated item-6 branch.
- Focused tests PASS 50/50, TypeScript PASS after locked dependency installation, and `git diff --check` PASS.
- The branch remains pre-PR while executable 05A/05B source and independent review are incomplete.

### Cycle 24 — transfer persistence contract completed

- Added the missing required `transfer_reason` mapping and validation to the proven `transfer_request_details` adapter contract.
- Full student-request suite PASS 438/438, TypeScript PASS, and diff-check PASS; commit `f1b626d` is pushed.
- Build reached Vite bundle generation but the command transport timed out twice at 59 seconds; no source build error was reported. This gate remains pending a longer isolated run before PR.
- Generated `routeTree.gen.ts` had no normalized diff after the build and the worktree is clean.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

### Cycle 25 — schema-contract preflight tests

- Re-ran build with an extended transport window: PASS in 60.5 seconds; the earlier timeout was environmental, not a source failure.
- Added catalog-backed readiness tests for transfer, excused absence, final chance, and the no-financial-ledger invariant in commit `27d61f6`.
- Focused readiness tests PASS 4/4; full student-request suite PASS 442/442; TypeScript and diff-check PASS.
- Excused absence remains fail-closed because source values `family_emergency`/`official` do not match the applied historical check values `family`/`emergency`; no mapping was invented and no history was rewritten.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

### Cycle 26 — final chance request contract completed

- Added the missing canonical `final_chance` form, explicitly limited to a final exam chance.
- Added trusted academic-year and dependent-semester resolvers plus required reason persistence matching `extra_chance_details`.
- New writes remain server-constrained to `chance_type='final_chance'`; payment remains external confirmation with no portal financial fields.
- Focused tests PASS 54/54, TypeScript PASS, and diff-check PASS; commit `a0b5357` is pushed on the isolated item-6 branch.
- No SQL/migration apply, production access/write, visibility change, deploy, publish, or historical backfill occurred.

### Cycle 27 — suspension form/validator parity

- Fixed an impossible-submit gap: `enrollment_suspension` validation required `suspension_duration_type`, but the canonical form did not expose it.
- Added the schema-approved choices `one_semester` and `full_year` plus a regression test covering complete form-to-adapter parity.
- Focused tests PASS 15/15; full student-request suite PASS 443/443; TypeScript and diff-check PASS. Commit `814b558` is pushed.
- The service remains free and runtime remains closed pending 05A/05B; no SQL/migration apply or production action occurred.

### Cycle 28 — excused-absence vocabulary draft 05A

- Added source-only `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql` with exact catalog preflight and transaction bounds.
- The draft admits canonical new values while retaining historical `family`/`emergency` values without mapping, rewrite, or backfill.
- It does not activate the service or install the dispatcher and contains no financial fields.
- Focused tests PASS 9/9, TypeScript PASS, and diff-check PASS; commit `278ab7c` is pushed pending independent review and later full gates.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

### Cycle 29 — 05A independent review closure

- Independent review initially found HIGH 1 and MEDIUM 1: historical reason values remained writable and target-state reruns were incomplete.
- Remediation added canonical-only INSERT/changed-value enforcement, exact trigger catalog verification including `tgattr`/`tgqual`, and explicit `convalidated` handling.
- Final independent re-review PASS: CRITICAL/HIGH/MEDIUM/LOW = 0. Focused tests PASS 6/6 and diff-check PASS.
- Remediation commit `8ea65c3` is pushed; the broader item-6 branch remains pre-PR until 05A/05B executable coverage and full gates complete.
- No SQL/migration apply, production access/write, visibility change, deploy, publish, or backfill occurred.

### Cycle 30 — file-withdrawal detail boundary draft

- Added source-only `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql` and tests in commit `4db57a7`.
- Three review rounds identified and remediated exact constraint/default/ACL/RLS/policy inventory gaps; the latest remediation adds closed ACL proof, `NO FORCE RLS`, and exact default inventory.
- Focused tests PASS 4/4 and diff-check PASS. Final independent re-review of the latest ACL/RLS remediation remains pending; no PR is allowed before PASS.
- The table is owner-read and direct table writes are denied to authenticated and service roles; later reviewed SECURITY DEFINER persistence owns writes.
- No SQL/migration apply, production access/write, visibility change, deploy, publish, or protected-record action occurred.

### Cycle 31 — withdrawal review PASS and checksums pinned

- Final independent review of withdrawal 05A PASS: CRITICAL/HIGH/MEDIUM/LOW = 0; all ACL/RLS/default/constraint findings are closed.
- Pinned reviewed SHA-256 values in the migration inventory: absence 05A `c73b359...47fb27`; withdrawal 05A `e75dd442...6089a`.
- Inventory commit `248c2d7` is pushed. Remaining item-6 work is the five-service persistence dispatcher, trusted-reference validators, and inactive free-service workflows.
- No PR is opened until those executable pieces, full gates and a branch-wide independent review are complete.
- No SQL/migration apply, production access/write, visibility change, deploy, publish, or protected-record action occurred.

### Cycle 32 — trusted-reference validators started

- Added source-only shared validators for exact academic year/semester relationship, active owned course enrollment, and active program/department relationship.
- Functions are internal-only with authenticated/anon execution revoked and contain no data writes, service activation, or financial fields.
- Focused tests PASS 4/4, TypeScript PASS, and diff-check PASS; commit `163ce95` is pushed pending independent review.
- The atomic persistence dispatcher remains fail-closed and no PR is opened yet.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

### Cycle 33 — trusted-reference validators review PASS

- Independent review initially found inactive-parent gaps for academic year, course offering, and department.
- Commit `7201ece` now requires active linked parents for all three validators; final review PASS with CRITICAL/HIGH/MEDIUM/LOW = 0.
- Deliberately did not infer `is_current`; the approved contract proves selectable active references, not a current-period-only rule.
- Validator SHA-256 `529366401a8a57124211e1efb21c88ee9acf4ea0395c0daff93573e82b44897c` is pinned in inventory commit `17ffb42`.
- Remaining item-6 source: five-service persistence dispatcher and inactive workflows for three free services. No SQL/migration apply or production action occurred.

### Cycle 34 — excused-absence detail boundary PASS

- Added nullable/no-default `absence_reason_detail` for historical compatibility without backfill, while enforcing meaningful values on new or substantively changed rows.
- Closed legacy authenticated/service-role mutation grants and write policies; exact owner-read/RPC-write ACL, RLS and policy inventories are enforced.
- Independent review findings progressed from HIGH 2 to MEDIUM 1 and then final PASS: all severity counts zero.
- Commit `821e959`; checksum `1bdbc6f747dda43c4a2d8d91648ac99d2c5984f7fb00213412754096f754cdbe` pinned by `37bf4ae`. Tests 11/11 and diff-check PASS.
- Dispatcher remains fail-closed; no SQL/migration apply, production access/write, visibility change, deploy, publish, or backfill occurred.

### Cycle 35 — transfer attachment dependency isolated

- Dispatcher preflight found `department_transfer` requires `secondary_certificate`, while the reviewed private attachment runtime currently supports excused absence only.
- Corrected the activation gate to `BLOCKED_PENDING_SECURE_ATTACHMENTS_AND_EXTERNAL_PAYMENT_RUNTIME`; payment policy remains `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.
- Focused tests PASS 59/59, TypeScript PASS, and diff-check PASS; commit `8f41400` is pushed.
- No insecure upload fallback or partial dispatcher was introduced. The secure attachment extension is now an explicit dependency before transfer runtime.
- No SQL/migration apply, production access/write, visibility change, deploy, publish, or protected-record action occurred.

### Cycle 36 — transfer secure-attachment source contract started

- Independent review of the combined transfer activation gate PASS: all severity counts zero; final-chance and free-service gates remain unchanged.
- Extended the pure secure-attachment contract to bind `secondary_certificate` only to `department_transfer`/`transfer`, retaining the private MIME/size and opaque-reference rules.
- Focused attachment tests PASS 21/21, TypeScript PASS, and diff-check PASS; commit `5213f21` is pushed.
- SQL upload-intent/assertion/atomic-wrapper overlay remains missing, so transfer activation stays fail-closed and no dispatcher branch is enabled.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

### Cycle 37 — transfer secure-attachment SQL overlay drafted

- Added source-only overlay for exact transfer/absence field mapping, server-generated upload intent, locked attachment-set assertion, and revocation of the obsolete non-atomic submit wrapper.
- Atomic submission remains exclusively through `submit_b1_student_request_atomic`; the overlay returns only an opaque attachment ID.
- Focused tests PASS 7/7, TypeScript PASS, and diff-check PASS; commit `2a7987f` is pushed pending independent review.
- Transfer activation and dispatcher remain fail-closed until review and full integration complete.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

### Cycle 38 — transfer attachment overlay review PASS

- Independent review initially found HIGH 1 (returned requests could not replace attachments) and MEDIUM 1 (field constraint lacked catalog preflight).
- Commit `0b29ae2` aligns editable states with atomic resubmit and adds exact old/target constraint verification, validation and inventory checks.
- Final review PASS: all severity counts zero; focused tests PASS 27/27, TypeScript and diff-check PASS.
- Overlay checksum `ba163a3f2bc5115a22373e324d199817d58796284bb3ca0d095abc6bf12783a8` is pinned in `9a75cb9`.
- No SQL/migration apply, production access/write, visibility change, deploy, or publish occurred.

## Cycle 22 — shared atomic submit/action merged

- PR #142 passed Web CI and merged as `5b8d0ef4cec3bae32719ba94b8559945a07a38f6`.
- Independent review PASS: CRITICAL/HIGH/MEDIUM/LOW = 0; all earlier six HIGH and two MEDIUM findings are closed.
- Shared atomic boundaries, payment action dispatch, audit vocabulary, tests, ordering, and checksums are source-complete.
- Gates passed: focused 14/14, student-request 437/437, TypeScript, build, Web CI, and `git diff --check`.
- Next source-only priority: executable service validator/detail-persistence/workflow drafts (inventory item 6) in an isolated worktree.
- No SQL/migration apply, production access/write, `student_visible` change, deploy, publish, or protected-record action occurred.

## Cycle 21 — shared atomic submit/action draft review HOLD

- Started isolated branch/worktree `codex/b1-atomic-submit-action-draft-04` / `C:\projects\saba-uni-portal-b1-atomic-runtime-draft` from `main@518981d`.
- Built an uncommitted source-only first draft with transactional submit/action boundaries and a fail-closed service-persistence dispatcher.
- Focused tests pass, but independent deep review returned HOLD: CRITICAL 0, HIGH 6, MEDIUM 2.
- HIGH remediation required: close legacy B1 submit/action RPC bypass; validate assignment type and active linked identity; require exact faculty/department transfer heads; enforce student eligibility; remove arbitrary visible client payload; eliminate count/select races.
- MEDIUM remediation required: fully revalidate/clear returned runtime on resubmit and preserve distinct reviewed/cleared/applied audit semantics.
- The unsafe draft was not committed, pushed, or opened as a PR. Its worktree remains owned for remediation.
- No SQL/migration apply, production connection/write, protected-record access, `student_visible` change, deploy or publish occurred.

## Cycle 20 — final chance canonical write draft 3/3

- Isolated branch/worktree: `codex/final-chance-canonical-write-draft-03` / `C:\projects\saba-uni-portal-final-chance-write-draft`.
- Commit `508da3b`; PR #141 passed Web CI and merged as `518981d2be27fffa6113d56c03460e53de305420`.
- Draft checksum: `9a01392415fcd97e21adc4e8c2af9490afe759b35452bf43b70bc74013c9f704`.
- New academic chance writes are constrained to `final_chance`; the proven stored request alias remains `extra_chance`; historical aliases are retained read-only without backfill.
- Independent review closed two HIGH and one MEDIUM findings. Final review PASS: CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0.
- Gates: 429 student-request tests, TypeScript, build, CI and diff-check PASS. Isolated PostgreSQL 17 compile, idempotency, positive/negative writes and ACL verification PASS.
- No production connection/write, SQL/migration apply, protected-record access, `student_visible` change, deploy, publish or historical notification backfill occurred.

## Cycle 19 — external payment workflows draft 2/3

- Isolated branch/worktree: `codex/external-payment-workflows-draft-02` / `C:\projects\saba-uni-portal-payment-workflows-draft`.
- Commit `d5a028a`; PR #140 passed Web CI and merged as `df057b9a9029ee390d5a8cfdd60b4b529f3d6129`.
- Draft checksum: `f63ff4f526a5dea6b8896586375eaf01ec07433001c857f270f0f1ce155aa444`.
- Both paid services receive inactive versioned drafts, exact processing bindings, direct assignment, transfer department isolation, and exactly one `payment_confirmed` transition to registrar application.
- Independent review initially found two HIGH and one MEDIUM issue; all were closed. Final review PASS: CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0.
- Gates: 423 student-request tests, TypeScript, build, focused tests, CI and diff-check PASS. Repository lint remains baseline-failing on existing CRLF/Prettier findings.
- Post-merge Android CI for PR #139 also completed successfully, including APK/AAB artifacts.
- No SQL/migration apply, production access/write, protected-record access, `student_visible` change, deploy or publish occurred.

## Cycle 18 — B1 extended runtime authorization matrix

- Isolated branch/worktree: `codex/b1-extended-runtime-authorization-matrix-01` / `C:\projects\saba-uni-portal-b1-runtime-matrix`.
- Commit `3cd4c8d`; PR #139 passed CI and merged as `5fa1497dcd3515f8dee26daff1b33be74a001782`.
- All 24 configured B1 staff steps have exact direct-assignee ALLOW and negative matrices for unassigned same role, wrong unit/role, admin/registrar/dean, anonymous, non-active/completed, other request, wrong action and predecessor failure.
- SQL source now requires direct identity plus active exact processing binding; transfer heads additionally match source/target department; attachment staff download is direct-active-assignee only.
- Gates: 414/414 student-request tests, TypeScript, build, diff-check, independent review PASS; CRITICAL 0, HIGH 0. Repository lint remains baseline-failing on existing Prettier/CRLF findings.
- Migration inventory and sequential preflight/post-verification plan are merged. Apply remains closed because shared/service workflow executables and payment migrations 2/3 and 3/3 are missing, and processing-domain identity mappings need fresh verification.
- No SQL/migration apply, production access/write, protected-record access, `student_visible` change, deploy or publish occurred.

## Cycle 17 — compile fix review and merge

- Independent review initially HOLDed the historical stored aliases, then PASSed after verifying `transfer → department_transfer` and `extra_chance → final_chance` against the binding compatibility decision.
- Final source/security review: CRITICAL 0, HIGH 0; contract tests 6/6 and CI PASS.
- PR #138 merged as `50706816172b215025e7297d673937db32cad85c`.
- Current draft checksum: `9473d07ec78ee1133ffb150a2cd8173bc27040388899a79ed0a4b935bfa1379a`.
- Runtime/apply remains closed pending the expanded assignee, replay, stale-step and ambiguous-transition matrix on a full compatible schema.
- No production access/write, SQL apply, visibility change, deploy or publish occurred.

## Cycle 16 — isolated PostgreSQL compile finding

- Started local Docker/Supabase only; no link or remote target was used.
- Full local baseline stopped on unrelated historical faculty fixture `faculty_id = NULL`; no production apply occurred.
- Minimal PostgreSQL 17 compile exposed and fixed the draft RPC `%ROWTYPE` multi-item `INTO` error.
- Isolated direct-user matrix passed: assigned actor allow, wrong actor deny, negative no-transition, positive transition, confirmer/time and audit invariants.
- New checksum: `83b4baa77b2501e44ab18d3fac62b5af69f58747ae9331dcbfa97319a046ef0c`.
- TypeScript, 360/360 student-request tests and diff-check passed. Commit `605f9aa`; Draft PR #138 opened.
- Production migration, visibility and deploy gates remain closed pending full-schema baseline repair and expanded assignee/replay/stale/ambiguity matrix.

## Cycle 15 — unchanged runtime gate

- `origin/main` remains `d67586de173d380abe7a5424f1d9dfe02ab2ab9a`; no new project PR or CI result appeared.
- Supabase CLI remains unavailable and Docker remains stopped, so the safe DB compile/RPC matrix gate is unchanged.
- Legacy open PRs remain isolated; conflicting or historical PRs were not modified or merged without current scope review.
- No SQL/migration apply, production access/write, protected-record access, `student_visible` change, deploy or publish occurred.

## Cycle 14 — post-merge runtime readiness inventory

- Fetched and confirmed `origin/main@d67586de173d380abe7a5424f1d9dfe02ab2ab9a`.
- PR #137 CI remains PASS; no post-merge run was expected because the merged change is limited to `docs/**` and `tests/**`, outside the main-push workflow path filters.
- The host has neither a Supabase CLI nor a running Docker engine, so an isolated schema compile and RPC authorization matrix cannot be executed safely in this cycle.
- The migration/apply chain remains fail-closed. No production fallback or credential use was attempted.
- No SQL/migration apply, production access/write, `student_visible` change, deploy, publish, cleanup or protected-record action occurred.

## Cycle 13 — external payment runtime draft

- Isolated branch/worktree: `codex/external-payment-runtime-draft` / `C:\projects\saba-uni-portal-payment-runtime-draft`.
- Source-only draft commit: `18f00ea4231a0c57f1fa593e8d68311d755a3ada`.
- PR #137 passed Web CI and merged as `d67586de173d380abe7a5424f1d9dfe02ab2ab9a`.
- Draft RPC records confirmation through existing workflow step/event fields, requires exactly one direct finance assignee, and contains no financial ledger fields or bypass.
- Gates passed locally: TypeScript, 360/360 student-request tests, build, diff-check, and independent source/security review (CRITICAL 0, HIGH 0).
- SQL remains under `docs/migration-drafts`; it was not copied to `supabase/migrations` or applied.
- Required before any apply: isolated DB compile, positive/negative RPC matrix, transactional replay/stale/ambiguity checks, and final checksum/sequence approval.
- No Supabase connection, production write, `student_visible` change, deploy, or publish.

## Cycle 12 — external university payment confirmation

- Policy governance commit: `64c45dc`.
- Source branch: `codex/external-university-payment-confirmation`.
- Source commit: `211f692`.
- PR #136 merged as `d173fbbcbda77a3bbc0ba234a96f75188ea3e258`.
- Policy: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` for `department_transfer` and `final_chance`; no fee type, amount, currency, invoice, gateway, reference, or internal balance.
- `final_chance` new academic value is `final_chance` only; legacy values are read-normalized only.
- Independent review: PASS after closing two HIGH fail-open findings.
- Local gates: TypeScript PASS, student-request suite PASS, build PASS, diff-check PASS. Repository-wide lint remains baseline-failing on CRLF/Prettier in unrelated files.
- Runtime remains fail-closed with `BLOCKED_PENDING_EXTERNAL_PAYMENT_RUNTIME`.
- Post-merge Web CI and Android CI passed, including APK/AAB builds and uploads.
- No migration/SQL apply, `student_visible` change, production access/write, deploy, or publish.

## Baseline

- Repository: `msorori-mh/saba-uni-portal`
- Original cycle baseline: `1905844289536de9040557d8317bbe1f09341193`
- Current `origin/main`: `518981d2be27fffa6113d56c03460e53de305420`
- PR #130 merge: `7a7e35f315a89b5376ed8eb4f2cb5c949510f7cb`
- PR #129 merge: `be38c319aedd6d9a9257e30d0623e1b1b66b6bb7`
- PR #131 Android heap merge: `d29949230b4f0c603f46dce6785f6e48e5b32d72`
- PR #132 Capacitor assets merge: `682b63ef93936a5fcc275c0437df4816355c41be`
- PR #133 B1-01 merge: `2834e577e89588c9e358cdf782114d40ed3cb881`
- PR #134 B1-03 merge: `bb48c3acd7123268cfb73c5c9817200a356f4520`
- PR #135 B1-02 source merge: `2dbd299b865610f3b885ef9985ce620f91027648`
- Leader branch: `chore/portal-autopilot-orchestrator`
- Leader policy is committed and the leader worktree is clean.

## Active worktrees and tasks

| Worktree / branch | HEAD | State | Owner / dependency | Next gate |
|---|---|---|---|---|
| `saba-uni-portal-autopilot` / `chore/portal-autopilot-orchestrator` | `7e595d5` + current state | ACTIVE_CLEAN | leader state files | continue hourly inventory |
| `saba-uni-portal-shared-foundation-fix2-b1` / `fix/request-b1-remaining-review-findings-01` | `98c9713` | COMPLETE, PR #129 MERGED | completed | post-merge main CI monitoring |
| `saba-uni-portal-secure-attachments-review-b1` / `review/student-request-secure-attachments-source-01` | `200c018` | COMPLETE historical review | read-only security reviewer | superseded by merged remediation and PASS review 2 |
| `saba-uni-portal-secure-attachments-fix-b1` / `fix/student-request-secure-attachments-security-findings-01` | `e162edb` | COMPLETE, PR #130 MERGED | completed source/security path | runtime SQL/RPC verification still requires a safe environment |
| `saba-uni-portal-agent-b1-01` / `feat/request-b1-suspension-absence` | `aca8179` | COMPLETE, PR #133 MERGED | completed source | runtime attachment/RPC verification remains pending |
| `saba-uni-portal-agent-b1-02` / `feat/request-b1-transfer-final-chance` | `16c86f8` | SUPERSEDED BY PR #136 | fee/chance decisions resolved | reviewed runtime migration and safe RPC matrix |
| `saba-uni-portal-payment-policy` / `codex/external-university-payment-confirmation` | `211f692` | COMPLETE, PR #136 MERGED | payment/final-chance policy source | runtime remains fail-closed |
| `saba-uni-portal-payment-runtime-draft` / `codex/external-payment-runtime-draft` | `18f00ea` | COMPLETE, PR #137 MERGED | executable source-only SQL/RPC contract | isolated DB compile and RPC authorization matrix |
| `saba-uni-portal-agent-b1-03` / `feat/request-b1-file-withdrawal` | `785c6f9` | COMPLETE, PR #134 MERGED | completed source | later reviewed migration/RPC gates |
| `saba-uni-portal-shared-foundation-b1` / `feat/request-b1-shared-foundation-source-01` | `cde27fc` | SOURCE PASS, superseded by fixes | upstream of `9ba31d9` | remediation and review |

## Security status

- Secure attachments source remediation: `PASS_SOURCE_SECURITY_REVIEW_2`.
- All original HIGH findings and follow-up bypass/TOCTOU findings were closed in
  merged PR #130.
- Runtime feature flag must remain closed.
- Direct assignment must have absolute priority; no admin, registrar or dean
  bypass is permitted.
- Runtime RPC ALLOW/DENY verification remains blocked until a safe
  non-production environment exists and a separately approved migration apply
  makes the Draft contracts available.

## GitHub status (separate from current B1 path)

- Latest Web CI and Android CI on `main@d173fbb` passed.
- PR #49: separate legacy item; Migration Review failing.
- PR #118: separate legacy item; merge state `DIRTY`.
- PR #98: separate legacy draft; merge state `DIRTY`.
- These items do not block the current isolated B1/security source work and are
  not being modified during the priority cycle.

## Progress and priority

- Repository/worktree/PR baseline inventory: complete.
- Governance state setup: complete locally.
- Shared foundation, attachment security, B1-01, B1-02 source contracts and
  B1-03 passed independent reviews and CI and are merged.
- Android CI was repaired and now passes end to end, including APK/AAB uploads.
- Fee/chance decisions are resolved and merged. Remaining runtime readiness is
  blocked by reviewed migration application and safe-environment RPC authorization
  testing; source remains fail-closed.

## Production impact

None. No migration/SQL apply, Supabase production access, data/storage write,
deploy, publish, secret change, production E2E, cleanup or discard was performed.

## 2026-07-17 — Enrollment-certificate availability banner UX fix

- PR #143 merged into `main` at `0da75d8b199d516a5d6d8498a0ea0d67c9c8e360`.
- Eligibility, form validation and service information are now separate UI contracts.
- Focused tests 6/6, student-request suite 443/443, TypeScript, build, Web CI and independent review PASS.
- CRITICAL/HIGH/MEDIUM/LOW = 0/0/0/0.
- No workflow, submit backend, migration, `student_visible`, deploy, publish or production data change.
- Production display requires a later separately authorized Deploy.

## 2026-07-17 — B1 detail RPC-write cutover boundary

- Feature branch `codex/b1-service-runtime-drafts-05` advanced to `45b7677` and is pushed.
- Added an installation-only, locked cutover primitive for the three legacy B1 detail tables; installation does not invoke it or mutate table ACL/RLS/policies.
- Unknown policies and missing/stub dispatcher state fail closed. Invocation is reserved for the future single reviewed dispatcher/caller cutover transaction.
- Independent review: PASS; CRITICAL/HIGH/MEDIUM/LOW = 0/0/0/0.
- Validation: focused tests 6/6, TypeScript and `git diff --check` PASS.
- Pinned SHA-256: `85fdd4f4e34bba7859e61e52009c385cd74747f14bcaa74bc6d3f6db41892495`.
- Production impact: none; no SQL/migration apply, production access, `student_visible`, deploy or publish.

## 2026-07-17 — B1 five-service dispatcher PASS

- `codex/b1-service-runtime-drafts-05` advanced to pushed `b3356c7`.
- Installation-only dispatcher covers exactly the five B1 services with owner/state/type locking, exact payload allowlists, trusted references, secure attachments, server-derived transfer source scope, and canonical `final_chance` writes.
- Resubmission fails closed when an irreversible academic effect or withdrawal clearance already exists.
- Caller/ACL cutover remains deliberately separate; legacy write permissions are not changed by this draft.
- Independent review: PASS, findings 0/0/0/0. Focused tests 7/7, TypeScript and diff-check PASS.
- SQL SHA-256: `82bab7a52b44dde51c71c12acbdfd3445d08d2d4c24176c66a0b0cc39f99118c`.
- Production impact: none.

## 2026-07-17 — B1 caller attachment identity PASS

- Feature branch advanced to pushed `cf11a66`.
- Added fail-closed extraction of opaque secure attachment UUIDs for absence and transfer atomic callers.
- UUIDs are canonicalized before duplicate checking; paths and client metadata are never authoritative.
- Independent review PASS with CRITICAL/HIGH/MEDIUM/LOW = 0/0/0/0; focused tests 4/4, TypeScript and diff-check PASS.
- Direct legacy caller conversion and ACL cutover remain pending; no production impact.

## 2026-07-18 — B1 atomic server caller PASS

- Feature branch advanced to pushed `4dd85f6`.
- Canonical B1 submit and standalone draft creation now fail closed and use B1 RPC paths without admin/generic fallback.
- Existing B1 resubmits use versioned CAS; zero-row races fail closed. Admin CAS is scoped only to B1, while non-B1/protected services retain their original session/RLS path.
- Independent review PASS with findings 0/0/0/0; relevant tests 60/60, TypeScript and diff-check PASS.
- Legacy portal component direct writers and ACL cutover remain pending; no production impact.
