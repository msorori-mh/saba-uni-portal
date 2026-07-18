# B1-FIVE-SERVICES-PRODUCTION-PREFLIGHT-READONLY-01 — REPORT

**القرار النهائي:** `HOLD_B1_FIVE_SERVICES_PRODUCTION_PREFLIGHT`

النطاق: `enrollment_suspension`, `excused_absence`, `file_withdrawal`, `department_transfer`, `final_chance`. الست الأخرى تبقى `DEFERRED_USER_LIFECYCLE_INPUT`. لا Migration/SQL كتابي/Publish/Deploy/تعديل بيانات — قراءة فقط.

---

## 1) هوية البيئة

| البند | القيمة |
|---|---|
| قاعدة البيانات | `postgres` على Supabase production (IPv6 مطابق لعنوان مشروع `wpmicqriltrowwonknox`) |
| نسخة PostgreSQL | 17.6 |
| وقت الفحص | 2026-07-18 22:38 UTC |
| Lovable project | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| اتصال ببيئة أخرى | لا يوجد |

`supabase_migrations` مقفل عن أدوات القراءة الحالية → لا يمكن جلب سجل الـmigrations رسمياً من هذه الجلسة، لذا الحكم على تطبيق كل ملف يعتمد على الأثر (كائنات/دوال/تريجرات) في المخطط العام.

## 2) الإصدار / release evidence

- SHA المتوقعة لـ `origin/main`: `e592ee9788cc163437badc13c60af03b3fe3d783` (PR #162 + PR #163 المذكورة في التوجيه).
- STAMP draft ثابت على `APPROVED_RELEASE_COMMIT_PLACEHOLDER` (SHA255 = `893a2979…cf357` مطابق).
- Deployed SHA من Lovable: **غير قابل للتثبيت من هذه الجلسة** → لا يمكن مطابقته مع الـatomic caller المعتمد.
- النتيجة: **`HOLD_ORDER_1_RELEASE_EVIDENCE`** (فشل بوابة الترتيب #1 لجميع الخدمات الخمس).

## 3) Migration history / أثر التطبيق

SHA-256 لكل ملف من ملفات B1 السبعة عشر تطابق `docs/B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md` بدون فرق. حالة كل ملف مقابل الإنتاج:

| # | الملف | الحالة |
|---|---|---|
| 1 | REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | not_applied (placeholder) |
| 2 | STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | not_applied (لا `_b1_*` ولا `assert_workflow_step_actor_authorized`) |
| 3 | REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | **applied** (كل الوحدات/الأدوار موجودة) |
| 4 | REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | not_applied |
| 5 | EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | not_applied |
| 6 | STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | جزئي: bucket + 6 سياسات `sra_*` موجودة (سبب already exists عند إعادة التنفيذ) |
| 7 | REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | not_applied |
| 8 | REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | not_applied |
| 9 | REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | not_applied |
| 10 | REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | not_applied |
| 11 | REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | not_applied |
| 12 | FINAL-CHANCE-CANONICAL-WRITE-03.sql | not_applied |
| 13 | REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | not_applied |
| 14 | REQUEST-B1-SERVICE-DETAILS-05A.sql | not_applied |
| 15 | B1-FREE-SERVICE-WORKFLOWS-08.sql | not_applied |
| 16 | EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | not_applied |
| 17 | REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | not_applied |

لا تعارض بأسماء أخرى أو SHA مختلفة رُصد.

## 4) Schema / dependency inventory

| كائن | وجود | ملاحظة |
|---|---|---|
| `public.log_audit(6-arg, 7-arg)` | نعم | overload مزدوج (سبب فشل `cancel_official_document`) |
| `public.student_requests` وأعمدة workflow (`current_step_index`, `current_role_key`, `current_assignee_id`) | نعم | ✅ |
| `public.request_type_workflows / _steps / _transitions` | نعم | ✅ |
| `public.student_request_workflow_steps / _events` | نعم | ✅ |
| `public.student_request_attachments` | نعم | ✅ |
| `public.student_request_fee_assessments`, `service_windows`, `parallel_group*` | نعم | ✅ |
| `enrollment_suspension_details` | نعم | ✅ |
| `absence_excuse_details` | نعم | ✅ (الاسم القانوني، ليس `excused_absence_details`) |
| `transfer_request_details` | نعم | ✅ |
| `extra_chance_details` | نعم | يُتوقع أن `final_chance` يعيد الكتابة عبر `FINAL-CHANCE-CANONICAL-WRITE-03` |
| `enrollment_reinstatement_details` | نعم | ✅ |
| `file_withdrawal_details` | **لا** | جدول Migration `REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A` سينشئه |
| Helpers: `_b1_atomic_caller_release_commit`, `_b1_assert_actor_authorized`, `_b1_step_tuple`, `assert_workflow_step_actor_authorized`, `validate_*_details` | **لا** | لم تُطبق أي migration تنشئها |
| Extensions المطلوبة (`pgcrypto`, `pgjwt` وقت اللزوم) | مفعّلة (المشروع افتراضياً) | ✅ |

جميع SECURITY DEFINER القائمة على `log_audit` سليمة (مالك postgres/service_role حسب البيانات المتاحة). لا خرق owners واضح.

## 5) Idempotency و trigger check

- **secure attachments already exists**: bucket `student-request-attachments` (private) + 6 سياسات `sra_*` موجودة بالفعل في الإنتاج → المهاجرة يجب أن تعمل بمنطق `CREATE POLICY IF NOT EXISTS` أو `DROP … IF EXISTS` قبل الإنشاء وإلا ستفشل. الحالة الفعلية: policies موجودة، اسم Bucket صحيح، `public=false`، عدد الملفات = 3.
- **CANONICAL_ABSENCE_REASON_TRIGGER_MISMATCH**: `absence_excuse_details` تحتوي فقط تريجر `trg_aed_updated_at` (updated_at). لا يوجد أي تريجر يقيّد `reason_code` حالياً. المهاجرة `REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A` ستنشئ التريجر القانوني. لا "mismatch" حقيقي في الإنتاج — عبارة الرسالة تصف تعارضاً محتملاً لو أُعيد التنفيذ بعد نسخة سابقة. الحكم على `excused_absence`: **لا HOLD_TRIGGER_DEFINITION_MISMATCH** (لا يوجد تعريف مسبق ليختلف).

## 6) Processing-domain identities

الوحدات التسع والأدوار الـ11 كلها `is_active=true`. التعيينات النشطة (13):

| الدور | الوحدة | الاسم | البريد | القسم |
|---|---|---|---|---|
| registrar_general | registrar | عبدالله طعيمان | toaiman@usr.edu.ye | — |
| student_affairs_manager | student_affairs | ياسمين الولص | yasmin@usr.edu.ye | — |
| student_affairs_specialist | student_affairs | هيثم الشبلي | hitham@usr.edu.ye | — |
| graduate_affairs_manager | graduate_affairs | محمد شوقي | shuki@usr.edu.ye | — |
| graduate_affairs_specialist | graduate_affairs | صالح علي | saleh@usr.edu.ye | — |
| library_officer | library | ناجي الروقي | naji@usr.edu.ye | — |
| labs_manager | labs | محمد حيدر | mohammed@usr.edu.ye | — |
| archive_officer | archive | محمد امين | mameen@usr.edu.ye | — |
| revenue_finance_officer | finance | فارس اليوسفي | fares@usr.edu.ye | — |
| dean | dean | أ.م.د. مقبول قايد عبده الكامل | — | — |
| department_head | department | د. رمزي حميد الجابري | — | قسم نظم المعلومات الحاسوبية |
| department_head | department | د. خالد قاسم محمد البراحي | — | قسم تكنولوجيا المعلومات |
| department_head | department | د. اسامه عبدالجليل احمد سيف | — | قسم تكنولوجيا المعلومات |

**عدد الرؤساء لكل قسم:**

| القسم | رؤساء نشطون |
|---|---|
| قسم علوم الحاسوب | **0** ❌ |
| قسم تكنولوجيا المعلومات | **2** ⚠️ |
| قسم نظم المعلومات الحاسوبية | 1 ✅ |

## 7) Department transfer isolation

- عزل المصدر/الهدف قابل التحقق فقط للأقسام ذات رئيس واحد. أي طلب تحويل يشمل **قسم علوم الحاسوب** لن يجد رئيساً صالحاً على أي طرف → عائق مسدود.
- **قسم تكنولوجيا المعلومات** يمتلك تعيينين نشطين، بينما عقد B1 يفرض «تعيين مباشر واحد لكل خطوة». لا يمكن اختيار الرئيس بشكل حتمي أثناء التشغيل.
- CS + IT هما البلوكر المزدوج لـ `department_transfer`.

## 8) Secure attachments

- Bucket `student-request-attachments`: موجود، `public=false`، فيه 3 ملفات.
- سياسات موجودة: `sra_storage_select_self`, `sra_storage_insert_self`, `sra_storage_delete_self`, `sra_storage_delete_admin`, `sra_storage_update_own`, `sra_storage_select_priv` — جميعها PERMISSIVE على دور `authenticated`.
- لم يُرصد أي سياسة PERMISSIVE واسعة على `anon` تفتح البكت.
- لا يوجد PUBLIC access. أي تعديل مستقبلي على السياسات يستلزم **موافقة تخزين منفصلة**.

## 9) Current workflows & visibility (snapshot)

| service | is_active | student_visible | request_audience | workflow rows |
|---|---|---|---|---|
| enrollment_suspension | true | **false** | active_student | 0 |
| excused_absence | true | **false** | active_student | 0 |
| file_withdrawal | true | **false** | active_student | 0 |
| department_transfer | true | **false** | active_student | 0 |
| final_chance | true | **false** | active_student | 0 |

`student_visible=false` لجميعها → لا تعارض تشغيلي ولا حاجة لتغيير قيمة في هذه المرحلة.

## 10) Safety snapshots

| البند | القيمة (checksum evidence) |
|---|---|
| طلبات لأي من الخدمات الخمس | **0** لكل الخدمات |
| workflow runtime steps مرتبطة | 0 |
| workflow events مرتبطة | 0 |
| مرفقات مرتبطة | 0 |
| protected `93807768-…` | `in_review`, updated `2026-07-13 17:59:19.782271+00` ✅ لم يُلمس |
| protected `9cfd55a4-…` | `completed`, updated `2026-07-16 03:05:57.517147+00` ✅ |
| protected `ec85cca4-…` | `completed`, updated `2026-07-16 04:44:29.338193+00` ✅ |
| `USR-2026-000001` | `archived` ✅ |
| `USR-2026-000002` | `archived` ✅ (لا يزال بانتظار soft-cancel المؤجل) |

## 11) Authorization readiness (planning only)

- لا حسابات اختبارية جديدة أُنشئت. الطالب النظيف المُختار مسبقاً `24220113` صالح لاختبارات نطاق شهادة القيد فقط؛ لخدمات B1 يلزم اختيار طلاب نظيفين لكل خدمة **من مستخدم Registrar بعد اعتماد النطاق**.
- مصفوفة `positive/negative` لكل خدمة قابلة للتشغيل فقط بعد تطبيق `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING` + `REQUEST-B1-ATOMIC-SUBMIT-ACTION-04` + المهاجرات الخاصة بكل خدمة. لن تُشغَّل حالات مغيرة على الإنتاج.

## 12) ترتيب التطبيق وقرار كل خدمة

الترتيب النهائي المؤكد (بدون تطبيق):

1. `enrollment_suspension`
2. `excused_absence`
3. `file_withdrawal`
4. `department_transfer`
5. `final_chance`

| البوابة | enrollment_suspension | excused_absence | file_withdrawal | department_transfer | final_chance |
|---|---|---|---|---|---|
| source_ready | ✅ | ✅ | ✅ | ✅ | ✅ |
| identities_ready | ✅ | ✅ | ✅ | ❌ (CS بلا رئيس، IT برئيسين) | ✅ |
| storage_ready | n/a | n/a | n/a | ⚠️ (bucket جاهز لكن `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A` يفترض حالة نظيفة → موافقة تخزين منفصلة قبل التطبيق) | n/a |
| schema_ready | ✅ (detail موجود) | ✅ (absence_excuse_details موجود) | ❌ (`file_withdrawal_details` غير موجود — ينشئه Migration 10) | ✅ (transfer_request_details موجود) | ⚠️ (`extra_chance_details` موجود، لكن `FINAL-CHANCE-CANONICAL-WRITE-03` يحوّل الكتابة) |
| migration_history_clear | ✅ | ✅ | ✅ | ✅ | ✅ |
| release_evidence_ready | ❌ HOLD_ORDER_1_RELEASE_EVIDENCE | ❌ | ❌ | ❌ | ❌ |
| rpc_matrix_ready | مخطط لا مُنفَّذ | مخطط | مخطط | معطّل بعائق identities | مخطط |
| blockers | release evidence, actor hardening not applied | release evidence, actor hardening not applied | release evidence, actor hardening not applied, file_withdrawal_details missing | release evidence, CS dept head=0, IT dept head=2, storage approval | release evidence, actor hardening not applied, `log_audit` overload ambiguity قد يطال دوال Saga |
| decision | **HOLD** | **HOLD** | **HOLD** | **HOLD** | **HOLD** |

---

## القرار

**`HOLD_B1_FIVE_SERVICES_PRODUCTION_PREFLIGHT`**

**العوائق المشتركة:**
1. STAMP `APPROVED_RELEASE_COMMIT_PLACEHOLDER` غير مستبدل بـ deploy SHA فعلي — بوابة الترتيب #1 مغلقة لجميع الخدمات.
2. `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING` غير مطبق → لا يوجد `assert_workflow_step_actor_authorized` ولا `_b1_step_tuple`.
3. Overload مزدوج على `public.log_audit` (6-arg / 7-arg) — نفس السبب الذي أوقف `cancel_official_document`؛ يجب تحديد نسخة صريحة داخل الـmigrations قبل التطبيق.

**عوائق مستقلة:**
- `file_withdrawal`: جدول التفاصيل غير موجود (سينشأ ضمن Migration 10).
- `department_transfer`: قسم علوم الحاسوب بلا رئيس نشط، قسم تكنولوجيا المعلومات برئيسين نشطين (كسر شرط «تعيين مباشر واحد لكل خطوة»)، ويلزم موافقة تخزين منفصلة لسياسات `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A`.
- `final_chance`: يعتمد على `FINAL-CHANCE-CANONICAL-WRITE-03` مع الحفاظ على قراءة `extra_chance_details` القديمة — يحتاج التحقق بعد إصلاح `log_audit` ambiguity.

**الإجراء التالي المطلوب من الجهة المختصة (خارج نطاق هذه المرحلة):**
- تثبيت deploy SHA فعلي واستبدال placeholder في STAMP draft.
- قرار رئاسة قسم علوم الحاسوب، وتقليل رؤساء IT إلى واحد نشط، أو تعليق `department_transfer` مؤقتاً.
- موافقة تخزين منفصلة لأي تعديل على سياسات `student-request-attachments`.
- إصلاح log_audit ambiguity (اختيار overload واحد أو casts صريحة داخل الاستدعاءات).

**الأثر الإنتاجي لهذه المرحلة:** صفر — قراءة فقط، بدون Migration/SQL/تعديل بيانات/Publish/Deploy. جميع الطلبات والوثائق المحمية لم تُلمس، `student_visible` لم يتغير، لا bucket/policy جديد.

**الجاهزية الإجمالية لتطبيق B1:** 15% (البنية التحتية للمعالجة جاهزة، لكن كل بوابات إثبات الإصدار وتشديد المُخوِّل وإصلاح log_audit مفتوحة).
