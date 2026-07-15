# ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGN_01 — Report

Decision: **PASS_ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_DESIGNED_READY_FOR_OWNER_APPROVAL_NO_EXECUTION_NO_CHANGES**

Mode: Read-only design. No writes, no Saga, no PDF, no upload, no Migration, no Publish/Deploy. Blocked trial request untouched. `official-documents` bucket untouched.

---

## 1. Environment & Sync

- GitHub: `msorori-mh/saba-uni-portal`
- Local HEAD: `81686e233922bec1716032bf2b507842c1cd3351` (matches expected)
- Lovable project: `4b291119-790f-4484-9285-c2b774e1ba6f`
- Supabase project: `wpmicqriltrowwonknox`
- Domains live: quboolye.com, www.quboolye.com, saba-uni-portal.lovable.app

## 2. Reference Reports & Decisions

- `docs/ENROLLMENT-CERTIFICATE-WORKER-CONTROLLED-DEPLOYMENT-01-RETRY-AFTER-FACULTY-PII-REMEDIATION-REPORT.md` → PASS
- `docs/ENROLLMENT-CERTIFICATE-WORKER-POST-DEPLOYMENT-INSPECTION-01-REPORT.md` → HOLD → cleared by hardening
- `docs/ENROLLMENT-CERTIFICATE-FACULTY-POLICY-HARDENING-01-REPORT.md` → PASS

## 3. Baseline (read-only verified)

### Request type & workflow
- `request_types.code=enrollment_certificate`, id `da670e75-2ce3-4a60-a41e-7eb89fa9dfdc`, `is_active=false` (student-facing submission window closed — expected).
- Active workflow: id `7e06dfe1-ac07-432b-bb56-229c5c2de00c`, version 2, `is_active=true`.
- Steps (7, ordered):

  | # | step_key | action_type | unit | role | produces_document | requires_payment | active assignees |
  |---|---|---|---|---|---|---|---|
  | 1 | initial_review | review | student_affairs | student_affairs_specialist | no | no | 1 |
  | 2 | fee_assessment | assess_fee | student_affairs | student_affairs_manager | no | yes | 1 |
  | 3 | payment_confirmation | confirm_payment | finance | revenue_finance_officer | no | no | 1 |
  | 4 | registrar_signature | sign | registrar | registrar_general | no | no | 1 |
  | 5 | dean_signature | sign | dean | dean | no | no | 1 |
  | 6 | document_issuance | issue_document | student_affairs | student_affairs_specialist | **yes** | no | 1 |
  | 7 | archive | archive | archive | archive_officer | no | no | 1 |

### Storage
- Bucket `official-documents`: `public=false`, files=0, `file_size_limit=NULL`, `allowed_mime_types=NULL` (B4 not applied — intentional).

### Worker / Saga
- Server function + Saga present in server bundle (per prior deployment inspection).
- `SITE_URL` server-only; no client upload path.

### Security
- Latest scan: 0 critical / 0 error. Faculty PII finding cleared. No secret leaks.

### Blocked trial request
- id `93807768-a281-42de-bfb4-0c0c03786b20`, status `in_review`, `updated_at 2026-07-13 17:59:19.782271+00`. Unchanged.
- 0 official_documents, 0 enrollment_certificate_document_details, 0 generation_attempts.

## 4. Candidate Actors (read-only)

### Student
- `email: wadeh@usr.edu.ye`, `user_id 4a0ce655-8e23-4ea4-bf14-1c4d3234619c`
- `student_profile 95713a18-22c6-4f15-a825-ab0c2e373c4f`, academic_number `2026100`, name `واضح محمد محد`
- **Conflict flag**: This student currently owns the blocked trial request (only active enrollment_certificate request). A second concurrent request may violate the one-active-per-type guard.
  - Options for execution phase (owner to decide):
    - (a) Choose a different eligible student (preferred; keeps the blocked request as audit trace, no owner-approval carve-out needed).
    - (b) Owner explicit approval to allow a parallel test request for the same student under E2E marker, if guards permit.

### Staff actors (all present, 1 active assignment each)
| step | unit | role_code | count |
|---|---|---|---|
| initial_review / document_issuance | student_affairs | student_affairs_specialist | 1 |
| fee_assessment | student_affairs | student_affairs_manager | 1 |
| payment_confirmation | finance | revenue_finance_officer | 1 |
| registrar_signature | registrar | registrar_general | 1 |
| dean_signature | dean | dean | 1 |
| archive | archive | archive_officer | 1 |

Specific `user_id`s deliberately omitted from this design report (execution report will capture them under G12 evidence). No missing actor → not a HOLD.

## 5. Test Request Strategy

- **Preferred**: create a fresh dedicated request via the student portal for a candidate student *other than* the blocked one, tagged with internal marker `ENROLLMENT-CERTIFICATE-CONTROLLED-E2E-01` in `student_notes` and/or `form_data.e2e_marker`.
- If wadeh remains the mandated student, execution phase requires:
  1. Owner-approved admin RPC `admin_create_enrollment_certificate_e2e_draft` (already implemented in `src/lib/admin-enrollment-certificate-e2e.functions.ts`) which creates a hidden E2E draft bypassing the public submission window and idempotently reusing prior E2E draft rather than colliding with the blocked in-review request.
  2. Explicit check that the blocked request id `93807768-…` is NOT the target.
- **Retention**: keep the E2E request + issued document as audit trace (marker preserved). No delete/cleanup.

## 6. Submission Window Strategy

Preferred path avoids opening a public window. Use the existing hidden admin path (`admin_set_enrollment_certificate_e2e_submit_window` with `student_visible=false` invariant enforced by RPC) only if creation requires it. Post-execution checklist verifies:
- `request_types.is_active` unchanged from baseline `false`, or restored.
- No row with `student_visible=true`.
- Audit event recorded.

## 7. Workflow Execution Plan (per step)

For each step the execution phase must record: acting `user_id`, pre-state (`status`, `current_step_index`), action invoked, post-state, audit event id, timestamp, transition guard result.

1. **Student → create draft & submit**: pre `status=draft` → post `status=in_review`, `current_step_index=1`. Verify request visible in student portal.
2. **initial_review** (student_affairs_specialist): review → approve. Verify transition to step 2.
3. **fee_assessment** (student_affairs_manager): set `amount=0`, `payment_status=not_required` (justified: certificate is currently free per config; avoids injecting fake finance data). Verify transition to step 3.
4. **payment_confirmation** (revenue_finance_officer): auto-confirm zero-fee. Verify transition to step 4.
5. **registrar_signature** (registrar_general): sign. Verify audit event `workflow_step_completed`.
6. **dean_signature** (dean): sign. Verify audit + transition to step 6.
7. **document_issuance** (student_affairs_specialist): issue button visible ONLY to this role; single confirm click; idempotency key `ec-e2e-<request_id>-issue-v1`.
8. **archive** (archive_officer): confirm archive. Verify request final `status=completed`/`archived`.

Post-workflow: student portal shows certificate; download link works; public QR verification page resolves.

## 8. Saga Plan (single invocation)

Entry: `executeEnrollmentCertificatePdfStorageSaga` invoked exactly once at step 6 confirm.

Pre-checkpoints:
- request in step 6, status matches, all prior signatures present.
- `enrollment_certificate_document_generation_attempts` count for request = 0.
- `official_documents` count for request = 0.
- bucket file count baseline recorded.
- idempotency key computed and stable.
- actor is the specialist assigned to `document_issuance`.
- target request id ≠ blocked request id.

Phases: `prepare_*` → `mark_generating` → PDF build → SHA-256 → private upload → `mark_uploaded` → `finalize_*`.

Post-checkpoints: attempt row status `succeeded`, document row present with token hash + verify URL + SHA + size + MIME=`application/pdf`, storage object present at expected path, final workflow transition to `archive`.

Failure matrix (stop-on-first, no auto-retry): auth failure, wrong step, duplicate invocation, PDF error, upload error, finalize error, timeout, idempotency conflict, SHA mismatch. For each → capture attempt row, emit HOLD, do not run `fail_*` twice, do not cleanup.

## 9. PDF Acceptance Checklist

File opens; `application/pdf`; size sane (target < 500 KB, hard cap ≤ 2 MB proposed for B4); Arabic text readable & RTL; Cairo font embedded (no tofu boxes); college and/or university logo visible; student Arabic name, academic number, program, department, level, academic year, issue date, document number correct; registrar & dean names/signatures present; QR present and scannable; verification URL correct; no service-role or internal ids exposed; no "TEST" watermark unless owner-approved.

Verification means: download via signed URL; inspect metadata; visual review; scan QR; independent SHA-256 vs stored value.

## 10. QR & Public Verification

- QR payload = `${SITE_URL}/verify-document?code=<public_verification_code>` (opaque code, not raw token).
- DB stores hash only; verify page compares hash.
- Public page shows: document type, student Arabic name, academic number, issue date, document number, status. Hides: email, phone, national id, signed URLs, storage path.
- Bad code → generic "not found"; archived doc → still verifiable with archived badge; revoked (future) → revoked state; never leaks signed URL.

## 11. Storage & Download

- Bucket stays `public=false`.
- Path convention: `enrollment_certificate/<student_profile_id>/<document_id>.pdf` (verify actual code path in execution).
- anon direct read → 403; authenticated non-owner → 403; owning student → signed URL (short TTL, ≤ 5 min); authorized staff (specialist/archive) → signed URL.
- No permanent public URL. No service-role in client. Same idempotency key never creates a second object.

## 12. Idempotency Test

- Single write invocation only. After success, re-invocation is NOT clicked in execution phase.
- Proof performed via DB read: same idempotency key → single attempt row, single document row, single storage object. UNIQUE constraint on idempotency key enforced at RPC layer (already migrated).
- A second write-invocation experiment is deferred to a separately-approved sub-phase; not part of this execution.

## 13. Stop Gates (execution phase)

Trigger HOLD (no retry, no cleanup, no rollback) on any of:
student ineligible; actor missing; role mis-assigned; workflow drift; request conflict with blocked request; submission window not properly scoped; wrong step reached; unexpected fee status; registrar/dean not linked to `faculty_profiles`; issue button visible to non-authorized user; bucket baseline drift; prior attempt row exists; new security scan critical/error; missing `SITE_URL`; Saga runtime error; PDF error; upload error; SHA mismatch; QR mismatch; verification URL failure; duplicate document; blocked request mutated; any other live request eligible for issuance.

## 14. Evidence Plan (G12)

Capture: new `request_id`, `request_number`, e2e marker, student ids, all actor user_ids, workflow id/version, step ids, timestamps, status transitions, audit events, fee amount/status, signatures, idempotency key, attempt id, document id, details id, storage path, file size, MIME, SHA-256, verification token hash, verify URL, decoded QR URL, signed-URL access test result (boolean only), final status, archive status, student portal visibility, bucket count before/after, blocked-request before/after, security scan before/after.

Never log: passwords, access/refresh tokens, service-role key, full signed URL, raw verification token, unnecessary PII.

## 15. Preservation of Blocked Request

- No read that mutates, no update, no cancel, no delete.
- Pre- and post-execution snapshot of `id, status, updated_at, form_data->>'e2e_marker'` compared byte-for-byte.
- Any drift → immediate HOLD `HOLD_ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_PROTOCOL_UNEXPECTED_MUTATION`.

## 16. B4 (bucket hardening) Recommendation

`B4_NON_BLOCKING_FOR_SINGLE_CONTROLLED_E2E_BUT_REQUIRED_BEFORE_GENERAL_LAUNCH`.
Proposed values (apply after successful E2E, before general launch):
- `allowed_mime_types = ['application/pdf']`
- `file_size_limit = 2_097_152` (2 MiB) — anticipated PDF ≤ 300 KB (Cairo subset + 1–2 embedded raster logos + QR); 2 MiB gives ~7× headroom without being permissive.

## 17. Migration Requirement

`NO_MIGRATION_REQUIRED_FOR_CONTROLLED_E2E_EXECUTION` — all RPCs, tables, policies, saga, and storage bucket already deployed.

## 18. Approvals Required for Next Phase

`ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_EXECUTION_01` requires a fresh owner approval covering:
- one new test request creation (writes to production),
- workflow actions across 7 steps,
- exactly one Saga invocation,
- one PDF generation + private upload,
- one document issuance + archival,
- read-only verification post-flow.

Not authorized by this phase.

---

## 19. Remaining phases until College Portal launch complete

Scoping rule (permanent): College Portal does NOT build, edit, or resolve conflicts in academic schedules. Schedule scope is limited to importing prepared Excel files from the academic scheduling platform, template validation, filtering by department/program/level/system/semester, linking to courses/instructors/sections, display in portals, and refresh via re-import. No schedule-editor / generator / conflict-resolver phases below.

| # | Phase | Status |
|---|---|---|
| 1 | Faculty PII remediation | COMPLETED |
| 2 | Faculty policy hardening (public RPCs) | COMPLETED |
| 3 | Worker controlled deployment | COMPLETED |
| 4 | Post-deployment inspection | COMPLETED |
| 5 | Controlled E2E protocol design (this phase) | COMPLETED |
| 6 | Controlled E2E execution (single certificate) | READY (needs approval) |
| 7 | Post-E2E inspection & evidence review | NOT_STARTED |
| 8 | B4 bucket hardening (MIME + size limits) | READY |
| 9 | Enrollment certificate general activation (`request_types.is_active=true`) | BLOCKED (waits on 6–8) |
| 10 | Student status certificate service | NOT_STARTED |
| 11 | Official transcript request service | NOT_STARTED |
| 12 | Financial receipt / payment services | IN_PROGRESS |
| 13 | Grade appeal service | NOT_STARTED |
| 14 | Enrollment suspension / reinstatement services | NOT_STARTED |
| 15 | Absence excuse service | NOT_STARTED |
| 16 | Equivalency request service | NOT_STARTED |
| 17 | Transfer request service | NOT_STARTED |
| 18 | Extra chance service | NOT_STARTED |
| 19 | Course offerings & enrollment ops closure | IN_PROGRESS |
| 20 | Grades pipeline & appeals surface | IN_PROGRESS |
| 21 | Academic councils (agenda/minutes/decisions) | IN_PROGRESS |
| 22 | Teaching follow-up dashboards | NOT_STARTED |
| 23 | Course materials portal (student + faculty) | IN_PROGRESS |
| 24 | Prepared-schedule import + filtered display | IN_PROGRESS |
| 25 | Academic affairs reports | NOT_STARTED |
| 26 | Data & assignment readiness (roles, orgs, departments) | IN_PROGRESS |
| 27 | Notifications + email templates hardening | IN_PROGRESS |
| 28 | Public site + SEO polish | IN_PROGRESS |
| 29 | Mobile student app parity | IN_PROGRESS |
| 30 | Final security audit + pen-test pass | NOT_STARTED |
| 31 | Pre-launch smoke + rollback drill | NOT_STARTED |
| 32 | General launch | BLOCKED |
| — | Schedule editor / auto-generation / conflict resolver | OUT_OF_SCOPE |

### Executive summary
- **Done**: PII remediation, faculty policy hardening, worker production deployment + inspection, this E2E design.
- **Remaining**: one controlled E2E (next), B4 hardening, activation, then broader student services and portal surfaces.
- **Top 3 blockers**: (1) owner approval for E2E execution, (2) resolve blocked-request/student conflict decision, (3) B4 not yet applied.
- **Next phase**: `ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_EXECUTION_01` (awaits explicit owner approval).
- **Remaining phase count**: 27 (excluding OUT_OF_SCOPE).
- Readiness: enrollment certificate = design-complete / execution-pending; other student services = not started; data & assignments = healthy for enrollment certificate; prepared-schedule import = in progress; academic-affairs reports = not started; academic councils = in progress; teaching follow-up = not started; course materials = in progress; overall portal = pre-launch.
- Publish/Deploy state: **FORBIDDEN** — no publish or deploy performed in this phase.
