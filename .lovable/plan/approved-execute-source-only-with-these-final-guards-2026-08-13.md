# APPROVED — EXECUTE SOURCE-ONLY WITH THESE FINAL GUARDS

1. BASELINE SAFETY

15b980d907381552c296d845150a472509826fda

is the FUNCTIONAL MATERIALS BASE only.

Do NOT reset/revert main to that SHA.

Resolve CURRENT_HEAD immediately before edits and execute on top of it.

Preserve all newer Android / reports / request fixes and unrelated work.

Report:

FUNCTIONAL_BASE_SHA=15b980d907381552c296d845150a472509826fda

STARTING_HEAD=<current HEAD>

ENDING_HEAD=<new HEAD>

2. CDP HELPER CALLER-SAFETY BEFORE REVOKE

Before preparing CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql,

inspect source and production definitions/properties for:

- public.cdp_instantiate_from_syllabus(uuid)

- public.syllabus_approve_version(uuid)

- public.cdp_regenerate_section_plan(uuid)

- public.cdp_section_autoplan(...)

Verify the effective execution context of ALL callers.

Do not revoke authenticated execution in a way that breaks

cdp_section_autoplan or another legitimate internal path.

Target contract:

DIRECT:

student -> DENY

ordinary faculty -> DENY

unrelated staff -> DENY

generic authenticated -> DENY

AUTHORIZED/INTERNAL:

syllabus_approve_version -> PASS

cdp_regenerate_section_plan -> PASS

cdp_section_autoplan -> PASS

If cdp_section_autoplan is SECURITY INVOKER and would break after REVOKE,

harden its internal execution path explicitly rather than preserving broad

EXECUTE on cdp_instantiate_from_syllabus.

No generic authenticated bypass.

3. STUDY-SYSTEM PRODUCTION ORDER — DOCUMENT ONLY NOW

Source behavior:

NULL/blank/unknown section study_system

-> FAIL CLOSED for new material writes.

Do NOT infer both.

For the later Production gate, mandatory order will be:

A. resolve/reimport authoritative study_system for all 8 active sections

B. verify:

   ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0

C. only then apply COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01

D. apply CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01

E. run authorization + syllabus/material E2E

Do NOT perform A-D in this source-only task.

4. EXISTING MATERIALS

Existing historical materials remain readable and are not rewritten.

If their section remains NULL during source testing:

- reading existing material may continue

- any NEW material creation must DENY

- any write path governed by the new derivation trigger must fail closed

  until the section is authoritatively classified

Do not silently mutate [material.study](http://material.study)_system.

5. DELIVERY

Return:

- STARTING_HEAD / ENDING_HEAD

- exact changed files

- updated two migration drafts

- reconciliation report with 8 section IDs

- cdp caller security/execution-context evidence

- direct RPC authorization matrix

- targeted test counts

- tsc result

- ZERO production writes

- ZERO production migrations

- ZERO publish/deploy

Final allowed result:

PASS_COURSE_SYLLABUS_MATERIALS_STUDY_SYSTEM_SOURCE_READY_FOR_PRODUCTION_GATE

Then STOP.إغلاق الحاجزين قبل بوابة الإنتاج — نظام الدراسة + تأمين توليد الخطة

المصدر النهائي المعتمد: `15b980d907381552c296d845150a472509826fda`.
لا كتابة إنتاجية، لا تطبيق Migration، لا نشر ضمن هذه المهمة.

## الحاجز 1 — الفشل المغلق عند مجموعة غير مصنَّفة

الوضع الحالي المؤكد في المصدر: `deriveMaterialStudySystem` يُرجع `both` عندما تكون قيمة المجموعة فارغة، والمسودة تستخدم `COALESCE(v_section_system, 'both')`.

التغيير:

- إزالة الافتراض في الطبقتين: أي مجموعة بقيمة `NULL` أو فارغة أو غير معروفة تُرفض عند إنشاء أو تعديل مادة جديدة برمز `UNKNOWN_SECTION_STUDY_SYSTEM` والرسالة العربية «نظام الدراسة للمجموعة غير محدد».
- `general → general`، `private → private`، `both → both` فقط.
- الصفوف التاريخية في `course_materials` تبقى كما هي وتُقرأ بلا تعديل (تبقى القيم القديمة `regular`/`parallel` مقبولة للقراءة).
- واجهة عضو هيئة التدريس تعرض الرسالة وتعطّل زر الإضافة عندما تكون المجموعة غير مصنَّفة، دون اشتقاق أي قيمة من الطلاب.

## تقرير المطابقة للمجموعات الثماني (قراءة فقط — لا تنفيذ)

قراءة إنتاجية أُجريت الآن، والنتيجة 8 مجموعات بقيمة غير محددة، جميعها نشطة وضمن برنامج «البكالوريوس في تكنولوجيا المعلومات»:


| المجموعة     | المقرر                         | السنة     | الفصل  | مسجلون | مواد |
| ------------ | ------------------------------ | --------- | ------ | ------ | ---- |
| A            | USR02 مهارات اللغة العربية (2) | 2025-2026 | الثاني | 2      | 0    |
| DEMO-FITCS01 | مقدمة في تكنولوجيا المعلومات   | 2026-2027 | الأول  | 1      | 4    |
| DEMO-FITCS02 | تفاضل وتكامل                   | 2026-2027 | الأول  | 1      | 0    |
| DEMO-FITCS03 | برمجة الحاسوب (1)              | 2026-2027 | الأول  | 1      | 0    |
| DEMO-FITCS05 | الرياضيات المتقطعة             | 2026-2027 | الأول  | 1      | 0    |
| DEMO-IT343   | التجارة الالكترونية            | 2026-2027 | الأول  | 1      | 0    |
| DEMO-IT425   | إدارة النظم وصيانتها           | 2026-2027 | الأول  | 2      | 0    |
| DEMO-AI414   | تنقيب البيانات                 | 2026-2027 | الأول  | 1      | 0    |


سيُحفظ هذا الجدول مع معرّفات المجموعات في `docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01.md` كوثيقة قرار فقط. لا تعبئة تلقائية ولا اشتقاق من الطلاب؛ التعبئة تتم لاحقًا عبر استيراد المجموعات المعتمد بقرارك.

## الحاجز 2 — تأمين `cdp_instantiate_from_syllabus`

نتيجة الفحص الإنتاجي (قراءة فقط):

- الدالة موجودة فعلًا في الإنتاج: `public.cdp_instantiate_from_syllabus(uuid)`، `SECURITY DEFINER = true`.
- الصلاحيات الحالية: `postgres=X`, `authenticated=X`, `service_role=X` — أي أن أي مستخدم مسجَّل يستطيع استدعاءها مباشرة، وهي دالة تكتب على خطط التنفيذ بلا أي تحقق من الدور.
- المستدعون في المصدر ثلاثة فقط، وكلهم مؤمَّنون أو داخليون: `syllabus_approve_version` و`cdp_regenerate_section_plan` (كلاهما يتحقق من `auth.uid()` و`syllabus_is_admin`) والمُشغِّل `cdp_section_autoplan`. لا يوجد مستدعٍ من الواجهة يحتاجها كـRPC عام.

المعالجة: Migration تأمين forward-only مستقلة تسحب التنفيذ المباشر من `authenticated` و`anon` و`public` وتُبقي فقط ما يلزم المالك/الخدمة لتشغيل المستدعين المصرَّح لهم. لا إنشاء RPC إداري جديد لأن إعادة التوليد الإدارية متاحة أصلًا عبر `cdp_regenerate_section_plan` المؤمَّنة.

## ملفات Migration (تُحضَّر ولا تُطبَّق)

1. `docs/migration-drafts/COURSE-MATERIALS-STUDY-SYSTEM-CANONICALIZATION-01.sql` — تحديث `course_materials_derive_scope()` ليرفع `UNKNOWN_SECTION_STUDY_SYSTEM` عندما تكون قيمة المجموعة غير محددة، بدل `COALESCE(... ,'both')`. لا إعادة كتابة لأي صف تاريخي.
2. `docs/migration-drafts/CDP-INSTANTIATE-AUTHORIZATION-HARDENING-01.sql` — ملف جديد لسحب صلاحية التنفيذ المباشر.

لن تُعدَّل أي Migration مطبقة سابقًا.

## الاختبارات

تغطية جديدة/محدَّثة في مسارات: التوصيف، خطة التنفيذ، مواد عضو هيئة التدريس، مواد الطالب، الاستيراد، ومصفوفة التفويض السلبية المباشرة:

- مجموعة بلا نظام دراسة ← رفض الإنشاء
- general / private / both ← اشتقاق مطابق
- مادة مرتبطة بمحاضرة ← اشتقاق العنوان والأسبوع ورقم المحاضرة من الخطة الحالية
- جلسة من خطة قديمة أو من مجموعة أخرى ← رفض
- استدعاء مباشر لـ`cdp_instantiate_from_syllabus`: طالب ← رفض، عضو هيئة تدريس عادي ← رفض، موظف غير مختص ← رفض
- مسار اعتماد التوصيف المصرَّح له ← نجاح توليد الخطة

مع `bunx tsc --noEmit` وتشغيل الحزم المستهدفة.

## التسليم

SHA جديد، ملفات معدّلة بالضبط، فروق المسودتين، تقرير المجموعات الثماني، أعداد الاختبارات، وتأكيد صفر كتابة إنتاجية، ثم التوقف عند:
`PASS_COURSE_SYLLABUS_MATERIALS_STUDY_SYSTEM_SOURCE_READY_FOR_PRODUCTION_GATE`