# ADMIN-STAFF-ROLE-TITLES-ALIGN-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`

---

## 1. Executive Summary

| Item | Result |
|---|---|
| **القرار** | **PASS_WITH_NOTES** |
| **هل تم تغيير قائمة المسميات؟** | **نعم** — في إضافة/تعديل الموظف وفلتر القائمة |
| **هل الحفظ ما زال متوافقاً؟** | **نعم** — حفظ `staff_profiles.role_type` يعمل؛ عند إنشاء حساب دخول يُربَط `user_roles` بأقرب `app_role` موجود |

### ملاحظات

1. المسميات الجديدة (مثل `student_affairs_manager`, `lab_keeper`) تُخزَّن في `staff_profiles.role_type` (حقل نصي).
2. enum `app_role` في قاعدة البيانات **لا يتضمن** بعد المفاتيح الدقيقة للمسميات الجديدة — عند `create_login` يُستخدم mapping إلى: `registrar`, `student_affairs`, أو `finance_officer`.
3. **رئيس القسم العلمي** و**عميد الكلية** غير مضافين في قائمة الموظفين (كما طُلب).
4. الموظفون القديمون بقيم `student_affairs` / `hr_officer` يظهرون في التعديل والفلتر حتى يُحدَّثوا يدوياً.

---

## 2. Files Changed

| الملف | التغيير |
|---|---|
| `src/lib/staff-role-types.ts` | **جديد** — قائمة المسميات، التسميات العربية، mapping إلى `app_role` |
| `src/routes/admin/staff-management.tsx` | استبدال خيارات الدور في الإضافة/التعديل/الفلتر |
| `src/lib/admin-people.functions.ts` | توسيع التحقق من `role_type` + mapping آمن لـ `user_roles` |

---

## 3. Role Options Before / After

### قبل (4 خيارات)

| value | label |
|---|---|
| `registrar` | موظف القبول والتسجيل |
| `student_affairs` | موظف شؤون الطلاب |
| `finance_officer` | موظف الشؤون المالية |
| `hr_officer` | موظف الموارد البشرية |

### بعد (10 خيارات في الإضافة)

| # | value | label | app_role عند إنشاء دخول |
|---|---|---|---|
| 1 | `registrar` | المسجل العام | `registrar` |
| 2 | `student_affairs_manager` | مدير إدارة شؤون الطلاب | `student_affairs` |
| 3 | `student_affairs_specialist` | مختص شؤون الطلاب | `student_affairs` |
| 4 | `graduate_affairs_manager` | مدير شؤون الخريجين | `student_affairs` |
| 5 | `graduate_affairs_specialist` | مختص شؤون الخريجين | `student_affairs` |
| 6 | `archive_officer` | مسؤول الإرشيف | `student_affairs` |
| 7 | `finance_officer` | موظف الإيرادات والمالية | `finance_officer` |
| 8 | `library_officer` | مسؤول المكتبة | `student_affairs` |
| 9 | `lab_manager` | مسؤول المعامل | `student_affairs` |
| 10 | `lab_keeper` | أمين معمل | `student_affairs` |

### غير مضاف (عمداً)

- `dean` / عميد الكلية
- `department_head` / رئيس القسم العلمي

### قيم قديمة (للعرض/التعديل/الفلتر فقط)

- `student_affairs` → موظف شؤون الطلاب
- `hr_officer` → موظف الموارد البشرية

---

## 4. Faculty Positions Note

**رئيس القسم العلمي** و**عميد الكلية** لا يُنشآن من شاشة **الموظفون → إضافة موظف جديد**.

المسار الصحيح في النظام:

- `faculty_profiles` — ملف عضو هيئة التدريس
- `organizational_positions` — تعريف المنصب
- `position_assignments` — ربط المنصب بالشخص

هذه المرحلة لم تُضِفهما إلى dropdown الموظفين الإداريين.

---

## 5. Checks

| الفحص | النتيجة |
|---|---|
| `npm run build` | **PASS** (exit 0) |
| `git diff --check` | **PASS** (لا أخطاء whitespace) |
| `git status --short` | تعديلات محلية متعددة (مراحل سابقة + هذه المرحلة) |

---

## 6. No-DB-Write Assurance

| بند | الحالة |
|---|---|
| migrations | **لم تُنفَّذ** |
| DB changes | **لم تُنفَّذ** |
| seed | **لم يُنفَّذ** |
| commit / push / PR | **لم يُنفَّذ** |

---

## Follow-up (خارج نطاق هذه المرحلة)

لتمييز صلاحيات دقيقة لكل مسمى (مثل `archive_officer` vs `lab_manager`) في RLS وطلبات الطلاب، يُوصى لاحقاً بمرحلة:

- توسيع `app_role` enum و/أو `request_processing_roles`
- ربط `staff_profiles.role_type` بـ `request_processing_assignments`

**Final Decision: PASS_WITH_NOTES**
