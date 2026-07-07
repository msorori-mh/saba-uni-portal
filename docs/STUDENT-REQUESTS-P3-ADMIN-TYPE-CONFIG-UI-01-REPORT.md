# STUDENT-REQUESTS-P3-ADMIN-TYPE-CONFIG-UI-01 Report

**Date:** 2026-07-07  
**Scope:** Admin UI for student request type configuration (no workflow, seed, or DB apply)

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **Decision** | **PASS_WITH_NOTES** |
| **Admin can configure** | Code (canonical picker on create), Arabic name/description, audience, ineligible display mode, student visibility, attachments, sort order, active state; registry-derived spec flags for review (fee, service window, document, archive) |
| **Limitation** | Audience/eligibility columns persist only after migration `20260710130000_student_request_types_schema.sql`; spec-only flags are UI review until future schema phase |

The admin page no longer crashes when audience columns are missing; it probes schema at runtime and falls back gracefully.

---

## 2. Current Admin Route

| Item | Value |
|------|-------|
| **Route** | `/admin/request-types` |
| **Page** | `src/routes/admin/request-types.tsx` |
| **Dialog component** | `src/components/admin/RequestTypeConfigDialog.tsx` |
| **Server functions** | `src/lib/admin-request-types.functions.ts` |
| **Registry** | `src/lib/student-requests/request-type-registry.ts` |
| **Workflow (unchanged)** | `/admin/request-types/:id/workflow` → `src/routes/admin/request-types.$id.workflow.tsx` |

### Prior state (before P3)

- Direct `request_types` table reads/writes via server functions (no RPC).
- Hardcoded free-text code input on create.
- Fields: `code`, `name_ar`, `description_ar`, `requires_attachment`, `sort_order`, `is_active` only.

---

## 3. Fields Added

| Field | Arabic UI label | Persisted to DB |
|-------|-----------------|-----------------|
| Code | الكود | `code` (canonical picker on create; locked on edit) |
| Name | الاسم بالعربية | `name_ar` |
| Description | الوصف العربي | `description_ar` |
| Audience | جمهور الطلب | `request_audience` * |
| Ineligible display | عرض غير المؤهل | `ineligible_display_mode` * |
| Student visible | الخدمة ظاهرة للطالب | `student_visible` † |
| Requires attachment | يتطلب مرفقات | `requires_attachment` |
| Requires service window | يتطلب نافذة تفعيل | Registry review only |
| Requires fee | يتطلب رسوماً | Registry review only |
| Produces document | ينتج مستنداً | Registry review only |
| Requires archive | يحتاج أرشفة | Registry review only |
| Sort order | ترتيب العرض | `sort_order` |
| Active | مفعّل | `is_active` |

\* Requires migration `20260710130000`  
† Requires migration `20260706120000` (`student_visible`)

### Audience Arabic labels

| Value | Label |
|-------|-------|
| `active_student` | طلاب غير خريجين |
| `graduate` | خريجون |
| `both` | طلاب وخريجون |

### Ineligible display Arabic labels

| Value | Label |
|-------|-------|
| `hidden` | مخفي |
| `disabled` | باهت (معطّل) |

Help text explains: graduate requests appear disabled to non-graduates; active-student requests are hidden from graduates when `hidden`; RPC enforcement is future work.

---

## 4. Registry Integration

| Helper | Usage |
|--------|-------|
| `buildAdminCreateTypeOptions()` | Create dialog — canonical codes not yet in DB |
| `getRegistryDefaultsForAdminForm()` | Prefill form when canonical code selected |
| `getStudentRequestTypeDisplayName()` | List rows + legacy display |
| `normalizeStudentRequestTypeCode()` | Legacy badge `→ canonical` in list |
| `isLegacyAliasCode()` | Block legacy codes on create; show legacy hint on edit |
| `REQUEST_AUDIENCE_LABELS_AR` / `INELIGIBLE_DISPLAY_MODE_LABELS_AR` | Select labels |

**Legacy aliases blocked from create:** `absence_excuse`, `transfer`, `reenrollment` — not in canonical picker; server rejects insert with legacy code.

**Existing legacy rows:** Shown with official Arabic name via normalization; DB `code` unchanged on edit.

---

## 5. Save Behavior

### Always saved (base schema)

- `name_ar`, `description_ar`, `is_active`, `requires_attachment`, `sort_order`
- On create: `code` (canonical only)

### Conditionally saved (schema probe)

Runtime probe (`probeRequestTypeSchema`) attempts `SELECT` on optional columns:

| Column | When saved |
|--------|------------|
| `student_visible` | If column exists |
| `request_audience`, `ineligible_display_mode` | If both columns exist |

### Not saved (this phase)

- `requires_fee`, `requires_service_window`, `produces_document`, `requires_archive` — displayed read-only from registry for spec review

### Graceful fallback

- If extended update/insert fails due to missing columns → retry with base fields only
- UI banner: **«إعدادات الجمهور والأهلية تحتاج تطبيق مخطط طلبات الطلاب قبل الحفظ.»**
- Toast notes when audience fields were not persisted

### Full save possible when

1. Base `request_types` table exists (always)
2. **Partial:** `student_visible` after workflow migration `20260706120000`
3. **Full audience/eligibility:** after `20260710130000_student_request_types_schema.sql`

---

## 6. Compatibility

| Legacy code | Behavior |
|-------------|----------|
| `absence_excuse` | List shows «غياب بعذر» + badge `→ excused_absence`; edit allowed; code locked |
| `transfer` | List shows canonical transfer name + badge `→ department_transfer` |
| `reenrollment` | Display via `OUT_OF_SCOPE_LABELS` / normalization to `enrollment_reinstatement` |

No DB renames or data writes for normalization in this phase.

---

## 7. Explicit Non-Goals

- No workflow steps, roles, fees, hafiza, service windows, parallel steps, documents
- No seed for the 8 canonical types
- No DB apply / Supabase apply
- No changes to `StudentRequestsSection.tsx` (deprecated)
- No changes to workflow route `/admin/request-types/:id/workflow`

---

## 8. Validation

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** (no conflict markers) |
| `git status --short` | Modified UI/functions + new component; `routeTree.gen.ts` restored |

---

## 9. No-Write Assurance

| Constraint | Status |
|------------|--------|
| No new migrations | ✅ |
| No Supabase apply | ✅ |
| No seed | ✅ |
| No test/experimental DB writes | ✅ |
| No commit / push / PR | ✅ |
| No `routeTree.gen.ts` edit | ✅ (restored after build) |

---

## Files changed

| File | Action |
|------|--------|
| `src/routes/admin/request-types.tsx` | Extended list + registry integration |
| `src/components/admin/RequestTypeConfigDialog.tsx` | **New** create/edit dialog |
| `src/lib/admin-request-types.functions.ts` | Schema probe, extended list/upsert, legacy block |
| `src/lib/student-requests/request-type-registry.ts` | Admin helpers + Arabic labels |
