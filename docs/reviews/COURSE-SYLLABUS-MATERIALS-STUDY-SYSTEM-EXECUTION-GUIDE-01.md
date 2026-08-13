# دليل التنفيذ — COURSE-SYLLABUS-MATERIALS-AND-STUDY-SYSTEM-CLOSURE-01

الحالة الحالية: **مصدر جاهز فقط**. لا كتابة إنتاجية، ولا Migration مطبقة، ولا Publish/Deploy.

كل خطوة إنتاجية أدناه تتطلب موافقة صريحة منفصلة، وتُنفَّذ بالترتيب، ولا تُدمج Migration مع أخرى.

---

## البوابة 1 — تحديث المجموعات الثماني عبر الاستيراد

المدخل: `docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01-IMPORT.csv` بعد تعبئة `study_system` واعتماده.

الخطوات:
1. مركز الاستيراد → نوع البيانات: المجموعات (`course_sections`).
2. تفعيل **تحديث القائم (Update Existing)**.
3. تشغيل المعاينة (Dry Run) والتأكد من: 8 صفوف، `rows_updated = 8`، `rows_created = 0`، `rows_failed = 0`.
4. التنفيذ الفعلي بعد موافقتك.

ملاحظة: القيم غير المعروفة أو الفارغة تُرفض في المعاينة قبل أي كتابة.

## البوابة 2 — التحقق: ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0

```sql
SELECT count(*) AS active_sections_with_null_study_system
FROM course_sections cs
JOIN course_offerings co ON co.id = cs.course_offering_id
WHERE cs.status = 'active'
  AND (cs.study_system IS NULL OR btrim(cs.study_system) = '');
```

الشرط: النتيجة = 0. أي قيمة أخرى ⇒ توقف، ولا انتقال إلى Migration A.

تحقق مساند (توزيع القيم بعد التحديث):

```sql
SELECT coalesce(cs.study_system,'(null)') AS study_system, count(*)
FROM course_sections cs WHERE cs.status='active' GROUP BY 1 ORDER BY 1;
```

## البوابة 3 — Migration A: COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01

المصدر: `docs/migration-drafts/COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01.sql` (يُرقَّم زمنيًا كما هو، بدون إعادة صياغة).

النطاق: قيد المفردات على `course_materials.study_system` + دالة `course_materials_derive_scope()` + المشغّل `course_materials_derive_scope_trg`.

## البوابة 4 — Verify A

```sql
-- 1) القيد
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'course_materials_study_system_check';

-- 2) المشغّل
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.course_materials'::regclass
  AND tgname = 'course_materials_derive_scope_trg';

-- 3) خصائص الدالة
SELECT prosecdef, proconfig FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='course_materials_derive_scope';
```

اختبار FAIL CLOSED (داخل معاملة تُلغى): إدراج مادة على مجموعة غير مصنفة يجب أن يفشل بالخطأ `UNKNOWN_SECTION_STUDY_SYSTEM`.

```sql
BEGIN;
-- INSERT INTO public.course_materials(... course_section_id = <مجموعة غير مصنفة> ...);
ROLLBACK;
```

## البوابة 5 — Migration B: CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01

المصدر: `docs/migration-drafts/CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql`، منفصلة تمامًا عن Migration A.

## البوابة 6 — Verify B

```sql
SELECT p.proacl FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='cdp_instantiate_from_syllabus';
```

المتوقع: لا `authenticated=X`، لا `anon=X`، لا مدخل PUBLIC بصيغة `=X/`؛ مع بقاء المالك و`service_role`.

سلامة المسارات الإدارية (يجب أن تبقى موجودة و SECURITY DEFINER بمالك postgres):
`syllabus_approve_version`, `cdp_regenerate_section_plan`, `cdp_section_autoplan`.

مصفوفة سلبية على RPC مباشرة: استدعاء `cdp_instantiate_from_syllabus` بحساب طالب/عضو هيئة تدريس يجب أن يُرفض بـ permission denied.

## البوابة 7 — E2E متكامل

توصيف المقرر → اعتماد النسخة → إنشاء خطة التنفيذ → تسجيل تنفيذ محاضرة → رفع مادة مرتبطة بمحاضرة ومادة عامة → عرض الطالب بحسب نظام دراسته → تنظيف أي بيانات TEST_ONLY مؤقتة مع الإبقاء على DEMO_ONLY.

---

## قواعد ملزمة

- Migration منفصلة لكل غرض؛ لا دمج.
- كل الإصلاحات forward-only؛ لا تعديل Migration مطبقة، ولا reset/cleanup/DELETE.
- لا UPDATE مباشر لقيم المجموعات الثماني خارج مسار الاستيراد.
- لا Publish/Deploy ضمن هذا المسار.
