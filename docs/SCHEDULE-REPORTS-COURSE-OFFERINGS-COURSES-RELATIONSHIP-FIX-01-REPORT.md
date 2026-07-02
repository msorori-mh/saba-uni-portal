# SCHEDULE-REPORTS-COURSE-OFFERINGS-COURSES-RELATIONSHIP-FIX-01

## مكان الخطأ
`src/lib/admin-reports.functions.ts` — دالة `loadScheduleBase` التي تُستخدم من كافة تبويبات تقارير الجداول والإسناد (إسناد المقررات، المقررات غير المسندة، المجموعات، الجداول، القاعات، عبء المحاضرين، التعارضات).

## الاستعلام المسبب
```
supabase.from("course_offerings").select(`
  id, ..., 
  courses(id, code, name_ar, ..., departments(name_ar)),
  programs(...),
  academic_levels(...),
  academic_years(...),
  semesters(...)
`)
```
PostgREST يعتمد على schema cache للـ FK لتوليد الـ embed. لا يوجد قيد FK بين `course_offerings.course_id` و `courses.id` — لذلك رفض PostgREST الاستعلام بالخطأ:
> Could not find a relationship between 'course_offerings' and 'courses' in the schema cache

## هل توجد FK فعلية؟
- `course_offerings.course_id`: عمود موجود ✅ لكن **بدون FK** ❌
- نفس الوضع لبقية العلاقات المتداخلة (تم توحيدها بالربط اليدوي احتياطاً).

## الحل المطبق
تم استبدال الـ embed بجلب مستقل لكل جدول ثم ربطها في الكود عبر `Map<id, row>`:
- `course_offerings`, `courses`, `programs`, `departments`, `academic_levels`, `academic_years`, `semesters`, `faculty_profiles` تُجلب بشكل منفصل.
- يتم بناء نفس شكل البيانات السابق (`offering.courses.departments.name_ar` إلخ) في الذاكرة، فلا حاجة لتعديل أي مستهلك (`offeringMatches`، تقارير غير المسند، المجموعات، القاعات، عبء المحاضرين، التعارضات).

## Migration / DB / RLS / Storage / Trigger
- Migration: **لا**
- تعديل DB: **لا**
- تعديل RLS: **لا**
- تعديل Storage: **لا**
- تعديل Trigger: **لا**

## نتيجة build
`bun run build` → ✅ نجح (13.29s، بدون أخطاء TS/Vite).

## نتيجة تبويب "إسناد المقررات"
الاستعلام لم يعد يعتمد على schema cache للـ FK؛ الخطأ المشار إليه لن يظهر بعد الآن. البيانات (اسم المقرر، كوده، القسم، البرنامج، المستوى، السنة، الفصل، المحاضر، عدد المجموعات، الجلسات، حالة الإسناد) تُبنى من الـ Maps.

## نتيجة بقية تبويبات تقارير الجداول
تستخدم كلها `loadScheduleBase` نفسها بنفس الشكل، والاستهلاك (`offering.courses.*`, `offering.programs.*`, إلخ) لم يتغير → لا كسر.

## القرار
**PASS**
