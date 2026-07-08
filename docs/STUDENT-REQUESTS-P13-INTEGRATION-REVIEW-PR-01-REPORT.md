# STUDENT-REQUESTS-P13 — Integration Review (PR-01)

**Task ID:** STUDENT-REQUESTS-P13-INTEGRATION-REVIEW-PR-01  
**Date:** 2026-07-08  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Base:** `origin/main` @ `71b4bee` (P12 PR #106 merged)  
**Decision:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** (no blockers) |
| **Branch (proposed)** | `codex/student-requests-p13-document-archive-contract` |
| **Build** | **PASS** (`npm run build`, ~38s) |
| **Scenario matrix** | **16/16 PASS** (`runDocumentArchiveScenarioMatrix`) |
| **Execute capabilities** | All false except `canValidate: true` |
| **DB writes / Storage** | **None** in P13 paths (see §8 note on read-only SELECT) |
| **Migrations / seed / publish** | **None** |
| **Official transcript / verify-document** | **Unchanged** |

---

## 2. Review Checklist

| Check | Status | Evidence |
|-------|--------|----------|
| `request-document-archive-contract.ts` preview/dry-run only | **PASS** | Returns validation statuses only; `validateDocumentArchiveCapability()` sets all execute flags false |
| Document types linked to correct request types | **PASS** | `DOCUMENT_DEFINITIONS` maps 7 document types to registry request codes (§5) |
| Local vs central signatory separation | **PASS** | `LOCAL_SIGNATORY_KEYS` / `CENTRAL_SIGNATORY_KEYS`; scope on each signatory |
| `registrar_general` = college registrar | **PASS** | Label + maps to `registrar_general` processing role |
| `university_registrar_general` = central, NOT local app_role | **PASS** | Central set only; validation rejects college staff on central signatory (matrix #8) |
| No File/Blob/base64/HTML from client | **PASS** | `never` types + `rejectForbiddenClientFields` (matrix #6) |
| No `documentNumber` or `signatoryUserId` from client | **PASS** | Rejected in normalizer (matrix #4, #5) |
| All execute capabilities false | **PASS** | `canGenerateDocument`, `canRecordSignature`, `canIssueDocument`, `canArchiveRequest` all `false` |
| No PDF, signing, document numbers, archive records | **PASS** | UI execute buttons disabled; server returns `EXECUTION_UNAVAILABLE` on valid dry-runs |
| No DB writes, Storage writes, createSignedUrl, upload | **PASS** | `git grep` on student-requests: no matches; diff scan: comment only |
| No `act_on_student_request_step`, notifications, audit | **PASS** | Not introduced in P13 diffs |
| Official transcript & document verification unchanged | **PASS** | No diff vs `origin/main` on transcript/verify paths; `official_transcript` excluded from P13 definitions |
| No migrations, seed, production publish | **PASS** | No supabase/migration changes staged |

---

## 3. Scope — Files in PR

| File | Role |
|------|------|
| `src/lib/student-requests/request-document-archive-contract.ts` | Contract, registry, validation, 16-scenario matrix |
| `src/components/student-requests/RequestDocumentArchivePanel.tsx` | Staff preview UI: definitions, dry-run validate, disabled execute |
| `src/lib/student-requests/staff-inbox.functions.ts` | `prepareStudentRequestDocumentArchiveAction` (dry-run server fn) |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` | Embeds `RequestDocumentArchivePanel` |
| `docs/STUDENT-REQUESTS-P13-DOCUMENT-SIGNATORY-ARCHIVE-CONTRACT-FOUNDATION-01-REPORT.md` | Foundation report |
| `docs/STUDENT-REQUESTS-P13-INTEGRATION-REVIEW-PR-01-REPORT.md` | This integration review |

**Explicitly excluded:** `src/routeTree.gen.ts` (restored), migrations, `StudentRequestsSection.tsx`, unrelated reports.

---

## 4. Capabilities

```text
canValidate: true
canGenerateDocument: false
canRecordSignature: false
canIssueDocument: false
canArchiveRequest: false
reason: document_archive_runtime_unavailable
```

Staff UI mirrors capability flags and disables generation/signature/archive execute buttons.

---

## 5. Document Types ↔ Request Types

| Document type | Request type(s) | Signatories (local / central) |
|---------------|-----------------|-------------------------------|
| `grade_statement_non_graduate_document` | `grade_statement_non_graduate` | local: graduate_affairs_manager, dean, registrar_general; central: university_registrar_general |
| `enrollment_certificate_document` | `enrollment_certificate` | local: dean, registrar_general |
| `file_withdrawal_grade_statement` | `file_withdrawal` | local: registrar_general; parallel clearance required |
| `file_withdrawal_clearance_summary` | `file_withdrawal` | none; parallel clearance required |
| `october_exam_entry_form_document` | `october_exam_entry_form` | local: registrar_general |
| `request_decision_document` | `enrollment_suspension`, `excused_absence`, `grade_appeal`, `department_transfer` | local: registrar_general |
| `request_archive_package` | grade_statement_non_graduate, enrollment_certificate, file_withdrawal, enrollment_suspension, excused_absence, department_transfer, october_exam_entry_form | none (archive handoff metadata) |

**Not in P13 registry:** `official_transcript` (separate official_documents path per `OFFICIAL_TRANSCRIPT_INTEGRATION_NOTE`).

---

## 6. Signatory Model

- **Local keys:** dean, registrar_general (college registrar), graduate_affairs_manager, student_affairs_manager, department_head — tied to processing roles via `LOCAL_SIGNATORY_TO_PROCESSING_ROLE`.
- **Central keys:** university_registrar_general, vice_president_student_affairs — not mapped to local `app_role`; college staff cannot satisfy central signature validation.
- **UI note:** Signature dry-run allows selecting signatory **key** from registry for preview only; contract rejects manual/ad-hoc signatory user IDs.

---

## 7. Validation Matrix (16 scenarios)

All scenarios: **expected === actual**.

| ID | Scenario | Expected |
|----|----------|----------|
| 1 | grade_statement generation valid | EXECUTION_UNAVAILABLE |
| 2 | invalid requestId UUID | INVALID |
| 3 | documentType mismatch requestType | INVALID |
| 4 | client documentNumber | INVALID |
| 5 | client signatoryUserId | INVALID |
| 6 | File/base64 in payload | INVALID |
| 7 | enrollment_certificate local-only | EXECUTION_UNAVAILABLE |
| 8 | college staff central signature | INVALID |
| 9 | manual signatory selection | INVALID |
| 10 | file_withdrawal archive clearance incomplete | INVALID |
| 11 | file_withdrawal archive clearance complete | EXECUTION_UNAVAILABLE |
| 12 | archive before final approval | INVALID |
| 13 | october_exam qualified courses warning | VALID_WITH_WARNINGS |
| 14 | request_decision_document enrollment_suspension | EXECUTION_UNAVAILABLE |
| 15 | unauthorized actor | UNAUTHORIZED |
| 16 | client publicUrl | INVALID |

Command: `npx tsx -e "import { runDocumentArchiveScenarioMatrix } from './src/lib/student-requests/request-document-archive-contract.ts'; ..."` → `PASS true`.

---

## 8. DB / Storage Audit

| Pattern | P13 student-requests paths |
|---------|---------------------------|
| `insert` / `update` / `upsert` / `delete` | **Not added** |
| `createSignedUrl` / `createSignedUploadUrl` | **Not present** |
| `storage.from` / `.upload(` / `.remove(` / `.move(` | **Not present** |
| `act_on_student_request_step` | **Not present** |
| audit / notification hooks | **Not added** |

**Note (non-blocker):** `prepareStudentRequestDocumentArchiveAction` performs a **read-only** `select("id, request_type")` on `student_requests` to normalize `requestTypeCode` against the stored row. No inserts/updates/deletes.

**Diff scan** (`git diff -U0` + pattern): only additive comment mentioning "no DB writes" in server fn.

---

## 9. Official Transcript & Document Verification

- No changes vs `origin/main` on dedicated transcript issuance or `/verify-document` integration files.
- P13 contract documents that official transcript remains on legacy `official_documents` / document-view / verify flows.
- `StudentRequestsSection.tsx` not modified.

---

## 10. Build & Preflight

```text
git branch: main @ 71b4bee (Merge PR #106 P12)
git diff --check: clean (after routeTree restore)
npm run build: PASS
routeTree.gen.ts: restored, not staged
```

---

## 11. No Actual Execution Confirmation

This PR adds **foundation contract + dry-run validation + disabled UI only**. It does **not**:

- Generate PDFs or assign document numbers  
- Record signatures or issue documents  
- Create archive records or upload files  
- Run workflow steps, notifications, or audit events  
- Apply migrations or publish to production  

---

## 12. Notes (PASS_WITH_NOTES)

1. Dry-run server action reads `student_requests.request_type` for consistency — acceptable for validation; document if stricter "no DB at all" policy is required later.
2. Signature mode UI exposes signatory **keys** from the registry for dry-run; execution remains disabled.
3. `grade_appeal` included under `request_decision_document` — aligns with registry; confirm product intent in a later execution phase.

---

## 13. PR Recommendation

**Proceed:** Draft PR to `main` with title `[codex] Add student request document and archive contract` — **do not merge** until execution runtime is explicitly approved.

