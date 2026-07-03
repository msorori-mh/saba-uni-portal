# PORTAL-DATA-PREP-01 — تقرير تجهيز بيانات البوابة (Read-only)

## 1. الغرض والنطاق

تقرير تحضيري فقط لمراجعة قوالب الاستيراد الحالية وترتيب تجهيز البيانات قبل بدء أي عملية استيراد فعلية. لم يُنفّذ أي SQL، ولا تعديل قاعدة بيانات، ولا حذف ملفات، ولا استيراد فعلي، ولا نشر، ولا تغيير على الإنتاج.

## 2. القوالب الحالية في النظام

المصدر: `src/lib/imports/templates.ts` وواجهة `/admin/imports` (`src/routes/admin/imports.tsx`).

### 2.1 قوالب متاحة فعلياً للاستيراد (لها قالب + تبويب + مسار تحقق/استيراد)

| # | النوع (ImportType) | التبويب | ملاحظات |
|---|---|---|---|
| 1 | `departments` | الأقسام | كامل |
| 2 | `programs` | البرامج | كامل |
| 3 | `levels` | المستويات الدراسية | كامل |
| 4 | `faculty` | أعضاء هيئة التدريس | كامل |
| 5 | `staff` | الموظفون | كامل |
| 6 | `students` | الطلاب | يدعم سياق `study_system` عبر إعدادات الشاشة (Overrides) |
| 7 | `courses` | المقررات | `credit_hours` يُحسب تلقائياً |
| 8 | `study_plans` | الخطط الدراسية | سياق الخطة (قسم/برنامج/إصدار) يُحدَّد من الشاشة |
| 9 | `course_sections` | مجموعات المقررات | Structure |
| 10 | `student_enrollments` | تسجيلات الطلاب | Structure |
| 11 | `student_grades` | درجات الطلاب | Structure |
| 12 | `student_fees` | رسوم الطلاب | Structure |
| 13 | `student_discounts` | خصومات الطلاب | Structure |
| 14 | `documents` | الوثائق الرسمية | كامل |

### 2.2 تبويبات موجودة بدون قالب Excel قابل للتنزيل من `templates.ts`

| التبويب | الحالة |
|---|---|
| `faculty_accounts` (حسابات أعضاء هيئة التدريس) | تبويب خاص — ليس ضمن `ImportType`، لا يوجد قالب موحّد في `templates.ts` |
| `class_schedule` (الجداول الدراسية) | تبويب خاص — لا يوجد قالب Excel قياسي في `templates.ts`، يستخدم مسار مختلف |

توصية: تُصنَّف حالياً كمسارات خاصة وليست قوالب استيراد قياسية.

## 3. الترتيب الصحيح لتجهيز البيانات (الاعتماديات)

```
1. departments
2. programs                 (يعتمد على departments)
3. levels
4. academic_years + semesters   (مرجعية — تُدار من الإعدادات لا من ملف)
5. faculty                  (يعتمد على departments، programs اختياري)
6. faculty_accounts         (يعتمد على faculty)
7. students                 (يعتمد على departments, programs, levels, years, semesters)
8. courses                  (يعتمد على departments)
9. study_plans              (يعتمد على programs + courses + levels)
10. course_sections         (يعتمد على courses + faculty + years/semesters)
11. student_enrollments     (يعتمد على students + course_sections)
12. student_grades          (يعتمد على student_enrollments + grade_components)
13. student_fees / student_discounts
14. documents
```

الالتزام بهذا الترتيب إلزامي لأن أي كسر يؤدي إلى فشل الـ Foreign Keys والتحقق داخل الاستيراد.

## 4. الحقول المطلوبة لكل نوع (من `src/lib/imports/templates.ts`)

- **departments**: `department_code`, `department_name_ar` (+ `department_name_en`, `description`, `is_active`).
- **programs**: `program_code`, `program_name_ar`, `department_code`, `degree_type` (+ `duration_years`, `is_active`).
- **levels**: `level_code`, `level_name`, `level_number`.
- **faculty**: `employee_number`, `full_name_ar` (+ `department_code`, `program_code`, `academic_rank`, `position_title`, `status`).
- **staff**: `employee_number`, `full_name_ar` (+ `department_code`, `job_title`, `role_type`, `status`).
- **students**: `academic_number`, `full_name_ar`, `department_code`, `program_code`, `academic_level`, `academic_year`, `semester` (+ `study_system`, `status`, `gender`, `create_login`, `must_change_password`).
- **courses**: `code`, `name_ar` (+ `theory_hours`, `practical_hours`, `department_code`, `status`) — `credit_hours` محسوب تلقائياً.
- **study_plans**: `course_code`, `level` (+ `semester`, `required`, `prerequisite_course_code`, `sort_order`) — `program_code`/`plan_name`/`version` من سياق الشاشة.
- **course_sections**: `course_code`, `academic_year`, `semester`, `program_code`, `level`, `section_code` (+ `faculty_employee_number`, `capacity`, `status`).
- **student_enrollments**: `academic_number`, `course_code`, `section_code`, `academic_year`, `semester` (+ `enrollment_status`).
- **student_grades**: `academic_number`, `course_code`, `section_code`, `academic_year`, `semester`, `component_name`, `score` (+ `status`).
- **student_fees**: `academic_number`, `fee_type_code`, `academic_year`, `semester`, `amount` (+ `due_date`, `status`).
- **student_discounts**: `academic_number`, `discount_type_code`, `academic_year`, `semester`, `value` (+ `reason`, `status`).
- **documents**: `academic_number`, `document_type` (+ `issue_date`, `purpose`, `notes`).

## 5. دعم حقل `study_system` في القوالب

| القالب | يدعم `study_system` صراحة؟ | ملاحظة |
|---|---|---|
| students | نعم — عمود `study_system` + Override من إعدادات الشاشة | الوحيد الذي يميّز نظام الدراسة داخل الصف |
| courses | لا | المقرر مشترك افتراضياً |
| study_plans | لا — يميَّز عبر `program_code` + سياق الشاشة | لا يوجد عمود نظام دراسة |
| course_sections | لا | يميَّز عبر `program_code` |
| class_schedule | لا (تبويب خاص) | يميَّز عبر السياق |
| student_enrollments / grades / fees / discounts | لا | يميَّز عبر بيانات الطالب |
| departments / programs / levels / faculty / staff / documents | لا | مرجعية أو مشتركة |

الخلاصة: `study_system` مُدعَم فقط داخل قالب الطلاب. باقي القوالب لا تحمل الحقل صراحة، ما يجعل تمييز نظام الدراسة اعتمادياً على البرنامج/الطالب.

## 6. اشتراط تسمية ملفات البيانات حسب نظام الدراسة

### 6.1 الملفات التي يجب فصلها إلزامياً حسب نظام الدراسة

- **students** — لأن الحقل `study_system` جزء من الصف؛ الخلط يُصعّب المراجعة والتدقيق البشري.
- **study_plans** — الخطة قد تختلف بين النظامين حتى لنفس البرنامج.
- **course_sections** — المجموعات قد تختلف بالسعة/المدرس/الجدول.
- **class_schedule** — يختلف كلياً بين نظامين.
- **student_enrollments / grades / fees / discounts** — يُفضّل فصلها لتسهيل التتبع.
- **courses** — يُفضّل فصلها لو كان هناك مقررات خاصة بنظام دون آخر؛ وإلا فملف مشترك مقبول.

### 6.2 الملفات المشتركة (لا يلزم فصلها)

- `departments`, `programs`, `levels`, `faculty`, `staff`, `documents` (المرجعية).

### 6.3 مخاطر دمج أكثر من نظام دراسة في ملف واحد

- صعوبة المراجعة اليدوية قبل الاستيراد.
- خطر إسناد طالب لنظام دراسة خاطئ عند خطأ في عمود واحد.
- صعوبة التراجع الجزئي (Rollback) عن نظام دراسة واحد.
- تشويش على تقارير التدقيق والـ audit_logs.
- تعذّر تطبيق قواعد رسوم/خصومات مختلفة إن جاءت مختلطة.

### 6.4 صيغة التسمية المعتمدة

```
<entity>_<study_system>_<academic_year_or_context>.xlsx
```

| الكيان | نموذج الاسم المقترح |
|---|---|
| students | `students_regular_2026.xlsx` / `students_parallel_2026.xlsx` |
| courses | `courses_regular.xlsx` / `courses_parallel.xlsx` (أو `courses_shared.xlsx`) |
| study_plans | `study_plans_regular_cs.xlsx` / `study_plans_parallel_cs.xlsx` |
| course_sections | `course_sections_regular_2026_sem1.xlsx` |
| class_schedule | `schedule_regular_2026_sem1.xlsx` |
| student_enrollments | `student_enrollments_regular_2026_sem1.xlsx` |
| student_grades | `student_grades_regular_2026_sem1.xlsx` |
| student_fees | `student_fees_regular_2026_sem1.xlsx` |
| student_discounts | `student_discounts_regular_2026_sem1.xlsx` |
| departments | `departments_shared.xlsx` |
| programs | `programs_shared.xlsx` |
| levels | `levels_shared.xlsx` |
| faculty | `faculty_shared.xlsx` |
| staff | `staff_shared.xlsx` |
| documents | `documents_<context>.xlsx` |

## 7. المخاطر المحتملة قبل الاستيراد

1. **كسر ترتيب الاعتماديات** يؤدي لفشل FK.
2. **خلط أنظمة الدراسة** في ملف واحد (خاصة الطلاب/الخطط/المجموعات).
3. **رموز غير موحّدة** (`department_code` بالعربية، `program_code` بالإنجليزية) — أي تباين بسيط يُسقط الصف.
4. **قيم `All` أو `IT4XX(E)`** في `prerequisite_course_code` غير مسموحة — موثّقة سابقاً في `IT-STUDY-PLAN-DATA-READINESS-01`.
5. **حسابات دخول الطلاب**: `create_login=true` يُنشئ حساباً بكلمة مرور = `academic_number`؛ يجب التأكد قبل التفعيل.
6. **`credit_hours` مُحتسَبة** — أي قيمة يدوية يتم تجاهلها؛ قد يخلق التباس لدى المُعِد.
7. **قوالب بدون Excel** (`faculty_accounts`, `class_schedule`) — تحتاج توثيقاً منفصلاً قبل الاستخدام.
8. **غياب Dry-run صارم** لبعض القوالب الهيكلية قد يجعل التراجع صعباً.
9. **`study_plans` بدون سياق شاشة صحيح** يؤدي لربط الخطة ببرنامج خاطئ.
10. **الملفات الكبيرة** بدون تقسيم قد تُبطّئ التحقق أو تسبب Timeout.

## 8. تحقق حالة صفحة `/admin/imports`

- الصفحة تعرض 16 تبويباً منها 14 قالب Excel قياسي + 2 تبويب خاص (`faculty_accounts`, `class_schedule`).
- كل تبويب قياسي يوفر: تنزيل قالب، رفع، معاينة، تحقق، استيراد، تقرير.
- لا يوجد تمييز بصري صريح داخل الشاشة بين "قابل للتحميل فقط" و"قابل للاستيراد فعلياً"، لأن جميع التبويبات القياسية قابلة للاستيراد فعلياً؛ لكن `faculty_accounts` و`class_schedule` يسلكان مسار مختلف. يُوصى بإضافة شارة توضيحية لاحقاً (خارج نطاق هذه المرحلة).

## 9. تأكيدات السلامة

- لم يُنفّذ أي SQL.
- لم تُعدَّل قاعدة البيانات.
- لم تُنشأ Migration.
- لم يُحذف أي ملف.
- لم يُنفّذ أي استيراد فعلي.
- لم يُنشر أي تحديث.
- لم تُعدَّل الإنتاج.
- لم يُعدَّل أي كود.

## 10. التوصية

**READY FOR NEXT PHASE — PORTAL-DATA-COLLECTION-01**

الانتقال إلى مرحلة جمع البيانات الفعلية من الأقسام الأكاديمية بالترتيب الموضّح في §3، مع الالتزام بصيغة التسمية في §6.4 وفصل ملفات الأنظمة الدراسية للطلاب/الخطط/المجموعات/الجداول/التسجيلات/الدرجات/الرسوم/الخصومات.

## القرار

**PASS**
