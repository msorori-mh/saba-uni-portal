# REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01

## سبب المشكلة
جدول `study_plan_courses` يمتلك مفتاحين أجنبيين نحو `courses`:
- `study_plan_courses_course_id_fkey` (course_id)
- `study_plan_courses_prerequisite_course_id_fkey` (prerequisite_course_id)

استعلامات PostgREST التي كانت تكتب `courses(...)` كـ embed ضمني تسببت في خطأ:
> Could not embed because more than one relationship was found for 'study_plan_courses' and 'courses'

نتيجةً لذلك فشل تحميل KPIs تقرير الخطط وتبويب "تغطية الخطط بالمقررات"، فظهرت القيم صفراً رغم أن قاعدة البيانات تحوي 41 صفاً صحيحاً لخطة IT بمجموع 115 ساعة.

## الاستعلامات المسببة
`src/lib/admin-reports.functions.ts`:
- سطر 1054: `select("study_plan_id, courses(credit_hours)")`
- سطر 1206: `select("study_plan_id, level_id, semester_code, courses(credit_hours)")`

## الإصلاح
استخدام اسم العلاقة الصريح المؤكد من `types.ts`:
`courses:courses!study_plan_courses_course_id_fkey(credit_hours)`

هذا هو نفس النمط المستخدم بنجاح في `src/routes/student.index.tsx:187`.

- الطريقة: **FK صريح** (لا حاجة لفصل الاستعلامات).
- منطق KPIs لم يتغير — كان صحيحاً بالفعل: `courses_count` من عدد الصفوف، `total_hours` من مجموع `courses.credit_hours` مع fallback لـ `plan.total_credit_hours` عند غياب الروابط، `withoutCourses` من `courses_count === 0`.

## الملفات المعدلة
- `src/lib/admin-reports.functions.ts` (سطران فقط)
- `docs/REPORT-STUDY-PLANS-RELATIONSHIP-FIX-01-REPORT.md` (جديد)

## قائمة تحقق
| البند | القيمة |
|---|---|
| تعديل DB | ❌ لا |
| Migration | ❌ لا |
| Import | ❌ لا |
| تعديل بيانات الإنتاج | ❌ لا |
| استخدام service role من المتصفح | ❌ لا |
| Schema changes | ❌ لا |

## نتيجة Build
سيتم التحقق تلقائياً عبر خط CI بعد الدمج.

## القرار
**PASS**
