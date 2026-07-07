# ADMIN-STUDENT-REGISTRATION-RENAME-01 Report

**التاريخ:** 2026-07-07  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**

---

## 1. Executive Summary

تم إكمال إعادة تسمية واجهة الأدمن من «تسجيل الطلاب» إلى «تقسيم المجموعات». معظم مواقع التنقل والعناوين كانت قد اُعدّت في مرحلة `ADMIN-DASHBOARD-CARDS-RENAME-HIDE-01`؛ هذه المرحلة أصلحت المواقع المتبقية (إجراء سريع على لوحة التحكم، رسالة صلاحية، وصف قالب الاستيراد).

---

## 2. ما كان مُنجَزاً مسبقاً (ADMIN-DASHBOARD-CARDS-RENAME-HIDE-01)

| الملف | الموقع | النص بعد التعديل |
|-------|--------|------------------|
| `src/components/admin/AdminShell.tsx` | القائمة الجانبية → `/admin/enrollments` | **تقسيم المجموعات** |
| `src/routes/admin/academic-operations.tsx` | رابط سريع | **تقسيم المجموعات** |
| `src/routes/admin/enrollments.tsx` | عنوان `<h1>` | **تقسيم المجموعات** |

---

## 3. الملفات المعدّلة في هذه المرحلة

| الملف | الموقع | قبل | بعد |
|-------|--------|-----|-----|
| `src/routes/admin/index.lazy.tsx` | إجراءات سريعة على `/admin` | تسجيل طالب | **تقسيم المجموعات** |
| `src/lib/admin-enrollments.functions.ts` | رسالة رفض الصلاحية (واجهة أدمن) | ليس لديك صلاحية إدارة تسجيل الطلاب | **ليس لديك صلاحية إدارة تقسيم المجموعات** |
| `src/lib/imports/master-templates.ts` | وصف قالب `student_enrollments` | تسجيل الطلاب في مجموعات المقررات. | **تقسيم الطلاب على مجموعات المقررات.** |

---

## 4. تأكيد التسمية في واجهة الأدمن

جميع نقاط التنقل والعناوين الرئيسية للميزة `/admin/enrollments` تعرض الآن **تقسيم المجموعات**:

- القائمة الجانبية (`AdminShell`)
- لوحة التحكم — إجراء سريع (`index.lazy.tsx`)
- مركز العمليات الأكاديمية — رابط سريع (`academic-operations.tsx`)
- صفحة `/admin/enrollments` — العنوان (`enrollments.tsx`)

---

## 5. بقايا «تسجيل الطلاب» المتروكة عمداً

| الموقع | النص | السبب |
|--------|------|-------|
| `docs/ADMIN-DASHBOARD-CARDS-RENAME-HIDE-01-REPORT.md` | تسجيل الطلاب (سياق «قبل») | تقرير تاريخي — خارج نطاق UI |
| `src/routes/admin/imports.tsx` | تسجيلات الطلاب | تسمية نوع بيانات الاستيراد الجماعي، وليست عنوان ميزة التنقل |
| `src/lib/imports/labels.ts` | تسجيلات الطلاب | مفتاح `student_enrollments` — تسمية بيانات وليست label الميزة |
| `src/lib/imports/master-templates.ts` | title: تسجيلات الطلاب | عنوان قالب Excel للاستيراد (جمع «تسجيلات»)، مختلف عن «تسجيل الطلاب» |
| `src/routes/admin/enrollments.tsx` | تم تسجيل الطالب / تسجيل / حذف التسجيل | أفعال تشغيلية داخل الصفحة (toast، أزرار)، وليست تسمية الميزة |
| `src/routes/admin/academic-operations.tsx` | تسجيلات نشطة | مؤشر KPI — عدد التسجيلات النشطة |
| `src/routes/admin/pilot-center.tsx` | `/admin/enrollments` (مسار) | مسار URL — خارج نطاق «نص ظاهر فقط» |

**بحث `rg "تسجيل الطلاب"`:** لا توجد بقايا في `src/` بعد هذه المرحلة.

---

## 6. ما لم يُمس (حسب النطاق)

- لا migrations ولا DB changes
- لا تغيير route paths (`/admin/enrollments` باقٍ)
- لا تعديل صلاحيات أو RLS
- لا commit / push / PR

---

## 7. الفحوصات

| الفحص | النتيجة |
|-------|---------|
| `npm run build` | ✅ نجح (exit 0) |
| `git diff --check` | ✅ بدون أخطاء whitespace |
| `git status --short` | تعديلات UI ضمن الملفات أعلاه + ملفات مراحل أخرى غير مُلتزَمة في الفرع |

---

## 8. Decision

**PASS_WITH_NOTES** — جميع labels التنقل والعناوين الرئيسية للميزة أصبحت «تقسيم المجموعات». تُركت عمداً تسميات «تسجيلات الطلاب» في الاستيراد الجماعي وأفعال التشغيل داخل الصفحة لأنها سياق مختلف عن تسمية الميزة في القائمة.
