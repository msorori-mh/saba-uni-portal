# LECTURE-EXECUTION-MVP-01 — متابعة تنفيذ المحاضرات (مصدري فقط)

- **الحالة:** مكتمل كشريحة مصدرية أولى (source-only) — غير مدموج، ولا يُدمج من هذا الفرع.
- **الفرع:** `feat/lecture-execution-mvp-01` (من `main` @ `8f229d09`).
- **النطاق الحصري الملتزم به:** `src/**/lecture-execution*`, `tests/lecture-execution/`, `docs/drafts/*lecture*`, `docs/LECTURE-EXECUTION-*`. لم تُلمس: `routeTree.gen.ts`, `supabase/migrations/`, أي نظام آخر.

## 1. الأساس التعاقدي (العقود المدموجة فقط)

| العقد المدموج | ما بُني عليه |
| --- | --- |
| #150 — canonical current term | الجلسة تخزن `academic_year_id`/`semester_id` صراحة من الـ offering؛ لا استنتاج |
| #152 — portal consumes published schedules | لا يُتتبع إلا `class_schedule.status='published'` على section/offering بحالة `active` |
| #153 — exact section binding, no cohort inference | التفويض بالقسم/الشعبة/المستوى الفعلي فقط؛ لا استدلال على الدفعات |
| #158 — sections legacy source of record | الربط على `course_sections`/`class_schedule` كما هي؛ **لا يُقرأ أو يُفكّك `section_code` إطلاقاً** |

مسودة #149 (cohorts/delivery groups) **غير مدموجة** ولم يُبنَ عليها: لا جداول ولا مراجع لـ delivery_group في أي ملف. إن دُمجت لاحقاً، تبقى `course_section_id` نقطة الارتكاز ويمكن إضافة إسقاط delivery-group في مسودة أمامية لاحقة.

## 2. النموذج

- **أسابيع مرقّمة:** `week_no smallint` بين 1 و30، وحدّ فعلي من الإعدادات (`term_weeks`، افتراضي 15) — قيد فريد `(class_schedule_id, week_no, session_kind)`.
- **نوع المحاضرة:** `theory` (نظرية ↔ `schedule_type='lecture'`) / `practical` (عملية ↔ `'lab'`). `tutorial`/`exam` خارج النطاق — يرفضان بإغلاق.
- **الحالات الثمان:** `executed` نُفِّذت، `hindered` تعذَّرت، `compensated` عُوِّضَت، `cancelled` ملغاة، `scheduled` مجدولة، `in_progress` قيد التنفيذ، `postponed` مؤجَّلة، `not_started` لم تبدأ. دورة حياة مغلقة؛ الحالات النهائية (نُفِّذت/عُوِّضَت/ملغاة) بلا انتقالات خارجة. `domain.ts` و`lecture_execution_transition_allowed()` مرآة لبعضهما.
- **التأكيد المزدوج (D-15 معلق → configurable):** `lecture_execution_settings.delegate_confirmation_enabled` افتراضياً `false`. عند الإيقاف: سجل عضو هيئة التدريس نهائي (`faculty_final`). عند التفعيل (بقرار معتمد منفصل — الجدول RLS + كل الامتيازات مسحوبة، لا مسار كتابة للعميل): كل تسجيل جديد `awaiting_delegate` حتى يؤكد مندوب نشط على المستوى نفسه أو يرفض بملاحظة إلزامية. `confirm_lecture_execution` يرفض بإغلاق برسالة `delegate confirmation is not enabled (D-15 pending)` ما دام معطلاً.
- **الربط:** الجدول المنشور (`class_schedule_id`) + الشعبة (`course_section_id`) + المقرر (`course_id`) + المستوى (`level_id`) + القاعة (`room_id`) + عضو هيئة التدريس (`faculty_profile_id`) + السنة/الفصل — كلها مُلتقطة عند التسجيل من الـ slot نفسه داخل RPC مغلق.

## 3. الواجهات (عرضية فقط — بلا ربط Routes)

بنمط مكونات graduation-projects (لا routeTree): 
- `FacultyExecutionLogCard` — يعرض حالة المحاضرة والانتقالات المتاحة للمسجّل المعيّن على الشعبة نفسها.
- `DelegateConfirmationCard` — طابور تأكيد المندوب؛ يشرح تعليق D-15 بدل أي إجراء عند التعطيل.
- `ExecutionMonitoringReport` — جداول نسب التنفيذ/التسوية بالقسم/المستوى/المقرر لرئيس القسم/العميد.

## 4. مسودة SQL (DRAFT ONLY — DO NOT APPLY)

`docs/drafts/20260722120000_lecture_execution_mvp_01.draft.sql` — أمامية فقط (forward-only)، معاملة واحدة `begin;…commit;` مع رفض إعادة المحاولة الغامضة:

- 5 جداول (settings/sessions/actor_assignments/confirmations/events) + عرض تجميعي `lecture_execution_reporting (security_invoker)`.
- **Composite integrity:** `unique(id, department_id)` على sessions/assignments؛ كل الجداول الابنة (confirmations, events) بمفاتيح أجنبية مركبة `(…, department_id)` لنفس النطاق.
- **RLS:** مفعّلة على الجداول الخمسة + `revoke all` من `anon, authenticated`؛ العرض مسحوب أيضاً؛ لا سياسات = إنكار افتراضي.
- **RPCs مغلقة:** `security definer` + `set search_path = public, pg_temp`؛ التفويض عبر تعيين نشط مباشر بالنطاق الدقيق (recorder=شعبة، delegate=مستوى) — لا ألقاب واسعة. `grant execute` لـ `record_lecture_execution` و`confirm_lecture_execution` فقط على `authenticated`؛ الدوال المساعدة مسحوبة من `public/anon/authenticated`.
- **Events append-only:** triggers تمنع update/delete؛ idempotency عبر `(department_id, correlation_id, event_type)` + no-op طبيعي لإعادة نفس الحالة.
- **Guard هوية التعيين:** null-tolerant (يفحص الملكية/القسم فقط عند وجود عمود الملف المناسب) حتى يسبق قيد `lecture_execution_assignment_subject_shape` (23514) كما هو مقصود.

## 5. التحقق المنفَّذ فعلياً

- **bun test (21/21 أخضر):** `tests/lecture-execution/lecture-execution-foundation.test.ts` (11) + `lecture-execution-sql-draft.test.ts` (10) — عقد المحتوى للمسودة والـ verifier.
- **تنفيذ PostgreSQL حقيقي (PostgreSQL 18 عبر PGlite disposable):** طُبّقت `postgres-minimal-schema.sql` ثم المسودة ثم كل عبارات `postgres-foundation-verifier.sql` الـ64 — **الكل أخضر**: fixture validation، فحوص composite FK، رفض wrong-role (23514 بالاسم)/wrong-owner، رفض anon privileges، رفض غير المعيّن بلا آثار جانبية، مسارات إيجابية record/confirm، idempotency exactly-once، بوابة D-15 المغلقة، رفض الانتقالات غير الصالحة، حد أسابيع الفصل، تطابق النوع مع slot، رفض cross-department FK، append-only update/delete، تجميع العرض وحرمانه من العميل، ثم `rollback;`.
- **tsc --noEmit (strict):** النطاقان `src/lib/lecture-execution` و`src/components/lecture-execution` نظيفان.
- لم يُطبَّق أي SQL على قاعدة المشروع؛ التحقق على قاعدة disposable فقط.

## 6. الفجوات / العمل التالي (خارج هذه الشريحة)

1. تطبيق المسودة فعلياً يتطلب قرار دمج + migration رسمية (مالك آخر) — هذه الشريحة مصدرية فقط.
2. واجهات Routes وربط TanStack Router (`routeTree.gen.ts` محظور هنا) + server functions للقراءة المعتمدة — شريحة لاحقة بعد اعتماد الجداول.
3. إدارة تعيينات recorders/delegates/monitors (مسار إداري معتمد) — الجدول جاهز، واجهة الإدارة ليست ضمن النطاق.
4. D-15: تفعيل `delegate_confirmation_enabled` يتطلب قرار اعتماد المندوبين ثم صف إعدادات (قسمي أو عام) عبر مسار معتمد.
5. سلوك `schedule_type` غير lecture/lab (tutorial/exam) ومراقبة college-wide عبر أقسام متعددة — حالياً dean monitor مقيّد بقسم واحد (fail-closed).
