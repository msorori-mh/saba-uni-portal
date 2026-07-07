# STUDENT-REQUESTS-P2-CODE-NORMALIZATION-01 — Report

**Date:** 2026-07-07  
**Scope:** Code-only normalization of student request type codes (no DB changes)

---

## 1. Decision

**PASS_WITH_NOTES**

Build succeeded. Central registry and normalization helpers are in place; active student/admin routes use them. Legacy DB codes remain stored unchanged and are resolved on read/compare.

**Notes:**
- `src/components/portal/StudentRequestsSection.tsx` is deprecated and not imported elsewhere; it still references legacy codes for direct Supabase inserts/table names (`absence_excuse_details`, etc.). Left unchanged to avoid scope creep; safe to remove or migrate in a later phase.
- `enrollment_reinstatement` is supported via alias `reenrollment` in normalization but is out of spec scope (retained in `OUT_OF_SCOPE_LABELS` for display only).
- Report status labels (`REQ_STATUS_AR`) in `admin-reports.functions.ts` remain mojibake-encoded from prior state; request-type labels now come from the registry.

---

## 2. Official canonical codes (spec)

| Code | Arabic name |
|------|-------------|
| `enrollment_suspension` | وقف القيد |
| `grade_statement_non_graduate` | شهادة تقديرات لغير الخريجين |
| `enrollment_certificate` | شهادة قيد |
| `file_withdrawal` | سحب ملف |
| `excused_absence` | غياب بعذر |
| `grade_appeal` | تظلم |
| `department_transfer` | تحويل من قسم إلى قسم |
| `october_exam_entry_form` | استمارة دخول دور أكتوبر |

---

## 3. Legacy aliases (read/compare only)

| Legacy code | Normalizes to |
|-------------|---------------|
| `absence_excuse` | `excused_absence` |
| `transfer` | `department_transfer` |
| `reenrollment` | `enrollment_reinstatement` |

Legacy codes are **not** shown as picker options when the canonical type is also present. DB rows are **not** renamed.

---

## 4. Files created

| File | Purpose |
|------|---------|
| `src/lib/student-requests/request-type-registry.ts` | Central registry, `normalizeStudentRequestTypeCode`, display/filter/report helpers |

---

## 5. Files modified

| File | Change summary |
|------|----------------|
| `src/routes/student.requests.new.tsx` | Filter picker via `filterStudentRequestTypesForDisplay` |
| `src/routes/student.requests.index.tsx` | Display names via `getStudentRequestTypeDisplayName` |
| `src/routes/mobile.student.requests.tsx` | Filter types + display names from registry |
| `src/routes/admin/student-requests.lazy.tsx` | `enrichRequestTypesForDisplay`, `matchesStudentRequestTypeCode` for transfer filter/approval |
| `src/routes/admin/reports.tsx` | `buildExtendedReportTypeOptions()` replaces hardcoded legacy options |
| `src/lib/admin-student-requests.functions.ts` | Normalized switch for details/effects; transfer approval via `matchesStudentRequestTypeCode` |
| `src/lib/admin-reports.functions.ts` | Registry labels; `getDbCodesForRequestTypeFilter` for report filtering |
| `src/lib/student-request-timeline.ts` | Effect labels via `resolveEffectLabelForRequestType` |

**Not modified (per constraints):** `src/routeTree.gen.ts`, migrations, seeds, Supabase types.

---

## 6. Prior legacy code usage (updated)

| Location | Was | Now |
|----------|-----|-----|
| `student.requests.new.tsx` | Raw DB type list | `filterStudentRequestTypesForDisplay` hides legacy duplicates |
| `student.requests.index.tsx` | `request_type_name_ar ?? request_type` | `getStudentRequestTypeDisplayName` |
| `mobile.student.requests.tsx` | Same as index | Registry filter + display |
| `admin/student-requests.lazy.tsx` | `request_type === "transfer"` | `matchesStudentRequestTypeCode(..., "department_transfer")` |
| `admin/reports.tsx` | `REQ_TYPE_OPTIONS` with `absence_excuse`, `transfer` | `buildExtendedReportTypeOptions()` (canonical + out-of-scope, no legacy aliases) |
| `admin-reports.functions.ts` | Garbled `REQ_TYPE_AR` map | `getStudentRequestTypeDisplayName`; filter expands legacy DB codes |
| `admin-student-requests.functions.ts` | `case "absence_excuse"` | `normalizeStudentRequestTypeCode` → `case "excused_absence"` |
| `student-request-timeline.ts` | `EFFECT_LABELS["absence_excuse"]` | `resolveEffectLabelForRequestType` (handles alias) |

**Remaining intentional legacy references:** DB table names (`absence_excuse_details`), deprecated `StudentRequestsSection.tsx` (unreferenced).

---

## 7. Backward compatibility mechanism

1. **`normalizeStudentRequestTypeCode(code)`** — maps legacy aliases to canonical codes; unknown codes pass through unchanged.
2. **`matchesStudentRequestTypeCode(stored, expected)`** — compares stored DB value against canonical expectation (e.g. `"transfer"` matches `"department_transfer"`).
3. **`getDbCodesForRequestTypeFilter(code)`** — report filters match both canonical and legacy stored values.
4. **`filterStudentRequestTypesForDisplay` / `enrichRequestTypesForDisplay`** — hide legacy alias rows in pickers when canonical type exists; labels normalized from registry.
5. **No writes to `student_requests.request_type`** — existing rows keep legacy codes until a future DB migration phase.

---

## 8. Build result

```
npm run build → exit 0 (success, ~68s)
git diff --check → no conflict markers / whitespace errors
```

---

## 9. Constraints confirmation

| Constraint | Status |
|------------|--------|
| No DB changes | ✅ |
| No migrations | ✅ |
| No seed | ✅ |
| No Supabase apply | ✅ |
| No commit / push / PR | ✅ |
| No `routeTree.gen.ts` edit | ✅ (restored after incidental build touch) |

---

## 10. Registry API summary

- `normalizeStudentRequestTypeCode(code)`
- `getStudentRequestTypeDefinition(code)`
- `getStudentRequestTypeDisplayName(code, fallbackNameAr?)`
- `matchesStudentRequestTypeCode(stored, expectedCanonical)`
- `getDbCodesForRequestTypeFilter(code)`
- `filterStudentRequestTypesForDisplay(types)`
- `enrichRequestTypesForDisplay(types)`
- `buildCanonicalReportTypeOptions()` / `buildExtendedReportTypeOptions()`
- `resolveEffectLabelForRequestType(code)`
