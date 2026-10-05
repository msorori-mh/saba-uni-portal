# Contract — `department_transfer` (تحويل من قسم إلى قسم)

## البيانات والتفويض

- القسم والبرنامج الحاليان مشتقان خادمياً من ملف الطالب.
- القسم والبرنامج الهدف يتحقق منهما خادمياً.
- رئيس القسم الحالي ورئيس القسم الهدف يثبت كل منهما في خطوته عبر `assigned_faculty_profile_id`.
- التعيين المباشر له الأولوية المطلقة؛ لا role-pool أو admin أو registrar أو dean bypass.

## الرسوم

السياسة: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION`.

- يدفع الطالب في النظام الأساسي للجامعة.
- لا تسجل البوابة `fee_type.code` أو مبلغاً أو عملة أو فاتورة أو gateway transaction أو internal balance.
- موظف المالية المعيّن مباشرة يؤكد الاستلام مع وقت وملاحظة اختيارية وaudit event.

## دورة العمل

| # | step_key | unit | role | action_type |
|---|---|---|---|---|
| 1 | `student_affairs_intake` | `student_affairs` | `student_affairs_specialist` | `review` |
| 2 | `source_department_head_approval` | `department` | `department_head` | `approve` |
| 3 | `target_department_head_approval` | `department` | `department_head` | `approve` |
| 4 | `dean_approval` | `dean` | `dean` | `approve` |
| 5 | `payment_confirmation` | `finance` | `revenue_finance_officer` | `confirm_payment` |
| 6 | `registrar_apply` | `registrar` | `registrar_general` | `apply_decision` |

لا يوجد `fee_assessment`. لا يجوز استكمال الطلب قبل `payment_confirmed`.

## حالة runtime

المصدر جاهز للسياسة، لكن runtime يبقى مغلقاً حتى تطبيق migration مراجعة واختبار مصفوفة التفويض المباشرة في بيئة آمنة.

## Update — B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 (source/draft until applied)
The fee is decided per request by the college registrar in a new step `registrar_fee_decision` (unit `registrar`, role `registrar_general`, action `review`, completed only through `record_b1_fee_decision`) placed immediately before `payment_confirmation`: `FEE_REQUIRED` with a DISPLAY-ONLY `amount_due` shown to the student (pay in the university main system, then finance confirms), or `FEE_NOT_REQUIRED` with reason `FREE_SERVICE` / `EXEMPTION` (payment confirmation skipped). Every other step, scope and effect code is unchanged; reject / return remain unavailable. This replaces the `FEE_GREATER_THAN_ZERO` branch of version 2. See `docs/reviews/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.md`.
