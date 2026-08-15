# PORTAL_REFORM_P1_STUDENT_SERVICES_SOURCE_CLOSURE_02 — تقرير الإغلاق المصدري

القرار: **PASS_P1_SOURCE_CLOSURE_02** (MIGRATION_APPLY = DENY، لم تُطبّق أي Migration ولم تُكتب أي بيانات إنتاجية).

## 1. الملفات المعدّلة/المضافة

| الملف | الوصف |
| --- | --- |
| `src/components/portal/StudentRequestsPortalSummary.tsx` | إصلاح ازدواج «الخدمات والخدمات الطلابية» |
| `docs/migration-drafts/p1/P1-01-DETAIL-MODELS.sql` | جداول `october_exam_entry_details` و`replacement_card_details` + تطوير `grade_appeal_details` |
| `docs/migration-drafts/p1/P1-02-BACKEND-VALIDATION.sql` | إعادة الحساب الخلفية المرجعية + تفويض الخطوة + بوابة الإيرادات |
| `docs/migration-drafts/p1/P1-03-WORKFLOW-SEEDS.sql` | مسارات حقيقية للخدمات الثلاث + دور `course_instructor` |
| `docs/migration-drafts/p1/P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql` | استبدال إعادة التوزيع النسبي القديمة |
| `src/lib/student-requests/p1/backend-contract.ts` | ترجمة أكواد أخطاء الخادم إلى رسائل عربية + بوابة الإيرادات |
| `src/lib/student-requests/p1/p1-eligibility.functions.ts` | غلاف server functions فوق RPCs المرجعية |
| `src/lib/student-requests/p1/authorization-matrix.ts` | مواءمة الوحدات مع `request_processing_units` الحقيقية |
| `src/lib/student-requests/p1/activation-gate.ts` | إغلاق DETAIL_MODEL/VALIDATION، وبقاء E2E معلقًا |
| `scripts/p1-source-closure-02-pg17/*` | بروفة PostgreSQL 17 معزولة |
| `tests/student-requests/p1/p1-source-closure-02.test.ts` | 18 اختبارًا للعقد والمصفوفة |

## 2. القرار بشأن التظلم القديم — REPLACE

المشغّل القديم `apply_grade_appeal_on_approval` كان يعيد توزيع كل مكوّنات الدرجة نسبيًا عند تحوّل الحالة إلى `approved`. تم رفضه لأنه:

- يولّد قيم مكوّنات لم يقرّرها أحد،
- يعمل على تغيّر حالة بلا ربط بالفاعل ولا سجل قبل/بعد،
- يخلط نطاق تظلم أعمال السنة (P2) بالتظلم الرسمي على النتيجة النهائية (P1).

البديل: `p1_apply_final_result_decision(request, final_result, note)` — مرتبط بخطوة `registrar_apply_result`، ويكتب القيمة السابقة والمعتمدة، ويُسجَّل في `audit_logs`، وغير قابل للتكرار (`ALREADY_APPLIED`)، ولا يمسّ `student_grades` إطلاقًا.

## 3. بوابة الإيرادات

لا بوابة دفع ولا مبالغ ولا عملات داخل البوابة. الخدمة المدفوعة تنتظر تأكيدًا يدويًا خارجيًا من موظف الإيرادات في خطوة `payment_confirmation`؛ الخدمة المجانية لا تملك هذه الخطوة أصلًا ولا يُنشأ لها أي صف مالي وهمي.

## 4. بروفة PostgreSQL 17

`bash scripts/p1-source-closure-02-pg17/run.sh` — عنقود مؤقت معزول، تُحمَّل فيه الملفات الأربعة **حرفيًا** ثم يُعاد تحميلها للتحقق من الـidempotency، ثم تُشغَّل 36 حالة:

- أكتوبر: 5 متبقية → رفض، 4 متبقية → قبول، المستوى الأول → رفض، اختيار مزوّر/فارغ → رفض.
- التحويل: المستوى 4 مسموح، المستوى 1 مرفوض.
- بطاقة بدل فاقد: طالب نشط مسموح، طلب مفتوح مكرر مرفوض، طالب غير نشط مرفوض.
- التظلم: داخل المهلة، حدّ اليوم السابع شامل، بعد المهلة مرفوض، تسجيل طالب آخر مرفوض.
- التفويض: المكلّف مسموح؛ موظف الإيرادات/الأدمن/المجهول/الخطوة غير الحالية/خطوة غير معروفة/زميل بنفس الدور أمام تعيين مباشر → كلها مرفوضة (لا bypass عام).
- الإيرادات: محجوب قبل التأكيد، مفتوح بعده، متخطى للخدمة المجانية.
- النتيجة: تطبيق مُدقّق، idempotent، بلا إعادة كتابة أعمال السنة، وغير المسجل لا يستطيع التطبيق.

النتيجة: `P1_PG17_REHEARSAL_PASS`.

## 5. التحقق

- `bunx tsgo --noEmit` → نظيف.
- `bun test tests/student-requests` → **1093 pass / 0 fail**.
- `git diff --check` → نظيف.
- تثبيت `routeTree` أُعيد بعد التحقق: 150 مسارًا، كلها فريدة، مطالب واحد بـ`/`، والفارق الوحيد هو مسار تقرير المطابقة المعتمد سابقًا.

## 6. المخاطر والمتبقي

- E2E يبقى PENDING لجميع خدمات P1 لأن تطبيق Migration ممنوع في هذه المهمة؛ لا يجوز رفع `student_visible` قبل تطبيق الحزمة وتشغيل مصفوفة RPC الحقيقية على الإنتاج.
- عتبة النجاح المعتمدة في `p1_passed_course_ids` هي 60% من مجموع الدرجات المعتمدة؛ إن كان لدى الكلية سلّم مختلف يجب تثبيته قبل التطبيق.
- خدمة `enrollment_certificate` لم تُمسّ.
