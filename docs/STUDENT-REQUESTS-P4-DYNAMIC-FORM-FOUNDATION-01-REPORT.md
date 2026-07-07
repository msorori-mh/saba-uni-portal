# STUDENT-REQUESTS-P4-DYNAMIC-FORM-FOUNDATION-01 Report

**Date:** 2026-07-07  
**Scope:** Dynamic per-type student request forms (foundation only — no workflow, migrations, seed, or DB apply)

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Delivered** | Central static form registry for 8 canonical types; RTL dynamic form component; student new-request page wired to per-type fields; mobile compatibility note |

Students now see different Arabic fields when selecting a supported request type. Legacy aliases resolve via `normalizeStudentRequestTypeCode()` (e.g. `absence_excuse` → excused absence form). Unsupported DB types show a safe message and cannot submit.

**Notes:**
- Field values persist only via existing `title`, `description`/`student_notes`, and `form_data` JSON — not per-type detail tables.
- File inputs are UI-only placeholders; no attachment upload in this phase.
- Select/multi-select options use safe placeholders until academic context RPCs exist.

---

## 2. Files Added / Modified

| File | Action |
|------|--------|
| `src/lib/student-requests/request-form-registry.ts` | **New** — static definitions, validation, summary serialization |
| `src/components/student-requests/DynamicStudentRequestForm.tsx` | **New** — dynamic RTL renderer |
| `src/routes/student.requests.new.tsx` | **Modified** — integrates dynamic form + validation |
| `src/routes/mobile.student.requests.tsx` | **Modified** — note that detailed forms are on web portal |

**Not modified:** `StudentRequestsSection.tsx`, migrations, `routeTree.gen.ts` (intentionally).

---

## 3. Supported Request Forms

| Code | Arabic name | Key fields | Attachments (UI) | Warnings |
|------|-------------|------------|------------------|----------|
| `enrollment_suspension` | وقف القيد | target semester, academic context (readonly), reason, terms ack | No | Eligibility checked later by system |
| `grade_statement_non_graduate` | شهادة تقديرات لغير الخريجين | purpose, copies, recipient | No | Non-graduates only |
| `enrollment_certificate` | شهادة قيد | purpose, copies, recipient | No | Internal service — no central signatures |
| `file_withdrawal` | سحب ملف | reason, impact ack, clearance info (readonly ×4) | No | Clearances not executed |
| `excused_absence` | غياب بعذر | date range, reason, courses (placeholder), excuse file | **Yes** (UI) | Service window required |
| `grade_appeal` | تظلم | semester, course (placeholder), reason | No | Activation period + published results |
| `department_transfer` | تحويل قسم | current dept/program (readonly), target dept/program, reason, secondary cert file | **Yes** (UI) | Equivalency by dept head later |
| `october_exam_entry_form` | دور أكتوبر | remaining courses (placeholder), admin limit ack | No | Final list by registrar |

All definitions set `unavailableUntilSchemaApplied: true` and show:

> سيتم تفعيل حفظ تفاصيل هذا النموذج بعد تطبيق مخطط طلبات الطلاب.

---

## 4. Save Behavior

### Display only (foundation)

- Per-type detail table columns (suspension semester FK, transfer targets, appeal course section, etc.)
- Real file upload to storage / `request_attachments`
- Service window enforcement
- Fee assessments
- Clearance workflow execution
- Course/department/program lists from live academic data

### Actually saved today (unchanged contract)

| Field | Storage |
|-------|---------|
| `title` | `student_requests.title` |
| Form summary text | `description` + `student_notes` via `buildFormValuesSummary()` |
| Structured values | `form_data` JSON via `serializeFormValuesForStorage()` (files → `{ _filePlaceholder, name, size }`) |
| Request type code | `request_type` (as selected from DB, including legacy codes) |

`createStudentServiceRequest` / `saveStudentServiceRequestDraft` / `submitStudentServiceRequest` contracts **unchanged**.

### Awaits migrations / RPC

- Typed detail rows per request type
- Attachment pipeline
- Eligibility and service-window gates at submit time

---

## 5. Compatibility

| Scenario | Behavior |
|----------|----------|
| `absence_excuse` (legacy) | Normalized → `excused_absence` form |
| `transfer` (legacy) | Normalized → `department_transfer` form |
| Unknown / out-of-scope type (e.g. `official_transcript`) | Message: «هذا النوع من الطلب غير مدعوم حالياً في النموذج الجديد.» — submit disabled |
| Missing context data | Placeholder selects/readonly fields — page does not crash |
| DB | No renames, no test writes, no new queries on unconfirmed tables |

---

## 6. Mobile Check

| Item | Result |
|------|--------|
| Page breaks? | **No** — build passes |
| Full mobile form? | **Not in scope** |
| Change | Header note: detailed forms available via web portal |

Mobile still links to `/student/requests/new` for submit; full dynamic UX is on desktop portal path.

---

## 7. Explicit Non-Goals

- No workflow steps / roles
- No seed for 8 types
- No service windows / fees / clearances
- No DB apply / Supabase apply
- No experimental DB writes
- No `StudentRequestsSection.tsx` changes

---

## 8. Validation

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** |
| `git status --short` | New registry + component; modified new-request + mobile pages |

---

## 9. No-Write Assurance

| Constraint | Status |
|------------|--------|
| No migrations | ✅ |
| No Supabase apply | ✅ |
| No seed | ✅ |
| No test/experimental DB data | ✅ |
| No commit / push / PR | ✅ |
| No `routeTree.gen.ts` edit | ✅ (do not commit if build touched it) |

---

## Registry API summary

- `getStudentRequestFormDefinition(code)`
- `hasStudentRequestFormDefinition(code)`
- `getEmptyFormValues(def)`
- `validateStudentRequestFormValues(def, values)`
- `buildFormValuesSummary(def, values)`
- `serializeFormValuesForStorage(values)`
