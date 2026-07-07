# GRADES-SECOND-SEMESTER-IMPORT-READINESS-01 Report

**Date:** 2026-07-07  
**Repository:** `C:\projects\saba-uni-portal-git`  
**Branch at audit:** `codex/student-requests-workflow-admin`  
**Target context:** العام الأكاديمي `2025-2026` — الفصل الثاني (`second` / الفصل الثاني)

---

## 1. Executive Summary

| Item | Result |
|---|---|
| **القرار** | **PASS_WITH_NOTES** |
| **جاهزية إدخال درجات الفصل الثاني (من ناحية النظام/الكود)** | **نعم — البنية والمستورد موجودان** |
| **جاهزية البيانات التشغيلية للفصل الثاني** | **غير مُتحقَّق منها في هذه المرحلة** (فحص كود/schema فقط، بدون اتصال بقاعدة البيانات الحية) |
| **هل يوجد مستورد Excel للدرجات؟** | **نعم** — تبويب `درجات الطلاب` في `/admin/imports` |

### الخلاصة

النظام **يدعم تقنياً** استيراد درجات الفصل الثاني عبر Excel، مع تحقق مسبق (preview/validation) وحالات اعتماد (`draft` / `submitted` / `approved`). الجداول والعلاقات والواجهات موجودة في المشروع.

**ملاحظات جوهرية قبل الاستيراد الفعلي:**

1. **مكوّنات الدرجة (`grade_components`)** يجب إنشاؤها مسبقاً لكل مجموعة دراسية — **لا يوجد مستورد جماعي لها**؛ تُنشأ عبر بوابة عضو هيئة التدريس أو يدوياً.
2. **سلسلة الاعتماديات إلزامية:** طلاب → مقررات → خطط → إسناد مقررات → مجموعات → تسجيلات → مكوّنات درجة → درجات.
3. **حالة أكاديمية للطالب** في `2025-2026` + `second` مطلوبة لكل طالب قبل قبول صف الدرجة.
4. **لا حالة `published`** — الظهور للطالب يعتمد على `approved` فقط (RLS).
5. **تحقق الفصل في المستورد** يعتمد على `code`/`name` عالمياً وليس مربوطاً صراحةً بـ `academic_year_id` في خريطة الـ lookup — خطر محتمل عند تعدد السنوات.

---

## 2. Scope

| بند | الحالة |
|---|---|
| نوع المرحلة | فحص جاهزية (read-only audit) |
| إدخال درجات | **لم يُنفَّذ** |
| تعديل قاعدة البيانات | **لم يُنفَّذ** |
| migrations / seed / apply | **لم يُنفَّذ** |
| service role في المتصفح | **لم يُستخدم** |
| commit / push / PR | **لم يُنفَّذ** |

**الكتابة الوحيدة:** هذا التقرير.

---

## 3. Current Grade Model

### 3.1 الجداول الأساسية

| الجدول | الغرض | المصدر |
|---|---|---|
| `academic_years` | السنوات الأكاديمية (`name`, `is_current`, `status`) | migration `20260531230139` |
| `semesters` | الفصول مربوطة بـ `academic_year_id` (`code`: `first`/`second`/`summer`) | نفس الـ migration |
| `academic_levels` | المستويات الدراسية | نفس الـ migration |
| `student_profiles` | بيانات الطالب (رقم أكاديمي، برنامج، قسم…) | أنظمة الطلاب/الاستيراد |
| `student_academic_status` | ربط الطالب بعام + فصل + مستوى | UNIQUE `(student_profile_id, academic_year_id, semester_id)` |
| `courses` | كتالوج المقررات | استيراد/إدارة مقررات |
| `study_plans` + `study_plan_courses` | الخطط الدراسية (`semester_code`: `first`/`second`) | استيراد خطط |
| `course_offerings` | إسناد مقرر لعام + فصل + برنامج + مستوى | إدارة الإسناد |
| `course_sections` | مجموعات المقرر (`section_code`) | استيراد مجموعات |
| `student_enrollments` | تسجيل طالب في مجموعة | استيراد تسجيلات |
| **`grade_components`** | مكوّنات التقييم لكل مجموعة (`name`, `max_score`, مجموع ≤ 100) | إنشاء يدوي/بوابة أعضاء التدريس |
| **`student_grades`** | درجة طالب لمكوّن (`score`, `status`, `entered_by`, `approved_by`) | استيراد/إدخال يدوي |

### 3.2 بنية `student_grades`

```sql
-- من migration 20260531233850
status CHECK (status IN ('draft','submitted','approved'))
UNIQUE (student_enrollment_id, grade_component_id)
-- trigger: score <= grade_components.max_score
```

**الحقول:** `student_enrollment_id`, `grade_component_id`, `score`, `status`, `entered_by`, `approved_by`, `approved_at`, timestamps.

**لا يوجد** حقل `published` — الطالب يرى الدرجات فقط عندما `status = 'approved'` (سياسة RLS `sg_student_select`).

### 3.3 عرض ملخّص الدرجات

View: `student_course_grade_summary` — يجمع الدرجات حسب التسجيل ويحسب `overall_status` (`draft` / `submitted` / `approved`).

### 3.4 العام والفصل المستهدفان (من الـ seed في الـ migration)

| الكيان | القيمة في الـ schema seed |
|---|---|
| العام | `2025-2026` (`is_current = true` في الـ seed) |
| الفصل الأول | `الفصل الأول` — `code = first` (`is_current = true` في الـ seed) |
| **الفصل الثاني** | **`الفصل الثاني` — `code = second`** (`is_current = false` في الـ seed) |
| الفصل الصيفي | `summer` |

> **تنبيه:** وجود هذه السجلات في قاعدة البيانات **الحية** يعتمد على تطبيق الـ migrations فعلياً. هذه المرحلة لم تتصل بقاعدة البيانات.

---

## 4. Admin UI Readiness

### 4.1 صفحات الأدمن ذات الصلة

| المسار | الوظيفة | دعم Excel؟ |
|---|---|---|
| **`/admin/imports`** → تبويب **«درجات الطلاب»** | استيراد جماعي Excel مع معاينة وتحقق وتقرير | **نعم** |
| **`/admin/grades`** | عرض شبكة الدرجات حسب المجموعة + **اعتماد/إرجاع** المرسلة | لا (عرض/اعتماد فقط) |
| **`/admin/enrollments`** | تسجيلات الطلاب | عبر الاستيراد الجماعي |
| **`/admin/course-offerings`** | إسناد المقررات | إدارة يدوية |
| **`/admin/academic-core`** | السنوات والفصول | إدارة يدوية |
| **`/admin/academic-operations`** | مؤشرات تشغيل (تسجيلات، مكوّنات درجات…) | لا |

**التنقل:** `AdminShell` → «الدرجات» (`/admin/grades`) و«الاستيراد الجماعي» (`/admin/imports`).

### 4.2 مستورد Excel للدرجات — التفاصيل

| بند | التفاصيل |
|---|---|
| **ImportType** | `student_grades` |
| **القالب** | `template_student_grades.xlsx` (`src/lib/imports/master-templates.ts`) |
| **التحقق** | `validateStudentGrades()` في `src/lib/imports/validators.ts` |
| **الاستيراد** | `importStudentGrades()` في `src/lib/imports/engine.server.ts` |
| **Server functions** | `validateBulkImportPreview`, `runBulkImport` في `src/lib/imports.functions.ts` |
| **الصلاحيات** | `admin`, `system_admin`, `registrar`, `student_affairs` |
| **خطوات الواجهة** | تنزيل القالب → رفع الملف → المعاينة → التحقق → الاستيراد → التقرير |
| **Dry Run** | مدعوم («وضع التحقق فقط») |
| **تقرير أخطاء** | قابل للتنزيل (`downloadValidationReport`, `downloadImportReport`) |

### 4.3 إدخال يدوي (بديل الاستيراد)

**`FacultyGradesManager`** (`src/components/portal/FacultyGradesManager.tsx`):

- إنشاء/حذف `grade_components` لمجموعة المدرّس.
- إدخال درجات كـ `draft` أو إرسالها `submitted`.
- لا يستبدل الاستيراد الجماعي لكنه يغطي الإدخال التفاعلي.

### 4.4 اعتماد الدرجات

**`/admin/grades`** (`src/routes/admin/grades.lazy.tsx`):

- فلترة حسب عام + فصل + مجموعة.
- اعتماد الدرجات `submitted` → `approved`.
- إرجاع `submitted` → `draft`.
- صلاحيات: `system_admin`, `admin`, `dean`, `registrar`, `department_head`.

---

## 5. Required Data Before Import

قبل استيراد درجات **الفصل الثاني 2025-2026** يجب توفر ما يلي **في قاعدة البيانات**:

| # | المتطلب | كيف يُجهَّز | ملاحظة |
|---|---|---|---|
| 1 | **العام `2025-2026`** | migration seed أو `/admin/academic-core` | اسم الملف في Excel: `2025-2026` |
| 2 | **الفصل `second`** | مربوط بالعام أعلاه | في Excel: `second` أو `الفصل الثاني` |
| 3 | **الطلاب** | استيراد `students` | مع `academic_year` + `semester` + برنامج + مستوى |
| 4 | **حالة أكاديمية للفصل الثاني** | `student_academic_status` لكل طالب | يُنشأ مع استيراد الطلاب أو يدوياً؛ **مطلوب** للتحقق |
| 5 | **المقررات** | استيراد `courses` | أكواد مطابقة للملف |
| 6 | **مقررات الفصل الثاني في الخطة** | استيراد `study_plans` بعمود `semester = second` | `study_plan_courses.semester_code` |
| 7 | **إسناد مقررات الفصل الثاني** | `course_offerings` لـ `2025-2026` + `second` | برنامج + مستوى + مقرر |
| 8 | **مجموعات المقررات** | استيراد `course_sections` | `section_code` مطابق للملف |
| 9 | **تسجيلات الطلاب** | استيراد `student_enrollments` | طالب مسجّل في المجموعة الصحيحة |
| 10 | **مكوّنات الدرجة** | **يدوياً** عبر بوابة أعضاء التدريس أو SQL آمن | **لا مستورد جماعي** — شرط إلزامي |
| 11 | **أسماء المكوّنات** | تطابق `component_name` في Excel | مثل: `نهائي`, `نصفي`, `أعمال فصل` |

### ترتيب الاستيراد الموصى به

```
departments → programs → levels → students → courses → study_plans
→ course_sections → student_enrollments → [إنشاء grade_components] → student_grades
```

(مستند إلى `docs/PORTAL-DATA-PREP-01-REPORT.md`)

---

## 6. Suggested Excel Template

### 6.1 القالب الرسمي الحالي (`template_student_grades.xlsx`)

| العمود | مطلوب؟ | مثال للفصل الثاني | ملاحظات |
|---|---|---|---|
| `academic_number` | نعم | `20251001` | يجب أن يكون الطالب موجوداً |
| `course_code` | نعم | `CS101` | كود المقرر في النظام |
| `section_code` | نعم | `A` | رمز المجموعة (حساس لحالة الأحرف — يُحوَّل uppercase) |
| `academic_year` | نعم | **`2025-2026`** | اسم السنة كما في `academic_years.name` |
| `semester` | نعم | **`second`** | أو `الفصل الثاني` |
| `component_name` | نعم | `نهائي` | يجب أن يطابق `grade_components.name` للمجموعة |
| `score` | نعم | `85` | `0 ≤ score ≤ max_score` |
| `status` | لا (افتراضي `submitted`) | `submitted` | `draft` / `submitted` / `approved` |

### 6.2 مثال صفوف للفصل الثاني

```
20251001 | CS101 | A | 2025-2026 | second | أعمال فصل | 28 | submitted
20251001 | CS101 | A | 2025-2026 | second | نصفي       | 18 | submitted
20251001 | CS101 | A | 2025-2026 | second | نهائي      | 42 | submitted
```

### 6.3 تسمية ملف البيانات (اقتراح تشغيلي)

```
student_grades_regular_2025-2026_second.xlsx
```

أو حسب دليل `PORTAL-DATA-PREP-01`: `<entity>_<study_system>_<academic_year_or_context>.xlsx`

### 6.4 خيار «تحديث القائم»

عند وجود درجات سابقة، يجب تفعيل **«تحديث القائم»** في واجهة الاستيراد وإلا يفشل التحقق بـ «الدرجة موجودة مسبقاً».

---

## 7. Risks

| الخطر | الوصف | التخفيف |
|---|---|---|
| **درجات بدون تسجيل مقرر** | المستورد يرفض الصف: «الطالب غير مسجل في هذه المجموعة» | استيراد `student_enrollments` أولاً + Dry Run |
| **اختلاف كود المقرر** | «المقرر غير موجود» أو «لا يوجد إسناد مطابق» | توحيد الأكواد مع `courses.code` و`course_offerings` |
| **اختلاف الرقم الأكاديمي** | «الطالب غير موجود» | مراجعة `student_profiles.academic_number` |
| **عدم وجود مكوّنات درجة** | «مكوّن التقييم غير موجود لهذه المجموعة» | إنشاء `grade_components` قبل الاستيراد |
| **مجموع مكوّنات > 100** | trigger DB يرفض إنشاء مكوّن جديد | توزيع `max_score` بعناية |
| **غياب حالة أكاديمية للفصل** | «لا توجد حالة أكاديمية للطالب في هذا الفصل» | تحديث/استيراد `student_academic_status` للفصل الثاني |
| **استيراد بحالة `approved` مباشرة** | يتجاوز سير الاعتماد الإداري | استخدم `submitted` ثم اعتماد من `/admin/grades` |
| **الفصل غير مربوط بالعام في lookup** | `semestersByCode` عالمي قد يلتقط فصل سنة خاطئة عند تعدد السنوات | التحقق بـ Dry Run؛ مراجعة نتائج التحقق صفاً بصف |
| **الفصل الثاني ليس `is_current`** | لا يؤثر على الاستيراد لكن قد يؤثر على واجهات افتراضية | اختيار `2025-2026` + `second` صراحةً في الفلاتر |
| **بيانات تشغيلية غير مؤكدة** | هذه المرحلة لم تفحص DB الحية | مرحلة لاحقة: `GRADES-DATA-READINESS-CHECK-01` (قراءة فقط على DB) |

---

## 8. Recommended Next Step

| الحالة | المرحلة التالية |
|---|---|
| **المستورد موجود** (الوضع الحالي) | **`PREPARE-GRADES-EXCEL-TEMPLATE-01`** — تجهيز ملف Excel فعلي لكل قسم/برنامج/مستوى للفصل الثاني 2025-2026 وفق القالب الرسمي، مع التحقق من مكوّنات الدرجة والتسجيلات |
| **إن وُجدت فجوات في البيانات الأساسية** | **`PORTAL-DATA-IMPORT-SEQUENCE-01`** أو استيراد تسلسلي: تسجيلات → مكوّنات → درجات |
| **للتحقق من DB الحية دون كتابة** | مرحلة قراءة فقط (counts لعام 2025-2026 / فصل second) — خارج نطاق هذه المرحلة |

**لا يُوصى بـ `GRADES-EXCEL-IMPORTER-01`** — المستورد مبني ويعمل في الكود الحالي.

---

## 9. No-Write Assurance

| بند | الحالة |
|---|---|
| إدخال درجات | **لم يُنفَّذ** |
| تعديل قاعدة البيانات | **لم يُنفَّذ** |
| تشغيل migrations / seed / apply | **لم يُنفَّذ** |
| service role في المتصفح | **لم يُستخدم** |
| commit / push / PR | **لم يُنفَّذ** |
| الملفات المُنشأة | `docs/GRADES-SECOND-SEMESTER-IMPORT-READINESS-01-REPORT.md` فقط |

### Git state at audit

```
Branch: codex/student-requests-workflow-admin
Modified/untracked files present from prior phases — unrelated to this audit.
No new code changes from GRADES-SECOND-SEMESTER-IMPORT-READINESS-01.
```

---

## Appendix: Checklist vs Requirements

| # | المتطلب | النتيجة (كود/schema) |
|---|---|---|
| 1 | وجود العام 2025-2026 | ✅ مُعرَّف في migration seed |
| 2 | وجود الفصل الثاني وربطه بالعام | ✅ `code = second` مربوط بـ `2025-2026` في seed |
| 3 | الطلاب وربطهم بأقسام/برامج/مستويات | ✅ `student_profiles` + `student_academic_status` — يعتمد على بيانات حية |
| 4 | مقررات الفصل الثاني في الخطط | ✅ `study_plan_courses.semester_code` يدعم `second` |
| 5 | تسجيلات الطلاب في مقررات الفصل | ✅ `student_enrollments` + مستورد — يعتمد على بيانات حية |
| 6 | جداول `student_grades` / `grade_components` | ✅ موجودة مع triggers وRLS |
| 7 | صفحة/مستورد Excel في الأدمن | ✅ `/admin/imports` → درجات الطلاب |
| 8 | قالب درجات جاهز | ✅ `template_student_grades.xlsx` |
| 9 | preview/validation قبل الاعتماد | ✅ 6 خطوات + Dry Run + تقرير أخطاء |
| 10 | حالة اعتماد draft/submitted/approved | ✅ (لا `published` — `approved` = ظهور للطالب) |

---

**Final Decision: PASS_WITH_NOTES**
