# B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — التحويل بين الأقسام والفرصة الأخيرة: قرار الرسوم لدى مسجل الكلية

- **النطاق:** SOURCE-ONLY. بروفة على عنقود PostgreSQL محلي مؤقت فقط؛ لا شيء طُبِّق على أي قاعدة حقيقية.
- **الفرع:** `feat/b1-paid-services-registrar-fee-decision`
- **المسودة:** `docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql` (معاملة واحدة، لا تُطبَّق من هذا المسار).
- **تتطلب:** حزمة «غياب بعذر» `EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01` مطبَّقة (حالة الإنتاج). لا تمسّ أياً من كائناتها.
- **تحل محل:** `B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01` (السداد الإلزامي). تلك المسودة **لم تُطبَّق** وأُعيدت تسميتها إلى `…SUPERSEDED.NOT_APPLIED.sql` مع حارس يوقفها فوراً إن شُغِّلت، وبروفتها أُدمجت في بروفة هذه الحزمة. (لم تُحذف الملفات: قواعد المشروع تمنع الحذف.)
- **القرار:** المصدر **PASS**. **HOLD** على شرط واحد قبل الدمج والتطبيق: توسيع سطر الاستثناء في `AGENTS.md` (القسم 9).

## 1. الخلاصة

قرار المالك: في «التحويل بين الأقسام» (`department_transfer`) و«الفرصة الأخيرة» (`final_chance`) يقرر **مسجل الكلية** الرسوم **لكل طلب**، تماماً كما في «غياب بعذر»:

- `FEE_REQUIRED` مع **مبلغ للعرض فقط** يظهر للطالب؛ يسدّد الطالب في النظام الجامعي الرئيسي، ثم تؤكد المالية في `payment_confirmation`.
- `FEE_NOT_REQUIRED` مع سبب إلزامي (خدمة مجانية / إعفاء)؛ تُتخطّى `payment_confirmation`.

هذا يستبدل تفرّع `FEE_GREATER_THAN_ZERO` في الإصدار 2 الذي كان يوقف **كل** طلب عند `registrar_apply` (التفاصيل والبرهان في `docs/reviews/B1-PAID-SERVICES-ZERO-FEE-CHECK-01.md`).

## 2. خيار التصميم ولماذا

**طبقة عامة صغيرة للخدمتين** (الخيار «أ»)، مع ترك كائنات «غياب بعذر» المطبّقة كما هي:

- جدول واحد `b1_request_fee_decisions` و RPC واحدة `record_b1_fee_decision` وشرط واحد `B1_FEE_NOT_REQUIRED` يخدم الخدمتين (عمود `service_code`)، بدل نسختين متوازيتين لكل خدمة.
- لم تُعمَّم كائنات «غياب بعذر» ولم تُنقل بياناتها: هي مطبّقة في الإنتاج وتحمل منطقاً خاصاً (الرفض/الإرجاع، نطاق قسم الطالب)؛ إعادة كتابتها مخاطرة بلا فائدة. المسودة تتحقق في نهايتها أن تعريفات دوالها وجدولها وسير عملها لم تتغير.
- رقعتان فقط على المحرّك، كل واحدة سطر إضافي بجوار ما أضافته حزمة «غياب بعذر»، وخاملتان خارج خطوة `registrar_fee_decision`.
- في الواجهة والعقود: عقد واحد `b1-fee-decision-contract.ts` يربط كل خدمة بخطوتها و RPCها، والبطاقة نفسها `B1FeeDecisionCard` للخدمات الثلاث.

## 3. جدول الخطوات

الإصدار الجديد = نسخة مطابقة للإصدار 2 (الوحدات، الأدوار، رموز الإجراءات، نطاقات الأقسام، الأعلام) + خطوة واحدة قبل السداد. كل الخطوات `specific_user` بمكلّف مباشر واحد.

### التحويل بين الأقسام

| # | مفتاح الخطوة | الوحدة / الدور | الإجراء / الكتالوج | ملاحظة |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` / `student_affairs_specialist` | `review` / `REVIEW` | كما كانت |
| 2 | `source_department_head_approval` | `department` / `department_head` (القسم الحالي) | `approve` / `APPROVE` | كما كانت |
| 3 | `target_department_head_approval` | `department` / `department_head` (القسم المطلوب) | `approve` / `APPROVE` | كما كانت |
| 4 | `dean_approval` | `dean` / `dean` | `approve` / `APPROVE` | كما كانت |
| 5 | `registrar_fee_decision` | `registrar` / `registrar_general` | `review` / `REVIEW` — عبر RPC القرار فقط | **جديدة**: «قرار مسجل الكلية بشأن الرسوم» |
| 6 | `payment_confirmation` | `finance` / `revenue_finance_officer` | `confirm_payment` / `PAYMENT_CONFIRMATION` | `can_skip = true` (الوحيدة) |
| 7 | `registrar_apply` | `registrar` / `registrar_general` | `apply_decision` / `APPLY_DEPARTMENT_TRANSFER` | كما كانت |

### الفرصة الأخيرة

| # | مفتاح الخطوة | الوحدة / الدور | الإجراء / الكتالوج | ملاحظة |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` / `student_affairs_specialist` | `review` / `REVIEW` | كما كانت |
| 2 | `manager_review` | `student_affairs` / `student_affairs_manager` | `approve` / `APPROVE` | كما كانت |
| 3 | `dean_decision` | `dean` / `dean` | `approve` / `APPROVE` | كما كانت |
| 4 | `registrar_fee_decision` | `registrar` / `registrar_general` | `review` / `REVIEW` — عبر RPC القرار فقط | **جديدة** |
| 5 | `payment_confirmation` | `finance` / `revenue_finance_officer` | `confirm_payment` / `PAYMENT_CONFIRMATION` | `can_skip = true` (الوحيدة) |
| 6 | `registrar_apply` | `registrar` / `registrar_general` | `apply_decision` / `APPLY_FINAL_CHANCE` | كما كانت |

**الانتقالات بعد العميد (للخدمتين):** العميد ← `registrar_fee_decision` (غير مشروط) · `registrar_fee_decision` ← `payment_confirmation` (الافتراضي) · `registrar_fee_decision` ← `registrar_apply` بشرط `B1_FEE_NOT_REQUIRED` (أولوية 100) · `payment_confirmation` ← `registrar_apply` · `registrar_apply` ← إغلاق. لا يوجد انتقال `skip`، فلا تخطٍّ يدوي لأحد.

**الرفض والإرجاع:** غير متاحين لهاتين الخدمتين اليوم (المنفّذ يرفضهما بـ`B1_ACTION_TYPE_MISMATCH`) و**بقيا كذلك**؛ لم تُضَف أي صلاحية رفض أو إرجاع، والأعلام نُسخت كما هي. مُثبت في البروفة على خطوة القرار.

## 4. قرار الرسوم

- المسجل يسجّل النتيجة عبر `record_b1_fee_decision(step, decision, exemption_reason, note, amount_due)` فقط. الدالة تتحقق من المدخلات، ثم من التفويض بـ`can_current_user_act_on_step` (مطابق تماماً لتنفيذ الخطوة: المكلّف المباشر الوحيد، بلا تجاوز للأدمن أو العميد)، ثم تكتب القرار وتُتم الخطوة وتتحقق أن التوجيه طابق القرار (وإلا تراجع كامل)، ثم حدثاً في سجل الطلب وإشعاراً واحداً.
- **المبلغ (للعرض فقط):** `amount_due numeric(12,2)` — إلزامي، أكبر من صفر، بحد أقصى 9999999.99 وبخانتين عشريتين على الأكثر عند `FEE_REQUIRED`؛ و`NULL` إلزاماً عند `FEE_NOT_REQUIRED`. مفروض في الـRPC وبقيد `CHECK`. كلمة «ريال» ثابتة في النص؛ لا عمود عملة ولا أي حساب.
- **غير قابل للتعديل:** قيد فريد على الطلب وعلى الخطوة، ومشغّل يرفض أي `UPDATE`/`DELETE` وأي إدراج خارج الـRPC.
- **لا إتمام بلا قرار:** المنفّذ العام يرفض إتمام الخطوة بـ`B1_FEE_DECISION_REQUIRED`.
- **المالية لا تؤكد سداداً غير مطلوب:** الخطوة `skipped` فترفض RPC التأكيد بـ`INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP`.
- لا صف في `student_request_fee_assessments`، لا بوابة دفع، لا أرصدة، لا إيصالات.

## 5. الإشعارات

إشعار واحد لطالب الطلب فقط، عبر `create_notification`:

| القرار | العنوان | النص |
|---|---|---|
| `FEE_REQUIRED` | رسوم مستحقة على طلب «اسم الخدمة» | قرّر مسجل الكلية أن طلبك رقم … («اسم الخدمة») يستلزم سداد رسوم الخدمة. المبلغ المستحق: … ريال. سدّد الرسوم في النظام الجامعي الرئيسي، وبعد أن يؤكد موظف الإيرادات الاستلام يُستكمل الطلب. لا يتم أي سداد داخل البوابة. |
| `FEE_NOT_REQUIRED` | لا يلزم سداد رسوم لطلب «اسم الخدمة» | قرّر مسجل الكلية أن طلبك رقم … («اسم الخدمة») لا يستلزم سداد رسوم (خدمة مجانية / إعفاء)، وانتقل الطلب إلى الخطوة التالية لدى مسجل الكلية. |

المُثبت: إشعار واحد بالضبط، للطالب فقط، والمبلغ مذكور مرة واحدة مع «ريال»؛ وإشعار «لا رسوم» بلا أي مبلغ. الطالب يرى القرار في تفاصيل الطلب (`get_b1_fee_decision`: الطالب المالك ومكلّفو خطوات الطلب فقط).

## 6. مصفوفة التفويض

| الخطوة | المسموح له | كيف |
|---|---|---|
| خطوات ما قبل القرار | المكلّف المباشر لكل خطوة (كما في الإصدار 2) | المنفّذ العام |
| `registrar_fee_decision` | مسجل الكلية المعيّن | RPC قرار الرسوم فقط |
| `payment_confirmation` | مسؤول الإيرادات المعيّن | RPC تأكيد السداد فقط، وفقط عند `FEE_REQUIRED` |
| `registrar_apply` | مسجل الكلية المعيّن | `apply_decision` |

**المُثبت عبر RPC مباشرة** (لكل خدمة × لكل فرع):

- على خطوة القرار: 13 هوية أخرى (مجهول، الطالب صاحب الطلب، طالب آخر، أدمن بلا تعيين، مدير شؤون طلاب غير معيّن، ومكلّفو كل الخطوات الأخرى) × (3 قرارات صالحة + 7 إجراءات على المنفّذ + RPC السداد + بوابة التفويض)؛ ثم المسجل نفسه بكل إجراء آخر وبكل مدخل غير صالح، و RPC القرار على كل خطوة أخرى. **186–187 رفضاً لخطوة القرار، بعدها تطابق تام لحالة الطلب وقراره وإشعاراته.**
- عيّنة رفض (5 هويات × 7 محاولات) على كل خطوة أخرى.
- الإجمالي لكل طلب: 326–397 رفضاً، كلها بصفر تغيير، ثم نجاح المكلّف مرة واحدة ومنع الإعادة.

## 7. الطلبات القائمة (in-flight)

- المسودة لا تكتب في `student_requests` ولا في خطوات التشغيل؛ الإصدار 2 يتقاعد دون تعديل صفوفه.
- طلب بدأ على الإصدار 2 يبقى عليه كما هو (مُثبت: مطابق بايتاً، لا يحصل على قرار رسوم، ويبقى عالقاً عند `registrar_apply` كما كان). **المالك أكد أنه لا توجد طلبات حقيقية عالقة في الإنتاج**؛ الفحص المسبق يعرض العدد (`requests_on_the_active_versions`).
- الطلبات الجديدة تُهيَّأ على الإصدار الجديد.

## 8. الكائنات التي تنشئها أو ترقّعها المسودة

**تنشئ:**

- جدول `public.b1_request_fee_decisions` (RLS مفعّل، بلا أي صلاحية لـ`anon`/`authenticated`) + المشغّل `trg_guard_b1_request_fee_decision_write`.
- 4 دوال: `b1_fee_decision_step(uuid)`، `guard_b1_request_fee_decision_write()`، `record_b1_fee_decision(uuid, text, text, text, numeric)`، `get_b1_fee_decision(uuid)` — الأخيرتان فقط ممنوحتان لـ`authenticated`.
- صف كتالوج الشروط `B1_FEE_NOT_REQUIRED`.
- الإصدار التالي من `department_transfer_external_payment_workflow` ومن `final_chance_external_payment_workflow` (خطواتهما، انتقالاتهما، صفوف تثبيت العقد، صف تحقق النشر، صف سجل التغيير).

**ترقّع (نقطة ارتكاز تطابق مرة واحدة بالضبط، وإلا تتوقف المعاملة):**

| الدالة | العلامة | التغيير |
|---|---|---|
| `act_on_b1_student_request_step_atomic` | `B1PFD01:fee-decision-required` | بعد خطّاف «غياب بعذر»: رفض إتمام خطوة القرار بلا قرار مسجّل |
| `evaluate_workflow_transition_condition` | `B1PFD01:fee-not-required-condition` | تنفيذ الشرط `B1_FEE_NOT_REQUIRED` |

**لا تمسّ:** كائنات «غياب بعذر» كلها، `can_current_user_act_on_step`، RPC تأكيد السداد، دوال الأثر الأكاديمي، `request_types`، التعيينات، الطلبات.

## 9. المطلوب في AGENTS.md

الاستثناء الحالي في قسم «الرسوم» مقصور نصاً على «غياب بعذر». هذه الحزمة تعرض المبلغ في خدمتين أخريين بقرار المالك، ولم يعدّل هذا الوكيل `AGENTS.md`. **التعديل المطلوب — سطر واحد، من الجلسة الرئيسية أو المالك:**

- الحالي: `- في خدمة «غياب بعذر» فقط: عند قرار الرسوم يُدخل مسجل الكلية المبلغ المستحق كقيمة للعرض فقط، …`
- المطلوب: `- في خدمات «غياب بعذر» و«التحويل بين الأقسام» و«الفرصة الأخيرة» فقط: عند قرار الرسوم يُدخل مسجل الكلية المبلغ المستحق كقيمة للعرض فقط، …` (بقية السطر والسطر التالي كما هما).

اختبار في الحزمة يفشل ما دام السطر لا يذكر الخدمتين، حتى لا يُدمج المصدر قبل القاعدة.

## 10. المخاطر

| الخطر | الأثر | المعالجة |
|---|---|---|
| رقعة إضافية على المنفّذ الذري | سطح المحرّك | سطر واحد خامل خارج خطوة القرار؛ نقطة ارتكاز مفحوصة؛ بروفة «غياب بعذر» كاملة تُعاد بعد المسودة وتنجح |
| المسجل يُدخل قراراً أو مبلغاً خطأً | غير قابل للتعديل | مقصود (كما في «غياب بعذر»)؛ القرار في سجل الأحداث بالفاعل |
| مسجل الكلية شخص واحد على خطوتين (القرار والتطبيق) | غيابه يوقف الخدمتين | تشغيلي؛ التعيين من لوحة التعيينات |
| طلبات عالقة على الإصدار 2 | تبقى عالقة | المالك أكد عدم وجودها؛ الفحص المسبق يعدّها |
| التراجع يعيد تفعيل الإصدار 2 المعيب | الخدمتان تعودان للتوقف | التراجع لإلغاء هذه الحزمة فقط ثم إصلاح للأمام (القسم 12) |
| تفاصيل الطلب لا تكشف `skipped` | الواجهة تخفي خطوة السداد اعتماداً على القرار | كما في «غياب بعذر» |
| البروفة على PostgreSQL 16 | فرق محتمل مع 17 | ساق CI «b1-paid-services-registrar-fee-decision» |

## 11. إجراء التطبيق

| الملف | النوع |
|---|---|
| `docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.preflight.sql` | قراءة فقط، `SELECT` واحدة ← `ready_to_apply` |
| `docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql` | المسودة (معاملة واحدة) |
| `docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.verify.sql` | قراءة فقط، `SELECT` واحدة ← `applied_correctly` |
| `docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.rollback-by-forward.sql` | مسودة تراجع |

1. سطر `AGENTS.md` (القسم 9)، ثم CI أخضر (`tsc`، الاختبارات، ساق PG 17).
2. **الفحص المسبق:** لا تطبيق إلا إذا `ready_to_apply = true`. الأعمدة المنطقية تحدد الحارس الفاشل؛ `failing_anchors` و`services_with_unexpected_shape` يسمّيان السبب. سجّل `requests_on_the_active_versions` (المتوقع 0) و`request_types_student_visible` و`processing_assignment_count`.
3. الترقية: نسخ المسودة حرفياً إلى `supabase/migrations/<timestamp>_b1_paid_services_registrar_fee_decision_01.sql` بحذف سطر «DRAFT ONLY» فقط. (المسودة قصيرة عمداً لتُنقل عبر لوحة SQL: تُنفَّذ كاملة في معاملة واحدة.)
4. التطبيق في نافذة هدوء؛ أي حارس يفشل يتراجع عن كل شيء.
5. **التحقق اللاحق:** `applied_correctly = true`، `requests_on_the_new_versions = 0`، `fee_decisions_recorded = 0`، وقيم الخطوة 2 كما هي.
6. نشر الواجهة **بعد** نجاح الترحيل مباشرة.
7. E2E بحساب اختبار: الخدمتان × الفرعان.

### الفحص المسبق (قراءة فقط)

```sql
-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — production PRE-FLIGHT.
-- READ-ONLY: one SELECT, no writes. Mirrors every guard and both patch anchors of
-- docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql and returns
-- ONE row. Apply the draft only when `ready_to_apply` is true. A missing core
-- relation or function makes the query fail with its name — also a NO-GO.
WITH anchors(fn, marker, anchor) AS (
  VALUES
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'B1PFD01:fee-decision-required',
      'PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);'),
    ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'B1PFD01:fee-not-required-condition',
      'ELSIF v_code = ''FEE_GREATER_THAN_ZERO'' THEN')
),
anchor_state AS (
  SELECT a.marker, d.def IS NOT NULL AS fn_exists,
         COALESCE(position(a.marker in d.def) > 0, false) AS already_patched,
         CASE WHEN d.def IS NULL THEN 0
              ELSE (length(d.def) - length(replace(d.def, a.anchor, ''))) / length(a.anchor) END AS hits
  FROM anchors a
  LEFT JOIN LATERAL (SELECT pg_get_functiondef(to_regprocedure(a.fn)) AS def) d ON true
),
svc(code, dean_key) AS (VALUES ('department_transfer', 'dean_approval'), ('final_chance', 'dean_decision')),
wf AS (
  SELECT s.code AS service, s.dean_key, w.*
  FROM svc s
  JOIN public.request_types rt ON rt.code = s.code
  JOIN public.request_type_workflows w ON w.request_type_id = rt.id AND w.status = 'active' AND w.is_active
),
shape AS (
  SELECT wf.service, wf.code, wf.version,
    EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
            WHERE s.workflow_id = wf.id AND s.step_key = 'registrar_fee_decision') AS already_published,
    (SELECT string_agg(s.step_key || ':' || s.action_type, '>' ORDER BY s.step_order)
       FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = wf.id
        AND s.step_order >= (SELECT d.step_order FROM public.request_type_workflow_steps d
                              WHERE d.workflow_id = wf.id AND d.step_key = wf.dean_key))
      = wf.dean_key || ':approve>payment_confirmation:confirm_payment>registrar_apply:apply_decision' AS tail_steps_ok,
    NOT EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                WHERE s.workflow_id = wf.id AND (s.can_skip OR s.action_type = 'assess_fee')) AS no_skip_no_assess_fee,
    (SELECT string_agg(ts.step_key || CASE WHEN t.is_default THEN '' ELSE '?' || (t.condition_schema ->> 'code') END,
                       ' ' ORDER BY t.is_default)
       FROM public.request_type_workflow_transitions t
       JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id AND fs.step_key = wf.dean_key
       JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = wf.id AND t.action_result = 'approved')
      = 'payment_confirmation?FEE_GREATER_THAN_ZERO registrar_apply' AS dean_exits_ok,
    (SELECT count(*) FROM public.request_type_workflow_transitions t
      WHERE t.workflow_id = wf.id AND COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) = 1 AS single_condition,
    EXISTS (SELECT 1 FROM public.request_type_workflows o
            WHERE o.request_type_id = wf.request_type_id AND o.code = wf.code AND o.version = wf.version + 1
              AND o.status = 'retired'
              AND EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                          WHERE s.workflow_id = o.id AND s.step_key = 'registrar_fee_decision')) AS rolled_back_version_waiting,
    wf.version = (SELECT max(o.version) FROM public.request_type_workflows o
                   WHERE o.request_type_id = wf.request_type_id AND o.code = wf.code) AS active_is_latest
  FROM wf
),
checks AS (
  SELECT
    (SELECT bool_and(to_regclass(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.request_types', 'public.request_type_workflows', 'public.request_type_workflow_steps',
      'public.request_type_workflow_transitions', 'public.request_type_workflow_change_log',
      'public.request_workflow_publish_validations', 'public.request_workflow_action_catalog',
      'public.request_workflow_transition_condition_catalog', 'public.request_processing_assignments',
      'public.b1_workflow_runtime_contract_snapshot', 'public.student_requests', 'public.student_profiles',
      'public.student_request_workflow_steps', 'public.student_request_workflow_events',
      'public.notifications', 'public.excused_absence_fee_decisions']) x) AS relations_ok,
    (SELECT bool_and(to_regprocedure(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
      'public.evaluate_workflow_transition_condition(uuid,jsonb)',
      'public.can_current_user_act_on_step(uuid,text)', 'public.user_matches_workflow_runtime_step(uuid)',
      'public.is_valid_b1_direct_assignment(uuid,uuid,boolean)',
      'public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)',
      'public.validate_request_workflow_publish(uuid)',
      'public.create_notification(uuid,text,text,text,text,uuid)',
      'public.b1_excused_absence_before_step_action(uuid,text,text)']) x) AS functions_ok,
    position('EAWF01:before-step-action-hook' in pg_get_functiondef(
      to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'))) > 0
      AS excused_absence_package_applied,
    (SELECT bool_and(fn_exists AND (already_patched OR hits = 1)) FROM anchor_state) AS both_patch_anchors_ok,
    (SELECT count(*) = 1 FROM public.request_workflow_action_catalog c
      WHERE c.code = 'REVIEW' AND c.is_active AND c.action_type = 'review' AND c.kind = 'neutral') AS catalog_review_ok,
    (SELECT count(*) = 1 FROM public.request_processing_assignments a
       JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'registrar' AND u.is_active
       JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id
        AND r.code = 'registrar_general' AND r.is_active
      WHERE a.is_active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now())
        AND public.is_valid_b1_direct_assignment(a.id, NULL, false)) AS single_registrar_direct_assignee,
    NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                WHERE c.code = 'B1_FEE_NOT_REQUIRED' AND NOT c.is_active) AS fee_condition_code_free_or_active,
    (SELECT count(*) = 2 FROM public.request_types rt WHERE rt.code IN ('department_transfer', 'final_chance'))
      AS both_request_types_exist,
    (SELECT count(*) = 2 AND bool_and(code = service || '_external_payment_workflow') FROM wf)
      AS single_active_workflow_per_service,
    (SELECT count(*) = 2 AND bool_and(already_published OR rolled_back_version_waiting OR (tail_steps_ok AND no_skip_no_assess_fee AND dean_exits_ok
                                                             AND single_condition AND active_is_latest)) FROM shape)
      AS workflow_shapes_ok
)
SELECT
  c.*,
  (c.relations_ok AND c.functions_ok AND c.excused_absence_package_applied AND c.both_patch_anchors_ok
   AND c.catalog_review_ok AND c.single_registrar_direct_assignee AND c.fee_condition_code_free_or_active
   AND c.both_request_types_exist AND c.single_active_workflow_per_service AND c.workflow_shapes_ok) IS TRUE
    AS ready_to_apply,
  -- informational (do not block the apply)
  (SELECT count(*) = 2 AND bool_and(already_patched) FROM anchor_state)
    AND (SELECT count(*) = 2 AND bool_and(already_published) FROM shape) AS draft_already_applied,
  (SELECT array_agg(marker || ':' || hits ORDER BY marker) FROM anchor_state
    WHERE NOT (fn_exists AND (already_patched OR hits = 1))) AS failing_anchors,
  (SELECT array_agg(service || '=' || code || ' v' || version ORDER BY service) FROM shape) AS active_workflows,
  (SELECT array_agg(service ORDER BY service) FROM shape
    WHERE NOT (already_published OR rolled_back_version_waiting OR (tail_steps_ok AND no_skip_no_assess_fee AND dean_exits_ok
                                      AND single_condition AND active_is_latest))) AS services_with_unexpected_shape,
  (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
     JOIN wf ON wf.id = s.workflow_id) AS requests_on_the_active_versions,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('department_transfer', 'transfer', 'final_chance', 'extra_chance')
      AND r.status::text NOT IN ('completed', 'rejected', 'cancelled', 'draft')) AS open_requests_of_both_services,
  (SELECT array_agg(rt.code || '=' || rt.student_visible ORDER BY rt.code) FROM public.request_types rt
    WHERE rt.code IN ('department_transfer', 'final_chance')) AS request_types_student_visible,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
```

### التحقق اللاحق (قراءة فقط)

```sql
-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — production POST-APPLY verification.
-- READ-ONLY: one SELECT, no writes. Returns ONE row; the apply is good only when
-- `applied_correctly` is true.
WITH svc(code, dean_key) AS (VALUES ('department_transfer', 'dean_approval'), ('final_chance', 'dean_decision')),
wf AS (
  SELECT s.code AS service, s.dean_key, w.*
  FROM svc s
  JOIN public.request_types rt ON rt.code = s.code
  JOIN public.request_type_workflows w ON w.request_type_id = rt.id AND w.status = 'active' AND w.is_active
),
shape AS (
  SELECT wf.service, wf.code, wf.version, wf.published_at,
    (SELECT string_agg(s.step_key || ':' || u.code || '/' || r.code || ':' || s.action_code
                         || CASE WHEN s.can_skip THEN '*' ELSE '' END, '>' ORDER BY s.step_order)
       FROM public.request_type_workflow_steps s
       JOIN public.request_processing_units u ON u.id = s.processing_unit_id
       JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
      WHERE s.workflow_id = wf.id
        AND s.step_order >= (SELECT d.step_order FROM public.request_type_workflow_steps d
                              WHERE d.workflow_id = wf.id AND d.step_key = wf.dean_key))
      = wf.dean_key || ':dean/dean:APPROVE>registrar_fee_decision:registrar/registrar_general:REVIEW'
        || '>payment_confirmation:finance/revenue_finance_officer:PAYMENT_CONFIRMATION*'
        || '>registrar_apply:registrar/registrar_general:'
        || CASE wf.service WHEN 'department_transfer' THEN 'APPLY_DEPARTMENT_TRANSFER' ELSE 'APPLY_FINAL_CHANCE' END
      AS tail_steps_exact,
    (SELECT string_agg(s.step_key, '>' ORDER BY s.step_order) FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = wf.id)
      = (SELECT string_agg(k, '>' ORDER BY o) FROM (
           SELECT o.step_key AS k, o.step_order * 10 AS o
           FROM public.request_type_workflow_steps o
           JOIN public.request_type_workflows ow ON ow.id = o.workflow_id
             AND ow.request_type_id = wf.request_type_id AND ow.code = wf.code AND ow.version = wf.version - 1
           UNION ALL
           SELECT 'registrar_fee_decision', o.step_order * 10 - 5
           FROM public.request_type_workflow_steps o
           JOIN public.request_type_workflows ow ON ow.id = o.workflow_id
             AND ow.request_type_id = wf.request_type_id AND ow.code = wf.code AND ow.version = wf.version - 1
           WHERE o.step_key = 'payment_confirmation') x) AS previous_steps_kept_in_order,
    (SELECT string_agg(fs.step_key || '-' || t.action_result || '-' || COALESCE(ts.step_key, '')
                         || CASE WHEN t.is_default THEN '' ELSE '?' || (t.condition_schema ->> 'code') END, ' '
                       ORDER BY fs.step_order, t.is_default DESC)
       FROM public.request_type_workflow_transitions t
       JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
       LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = wf.id
        AND fs.step_order >= (SELECT d.step_order FROM public.request_type_workflow_steps d
                               WHERE d.workflow_id = wf.id AND d.step_key = wf.dean_key))
      = wf.dean_key || '-approved-registrar_fee_decision registrar_fee_decision-reviewed-payment_confirmation'
        || ' registrar_fee_decision-reviewed-registrar_apply?B1_FEE_NOT_REQUIRED'
        || ' payment_confirmation-payment_confirmed-registrar_apply registrar_apply-applied-' AS tail_transitions_exact,
    (SELECT count(*) FILTER (WHERE COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) = 1
        AND count(*) FILTER (WHERE t.action_result IN ('skip', 'reject', 'return')) = 0
       FROM public.request_type_workflow_transitions t WHERE t.workflow_id = wf.id) AS one_condition_no_skip_edge,
    (SELECT count(*) FROM public.b1_workflow_runtime_contract_snapshot c WHERE c.workflow_id = wf.id)
      = (SELECT count(*) FROM public.request_type_workflow_steps s WHERE s.workflow_id = wf.id) AS contract_pinned,
    EXISTS (SELECT 1 FROM public.request_workflow_publish_validations v WHERE v.workflow_id = wf.id AND v.is_valid)
      AND EXISTS (SELECT 1 FROM public.request_type_workflow_change_log l
                  WHERE l.workflow_id = wf.id AND l.change_kind = 'workflow_published') AS publish_recorded,
    (SELECT count(*) = 1 AND bool_and(o.status = 'retired' AND NOT o.is_active)
       FROM public.request_type_workflows o
      WHERE o.request_type_id = wf.request_type_id AND o.code = wf.code AND o.version = wf.version - 1)
      AS previous_version_retired,
    NOT EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                JOIN public.student_requests r ON r.id = s.student_request_id
                WHERE s.workflow_id = wf.id AND r.submitted_at < wf.published_at) AS no_existing_request_moved
  FROM wf
),
fns(sig, exposed) AS (
  VALUES ('public.b1_fee_decision_step(uuid)', false),
         ('public.guard_b1_request_fee_decision_write()', false),
         ('public.record_b1_fee_decision(uuid,text,text,text,numeric)', true),
         ('public.get_b1_fee_decision(uuid)', true)
),
markers(fn, marker) AS (
  VALUES ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'B1PFD01:fee-decision-required'),
         ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'B1PFD01:fee-not-required-condition'),
         ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook'),
         ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition')
),
checks AS (
  SELECT
    (SELECT count(*) = 2 AND bool_and(code = service || '_external_payment_workflow') FROM shape)
      AS single_active_workflow_per_service,
    (SELECT bool_and(tail_steps_exact) FROM shape) AS fee_step_before_payment_exact,
    (SELECT bool_and(previous_steps_kept_in_order) FROM shape) AS previous_steps_kept_in_order,
    (SELECT bool_and(tail_transitions_exact AND one_condition_no_skip_edge) FROM shape) AS transitions_exact,
    (SELECT bool_and(contract_pinned) FROM shape) AS runtime_contract_pinned,
    (SELECT bool_and(publish_recorded) FROM shape) AS publish_recorded,
    (SELECT bool_and(previous_version_retired) FROM shape) AS previous_versions_retired,
    (SELECT bool_and(no_existing_request_moved) FROM shape) AS no_existing_request_moved_to_new_versions,
    (SELECT count(*) = 1 FROM public.request_workflow_transition_condition_catalog c
      WHERE c.code = 'B1_FEE_NOT_REQUIRED' AND c.is_active) AS fee_condition_in_catalog,
    (SELECT bool_and(to_regprocedure(sig) IS NOT NULL) FROM fns) AS four_new_functions_exist,
    (SELECT bool_and(has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') = exposed
                     AND NOT has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE'))
       FROM fns WHERE to_regprocedure(sig) IS NOT NULL) AS function_exposure_exact,
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.b1_request_fee_decisions'))
      AND NOT has_table_privilege('authenticated', to_regclass('public.b1_request_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('anon', to_regclass('public.b1_request_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE')
      AS fee_decision_table_rls_on_and_not_exposed,
    EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = to_regclass('public.b1_request_fee_decisions')
              AND t.tgname = 'trg_guard_b1_request_fee_decision_write' AND NOT t.tgisinternal)
      AS fee_decision_guard_trigger_exists,
    (SELECT count(*) = 1 AND bool_and(ic.column_name = 'amount_due' AND ic.data_type = 'numeric'
                                      AND ic.numeric_precision = 12 AND ic.numeric_scale = 2)
       FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = 'b1_request_fee_decisions'
        AND ic.column_name ~* 'amount|currency|price|balance|invoice|receipt')
      AND EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = to_regclass('public.b1_request_fee_decisions')
                    AND k.conname = 'b1_request_fee_decisions_decision_chk' AND k.contype = 'c')
      AS display_only_amount_column_exact,
    (SELECT count(*) = 4 AND bool_and(position(m.marker in pg_get_functiondef(to_regprocedure(m.fn))) > 0)
       FROM markers m) AS patch_markers_present_and_excused_absence_markers_kept,
    (SELECT count(*) = 1 FROM public.request_type_workflows w
      WHERE w.code = 'excused_absence_external_payment_workflow' AND w.status = 'active' AND w.is_active)
      AS excused_absence_workflow_still_active
)
SELECT
  c.*,
  (c.single_active_workflow_per_service AND c.fee_step_before_payment_exact AND c.previous_steps_kept_in_order
   AND c.transitions_exact AND c.runtime_contract_pinned AND c.publish_recorded AND c.previous_versions_retired
   AND c.no_existing_request_moved_to_new_versions AND c.fee_condition_in_catalog AND c.four_new_functions_exist
   AND c.function_exposure_exact AND c.fee_decision_table_rls_on_and_not_exposed
   AND c.fee_decision_guard_trigger_exists AND c.display_only_amount_column_exact
   AND c.patch_markers_present_and_excused_absence_markers_kept AND c.excused_absence_workflow_still_active) IS TRUE
    AS applied_correctly,
  -- informational
  (SELECT array_agg(service || '=' || code || ' v' || version ORDER BY service) FROM shape) AS active_workflows,
  (SELECT count(*) FROM public.b1_request_fee_decisions) AS fee_decisions_recorded,
  (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
     JOIN wf ON wf.id = s.workflow_id) AS requests_on_the_new_versions,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('department_transfer', 'transfer', 'final_chance', 'extra_chance')
      AND r.status::text NOT IN ('completed', 'rejected', 'cancelled', 'draft')) AS open_requests_of_both_services,
  (SELECT array_agg(rt.code || '=' || rt.student_visible ORDER BY rt.code) FROM public.request_types rt
    WHERE rt.code IN ('department_transfer', 'final_chance')) AS request_types_student_visible,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
```

## 12. إجراء التراجع

`docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.rollback-by-forward.sql` (مسودة؛ تفويض مستقل). لكل خدمة: يقاعد إصدار قرار الرسوم ويعيد تفعيل الإصدار السابق، ويكتب صف `workflow_rolled_back`. لا يحذف شيئاً: التعريفات، الجدول، الدوال والرقعتان تبقى خاملة.

- **تنبيه:** الإصدار السابق هو الإصدار 2 المعيب؛ التراجع يعيد توقف الخدمتين. يُستعمل لإلغاء هذه الحزمة فقط.
- **يرفض (فشل مغلق):** خدمة لها أي طلب على إصدارها الجديد ← `B1_PFD01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_VERSION`.
- **المُثبت:** التراجع، تشغيل ثانٍ بلا تغيير، إعادة تطبيق المسودة بعده (تعيد تفعيل الإصدار المتقاعد ولا تنسخه ثانية) والتحقق اللاحق أخضر، والرفض عند وجود طلبات بلا أي أثر.

## 13. التحقق المنفَّذ وما لم يُتحقق منه

**نُفِّذ محلياً:** `scripts/b1-paid-services-registrar-fee-decision-01-pg17/run.sh` على PostgreSQL 16 مؤقت: السلسلة المطبّقة + مسودة «غياب بعذر» ← الفحص المسبق أخضر ← 8 مجسّات فشل-مغلق (كل منها: الفحص المسبق NO-GO، المسودة تتوقف، لا أثر) ← تطبيق مرتين ببصمة متطابقة ← التحقق اللاحق ← بروفة التراجع ← الخدمتان × الفرعان ← **إعادة تشغيل ملف حالات «غياب بعذر» كاملاً (2956 / 2590 / 1005 رفضاً، كلها ناجحة)**. محاكاة ساق CI من الملفات المودعة. `bun test tests` قبل وبعد.

**لم يُتحقق منه:** `tsc --noEmit` و`vite build` واختبارات مكوّنات React (لا `node_modules`)؛ PostgreSQL 17؛ مطابقة أجسام الدوال وشكل الإصدار 2 في الإنتاج لنقاط الارتكاز (الفحص المسبق يحسمها)؛ البروفة تعمل على صور دوال المحرّك فوق مخطط مصغّر لا على سلسلة Supabase الكاملة (دالتا الأثر وكتلة نشر الإصدار 2 مستخرجتان حرفياً من ملفي الترحيل، واختبار يُبقيهما متطابقتين).

## 14. أثر الإنتاج

لا شيء. لم يُعدَّل أي ترحيل مطبّق ولا `AGENTS.md`، ولم يُكتب في أي قاعدة بيانات.
