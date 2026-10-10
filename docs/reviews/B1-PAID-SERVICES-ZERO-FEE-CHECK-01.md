# B1-PAID-SERVICES-ZERO-FEE-CHECK-01 — فحص «التحويل بين الأقسام» و«الفرصة الأخيرة»

> **تحديث:** الإصلاح المقترح في القسم 4 (السداد الإلزامي، `B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01`) **أُلغي ولم يُطبَّق**. اختار المالك الخيار (ب): قرار رسوم لكل طلب لدى مسجل الكلية — انظر `docs/reviews/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.md`. ملف المسودة القديم صار `B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.SUPERSEDED.NOT_APPLIED.sql` (يتوقف فوراً إن شُغِّل)، والبروفة انتقلت إلى `scripts/b1-paid-services-registrar-fee-decision-01-pg17/`. تشخيص العيب في الأقسام 1–3 و6 ما زال صحيحاً.

- **النطاق:** SOURCE-ONLY. بروفة على عنقود PostgreSQL محلي مؤقت فقط؛ لا شيء طُبِّق على أي قاعدة حقيقية.
- **البروفة:** `scripts/b1-paid-services-zero-fee-check-01-pg17/run.sh`
- **مسودة الإصلاح (مستقلة عن مسودة غياب بعذر):** `docs/migration-drafts/B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql`
- **القرار:** الفحص **PASS** (العيب مُثبت والإصلاح مُبرهن). تطبيق الإصلاح **HOLD** حتى يختار المالك بين الخيارين في القسم 5 ويُفحص الإنتاج بالاستعلام في القسم 6.

## 1. الخلاصة

الشك كان في محلّه، والعيب **أوسع** مما ظُنّ: في الإصدار 2 المطبّق للخدمتين، **كل طلب** يتوقف نهائياً عند خطوة مسجل الكلية `registrar_apply` بعد موافقة العميد. لا يوجد مسار يكمل به الطلب عبر الواجهة أو الـRPC.

## 2. السبب

1. الترحيل المطبّق `20260811202824` نشر الإصدار 2 بتفرّع بعد خطوة العميد:
   - العميد ← `payment_confirmation` **فقط** إذا تحقق الشرط `FEE_GREATER_THAN_ZERO`.
   - العميد ← `registrar_apply` هو **الافتراضي** («لا توجد رسوم — تخطي تأكيد السداد»).
2. الشرط `FEE_GREATER_THAN_ZERO` يقرأ جدول `student_request_fee_assessments`. الخدمتان بلا خطوة `assess_fee`، و`assess_student_request_fee` ترفض أي خطوة أخرى؛ إذن **لا يمكن أن يوجد تقييم رسوم** لهذه الطلبات، والشرط لا يتحقق أبداً.
3. فيأخذ كل طلب الفرع الافتراضي وتُعلَّم `payment_confirmation` بالحالة `skipped`.
4. خطوة السداد `can_skip = false` (منسوخة من الإصدار 1)، و`workflow_runtime_predecessors_satisfied` لا تقبل سابقة `skipped` إلا إذا كانت `can_skip = true`؛ فتعيد `can_current_user_act_on_step` القيمة `false` للمكلّف الصحيح نفسه.

## 3. النتيجة الدقيقة للاختبار (الإصدار 2 كما هو مطبّق)

الخطوات نُفِّذت بالمكلّف المباشر الوحيد الصحيح لكل خطوة، عبر RPC مباشرة.

| الخدمة | الحالة | النتيجة |
|---|---|---|
| `department_transfer` | بلا تقييم رسوم (الحالة الوحيدة الممكنة في الإنتاج) | الخطوات 1–4 تنجح (`student_affairs_intake`، `source_department_head_approval`، `target_department_head_approval`، `dean_approval`). بعدها `payment_confirmation = skipped` و`registrar_apply = active`. **يفشل**: المسجل ← `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` عند `registrar_apply`؛ المالية ← `INVALID_ACTIVE_PAYMENT_CONFIRMATION_STEP`. الطلب يبقى `in_review` بلا أي تغيير. |
| `final_chance` | بلا تقييم رسوم | الخطوات 1–3 تنجح (`student_affairs_intake`، `manager_review`، `dean_decision`). ثم الفشل نفسه بالرمزين نفسيهما عند `registrar_apply`. |
| الخدمتان | تقييم رسوم > 0 **مزروع يدوياً في البروفة** (غير ممكن عبر أي RPC) | **يعمل** من البداية للنهاية: السداد يُفعَّل، المالية تؤكد عبر RPC السداد فقط (`B1_SPECIALIZED_ACTION_RPC_REQUIRED` على المنفّذ العام)، المسجل يطبّق، الطلب `completed` والأثر الأكاديمي يُطبَّق مرة واحدة. |

- عيّنة الرفض: مجهول، الطالب صاحب الطلب، أدمن بلا تعيين، موظف وحدة أخرى، عضو هيئة تدريس × خمس محاولات لكل خطوة: 100–150 رفضاً لكل طلب، كلها بلا أي تغيير في الطلب.
- **مسودة غياب بعذر لا تغيّر شيئاً هنا:** سجل الحالات متطابق حرفياً بدونها ومعها (مقارنة `cmp`)، والمسودتان تُطبَّقان بأي ترتيب.

## 4. الإصلاح المقترح (المسودة المستقلة)

ينشر **الإصدار التالي** لكل من السيرين كنسخة مطابقة للنشط، مع فرق واحد: خروج خطوة العميد يصبح انتقالاً واحداً غير مشروط إلى `payment_confirmation`، ولا يُنسخ انتقال التجاوز إلى `registrar_apply`. أي أن تأكيد السداد يعود إلزامياً كما في الإصدار 1 وكما تنص قواعد المشروع للخدمات المدفوعة.

- لا تُنشأ ولا تُعدَّل أي دالة. لا كتابة في الطلبات أو خطواتها أو تقييمات الرسوم. الإصدار 2 يتقاعد دون تعديل صفوفه.
- فشل مغلق: أي شكل غير الشكل المعيب المعروف يوقف المعاملة (5 مجسّات مُثبتة). آمنة عند إعادة التشغيل (بصمة متطابقة).
- **بعد الإصلاح (مُثبت):** طلب جديد بلا تقييم رسوم ← السداد يُفعَّل ← المالية تؤكد ← المسجل يطبّق (`can_current_user_act_on_step = true`) ← `completed` وكل الخطوات `completed`.

## 5. قرارات مطلوبة من المالك

1. **سياسة الرسوم للخدمتين:**
   - (أ) السداد إلزامي دائماً — هذا ما تنفّذه المسودة.
   - (ب) قرار رسوم لكل طلب كما في «غياب بعذر» — حزمة مستقلة أكبر (جدول قرار، RPC، واجهة).
   - **مرفوض تقنياً:** جعل `payment_confirmation` قابلة للتخطي (`can_skip = true`)؛ يفكّ التوقف لكنه يُكمل كل طلب «مدفوع» دون أي تأكيد سداد.
2. **الطلبات العالقة حالياً على الإصدار 2** (إن وُجدت): المسودة **لا تمسّها** (لمس الطلبات ممنوع). تبقى عالقة عند `registrar_apply` حتى يقرر المالك معالجتها بحزمة مفوَّضة مستقلة.

## 6. استعلام قراءة فقط للإنتاج (قبل أي قرار)

```sql
SELECT rt.code AS service,
       w.code || ' v' || w.version AS active_workflow,
       (SELECT count(*) FROM public.request_type_workflow_transitions t
         WHERE t.workflow_id = w.id AND t.condition_schema ->> 'code' = 'FEE_GREATER_THAN_ZERO') AS conditional_paid_edges,
       (SELECT count(*) FROM public.request_type_workflow_steps s
         WHERE s.workflow_id = w.id AND s.action_type = 'assess_fee') AS fee_assessment_steps,
       (SELECT bool_or(s.can_skip) FROM public.request_type_workflow_steps s
         WHERE s.workflow_id = w.id AND s.step_key = 'payment_confirmation') AS payment_step_skippable,
       (SELECT count(DISTINCT a.student_request_id)
          FROM public.student_request_workflow_steps a
          JOIN public.student_request_workflow_steps p
            ON p.student_request_id = a.student_request_id AND p.step_key = 'payment_confirmation'
         WHERE a.workflow_id = w.id AND a.step_key = 'registrar_apply'
           AND a.status = 'active' AND p.status = 'skipped') AS requests_stuck_at_registrar_apply,
       (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
         WHERE s.workflow_id = w.id) AS requests_on_this_version
FROM public.request_type_workflows w
JOIN public.request_types rt ON rt.id = w.request_type_id
WHERE rt.code IN ('department_transfer', 'final_chance')
  AND w.status = 'active' AND w.is_active;
```

العيب قائم في الإنتاج إذا كان `conditional_paid_edges = 1` و`fee_assessment_steps = 0` و`payment_step_skippable = false`.

## 7. ما لم يُتحقق منه

- حالة الإنتاج الفعلية (قد يكون سير العمل عُدِّل من لوحة الإدارة بعد الترحيل) — الاستعلام أعلاه يحسمها.
- البروفة تعمل على صور دوال المحرّك المأخوذة من الترحيلات المطبّقة فوق مخطط مصغّر، لا على سلسلة Supabase الكاملة؛ ودالتا الأثر وكتلة نشر الإصدار 2 مستخرجتان حرفياً من ملفي الترحيل وقت التشغيل.
- PostgreSQL 17 (المتاح محلياً 16)، ولم تُضف ساق CI لهذه البروفة لأنها تستخرج ملفات وقت التشغيل.

## 8. أثر الإنتاج

لا شيء. لم يُعدَّل أي ترحيل مطبّق ولم يُكتب في أي قاعدة بيانات.
