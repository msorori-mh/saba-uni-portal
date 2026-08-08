# PORTAL-B1-BLOCKED-22-ACTIVE-TEST-ONLY-FIXTURES-PREFLIGHT-18

MODE: PRODUCTION READ-ONLY FIXTURE EXECUTION PLANNING
DECISION: **PASS_B1_BLOCKED_22_ACTIVE_TEST_ONLY_FIXTURES_PREFLIGHT_READY_FOR_APPROVAL**

ZERO_RPC_CALLS · NO_PRODUCTION_WRITE · NO_MIGRATION · NO_DEPLOY

هذه الوثيقة خطة فقط. لم يُنفَّذ أي RPC ولا أي انتقال ولا أي تقييم رسوم ولا أي DML/DDL.
جميع القراءات تمت عبر كتالوج الإنتاج و`student_request_workflow_steps` بقراءة فقط.

---

## 1. Read-only production attestation (baseline)

| request_number | service | req_status | active step | pending steps |
|---|---|---|---|---|
| SR-20260727-88D885F0 | department_transfer | submitted | student_affairs_intake (1) | 2..6 |
| SR-20260727-50BEDCE2 | enrollment_suspension | submitted | initial_review (1) | 2..3 |
| SR-20260727-695EC35B | excused_absence | submitted | student_affairs_intake (1) | 2..3 |
| SR-20260727-42393846 | file_withdrawal | submitted | student_affairs_intake (1) | 2..7 |
| SR-20260727-3C550070 | final_chance | submitted | student_affairs_intake (1) | 2..5 |

- `student_request_fee_assessments` = **0 rows** لكل الطلبات الخمسة (لا رسوم، لا دفع).
- `assigned_user_id` على صفوف runtime = NULL؛ التعيين المباشر يُشتق من
  `request_processing_assignments` (unit + role) وفق Migration 29. لذلك «الفاعل المعيّن مباشرة»
  في هذه الخطة هو المستخدم المثبت في `step_state_pins.direct_assignee_user_id`.
- لا طلب خارج TEST_ONLY داخل النطاق. مالك الطلبات هو حساب TEST_ONLY المعزول وحده.

السبب الجذري للحجب: `act_on_b1_student_request_step_atomic` يرفض بـ
`B1_ACTIVE_STEP_REQUIRED` قبل بوابة التفويض، فأي حالة سلبية على step غير active
لا تثبت العقد المقصود. الحل الوحيد: جعل الخطوة الهدف **active** بانتقالات شرعية
ينفّذها المعيّن المباشر الصحيح فقط.

---

## 2. Fixtures (5 fixtures = 5 طلبات TEST_ONLY، لا طلبات جديدة)

| fixture | request | خدمة | حالات محجوبة تُغطّى | انتقالات مطلوبة |
|---|---|---|---|---|
| F1 | SR-20260727-42393846 | file_withdrawal | 6 | 6 |
| F2 | SR-20260727-88D885F0 | department_transfer | 8 (5 illegal + 3 scope) | 5 |
| F3 | SR-20260727-3C550070 | final_chance | 4 | 4 |
| F4 | SR-20260727-50BEDCE2 | enrollment_suspension | 2 | 2 |
| F5 | SR-20260727-695EC35B | excused_absence | 2 | 2 |
| **الإجمالي** | 5 fixtures | | **22** | **19 انتقالاً** |

كل fixture يخدم عدة حالات: تُنفَّذ كل الحالات السلبية الموجّهة لخطوة ما أثناء نافذة
كونها active، ثم يُكمل المعيّن المباشر تلك الخطوة لتنشيط التالية. لا حاجة لأي fixture إضافي.

---

## 3. مصفوفة الحالات الـ22

الرموز: `A#` = رقم الخطوة المطلوب تنشيطها. جميع الحالات `expect = DENY`،
`SQLSTATE 42501`، `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED`، `zero_mutation = true`،
وتُنفَّذ داخل `BEGIN ISOLATION LEVEL SERIALIZABLE … ROLLBACK`.

### F1 — SR-20260727-42393846 (file_withdrawal)

| # | target step (A) | current | actor (direct assignee) | action | predecessors يجب إكمالها (منفّذها) | fee؟ | أثر أكاديمي |
|---|---|---|---|---|---|---|---|
| 1 | library_clearance (2) | pending | e7a93314 | archive | 1 intake — c8a94548 | لا | لا |
| 2 | labs_clearance (3) | pending | 67b39ee4 | archive | +2 library — e7a93314 | لا | لا |
| 3 | activities_clearance (4) | pending | aac0e62d | archive | +3 labs — 67b39ee4 | لا | لا |
| 4 | finance_clearance (5) | pending | 79783c0f | archive | +4 activities — aac0e62d | **لا** (إجراء `clear` وليس دفعاً) | لا |
| 5 | registrar_apply (6) | pending | 4c261c1c | archive | +5 finance — 79783c0f | لا | **يُنشَّط فقط، لا يُكمَل** |
| 6 | archive (7) | pending | aec1303e | confirm_payment | يتطلب إكمال 6 registrar_apply → **أثر أكاديمي** | لا | **محجوب: يحتاج موافقة مستقلة** |

### F2 — SR-20260727-88D885F0 (department_transfer)

| # | target step (A) | actor | action | predecessors (منفّذها) | fee؟ | ملاحظات |
|---|---|---|---|---|---|---|
| 7 | source_department_head_approval (2) | d4aaa5c9 | archive | 1 intake — c8a94548 | لا | illegal-action |
| 8 | source_department_head_approval (2) | f602b62c (رئيس القسم الهدف) | approve | نفسها | لا | **transfer scope guard** |
| 9 | source_department_head_approval (2) | 97acbe02 (قسم ثالث) | approve | نفسها | لا | **transfer scope guard** |
| 10 | target_department_head_approval (3) | f602b62c | archive | +2 — d4aaa5c9 | لا | illegal-action |
| 11 | target_department_head_approval (3) | d4aaa5c9 (رئيس القسم المصدر) | approve | نفسها | لا | **transfer scope guard** |
| 12 | dean_approval (4) | b3dd71e6 | archive | +3 — f602b62c | لا | illegal-action |
| 13 | payment_confirmation (5) | 79783c0f | archive | +4 — b3dd71e6 | **نعم (تقييم رسوم مطلوب)** | يحتاج موافقة مستقلة |
| 14 | registrar_apply (6) | 4c261c1c | archive | +5 payment — 79783c0f | **نعم** | يحتاج موافقة مستقلة |

الحالات 8/9/11 هي الحالات الثلاث للـ scope؛ إثبات وصولها إلى الـ guard = الخطوة الهدف
active + الفاعل معيّن مباشرة على خطوة قسم أخرى، فتتجاوز `B1_ACTIVE_STEP_REQUIRED`
وترتطم ببوابة نطاق القسم.

### F3 — SR-20260727-3C550070 (final_chance)

| # | target step | actor | action | predecessors | fee؟ |
|---|---|---|---|---|---|
| 15 | manager_review (2) | aac0e62d | archive | 1 intake — c8a94548 | لا |
| 16 | dean_decision (3) | b3dd71e6 | archive | +2 — aac0e62d | لا |
| 17 | payment_confirmation (4) | 79783c0f | archive | +3 — b3dd71e6 | **نعم** |
| 18 | registrar_apply (5) | 4c261c1c | archive | +4 payment — 79783c0f | **نعم** |

### F4 — SR-20260727-50BEDCE2 (enrollment_suspension)

| # | target step | actor | action | predecessors | fee؟ |
|---|---|---|---|---|---|
| 19 | manager_approval (2) | aac0e62d | archive | 1 initial_review — c8a94548 | لا |
| 20 | registrar_apply (3) | 4c261c1c | archive | +2 — aac0e62d | لا |

### F5 — SR-20260727-695EC35B (excused_absence)

| # | target step | actor | action | predecessors | fee؟ |
|---|---|---|---|---|---|
| 21 | manager_review (2) | aac0e62d | archive | 1 intake — c8a94548 | لا |
| 22 | record_apply (3) | c8a94548 | archive | +2 — aac0e62d | لا |

**RPC المتوقع لكل الحالات الـ22:** `act_on_b1_student_request_step_atomic`
(الخطوات ذات `confirm_payment` تُختبر أيضاً عبر نفس الدالة بإجراء غير مشروع؛
`record_external_university_payment_confirmation` لا يُستدعى في أي حالة سلبية).

---

## 4. الأحداث والإشعارات المتوقعة

- **الحالات الـ22 (السلبية):** صفر events، صفر notifications، صفر audit rows،
  صفر تعديل على runtime steps — الاستدعاء يفشل قبل أي كتابة، والمعاملة تُلغى بـ ROLLBACK.
- **الانتقالات المشروعة الـ19 (fixture setup):** لكل انتقال صف واحد في
  `student_request_workflow_events` + إشعار للطالب المالك (حساب TEST_ONLY فقط)
  + إشعار/inbox للمعيّن التالي + تحديث حالتي الخطوة الحالية والتالية.
  لا بريد ولا SMS لأشخاص حقيقيين (المالك حساب اختبار معزول).

---

## 5. الحد الأدنى للكتابات الإنتاجية (عند الموافقة اللاحقة فقط)

| البند | العدد |
|---|---|
| انتقالات workflow | 19 |
| صفوف events | 19 |
| إشعارات | ≤ 38 |
| طلبات جديدة | 0 |
| تعديل assignments / profiles / request_types | 0 |
| fee assessments | 0 في هذه الخطة (2 مطلوبان فقط تحت موافقة الدفع المستقلة) |
| مدفوعات | 0 |
| migrations / deploys | 0 |

---

## 6. ترتيب التنفيذ ونقاط التوقف الآمنة

الترتيب مصمَّم من الأقل خطورة إلى الأعلى، مع نقطة توقف بعد كل fixture:

1. **F5 excused_absence** (2 انتقال) → توقف SP1: تُترك `record_apply` **active وغير مكتملة**.
2. **F4 enrollment_suspension** (2) → SP2: `registrar_apply` active وغير مكتملة.
3. **F1 file_withdrawal** (5 انتقالات حتى تنشيط registrar_apply) → SP3:
   `registrar_apply` active وغير مكتملة. الحالة #6 (archive step 7) **لا تُنفَّذ**.
4. **F2 department_transfer** (4 انتقالات حتى تنشيط dean_approval) → SP4:
   الحالات 7–12 مكتملة، `dean_approval` تُترك active. 13/14 موقوفتان.
5. **F3 final_chance** (3 انتقالات حتى تنشيط dean_decision) → SP5:
   الحالات 15–16 مكتملة. 17/18 موقوفتان.

عند كل نقطة توقف: التقاط snapshot للحالات + عدّ events + إثبات صفر mutation
للحالات السلبية، قبل السماح بالانتقال التالي.

**قابل للتنفيذ فور الموافقة على هذه الخطة: 18 حالة من 22.**
**موقوف على موافقة منفصلة: 4 حالات** — 13، 14، 17، 18 (مسار الرسوم/الدفع)
و #6 (يتطلب إكمال registrar_apply = أثر أكاديمي). أي: 17 حالة بلا رسوم/أثر،
+1 (#5 registrar_apply active بلا إكمال) آمنة، = 18.

---

## 7. مخاطر الآثار الأكاديمية

| مخاطرة | الوصف | الضابط |
|---|---|---|
| R1 | إكمال `registrar_apply` يُطلق `apply_b1_academic_effect_for_request` (تحويل قسم/إيقاف قيد/فرصة أخيرة/سحب ملف) | خطوات registrar_apply/record_apply **تُنشَّط ولا تُكمَل أبداً**. لا حالة من الـ22 تستدعي إجراء `apply_decision`. |
| R2 | تنشيط `payment_confirmation` قد يستلزم وجود fee assessment | خارج نطاق هذه المهمة؛ الحالات 13/14/17/18 موقوفة حتى موافقة مستقلة. |
| R3 | خطوة archive في file_withdrawal تتطلب المرور عبر registrar_apply المكتمل | الحالة #6 موقوفة؛ لا تُنفَّذ بدون موافقة أثر أكاديمي مستقلة. |
| R4 | forward-only: لا يمكن إعادة فتح خطوة أُكملت | تُنفَّذ كل الحالات السلبية الخاصة بخطوة **قبل** إكمالها؛ ترتيب ملزم. |
| R5 | تلوث بيانات الإنتاج | الطلبات الخمسة موسومة TEST_ONLY ومملوكة لحساب اختبار معزول؛ لا مساس بالسجلات المحمية SR-20260713-2DE64041 / SR-20260715-FEDCB3E1 / SR-20260716-26BAD4C8 / USR-2026-000001 / USR-2026-000002. |

---

## 8. الحالة المطلوبة بعد الاختبار والاحتفاظ

- الطلبات الخمسة تبقى **مفتوحة** عند نقاط التوقف أعلاه (لا إكمال، لا إغلاق، لا أثر أكاديمي).
- **لا cleanup ولا DELETE ولا reset** — الاحتفاظ كأثر تدقيق دائم للمصفوفة السلبية.
- إن لزم تجميد لاحق: يتم بوسم توثيقي فقط، دون DML على الطلبات.
- الخدمات الخمس تبقى على حالة الظهور الحالية؛ هذه المهمة لا تغيّر `student_visible`.

---

## 9. إثباتات مطلوبة مُستوفاة في هذه الخطة

- كل wrong-action case مربوطة بخطوة ستكون **active** لحظة التنفيذ (جدول القسم 3).
- كل حالة transfer-scope (8/9/11) تصل فعلياً إلى بوابة نطاق القسم لأن الخطوة الهدف تكون active.
- لا حالة تستدعي `apply_decision` ولا تُكمل registrar_apply/record_apply.
- لا رسم ولا دفع يُنشأ في هذه المهمة (0 fee assessments، 0 payments).
- لا طلب خارج TEST_ONLY داخل النطاق.
