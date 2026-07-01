# STUDY-PLANS-IMPORT-AUDIT-01 — Current Import Flow Investigation

Project: بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ  
Mode: تحقيق وتحليل فقط. لم يتم تنفيذ import، ولم يتم تعديل production data، ولم تُضف migrations أو schema changes.

## 1. ملخص تنفيذي

استيراد الخطط الدراسية الحالي يعمل من صفحة `/admin/imports` كاستيراد عام لكل صفوف ملف Excel، ويعتمد على أعمدة داخل الصف مثل `program_code`, `course_code`, `level`, `semester`, `prerequisite_course_code`. لا يفرض حالياً سياقاً مسبقاً من الشاشة للقسم أو البرنامج أو الفصل، باستثناء سياق الطلاب الذي أضيف سابقاً ولا ينطبق على `study_plans`.

فشل استيراد خطة برنامج تكنولوجيا المعلومات IT سببه المباشر أن validator يستلزم وجود كل `course_code` وكل `prerequisite_course_code` مسبقاً في جدول `courses`. من الأكواد التي تم فحصها read-only، الموجود حالياً فقط هو `AI211`، بينما بقية الأكواد المذكورة غير موجودة.

تم تجهيز ملف Excel محلي للمقررات الناقصة المؤكدة فقط:

`/workspace/it_missing_courses_import_template.xlsx`

هذا الملف يحتوي ورقة `Courses` مطابقة لقالب استيراد المقررات، وورقة مراجعة للمتطلبات السابقة. لم يتم تنفيذ أي استيراد.

**القرار:** `BLOCKED`

السبب: ملف المقررات الجاهز يغطي 7 مقررات مؤكدة، لكن الخطة ستظل معرضة للفشل إذا بقيت المتطلبات السابقة `IT323` و`IT333` غير موجودة أو غير مؤكدة الاسم. كما يجب تعديل ملف الخطة لإزالة `All` من `prerequisite_course_code`.

## 2. الملفات التي تم فحصها

| المجال | الملفات |
|---|---|
| صفحة الاستيراد | `src/routes/admin/imports.tsx` |
| قوالب الاستيراد | `src/lib/imports/templates.ts`, `src/lib/imports/master-templates.ts` |
| validators | `src/lib/imports/validators.ts` |
| server import functions | `src/lib/imports.functions.ts`, `src/lib/imports/bulk-import-validation.server.ts` |
| import engine | `src/lib/imports/engine.server.ts`, `src/lib/imports/lookups.ts`, `src/lib/imports/types.ts` |
| صفحة الخطط والمقررات | `src/routes/admin/study-plans.lazy.tsx` |
| دوال الخطط والمقررات | `src/lib/admin-study-plans.functions.ts` |
| schema types | `src/integrations/supabase/types.ts` |

## 3. الجداول التي تم فحصها

تم فحص schema والكود وقراءات read-only من الجداول التالية:

- `departments`
- `programs`
- `courses`
- `study_plans`
- `study_plan_courses`
- `academic_levels`
- `academic_years`
- `semesters`

ملاحظة مهمة: جدول `departments` لا يحتوي `code`. الربط الحالي في imports يستخدم `department_code` كاسم القسم العربي/الإنجليزي كما هو مسجل، وليس كوداً مستقلاً.

## 4. كيف يعمل استيراد الخطط حالياً

### الواجهة

في `/admin/imports` يوجد تبويب:

`study_plans` — `الخطط الدراسية`

عند اختيار التبويب:

1. زر `تنزيل القالب` يستدعي `downloadTemplate(tab)`.
2. رفع Excel يستدعي `parseExcel`.
3. يتم إرسال الصفوف إلى `validateBulkImportPreview`.
4. الخادم ينفذ `previewBulkImportValidation`.
5. عند التنفيذ، `runBulkImport` يعيد التحقق عبر `revalidateBulkImportRows`.
6. ثم يستدعي `importStudyPlans`.

لا توجد حالياً بطاقة إعداد سياق للخطط شبيهة ببطاقة استيراد الطلاب. لا يطلب النظام اختيار القسم/البرنامج/الفصل قبل رفع خطة دراسية.

### القالب الحالي

قالب `study_plans` في `src/lib/imports/templates.ts` يحتوي:

```text
program_code
plan_name
version
course_code
level
semester
required
prerequisite_course_code
sort_order
```

القالب يعتمد على:

- `program_code` وليس `program_id`.
- `course_code` وليس `course_id`.
- `level` داخل الصف.
- `semester` داخل الصف.
- `prerequisite_course_code` داخل الصف.

لا يوجد:

- `department_code`
- `department_id`
- سياق من الشاشة للبرنامج أو الفصل.
- `notes` للتعبير عن شرط مثل "All".

### validator الحالي

`validateStudyPlans` يقوم بـ:

- التحقق من `program_code` عبر `lookups.programsByCode`.
- التحقق من `course_code` عبر `lookups.coursesByCode`.
- التحقق من `level` عبر `levelsByNumber` أو `levelsByName`.
- التحقق من `prerequisite_course_code` إذا كان غير فارغ عبر `coursesByCode`.
- اعتبار `semester` فارغاً = `first`.
- منع تكرار نفس المقرر داخل نفس الخطة بالـ key:
  `program_id | plan_name | version | course_id`

أي قيمة غير موجودة في `courses` ستفشل preview قبل التنفيذ.

### import engine الحالي

`importStudyPlans`:

- ينشئ أو يجد `study_plans` بواسطة:
  `program_id + plan_name + version`
- يدرج الصف في `study_plan_courses`:
  - `study_plan_id`
  - `course_id`
  - `level_id`
  - `semester_code`
  - `is_required`
  - `prerequisite_course_id`
  - `sort_order`

لا يوجد update/upsert لمقررات خطة موجودة، ولا يوجد وضع "استبدال خطة" أو "استيراد فصل واحد" واضح.

## 5. كيف يعمل استيراد المقررات حالياً

قالب `courses` يحتوي:

```text
code
name_ar
name_en
credit_hours
theory_hours
practical_hours
department_code
status
```

ملاحظات مهمة:

- `code` و`name_ar` مطلوبان.
- `theory_hours` و`practical_hours` مطلوبان ويجب أن يكونا >= 0.
- `credit_hours` يتم تجاهله فعلياً ويُحسب تلقائياً:
  `theory_hours + ceil(practical_hours / 2)`
- `department_code` يعني اسم القسم كما هو مسجل، وليس كوداً مستقلاً.
- validator يمنع استيراد course code موجود مسبقاً.

## 6. كيف تعمل صفحة الخطط والمقررات الحالية

المسار:

`/admin/study-plans`

الملفات:

- `src/routes/admin/study-plans.lazy.tsx`
- `src/lib/admin-study-plans.functions.ts`

الصفحة تحتوي ثلاث تبويبات:

1. `المقررات`
   - إدارة مباشرة لجدول `courses`.
   - بحث وفلاتر حسب القسم/الحالة/البرنامج/المستوى/الفصل عبر روابط الخطة.
   - CRUD عبر server functions مثل `upsertCourse`, `deleteCourse`.

2. `الخطط الدراسية`
   - إدارة جدول `study_plans`.
   - إنشاء/تعديل خطة:
     - `program_id`
     - `name`
     - `version`
     - `total_credit_hours`
     - `status`
     - `is_active`

3. `مقررات الخطة`
   - إدارة جدول `study_plan_courses`.
   - ربط المقررات بالخطط، المستويات، الفصول.
   - يستخدم `study_plan_id`, `course_id`, `level_id`, `semester_code`.

لا توجد أزرار استيراد داخل هذه الصفحة. الاستيراد يتم من `/admin/imports` فقط.

### ملاحظة ازدواج/تداخل

هناك تداخل وظيفي طبيعي:

- تبويب `المقررات` يدير `courses`.
- تبويب `الخطط الدراسية` يدير `study_plans`.
- تبويب `مقررات الخطة` يدير `study_plan_courses`.
- `/admin/imports` يستطيع إدخال نفس الجداول عبر Excel.

لكن الاستيراد الحالي لا يستفيد من السياق الذي توفره صفحة الخطط والمقررات، ولا يقيّد الاستيراد بالخطة/البرنامج/الفصل المختار.

## 7. البنية الفعلية للجداول

### `departments`

حقول رئيسية:

- `id`
- `name_ar`
- `name_en`
- `is_active`
- `sort_order`

لا يوجد `code`.

### `programs`

حقول رئيسية:

- `id`
- `code`
- `name_ar`
- `department_id`
- `degree_type`
- `years`
- `is_active`
- `status`
- `study_plan` JSON legacy/extra field

### `courses`

حقول رئيسية:

- `id`
- `code`
- `name_ar`
- `name_en`
- `department_id`
- `theory_hours`
- `practical_hours`
- `credit_hours`
- `status`

### `study_plans`

حقول رئيسية:

- `id`
- `program_id`
- `name`
- `version`
- `total_credit_hours`
- `status`
- `is_active`

لا يوجد `academic_year_id`.

### `study_plan_courses`

حقول رئيسية:

- `id`
- `study_plan_id`
- `course_id`
- `level_id`
- `semester_code`
- `is_required`
- `prerequisite_course_id`
- `sort_order`

لا يوجد حقل `notes`.

### `academic_levels`

- `id`
- `name`
- `level_number`
- `status`

### `semesters`

- `id`
- `academic_year_id`
- `name`
- `code`
- `is_current`
- `status`

استيراد الخطط لا يستخدم `semester_id`; يستخدم `semester_code` نصياً داخل `study_plan_courses`.

## 8. منطق الفصل الدراسي

الوضع الحالي:

- الفصل الدراسي داخل صفوف Excel عبر عمود `semester`.
- لا يوجد سياق عام من الشاشة.
- القيم لا تتحقق مقابل جدول `semesters` في validator الخاص بالخطط؛ تُخزن كـ `semester_code` مباشرة.

### التحليل

الأفضل دعم وضعين:

#### أ. استيراد خطة كاملة

يستخدم عندما يحتوي Excel على كل مستويات وفصول الخطة.

الصفوف يجب أن تحتوي:

- `academic_level`
- `semester_code`
- `course_code`
- `required`
- `sort_order`
- `prerequisite_course_code`

السياق من الشاشة يجب أن يحدد:

- القسم
- البرنامج
- اسم الخطة
- إصدار الخطة

ويمنع تغيير `program_code` داخل الملف أو يتجاهله لصالح السياق.

#### ب. استيراد فصل محدد

يستخدم عندما يريد المستخدم استيراد مقررات مستوى/فصل واحد.

السياق من الشاشة يجب أن يحدد:

- القسم
- البرنامج
- الخطة
- المستوى
- الفصل الدراسي

والصفوف يجب ألا تحتاج `program_code` أو `semester` أو `level` إلا اختيارياً للتحقق من التطابق.

### هل يجب تحديد الفصل من الشاشة؟

نعم، إذا كان وضع الاستيراد "فصل محدد".  
أما في وضع "خطة كاملة"، فيجب أن تبقى `level + semester_code` داخل الصفوف مع اختيار البرنامج والخطة من الشاشة.

## 9. سبب فشل استيراد خطة IT

تمت قراءة مرجع `courses` الحالي read-only للأكواد:

```text
IT223, IT343, IT324, IT332, AI313, IT425, IT463, AI211, IT323, IT333
```

الموجود حالياً:

| code | name_ar |
|---|---|
| `AI211` | مقدمة في الذكاء الاصطناعي |

غير موجود حالياً:

| code | الحالة |
|---|---|
| `IT223` | غير موجود |
| `IT343` | غير موجود |
| `IT324` | غير موجود |
| `IT332` | غير موجود |
| `AI313` | غير موجود |
| `IT425` | غير موجود |
| `IT463` | غير موجود |
| `IT323` | غير موجود |
| `IT333` | غير موجود |

الأكواد التي ورد اسمها صراحة في الطلب ويمكن تجهيزها كمقررات:

- `IT223` — التوجيه والتبديل
- `IT343` — التجارة الإلكترونية
- `IT324` — الشبكات اللاسلكية والمحمول
- `IT332` — نظم إدارة قواعد البيانات
- `AI313` — علم البيانات
- `IT425` — إدارة النظم وصيانتها
- `IT463` — مشروع التخرج (2)

متطلبات سابقة ناقصة:

- `IT223` — سيتم حلها إذا استُورد المقرر.
- `AI211` — موجود حالياً.
- `IT323` — غير موجود ويحتاج اسم مقرر موثوق.
- `IT333` — غير موجود ويحتاج اسم مقرر موثوق.

### التعامل مع `All`

لا يجب وضع `All` في `prerequisite_course_code` لأن validator سيبحث عنه كـ course code ويفشل.

التعامل الصحيح:

- اترك `prerequisite_course_code` فارغاً.
- ضع المعلومة كملاحظة خارج نموذج الاستيراد الحالي:
  `يتطلب إكمال جميع مقررات الخطة السابقة`

لكن قالب `study_plans` الحالي لا يحتوي `notes`، لذلك إما:

- لا تُدرجها في Excel الحالي.
- أو يضاف `notes` في تحسين مستقبلي مع دعم validator/import.

### التعامل مع `IT4XX(E)`

هذا يبدو placeholder لمقرر اختياري أو مجموعة اختيارية، وليس course code فعلياً.

الخيارات:

1. لا يستورد كـ `course_code` حتى يتم تعريف مقرر اختياري فعلي.
2. دعم نوع صف خاص في الاستيراد مستقبلاً مثل:
   - elective_group_code
   - elective_group_name
   - required_credits
3. أو إنشاء مقرر اختياري واضح بكود فعلي إذا كانت السياسة الأكاديمية تسمح.

لا ينبغي ترك `IT4XX(E)` كـ `course_code` في الاستيراد الحالي لأنه سيُعامل كمقرر مفقود.

## 10. ملف المقررات الناقصة الجاهز

تم تجهيز ملف محلي:

`/workspace/it_missing_courses_import_template.xlsx`

محتوى ورقة `Courses`:

| code | name_ar | theory | practical | department |
|---|---|---:|---:|---|
| IT223 | التوجيه والتبديل | 2 | 2 | قسم تكنولوجيا المعلومات |
| IT343 | التجارة الإلكترونية | 2 | 2 | قسم تكنولوجيا المعلومات |
| IT324 | الشبكات اللاسلكية والمحمول | 2 | 2 | قسم تكنولوجيا المعلومات |
| IT332 | نظم إدارة قواعد البيانات | 2 | 2 | قسم تكنولوجيا المعلومات |
| AI313 | علم البيانات | 2 | 2 | قسم علوم الحاسوب |
| IT425 | إدارة النظم وصيانتها | 2 | 2 | قسم تكنولوجيا المعلومات |
| IT463 | مشروع التخرج (2) | 0 | 6 | قسم تكنولوجيا المعلومات |

لم يتم تضمين:

- `AI211` لأنه موجود.
- `IT323` و`IT333` لأن اسميهما غير موثقين.

## 11. نقاط الضعف في التصميم الحالي

| الخطر | الوصف |
|---|---|
| ربط الخطة ببرنامج خاطئ | الملف يعتمد على `program_code` داخل كل صف، ولا توجد شاشة سياق تلزم المستخدم بالبرنامج الصحيح. |
| غياب سياق القسم | `department_code` غير موجود في قالب الخطط، رغم أن البرنامج يتبع قسماً. |
| الفصل/المستوى داخل الصف فقط | لا يوجد وضع واضح لاستيراد فصل محدد من الشاشة. |
| أخطاء prerequisites غير ودية | أي نص مثل `All` يفشل كأنه كود مقرر. |
| placeholders غير مدعومة | `IT4XX(E)` لا يمثل مقررًا فعلياً في النظام الحالي. |
| لا يوجد notes | لا يمكن حفظ ملاحظات مثل "يتطلب إكمال جميع مقررات الخطة السابقة". |
| تكرار خطط/إصدارات | import ينشئ/يجد الخطة حسب `program_id + name + version` لكنه لا يوفر سياسة واضحة للاستبدال أو التحديث. |
| تكرار مقررات الخطة | validator يمنع التكرار داخل الملف، لكن التنفيذ يستخدم insert فقط ولا upsert. |
| لا يوجد updateExisting لخطط الدراسة | unlike بعض أنواع structure imports. |

## 12. هل يجب أن يرتبط الاستيراد بالقسم والبرنامج؟

نعم.

الأسباب:

- `programs.code` قد يتكرر نظرياً مستقبلاً أو يخطئ المستخدم في كتابته.
- اختيار القسم يفلتر البرامج ويقلل أخطاء الربط.
- يجعل استيراد الخطة عملية موجهة لسياق واحد بدلاً من ملف حر.
- يتسق مع ما تم عمله سابقاً في استيراد الطلاب context-aware.

## 13. هل يجب تحديد الفصل الدراسي من الشاشة؟

نعم، لكن حسب نمط الاستيراد:

- إذا كان الاستيراد لفصل محدد: نعم، إلزامي من الشاشة.
- إذا كان الاستيراد لخطة كاملة: لا، يجب أن يبقى الفصل داخل كل صف كـ `semester_code`.

التصميم الأفضل هو دعم الوضعين:

1. `full_plan`
2. `single_term`

## 14. التصميم المقترح قبل التنفيذ

### واجهة `/admin/imports` عند اختيار `study_plans`

إضافة بطاقة:

`إعداد استيراد الخطة الدراسية`

الحقول:

1. القسم.
2. البرنامج، مفلتر حسب القسم.
3. اسم الخطة.
4. إصدار الخطة.
5. نمط الاستيراد:
   - خطة كاملة.
   - فصل محدد.
6. إذا فصل محدد:
   - المستوى.
   - الفصل.
7. سياسة التعامل مع الموجود:
   - تحقق فقط.
   - إضافة فقط.
   - تحديث/استبدال لاحقاً بعد تصميم آمن.

### قالب الخطة

#### خطة كاملة

الأعمدة المقترحة:

```text
course_code
academic_level
semester_code
required
prerequisite_course_code
sort_order
notes
```

السياق من الشاشة يوفر:

- program_id
- plan_name
- version

#### فصل محدد

الأعمدة المقترحة:

```text
course_code
required
prerequisite_course_code
sort_order
notes
```

السياق من الشاشة يوفر:

- program_id
- plan_name
- version
- level_id
- semester_code

### التعامل مع المقررات الناقصة

قبل استيراد الخطة:

- preview يجب أن يعرض قائمة course codes الناقصة.
- خيار تنزيل قالب `courses` للمقررات الناقصة فقط.
- لا ينفذ استيراد الخطة إذا كانت هناك مقررات أو prerequisites غير موجودة.

### التعامل مع prerequisites

- قيمة فارغة = لا يوجد متطلب.
- قيمة course code موجودة = ربط مباشر.
- قيم خاصة مثل `All` يجب رفضها برسالة واضحة:
  `All ليست كود مقرر. ضعها في notes أو استخدم سياسة متطلبات خاصة.`

### التعامل مع IT4XX(E)

يجب عدم استيرادها كـ course_code مباشر.

التصميم المستقبلي:

- إما elective group model.
- أو مقرر اختياري فعلي معرف بكود رسمي.

### العلاقة مع تبويبات `/admin/study-plans`

- تبويب `المقررات`: يستخدم لإدارة `courses` أو مراجعة ما تم استيراده من قالب courses.
- تبويب `الخطط الدراسية`: يدير `study_plans` وسياق الخطة.
- تبويب `مقررات الخطة`: يعرض/يعدل `study_plan_courses` الناتجة من الاستيراد.
- `/admin/imports` يجب أن يكون مسار إدخال جماعي لنفس الكيانات، لا منطقاً منفصلاً.

## 15. نطاق PR التنفيذ القادم

مقترح PR القادم:

`IMPORT-STUDY-PLANS-CONTEXT-WIZARD-01`

النطاق:

- توسيع `src/routes/admin/imports.tsx` لإضافة بطاقة سياق للخطط.
- إضافة server function read-only لجلب خيارات الخطط:
  - departments
  - programs
  - levels
  - semesters
  - existing plans
- تعديل `downloadTemplate("study_plans")` لدعم overrides/context.
- تعديل preview المحلي/server-side لحقن السياق والتحقق من mismatch.
- تعديل validator لدعم نمطي:
  - full_plan
  - single_term
- دعم `notes` إن تم اعتماده.
- تحسين رسائل `All` و placeholders.

## 16. هل يحتاج التنفيذ القادم migration؟

غير مؤكد.

لا يحتاج migration إذا:

- اكتفينا بالسلوك الحالي:
  - `study_plans`
  - `study_plan_courses`
  - `prerequisite_course_id`

قد يحتاج migration إذا أردنا:

- تخزين notes على `study_plan_courses`.
- تمثيل elective groups مثل `IT4XX(E)`.
- تمثيل شرط `All` كنمط متطلبات رسمي.

## 17. المخاطر

- إضافة `notes` أو elective groups دون تصميم قد يسبب تكراراً أو نموذجاً غير واضح.
- استيراد خطة كاملة مع update/replace قد يسبب تكراراً أو حذفاً غير مقصود إن لم يصمم بحذر.
- الاعتماد على أسماء الأقسام كـ department_code في القوالب عرضة للأخطاء، ويجب استبداله بسياق من UI كلما أمكن.
- لا ينبغي خلط استيراد courses الناقصة مع import study plan في معاملة واحدة قبل تصميم rollback واضح.

## 18. نتائج التحقق

- لم يتم تنفيذ import.
- لم يتم تعديل production data.
- لم يتم delete/reset/cleanup.
- لم يتم إنشاء migration.
- تم إنشاء ملف Excel محلي فقط:
  - `/workspace/it_missing_courses_import_template.xlsx`
- الملف غير مضاف إلى git.
- `bun run build`: نجح.
- `bun run lint`: فشل بسبب أخطاء Prettier قديمة وواسعة على مستوى المستودع، وليس بسبب هذا التقرير. لم يتم إصلاحها التزاماً بنطاق التحقيق.

## 19. القرار النهائي

`BLOCKED`

سبب الحظر:

1. خطة IT تحتاج أولاً استيراد المقررات المؤكدة الناقصة.
2. `IT323` و`IT333` لا تزال أسماؤهما غير مؤكدة.
3. ملف الخطة يجب تعديله لإزالة `All` من `prerequisite_course_code`.
4. تصميم import study plans يحتاج سياق UI واضح قبل تنفيذ تحسين آمن.
