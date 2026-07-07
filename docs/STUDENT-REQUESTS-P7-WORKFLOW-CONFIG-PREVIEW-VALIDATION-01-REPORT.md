# STUDENT-REQUESTS-P7-WORKFLOW-CONFIG-PREVIEW-VALIDATION-01 Report

**التاريخ:** 2026-07-07
**المستودع:** `C:\projects\saba-uni-portal-git`
**القرار:** **PASS**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS** |
| **مصدر الحقيقة الموحّد** | `request-workflow-preview-registry.ts` |
| **التحقق** | `request-workflow-validation.ts` + `validateCanonicalPreviewRegistry()` |
| **UI** | `src/components/admin/RequestWorkflowPreview.tsx` |
| **التكامل** | `/admin/request-types/:id/workflow` + `staff-inbox-ui.ts` |

---

## 2. Files Added / Modified

### منشأة

| الملف |
|-------|
| `src/lib/student-requests/request-workflow-preview-registry.ts` |
| `src/lib/student-requests/request-workflow-validation.ts` |
| `src/components/admin/RequestWorkflowPreview.tsx` |
| `docs/STUDENT-REQUESTS-P7-WORKFLOW-CONFIG-PREVIEW-VALIDATION-01-REPORT.md` |

### معدّلة

| الملف | التغيير |
|-------|---------|
| `src/lib/student-requests/staff-inbox-ui.ts` | delegate إلى registry — لا تعريفات متعارضة |
| `src/routes/admin/request-types.$id.workflow.tsx` | معاينة + تحقق + رسالة schema |

**حُذف:** `src/components/admin/request-workflow/RequestWorkflowPreview.tsx` (نُقل إلى المسار المعتمد)

**لم يُعدَّل:** `routeTree.gen.ts`, `StudentRequestsSection.tsx`, migrations.

---

## 3. Registry — 8 Official Preview Paths

| الكود | خطوات | يبدأ بالطالب | النهاية | ملاحظات |
|-------|-------|--------------|---------|---------|
| `enrollment_suspension` | 7 | ✓ | أرشيف | رسوم + مستند |
| `grade_statement_non_graduate` | 8 | ✓ | أرشيف | مسجل الجامعة العام (مركزي) |
| `enrollment_certificate` | 6 | ✓ | أرشيف | اعتماد داخل الكلية |
| `file_withdrawal` | 10 | ✓ | أرشيف | parallel clearance ×4 |
| `excused_absence` | 6 | ✓ | أرشيف | مستند + أرشفة |
| `grade_appeal` | 4 | ✓ | مسجل الكلية | بدون أرشيف (كشف جماعي) |
| `department_transfer` | 9 | ✓ | أرشيف | target_dept + current_dept |
| `october_exam_entry_form` | 6 | ✓ | أرشيف | مستند + أرشفة |

**Aliases:** `absence_excuse` → `excused_absence`, `transfer` → `department_transfer` — **لا مسارات مستقلة**.

---

## 4. Registry Validation (`validateCanonicalPreviewRegistry`)

| الفحص | النتيجة |
|-------|---------|
| 8 أنواع رسمية | **PASS** |
| 8 مسارات preview | **PASS** |
| بداية كل مسار بالطالب | **PASS** |
| نهاية حسب المواصفة | **PASS** |
| `file_withdrawal` parallel group (4) | **PASS** |
| `grade_statement_non_graduate` مسجل الجامعة العام | **PASS** |
| `department_transfer` target + current dept | **PASS** |
| لا مسارات alias مستقلة | **PASS** |

---

## 5. Preview UI Features

- خطوات **متسلسلة** + مجموعات **توازي** (file_withdrawal)
- **جهات مركزية** (grade_statement)
- شارات: **رسوم** · **مستند** · **أرشفة** · **بالتوازي**
- Timeline موحّد مع Staff Inbox (`buildStaffInboxWorkflowStepsFromPreview`)
- عند غياب schema/RPC: معاينة ثابتة + رسالة:
  > «تفعيل وحفظ دورة الحياة يحتاج تطبيق مخطط طلبات الطلاب أولاً.»
- الحفظ والتفعيل **معطّلان** (`ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE = false`)

---

## 6. Staff Inbox Unification

`buildExpectedWorkflowPreview()` → `buildStaffInboxWorkflowStepsFromPreview()` — **مصدر واحد**، لا `EXPECTED_WORKFLOW_BY_TYPE` محلي.

---

## 7. Constraints Confirmation

| القيد | ✓ |
|-------|---|
| لا migrations | ✓ |
| لا Supabase apply | ✓ |
| لا seed | ✓ |
| لا DB writes | ✓ |
| لا workflow runtime | ✓ |
| لا `act_on_student_request_step` | ✓ |
| لا commit/push/PR | ✓ |
| لا تعديل routeTree يدوي | ✓ |

---

## 8. Build & Git

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** |
| `routeTree.gen.ts` | مستعاد بعد build |

---

## Summary

| Item | Value |
|------|-------|
| Decision | **PASS** |
| Registry validation (8 types) | **8/8 PASS** |
| Build | **PASS** |
| DB / migrations / seed | **Untouched** |
