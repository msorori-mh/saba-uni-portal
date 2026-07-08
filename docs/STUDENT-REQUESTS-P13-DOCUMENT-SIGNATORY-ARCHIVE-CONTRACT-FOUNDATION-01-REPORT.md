# STUDENT-REQUESTS-P13 — Document, Signatory & Archive Handoff Foundation

**Task ID:** STUDENT-REQUESTS-P13-DOCUMENT-SIGNATORY-ARCHIVE-CONTRACT-FOUNDATION-01  
**Date:** 2026-07-08  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Decision:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Document contract** | `src/lib/student-requests/request-document-archive-contract.ts` |
| **Dry-run server fn** | `prepareStudentRequestDocumentArchiveAction` |
| **Staff UI** | `RequestDocumentArchivePanel.tsx` — read-only preview + validate + disabled execute |
| **canValidate** | **true** |
| **canGenerateDocument / canRecordSignature / canIssueDocument / canArchiveRequest** | **false** (`document_archive_runtime_unavailable`) |
| **Document archive scenarios** | **16/16 PASS** |
| **New DB writes** | **None** |
| **Build** | **PASS** |

---

## 2. Operational Decision

| Capability | P13 behavior |
|------------|--------------|
| Document generation | Validation + preview only — no PDF, no document number |
| Signatures | Registry-driven local/central requirements — no manual selection, no client signatoryUserId |
| Archive handoff | Rules validated — no archive record, no file upload |
| Execution | All execute flags **false** until schema/runtime applied on safe environment |

**Foundation preview message (Arabic):**  
«هذه معاينة تأسيسية للمستندات والتوقيعات والأرشفة. لم يتم إنشاء أو توقيع أو أرشفة أي مستند.»

---

## 3. Files Created / Modified

| File | Change |
|------|--------|
| `src/lib/student-requests/request-document-archive-contract.ts` | **Created** — types, registry, validation, 16-scenario matrix |
| `src/lib/student-requests/staff-inbox.functions.ts` | **Modified** — `prepareStudentRequestDocumentArchiveAction` |
| `src/components/student-requests/RequestDocumentArchivePanel.tsx` | **Created** — read-only staff preview UI |
| `src/components/student-requests/StaffRequestDetailPanel.tsx` | **Modified** — integrates document archive panel |

**Not modified:** migrations, `StudentRequestsSection.tsx`, `src/routeTree.gen.ts` (manual), seed, publish, commit, PR.

---

## 4. Inventory — Existing Document Systems (Read-Only)

| System | Path | P13 relationship |
|--------|------|------------------|
| **Official transcript** | `admin-student-requests.functions.ts`, `official_transcript_request_details`, `official_documents` | **Out of scope** — separate issuance via `/document-view/$id` |
| **Document verification** | `/verify-document` route | **Untouched** — P13 does not add verification flows |
| **Student request attachments** | `student_request_attachments`, `getStudentRequestAttachmentUrl` (signed URL in legacy admin) | **Untouched** — P13 rejects File/base64/publicUrl in contract |
| **Storage** | `student-request-attachments` bucket, `createSignedUrl` in admin/student-affairs | **No new storage calls** in P13 paths |
| **Import engine documents** | `official_documents` insert in imports | **Untouched** |
| **Workflow preview (P7)** | `request-workflow-preview-registry.ts` — signatory steps, archive steps | **Read-only** — archive handoff references preview |
| **Parallel clearance (P12)** | `parallel-clearance-contract.ts` | **Read-only** — file_withdrawal archive prerequisite |
| **Finance clearance (P12)** | `request-finance-clearance-contract.ts` | **No overlap** — separate panel |

### Conflicts / Boundaries

- `official_transcript` is **out-of-scope** in canonical registry but remains in legacy admin UI — P13 does not route through it.
- `registrar_general` = **college registrar**; `university_registrar_general` = **central** — explicitly separated in signatory registry.
- No new `app_role` for central signatories; college staff cannot execute central signature.

---

## 5. Contract Types

| Type | Purpose |
|------|---------|
| `StudentRequestDocumentType` | 7 conceptual document types |
| `StudentRequestDocumentDefinition` | Registry entry with signatories and prerequisites |
| `StudentRequestDocumentGenerationInput` | Generation dry-run input — rejects client documentNumber/signatoryUserId |
| `StudentRequestDocumentGenerationResult` | Dry-run result with foundation status + signatory statuses |
| `StudentRequestDocumentSignatoryRequirement` | Local/central signatory from registry |
| `StudentRequestDocumentSignatoryStatus` | Conceptual pending/signed (preview only) |
| `StudentRequestArchiveHandoffInput` | Archive validation input with clearance/approval flags |
| `StudentRequestArchiveHandoffResult` | Archive readiness preview |
| `StudentRequestDocumentArchiveCapability` | All execute flags false |
| `StudentRequestDocumentArchiveValidationIssue` | error / warning / info |

---

## 6. Conceptual Document Types (Preview Only)

| documentType | labelAr | requestTypeCodes |
|--------------|---------|------------------|
| `grade_statement_non_graduate_document` | شهادة تقديرات لغير الخريجين | grade_statement_non_graduate |
| `enrollment_certificate_document` | شهادة قيد | enrollment_certificate |
| `file_withdrawal_grade_statement` | بيان تقديرات (سحب ملف) | file_withdrawal |
| `file_withdrawal_clearance_summary` | ملخص إخلاء طرف (سحب ملف) | file_withdrawal |
| `october_exam_entry_form_document` | استمارة دخول دور أكتوبر | october_exam_entry_form |
| `request_decision_document` | مستند قرار الطلب | enrollment_suspension, excused_absence, grade_appeal, department_transfer |
| `request_archive_package` | حزمة أرشفة الطلب | types requiring archive |

---

## 7. Document-to-Request Mapping & Signatories

### grade_statement_non_graduate

| Signatory | Scope |
|-----------|-------|
| graduate_affairs_manager | local |
| university_registrar_general | central |
| dean | local |
| registrar_general | local (college registrar) |

### enrollment_certificate

| Signatory | Scope |
|-----------|-------|
| dean | local |
| registrar_general | local |
| **NO central** | unless future spec requires |

### file_withdrawal

| Document | Notes |
|----------|-------|
| file_withdrawal_grade_statement | Requires parallel clearance complete (future) |
| file_withdrawal_clearance_summary | Requires parallel clearance complete (future) |
| request_archive_package | Archive after documents + signatures |

### october_exam_entry_form

- Qualified courses only (future) — `october_exam_qualified_courses_future` warning
- No actual form generation in P13

### Other canonical types

- `request_decision_document` + `request_archive_package` as generic where applicable

---

## 8. Local vs Central Signatories

| Scope | Keys |
|-------|------|
| **Local** | dean, registrar_general, graduate_affairs_manager, student_affairs_manager, department_head |
| **Central (spec only)** | university_registrar_general, vice_president_student_affairs |

**Rules enforced:**

- Central is **NOT** an `app_role`
- College staff (`APPROVED_WORKFLOW_ROLE_KEYS`) **cannot** execute central signature (`college_cannot_execute_central_signature`)
- No client-trusted `actorRole`
- Local signatures do **not** replace central (`local_does_not_replace_central`)
- No manual signatory selection (`manual_signatory_rejected`)

---

## 9. Conceptual Foundation Statuses

`not_required` → `pending_generation` → `generation_ready` → `pending_local_signatures` → `pending_central_signature` → `ready_for_issue` → `ready_for_archive` → `archived`

**No actual state transitions or DB persistence in P13.**

---

## 10. Validation Functions

| Function | Purpose |
|----------|---------|
| `normalizeDocumentType` | Canonical document type |
| `normalizeDocumentGenerationInput` | Strip unsafe fields |
| `normalizeArchiveHandoffInput` | Archive handoff normalization |
| `validateDocumentArchiveCapability` | Returns all execute=false |
| `validateDocumentGenerationInput` | requestId, type compatibility, prerequisites, rejects File/Blob/base64 |
| `validateSignatureRequirement` | Registry signatories, local/central rules |
| `validateArchiveHandoff` | No handoff before final approval; file_withdrawal clearance |
| `buildDocumentGenerationDryRunResult` | Status aggregation |
| `buildArchiveHandoffDryRunResult` | Archive readiness preview |
| `getDocumentDefinitionsForRequestType` | Expected documents for request type |
| `runDocumentArchiveScenarioMatrix` | 16 automated scenarios |

---

## 11. Capability

```json
{
  "canValidate": true,
  "canGenerateDocument": false,
  "canRecordSignature": false,
  "canIssueDocument": false,
  "canArchiveRequest": false,
  "reason": "document_archive_runtime_unavailable",
  "messageAr": "إنشاء المستندات والتوقيع والأرشفة يحتاج تطبيق مخطط طلبات الطلاب على بيئة آمنة أولاً."
}
```

---

## 12. Server Dry-Run

| Function | Guards | Read-only SELECT |
|----------|--------|------------------|
| `prepareStudentRequestDocumentArchiveAction` | `requireSupabaseAuth`, `assertStaffInboxAccess`, `userRoles()` | `student_requests` (id, request_type) |

**Modes:** `generation`, `signature`, `archive`

**Explicitly NOT called:** INSERT/UPDATE/UPSERT/DELETE, PDF, upload, createSignedUrl, act_on_student_request_step, audit, notification.

---

## 13. UI Behavior

### RequestDocumentArchivePanel

- Shows expected documents per request type
- Local vs central signatories per document
- Foundation status labels (preview)
- Missing requirements via dry-run issues
- Archive readiness checkboxes (theoretical)
- Disabled execute buttons: «إنشاء المستند», «تسجيل التوقيع», «أرشفة الطلب»
- Foundation message in Arabic (required text)

**NO:** issued/signed/archived toasts, official download, document number display, public file URL.

Integrated in `StaffRequestDetailPanel.tsx` between finance clearance and staff action panels.

---

## 14. Compatibility — Official Transcript & Storage

| Integration | Status |
|-------------|--------|
| `official_transcript` + `official_documents` | **Read-only documented** — `OFFICIAL_TRANSCRIPT_INTEGRATION_NOTE` |
| `/document-view/$id` | **Untouched** |
| `/verify-document` | **Untouched** |
| `student-request-attachments` storage | **Untouched** — `STORAGE_INTEGRATION_NOTE` |
| `StudentRequestsSection.tsx` | **Not modified** (per constraints) |

---

## 15. Validation Matrix — `runDocumentArchiveScenarioMatrix()` (16 scenarios)

| # | Scenario | Expected | Actual | Pass |
|---|----------|----------|--------|------|
| 1 | grade_statement — generation صالح | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 2 | requestId غير UUID | INVALID | INVALID | ✅ |
| 3 | documentType غير متوافق | INVALID | INVALID | ✅ |
| 4 | documentNumber من العميل | INVALID | INVALID | ✅ |
| 5 | signatoryUserId من العميل | INVALID | INVALID | ✅ |
| 6 | File/base64 في payload | INVALID | INVALID | ✅ |
| 7 | enrollment_certificate — local فقط | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 8 | college staff → central signature | INVALID | INVALID | ✅ |
| 9 | manual signatory selection | INVALID | INVALID | ✅ |
| 10 | file_withdrawal — clearance incomplete | INVALID | INVALID | ✅ |
| 11 | file_withdrawal — clearance complete | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 12 | archive قبل final approval | INVALID | INVALID | ✅ |
| 13 | october_exam — qualified courses warning | VALID_WITH_WARNINGS | VALID_WITH_WARNINGS | ✅ |
| 14 | generic request_decision_document | EXECUTION_UNAVAILABLE | EXECUTION_UNAVAILABLE | ✅ |
| 15 | actor غير مخول | UNAUTHORIZED | UNAUTHORIZED | ✅ |
| 16 | publicUrl من العميل | INVALID | INVALID | ✅ |

**Matrix:** **16/16 PASS**

---

## 16. Security Checks

| Check | Result |
|-------|--------|
| Client `documentNumber` rejected | ✅ |
| Client `signatoryUserId` rejected | ✅ |
| Client `publicUrl` / File / base64 rejected | ✅ |
| Client `actorRole` / `actorUserId` rejected | ✅ |
| Central signature by college staff forbidden | ✅ |
| No manual signatory selection | ✅ |
| Session auth on server dry-run | ✅ |
| Trusted actor from `userRoles()` only | ✅ |
| No createSignedUrl / storage.from / upload in new paths | ✅ |

---

## 17. Build and Git Checks

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** |
| `git restore --worktree src/routeTree.gen.ts` | Restored |
| `npx tsx -e runDocumentArchiveScenarioMatrix()` | **16/16 PASS** |
| DB write audit (insert/update/upsert/delete/act_on/audit/notification) | **No matches** (comment-only «upload» in docstring) |
| `git grep createSignedUrl/storage.from/.upload/act_on` in student-requests | **Pre-existing `uploadedAt` read mapping only** |

### Confirmation — No Real Execution

- ✅ No insert / update / upsert / delete in new paths
- ✅ No PDF generation, file upload, signed URL, document number assignment
- ✅ No signature recording, document issuance, or archive record creation
- ✅ No `act_on_student_request_step`, audit, or notification writes
- ✅ Execute buttons disabled; all capability execute flags false
- ✅ NO commit, NO push, NO PR (per task constraints)

---

## Decision: **PASS_WITH_NOTES**

P13 foundation delivers validation-only contracts for documents, signatories, and archive handoff aligned with P7–P12 workflow/clearance models. Notes: schema not applied on shared prod; october exam qualified-courses and file_withdrawal clearance are future prerequisites documented as warnings; official_transcript remains on separate legacy path.

---

*End of P13 Document, Signatory & Archive Handoff Foundation Report*
