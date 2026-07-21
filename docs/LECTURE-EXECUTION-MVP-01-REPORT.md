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
- **جولات التأكيد مرتبطة بنسخة التسجيل:** التأكيد/الرفض يلتقط `session_version` الجارية، والقيد `unique(session_id, session_version)` يضمن قراراً واحداً لكل نسخة. التسجيل المرفوض يُصحَّح بإعادة تسجيل (نفس الحالة) فتُرفع النسخة وتُفتح جولة تأكيد جديدة، ويبقى قرار النسخة السابقة تأريخاً غير قابل للتعديل — لا deadlock ولا 23505.
- **الربط:** الجدول المنشور (`class_schedule_id`) + الشعبة (`course_section_id`) + المقرر (`course_id`) + المستوى (`level_id`) + القاعة (`room_id`) + عضو هيئة التدريس (`faculty_profile_id`) + السنة/الفصل — كلها مُلتقطة عند التسجيل من الـ slot نفسه داخل RPC مغلق.

## 3. الواجهات (عرضية فقط — بلا ربط Routes)

بنمط مكونات graduation-projects (لا routeTree):
- `FacultyExecutionLogCard` — يعرض حالة المحاضرة والانتقالات المتاحة للمسجّل المعيّن على الشعبة نفسها، وملاحظة إعادة التقديم عند رفض المندوب.
- `DelegateConfirmationCard` — طابور تأكيد المندوب؛ يشرح تعليق D-15 بدل أي إجراء عند التعطيل.
- `ExecutionMonitoringReport` — جداول نسب التنفيذ/التسوية بالقسم/المستوى/المقرر لرئيس القسم/العميد.

## 4. مسودة SQL (DRAFT ONLY — DO NOT APPLY)

`docs/drafts/20260722120000_lecture_execution_mvp_01.draft.sql` — أمامية فقط (forward-only)، معاملة واحدة `begin;…commit;` مع رفض إعادة المحاولة الغامضة:

- 5 جداول (settings/actor_assignments/sessions/confirmations/events — بهذا الترتيب لإتاحة FK المركب) + عرض تجميعي `lecture_execution_reporting (security_invoker)`.
- **Composite integrity:** `unique(id, department_id)` على assignments/sessions؛ كل المراجع الابنة بمفاتيح أجنبية مركبة `(…, department_id)` لنفس النطاق: confirmations→sessions+assignments، events→sessions+assignments، sessions→assignments عبر `recorded_by_assignment_id`.
- **RLS:** مفعّلة على الجداول الخمسة + `revoke all` من `anon, authenticated`؛ العرض مسحوب أيضاً؛ لا سياسات = إنكار افتراضي.
- **RPCs مغلقة:** `security definer` + `set search_path = public, pg_temp`؛ التفويض عبر تعيين نشط مباشر بالنطاق الدقيق (recorder=شعبة، delegate=مستوى) — لا ألقاب واسعة، ولا دوال مساعدة ميتة. `grant execute` للـ RPCين فقط على `authenticated`.
- **حُرّاس NULL صريحون** برسائل نظيفة قبل أي كتابة: `p_state`/`p_session_kind`/`p_decision`.
- **Events append-only:** triggers تمنع update/delete. نطاق idempotency = `(actor, event_type, correlation)` في الفحص المسبق، ويطابقه قيد `unique(department_id, actor_user_id, correlation_id, event_type)` في اليومية — لا 23505 عبر فاعلين مختلفين.
- **Guard هوية التعيين:** null-tolerant (يفحص الملكية/القسم فقط عند وجود عمود الملف المناسب) حتى يسبق قيد `lecture_execution_assignment_subject_shape` (23514) كما هو مقصود.

## 5. معالجة ملاحظات مراجعة PR #189 (PASS_WITH_NOTES)

| الملاحظة | المعالجة |
| --- | --- |
| MEDIUM-1: unique(session_id) + إعادة الضبط = 23505/deadlock | `unique(session_id, session_version)` + إعادة التسجيل بعد الرفض تفتح جولة جديدة بنسخة مرفوعة (وليست no-op)؛ حالة verifier تثبت: تسجيل → رفض → إعادة تسجيل (v2→v3) → تأكيد جديد ينجح مع بقاء تأريخ الرفض |
| LOW-1: require_lecture_execution_assignment ميتة | حُذفت الدالة وسحوباتها (RPCs تحمل فحص التعيين الدقيق أصلاً) |
| LOW-2: نطاق idempotency | قيد اليومية صار `(department_id, actor_user_id, correlation_id, event_type)` مطابقاً للفحص المسبق + توثيق في كلا RPCين |
| LOW-3: فحوص NULL | حُرّاس صريحون لـ `p_state`/`p_session_kind`/`p_decision` برسائل نظيفة + حالات verifier |
| LOW-4: غياب FK على recorded_by_assignment_id | أُضيف FK مركب `(recorded_by_assignment_id, department_id)` → assignments (أُعيد ترتيب إنشاء الجداول) |
| LOW-5: توسيع verifier | حالات: slot غير منشور، section غير نشط، مسجل بنفس القسم على شعبة أخرى، has_table_privilege للجداول الخمسة (anon+authenticated)، فحص composite FK لـ sessions |

## 6. التحقق المنفَّذ فعلياً (بعد الإصلاحات)

- **bun test (25/25 أخضر):** `lecture-execution-foundation.test.ts` (12) + `lecture-execution-sql-draft.test.ts` (13).
- **تنفيذ PostgreSQL حقيقي (PostgreSQL 18 عبر PGlite disposable):** طُبّقت `postgres-minimal-schema.sql` ثم المسودة ثم كل عبارات `postgres-foundation-verifier.sql` الـ**81** — **الكل أخضر** ثم `rollback;`: fixture validation، composite FKs، wrong-role/wrong-owner، anon function+table privileges، الجداول الخمسة مغلقة، غير المعيّن بلا آثار جانبية، حُرّاس NULL، slot غير منشور/section غير نشط/شعبة أخرى، إيجابيات record/confirm، idempotency exactly-once، بوابة D-15، انتقالات غير صالحة، حد الأسابيع، تطابق النوع، **سيناريو MEDIUM-1 (رفض → إعادة تسجيل → تأكيد بنسخة جديدة + حفظ التأريخ)**، cross-department FKs، append-only، تجميع العرض.
- **tsc --noEmit (strict):** نظيف لنطاقَي lib وcomponents.
- لم يُطبَّق أي SQL على قاعدة المشروع؛ التحقق على قاعدة disposable فقط.

## 7. الفجوات / العمل التالي (خارج هذه الشريحة)

1. تطبيق المسودة فعلياً يتطلب قرار دمج + migration رسمية (مالك آخر) — هذه الشريحة مصدرية فقط.
2. واجهات Routes وربط TanStack Router (`routeTree.gen.ts` محظور هنا) + server functions للقراءة المعتمدة — شريحة لاحقة بعد اعتماد الجداول.
3. إدارة تعيينات recorders/delegates/monitors (مسار إداري معتمد) — الجدول جاهز، واجهة الإدارة ليست ضمن النطاق.
4. D-15: تفعيل `delegate_confirmation_enabled` يتطلب قرار اعتماد المندوبين ثم صف إعدادات (قسمي أو عام) عبر مسار معتمد.
5. سلوك `schedule_type` غير lecture/lab (tutorial/exam) ومراقبة college-wide عبر أقسام متعددة — حالياً dean monitor مقيّد بقسم واحد (fail-closed).
