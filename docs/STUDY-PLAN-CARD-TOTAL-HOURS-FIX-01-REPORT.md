# STUDY-PLAN-CARD-TOTAL-HOURS-FIX-01

## المشكلة
بطاقة الخطة في `/admin/study-plans` كانت تعرض `study_plans.total_credit_hours` مباشرةً، وهو حقل لا يُحدَّث تلقائياً بعد استيراد المقررات، فيظهر 0 ساعة لخطط سليمة (مثل خطة IT بعد استيرادها بـ 41 مقرراً / 115 ساعة).

## الإصلاح
- `src/lib/admin-study-plans.functions.ts`:
  - أضيفت دالة داخلية `computeHoursForPlans(planIds)` تجمع `courses.credit_hours` عبر العلاقة الصريحة `study_plan_courses -> study_plan_courses_course_id_fkey -> courses`.
  - `listStudyPlans` و`listStudyPlansByProgram` تُرجعان الآن حقلاً محسوباً `computed_credit_hours` لكل خطة، دون تعديل أي بيانات في DB.
- `src/routes/admin/study-plans.lazy.tsx`:
  - نوع `Plan` يشمل `computed_credit_hours?`.
  - البطاقة تعرض `computed_credit_hours` عند وجوده (> 0)، وإلا تعود إلى `total_credit_hours` كـ fallback.

## النتيجة المتوقعة
- خطة IT: 115 ساعة.
- بقية الخطط: لا تتأثر — عند غياب مقررات مربوطة يبقى العرض على `total_credit_hours`.

## الالتزامات
- لا migration.
- لا تعديل schema.
- لا تعديل production data.
- لا import/delete/reset/cleanup.
- استخدام `!study_plan_courses_course_id_fkey` صراحةً لتجنّب غموض العلاقة (منسجم مع PR #75).

## Build
`bun run build` → ✅ نجح.

## القرار النهائي
PASS
