# STUDENT-REQUESTS-P5-ELIGIBILITY-AVAILABILITY-UI-GUARD-01 Report

**Date:** 2026-07-07  
**Scope:** UI-only eligibility / availability guards (no DB enforcement, migrations, or seed)

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Delivered** | Eligibility helper module, status notice component, integration on new-request page, lightweight student context from `student_profiles.status`, mobile note |

Students see a badge (متاح / يحتاج تحقق / غير متاح / غير مدعوم), block/warning reasons, and RPC disclaimer before submit. Submit is disabled for clear blocks (unknown type, form invalid, academic status, picker ineligible, hard suspension rules when data present). **Needs verification** states allow submit with warnings (service window unchecked, etc.).

**Notes:** Service window state is always `{ checked: false }` until a future RPC — shows «لم يتم التحقق من فترة التفعيل بعد» without blocking. P1 suspension import fields are optional in context (not fetched yet) — suspension rules block only when values are supplied.

---

## 2. Files Added / Modified

| File | Action |
|------|--------|
| `src/lib/student-requests/request-eligibility-ui.ts` | **New** — eligibility evaluation helpers |
| `src/components/student-requests/StudentRequestEligibilityNotice.tsx` | **New** — RTL badge + reasons UI |
| `src/routes/student.requests.new.tsx` | **Modified** — notice + `canSubmitStudentRequestFromUi` |
| `src/lib/student-affairs.functions.ts` | **Modified** — `getStudentRequestUiContext` (reads `student_profiles.status` only) |
| `src/routes/mobile.student.requests.tsx` | **Modified** — eligibility note on web portal |

**Unchanged (already compliant):** `src/routes/student.requests.index.tsx` uses `getStudentRequestTypeDisplayName`.

---

## 3. UI Eligibility Rules

### Audience (display-only)

| Audience | Active student | Graduate |
|----------|----------------|----------|
| `active_student` | OK | Block if `hidden`; warn if `disabled` |
| `graduate` | Block/warn if not graduate | OK |
| `both` | OK if academic status OK | OK if academic status OK |

Graduate detection: `student_profiles.status === "graduated"` only.

### Academic status

| Status | UI behavior |
|--------|-------------|
| `active` | Eligible path (subject to audience) |
| `graduated` | Eligible for graduate/both types |
| Other known values | **Block** — «لا يمكن تقديم هذا الطلب حالياً بسبب حالة القيد الأكاديمية.» |
| Missing | **Warn** — needs verification |

### Service windows (4 types)

Types: `enrollment_suspension`, `excused_absence`, `grade_appeal`, `october_exam_entry_form`

- Always show: «تحتاج هذه الخدمة إلى فترة تفعيل من الإدارة.»
- When `serviceWindow.checked === false` (current default): «لم يتم التحقق من فترة التفعيل بعد» — **warn only, submit allowed**
- When `checked && isOpen === false`: **block**

### RPC / picker integration

- `is_eligible === false` or `is_disabled` from type picker → block with `disabled_reason`
- Final notice on every card: «التحقق النهائي… يتم عند المعالجة النظامية (RPC)»

---

## 4. Request-Specific Notices

| Code | Arabic | Notices / conditions | UI block possible |
|------|--------|----------------------|-------------------|
| `enrollment_suspension` | وقف القيد | First level, new student, transfer year, suspension limits | Yes, when profile fields provided |
| `grade_statement_non_graduate` | شهادة تقديرات | Non-graduates only | Via audience + graduate status |
| `enrollment_certificate` | شهادة قيد | Non-graduates; internal service | Via audience |
| `file_withdrawal` | سحب ملف | Clearance info (finance, library, labs, activities) | Info only |
| `excused_absence` | غياب بعذر | Service window + attachments | Window closed if checked |
| `grade_appeal` | تظلم | Window + published results | Window closed if checked |
| `department_transfer` | تحويل | Dept head review + equivalency | Info only |
| `october_exam_entry_form` | دور أكتوبر | Admin course limit | Window closed if checked |

---

## 5. Save / Submit Behavior

### Submit disabled when

- Unknown / unsupported request type (no dynamic form)
- Form validation failed (missing required fields)
- Empty subject
- Picker: `is_eligible === false` or `is_disabled`
- Academic status not `active` or `graduated`
- Audience hard block (e.g. graduate on active-only with hidden mode)
- `enrollment_suspension` hard rules when context data present (first level, new, transferred, suspension counts)
- Service window checked and explicitly closed

### Submit allowed with warning when

- Badge = **needs_verification** (unchecked service window, unknown student status nuances)
- Audience soft mismatch with `disabled` display mode

### Awaits RPC / migrations

- Final eligibility enforcement at submit
- Service window open/closed from `student_request_service_windows`
- P1 profile fields for suspension (optional extension to `getStudentRequestUiContext`)
- Fee / clearance gates

**Save contract unchanged:** `title`, `formData`, `studentNotes` via existing server functions.

---

## 6. Compatibility

| Scenario | Behavior |
|----------|----------|
| Legacy aliases (`absence_excuse`, `transfer`) | Normalized before form + eligibility lookup |
| Unknown type | Badge «غير مدعوم», submit disabled |
| Old requests in index | Display names via registry — no new queries |
| DB | No writes, no schema changes |

---

## 7. Mobile Check

| Item | Result |
|------|--------|
| Build | Pass |
| Breakage | None |
| Change | Note: «التحقق التفصيلي من الأهلية متاح حالياً من بوابة المتصفح» |

---

## 8. Explicit Non-Goals

- No workflow, seed, service windows implementation, fees, clearances, DB apply

---

## 9. Validation

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** |

---

## 10. No-Write Assurance

| Constraint | Status |
|------------|--------|
| No migrations | ✅ |
| No Supabase apply | ✅ |
| No seed | ✅ |
| No test DB writes | ✅ |
| No commit / push / PR | ✅ |

---

## Helper API

- `getStudentRequestUiEligibility(input)`
- `getStudentRequestBlockedReasons(input)`
- `getStudentRequestAvailabilityBadge(badge)`
- `canSubmitStudentRequestFromUi(input)`
