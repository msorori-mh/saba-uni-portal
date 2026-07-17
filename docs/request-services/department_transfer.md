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
