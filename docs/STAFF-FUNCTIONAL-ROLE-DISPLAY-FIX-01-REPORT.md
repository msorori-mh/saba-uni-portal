# STAFF-FUNCTIONAL-ROLE-DISPLAY-FIX-01 Report

## 1. Executive Summary

* **القرار:** PASS
* **هل تم تغيير المسمى إلى مسجل الكلية:** **نعم** — `registrar_general.labelAr` = `مسجل الكلية`
* **هل تم إصلاح عرض الدور في بوابة الموظف:** **نعم** — بطاقة «الدور» تعرض `staffFunctionalRoleDisplayLabel(profile.role_type)` من `staff_profiles` فقط

---

## 2. Root Cause

| السبب | التفصيل |
|-------|---------|
| **Mapping قديم في `staff.index.tsx`** | كان `ROLE_LABEL` يعرض `registrar` → **`قبول وتسجيل`** (نص مرتبط بـ `app_role` وليس `role_type`) |
| **عدم فصل العرض عن الصلاحيات** | `user_roles.app_role = registrar` ≠ المسمى الوظيفي؛ العرض القديم خلط بينهما |
| **Legacy `role_type = registrar`** | الموظفون المُنشَأون قبل REBUILD-01 قد يحملون المفتاح القديم `registrar` في `staff_profiles.role_type` |
| **لم يكن `staff-functional-roles.ts` مستخدماً للعرض** | REBUILD-01 أضاف المصدر الموحد لكن بوابة الموظف كانت ما زالت تعتمد على `ROLE_LABEL` المحلي |

---

## 3. Display Rule

| المصدر | الاستخدام |
|--------|-----------|
| `staff_profiles.job_title` | خانة **الوظيفة** في بوابة الموظف |
| `staff_profiles.role_type` → `staffFunctionalRoleDisplayLabel()` | خانة **الدور** — التسمية العربية الوظيفية |
| `user_roles.app_role` | **صلاحيات النظام فقط** — لا يُعرض في بطاقة الموظف |

---

## 4. Files Changed

| الملف | التغيير |
|------|---------|
| `src/lib/staff-functional-roles.ts` | `مسجل الكلية`؛ `staffFunctionalRoleDisplayLabel()`؛ aliases لـ `registrar` / `admissions_registration` |
| `src/routes/staff.index.tsx` | إصلاح البطاقة: الوظيفة = `job_title`، الدور = `staffFunctionalRoleDisplayLabel(role_type)`؛ إزالة `ROLE_LABEL` |
| `src/routes/admin/staff-management.tsx` | نص الصفحة + عرض القائمة عبر `staffFunctionalRoleDisplayLabel` |
| `src/lib/staff-role-types.ts` | re-export `staffFunctionalRoleDisplayLabel` |
| `src/lib/imports/templates.ts` | تعليمات الاستيراد: «مسجل الكلية» |

---

## 5. Legacy Handling

| `role_type` | العرض في بوابة الموظف |
|-------------|----------------------|
| `registrar_general` | مسجل الكلية |
| `registrar` | مسجل الكلية |
| `admissions_registration` | مسجل الكلية |
| `student_affairs` (legacy) | مختص شؤون الطلاب (via `suggestedKey`) |
| `finance_officer` (legacy) | موظف الإيرادات والمالية (via `suggestedKey`) |

**لا يُعرض:** `قبول وتسجيل`، `موظف القبول والتسجيل` في واجهة المستخدم.

النصوص القديمة تبقى في `LEGACY_STAFF_ROLE_META.legacyLabelAr` **لرسائل التحقق في الاستيراد فقط**.

---

## 6. Validation

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | **نجح** (~22 ثانية) |
| `git diff --check` | **نجح** (تحذير CRLF على routeTree.gen.ts) |
| `rg` النصوص القديمة | **نظيف في UI** — تظهر فقط في `LEGACY_STAFF_ROLE_META` (mapping داخلي) وتعليمات استيراد «لا تستخدم…» |

---

## 7. No-DB-Write Assurance

* لا migrations
* لا DB writes
* لا Supabase apply
* لا Lovable publish
* لا commit / push / PR
