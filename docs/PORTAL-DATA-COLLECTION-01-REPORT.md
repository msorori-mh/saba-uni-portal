# PORTAL-DATA-COLLECTION-01 — تقرير مرحلة جمع بيانات البوابة

- الحالة: تخطيط فقط (READ-ONLY)
- التاريخ: 2026-07-03
- المرجع السابق: `docs/PORTAL-DATA-PREP-01-REPORT.md` (PASS)
- صيغة التسمية المعتمدة: `<entity>_<study_system>_<context>.xlsx`

---

## 1. النطاق

إعداد إطار جمع البيانات المطلوبة لتشغيل البوابة، مع تحديد الملفات المطلوبة ومصادرها ونواقصها، **دون تنفيذ أي استيراد فعلي، ودون أي تعديل على قاعدة البيانات أو RLS أو Storage أو Triggers أو Seed**.

---

## 2. الكيانات المطلوبة للبوابة والقوالب المتاحة

القوالب المتاحة حالياً مصدرها `src/lib/imports/templates.ts` وواجهة `/admin/imports`.

| # | الكيان | القالب المتاح | يدعم `study_system` مباشرة؟ | ملاحظة |
|---|--------|---------------|-----------------------------|--------|
| 1 | departments | `departments` | لا (غير مرتبط) | أساس هرمي |
| 2 | programs | `programs` | لا (غير مرتبط) | مرتبط بـ department |
| 3 | levels | `levels` | لا | مرجعي |
| 4 | faculty | `faculty` | لا | يسبق حسابات الأعضاء |
| 5 | faculty_accounts | تبويب خاص (خارج ImportType الأساسية) | لا | يعتمد على وجود faculty |
| 6 | students | `students` | **نعم** (`study_system`) | الكيان المستهدف بالأولوية |
| 7 | courses | `courses` | لا (يفصل عبر السياق) | مطلوب قبل الخطط |
| 8 | study_plans | `study_plans` | لا (السياق من الشاشة) | يعتمد على program + courses |
| 9 | course_sections | `course_sections` | لا | يعتمد على courses + faculty |
| 10 | student_enrollments | `student_enrollments` | لا | يعتمد على students + sections |
| 11 | student_grades / fees / discounts / documents | متاحة | لا | مراحل تشغيلية لاحقة |

**الخلاصة:** جميع قوالب الأولوية الحالية متاحة. `study_system` مدعوم فقط على مستوى الطلاب — باقي الكيانات تُفصل عبر تسمية الملف والسياق المُختار على الشاشة.

---

## 3. أولويات الجمع (المرحلة الحالية)

1. **طلاب تكنولوجيا المعلومات — المستوى الأول — نظام عام (Regular)**
2. **طلاب تكنولوجيا المعلومات — المستوى الأول — نفقة خاصة (Parallel)**
3. باقي الأقسام / المستويات لاحقاً.

نطاق الأرقام الأكاديمية: أرقام تبدأ بـ `26` (دفعة 2026) — يتم التحقق منه عند توفر المصدر.

---

## 4. جدول جمع البيانات

| الكيان | المصدر المتوقع | القالب | النظام الدراسي | البرنامج | المستوى | حالة التوفر | النواقص | اسم ملف الإخراج المقترح |
|--------|---------------|--------|----------------|----------|---------|-------------|---------|--------------------------|
| students | ملف شؤون الطلاب (Excel/PDF) | `students` | regular | IT | 1 | غير مرفق بعد | كل الحقول الإلزامية | `students_regular_information_technology_level_1.xlsx` |
| students | ملف شؤون الطلاب (Excel/PDF) | `students` | parallel | IT | 1 | غير مرفق بعد | كل الحقول الإلزامية | `students_parallel_information_technology_level_1.xlsx` |
| students (بديل موحّد) | نفس المصدر | `students` | mixed → مفصول لاحقاً | ALL | 1 | غير مرفق | — | `students_regular_all_programs_level_1.xlsx` |
| departments | قائمة الأقسام الرسمية | `departments` | — | — | — | متوفرة في النظام غالباً | تأكيد الأكواد | `departments_all.xlsx` |
| programs | لوائح الكلية | `programs` | — | — | — | جزئي | degree_type / duration | `programs_all.xlsx` |
| levels | ثابت | `levels` | — | — | — | معروف | — | `levels_all.xlsx` |
| faculty | مكتب العمادة | `faculty` | — | — | — | غير مرفق | employee_number / rank | `faculty_all.xlsx` |
| faculty_accounts | مشتق من faculty | تبويب خاص | — | — | — | يعتمد على faculty | — | `faculty_accounts_all.xlsx` |
| courses | لوائح الخطة الدراسية | `courses` | — | IT | — | جزئي (خطة IT جاهزة نظرياً) | ساعات نظري/عملي | `courses_information_technology.xlsx` |
| study_plans | لوائح الخطة | `study_plans` | — | IT | 1..4 | جزئي | prerequisites | `study_plans_information_technology_level_1.xlsx` |

---

## 5. الحقول الإلزامية لقالب الطلاب (للتحقق قبل التجهيز)

مطلوبة حسب `templates.ts`:

- `academic_number` (يبدأ بـ 26 للدفعة الحالية)
- `full_name_ar`
- `department_code` = "قسم تكنولوجيا المعلومات والاتصالات"
- `program_code` = `IT`
- `academic_level` = `1`
- `academic_year` = `2025-2026` أو `2026-2027` (يُحدَّد عند التجهيز)
- `semester` = `first`

اختيارية لكن مستحسنة: `full_name_en`, `study_system` (regular/private), `status`, `phone`, `gender`, `national_id`, `create_login`, `must_change_password`.

**تنبيه:** لا تُدخل `email` أو `username` أو `password` أو `user_id` أو `role` — تُنشأ داخلياً.

---

## 6. مراجعة المصادر

- **لم تُرفق أي ملفات مصدر مع هذا الطلب.**
- لم يتم فتح أي مصدر خارجي أو تعديله.
- لم يتم فحص أعمدة فعلية لأي ملف طلاب.

---

## 7. جدول النواقص (Blocking للتجهيز)

| النقص | الأثر | الحل المقترح |
|-------|-------|----------------|
| ملف مصدر طلاب IT المستوى الأول (Regular) | لا يمكن التجهيز | طلب الملف من شؤون الطلاب |
| ملف مصدر طلاب IT المستوى الأول (Parallel) | لا يمكن التجهيز | طلب الملف من شؤون الطلاب |
| تأكيد `academic_year` الرسمي للدفعة | تحديد سياق القالب | تأكيد من العمادة |
| تأكيد أن أرقام `26xxxx` تخص هذه الدفعة حصراً | تصفية الصفوف | تأكيد من شؤون الطلاب |
| قائمة الأقسام والبرامج المعتمدة أكواداً | تعبئة `department_code` / `program_code` | تصدير من `/admin/departments` و `/admin/programs` |

---

## 8. أسماء ملفات الإخراج المقترحة (المرحلة القادمة)

- `students_regular_information_technology_level_1.xlsx`
- `students_parallel_information_technology_level_1.xlsx`
- (اختياري موحّد قبل الفصل) `students_regular_all_programs_level_1.xlsx`

جميعها تتوافق مع الصيغة المعتمدة `<entity>_<study_system>_<context>.xlsx`.

---

## 9. تأكيدات السلامة

- هل تم تنفيذ أي `import`؟ **لا**
- هل تم تعديل DB / RLS / Storage / Triggers / Migrations؟ **لا**
- هل تم إدخال أو حذف بيانات؟ **لا**
- هل تم تعديل منطق الاستيراد أو أعمدة القوالب؟ **لا**
- هل تم نشر أي شيء؟ **لا**

---

## 10. الإجابات المطلوبة

- هل بيانات الطلاب جاهزة للتجهيز؟ **لا** — تحتاج ملف مصدر مرفق أولاً.
- هل توجد نواقص تمنع التجهيز؟ **نعم** — انظر §7 (غياب الملفات المصدر أساساً).
- هل تم تنفيذ أي import؟ **لا**.
- هل تم تعديل DB/RLS/Storage؟ **لا**.

---

## 11. التوصية للمرحلة التالية

**NEEDS_SOURCE_FILES** ← قبل الانتقال إلى `PORTAL-STUDENTS-DATA-PREP-01`.

بمجرد إرفاق ملف طلاب IT المستوى الأول (Regular و/أو Parallel)، تنتقل الحالة تلقائياً إلى:

`PORTAL-STUDENTS-DATA-PREP-01`

---

## القرار

**PASS WITH NOTES** — الإطار جاهز، ولا يمكن التجهيز الفعلي قبل استلام الملفات المصدر.
