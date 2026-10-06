# Contract — `final_chance` (فرصة أخيرة)

الخدمة هي طلب السماح للطالب بدخول اختبار مقرر محدد كفرصة نهائية وفق اللوائح والاعتمادات الأكاديمية. الكود المعياري هو `final_chance`، ويظل `extra_chance` alias تخزينياً تاريخياً عند الحاجة حتى تطبيق migration توافق مستقلة.

## البيانات

- لا تعرض الواجهة `chance_type` للطالب.
- كل كتابة جديدة إلى `extra_chance_details.chance_type` تستخدم `final_chance` فقط.
- `additional_exam` و`grade_recovery` و`additional_chance` تقرأ وتطبّع للعرض التاريخي فقط، ولا تنشأ بها سجلات جديدة.
- unknown values ترفض fail-closed.
- السنة والفصل والمقرر والسبب يجب التحقق منها خادمياً قبل الحفظ.

## الرسوم

السياسة: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.

- يدفع الطالب في النظام الأساسي للجامعة.
- لا تسجل البوابة `fee_type.code` أو مبلغاً أو عملة أو فاتورة أو وسيلة دفع أو مرجع معاملة أو رصيداً.
- يتوقف الطلب عند `payment_confirmation`.
- موظف المالية المعيّن مباشرة للخطوة فقط يؤكد الاستلام، مع وقت التأكيد وملاحظة اختيارية وaudit event.

## دورة العمل

| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `manager_review` | `student_affairs` | `student_affairs_manager` | `approve` |
| 3 | `dean_decision` | `dean` | `dean` | `approve` |
| 4 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
| 5 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` |

لا يوجد `fee_assessment` ولا bypass للأدمن أو المسجل أو العميد. لا ينتقل الطلب إلى `registrar_apply` قبل `payment_confirmed`.

## حالة runtime

المصدر جاهز للسياسة، لكن runtime يبقى مغلقاً حتى تطبيق migration جديدة مراجعة واختبار مصفوفة RPC الإيجابية والسلبية في بيئة آمنة.

## Update — B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 (source/draft until applied)
The fee is decided per request by the college registrar in a new step `registrar_fee_decision` (unit `registrar`, role `registrar_general`, action `review`, completed only through `record_b1_fee_decision`) placed immediately before `payment_confirmation`: `FEE_REQUIRED` with a DISPLAY-ONLY `amount_due` shown to the student (pay in the university main system, then finance confirms), or `FEE_NOT_REQUIRED` with reason `FREE_SERVICE` / `EXEMPTION` (payment confirmation skipped). Every other step, scope and effect code is unchanged; reject / return remain unavailable. This replaces the `FEE_GREATER_THAN_ZERO` branch of version 2. See `docs/reviews/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.md`.
