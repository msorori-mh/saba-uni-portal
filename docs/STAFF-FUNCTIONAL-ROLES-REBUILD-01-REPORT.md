# STAFF-FUNCTIONAL-ROLES-REBUILD-01 Report

## 1. Executive Summary

* **القرار:** PASS_WITH_NOTES
* **هل اختفت القائمة القديمة من شاشة إضافة الموظف:** **نعم** — dropdown الإنشاء يقرأ فقط من `STAFF_FUNCTIONAL_ROLES` (10 مسميات معتمدة).
* **هل القائمة الجديدة أصبحت المصدر الوحيد:** **نعم** — `src/lib/staff-functional-roles.ts` هو مصدر الحقيقة؛ `staff-role-types.ts` طبقة توافق رفيعة فقط.

### ملاحظات

1. أدوار **المكتبة** و**المعامل** (3 مسميات) لا تملك `app_role` آمناً حالياً — يُمنع إنشاء حساب دخول لها حتى توسيع enum.
2. **مسؤول الإرشيف** و**شؤون الخريجين** يُربَطان مؤقتاً بـ `student_affairs` — يحتاجان توسيع صلاحيات لاحقاً.
3. **لم يُنشأ migration draft** — `app_role` الحالي يكفي للربط المؤقت؛ التوسيع الدقيق يُؤجَّل لمرحلة لاحقة.

---

## 2. Root Cause

| السبب | التفصيل |
|-------|---------|
| **مرحلة ALIGN-01 جزئية** | `staff-role-types.ts` غيّر labels لكن أبقى مفاتيحاً مختلطة (`registrar`, `finance_officer`) وترك `LEGACY_STAFF_ROLE_LABELS` + `LEGACY_STAFF_ROLE_FILTER_OPTIONS` |
| **مصدران للعرض** | الإضافة كانت تستخدم `STAFF_ROLE_TYPES` بينما الفلتر/التعديل يضيفان خيارات legacy بأسماء «موظف …» |
| **mapping مكرر** | `admin-users.functions.ts` كان يحتوي `staffRoleFor()` hardcoded منفصل لا يعرف المفاتيح الجديدة |
| **Lovable غير مزامن** | إن ظهرت القائمة القديمة (4 خيارات) في بيئة نشر، السبب أن `main`/Lovable لم يدمج PR #97 بعد — الكود المحلي كان يحتوي 10 labels جديدة لكن بمفاتيح قديمة جزئياً |
| **ليس مودالاً منفصلاً** | شاشة واحدة: `/admin/staff-management` → `AddStaffModal` / `EditStaffModal` |

---

## 3. New Role Architecture

```
staff-functional-roles.ts (مصدر موحد)
    ├── STAFF_FUNCTIONAL_ROLES[]     → role_type في staff_profiles
    ├── appRoleFallback              → user_roles.role عند create_login
    ├── scopeType / unitKey          → توثيق النطاق (college / departments / none)
    └── LEGACY_STAFF_ROLE_META       → عرض/فلتر فقط — ليس للإنشاء

staff-role-types.ts                  → re-export للتوافق مع imports القديمة
admin-people.functions.ts            → حفظ role_type + staffFunctionalRoleToAppRole
admin-users.functions.ts             → staffRoleFor ← staffFunctionalRoleToAppRole
```

**الفرق:**

| الحقل | الغرض |
|-------|--------|
| `staff_profiles.role_type` | المسمى الوظيفي الإداري الدقيق (مفتاح داخلي) |
| `user_roles.app_role` | صلاحية النظام العامة المتاحة في enum حالياً |
| `request_processing_assignments` | (لاحقاً) ربط بوحدات معالجة الطلبات |

---

## 4. Approved Staff Roles

| # | key | labelAr | app_role |
|---|-----|---------|----------|
| 1 | `registrar_general` | المسجل العام | `registrar` |
| 2 | `student_affairs_manager` | مدير إدارة شؤون الطلاب | `student_affairs` |
| 3 | `student_affairs_specialist` | مختص شؤون الطلاب | `student_affairs` |
| 4 | `graduate_affairs_manager` | مدير شؤون الخريجين | `student_affairs` * |
| 5 | `graduate_affairs_specialist` | مختص شؤون الخريجين | `student_affairs` * |
| 6 | `archive_officer` | مسؤول الإرشيف | `student_affairs` * |
| 7 | `revenue_finance_officer` | موظف الإيرادات والمالية | `finance_officer` |
| 8 | `library_officer` | مسؤول المكتبة | **null** — لا login |
| 9 | `labs_manager` | مسؤول المعامل | **null** — لا login |
| 10 | `lab_custodian` | أمين معمل | **null** — لا login |

\* يحتاج `app_role` أدق لاحقاً

**غير مضاف (عمداً):** عميد الكلية، رئيس القسم العلمي → `faculty_profiles` / `organizational_positions`

---

## 5. Files Changed

| الملف | التغيير |
|------|---------|
| `src/lib/staff-functional-roles.ts` | **جديد** — مصدر موحد للأدوار |
| `src/lib/staff-role-types.ts` | إعادة بناء كطبقة re-export |
| `src/routes/admin/staff-management.tsx` | dropdown إنشاء/تعديل/فلتر من المصدر الموحد |
| `src/lib/admin-people.functions.ts` | مفاتيح جديدة + منع login بدون app_role |
| `src/lib/admin-users.functions.ts` | إزالة staffRoleFor المكرر + catalog mapping |
| `src/lib/imports/validators.ts` | تحقق role_type + رفض legacy |
| `src/lib/imports/templates.ts` | تعليمات وعينة استيراد محدّثة |
| `src/routes/staff.index.tsx` | عرض الدور من المصدر الموحد |

---

## 6. Legacy Handling

| legacy key | عرض | في الإنشاء | في التعديل |
|------------|-----|-----------|-----------|
| `registrar` | دور قديم — يحتاج تحديث (موظف القبول والتسجيل) | ممنوع | خيار disabled + تحذير |
| `student_affairs` | … | ممنوع | disabled |
| `finance_officer` | … | ممنوع | disabled |
| `hr_officer` | … | ممنوع | disabled |
| `lab_manager` / `lab_keeper` | … | ممنوع | disabled |

الفلتر يتضمن «(قديم)» للعثور على السجلات القديمة دون عرضها كخيارات إنشاء.

---

## 7. Authorization Notes

| الدور | app_role مباشر | ملاحظة |
|-------|----------------|--------|
| registrar_general | `registrar` | ✓ |
| student_affairs_* | `student_affairs` | ✓ |
| revenue_finance_officer | `finance_officer` | ✓ |
| graduate_affairs_* | `student_affairs` | مؤقت — يحتاج enum لاحق |
| archive_officer | `student_affairs` | مؤقت — صلاحيات واسعة |
| library_officer, labs_* | **لا login** | يحتاج `library_officer` / `labs_officer` في enum |

**Migration draft:** لم يُنشأ — التوسيع يمكن تأجيله لمرحلة منفصلة.

---

## 8. Import Template / Validation

* `templates.ts`: عينة `student_affairs_specialist` + تعليمات بالمفاتيح/التسميات المعتمدة.
* `validators.ts`: `resolveStaffRoleTypeInput()` — يقبل key أو labelAr؛ يرفض legacy بخطأ.

---

## 9. Validation

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | **نجح** (~23 ثانية) |
| `git diff --check` | **نجح** (تحذير CRLF على routeTree.gen.ts فقط) |
| `rg` النصوص القديمة في `src` | **نظيف** — تظهر فقط في `LEGACY_STAFF_ROLE_META` (mapping موثّق) وتعليمات الاستيراد |

---

## 10. No-DB-Write Assurance

* لا migrations applied
* لا DB writes
* لا Supabase apply
* لا Lovable publish
* لا commit / push / PR
