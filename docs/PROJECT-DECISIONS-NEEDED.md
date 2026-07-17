# Project Decisions Needed — B1-02

## Decisions resolved

- `department_transfer` و`final_chance` يستخدمان `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` دون `fee_type.code` أو مبلغ أو عملة أو فاتورة أو gateway أو رصيد داخلي.
- `final_chance` تعني اختبار مقرر كفرصة نهائية، وكل كتابة جديدة تستخدم `chance_type='final_chance'` فقط.
- القيم التاريخية لـ`chance_type` تقرأ وتطبّع فقط ولا تستخدم لإنشاء سجل جديد.

## Remaining runtime gate

- تطبيق migrations الجديدة غير منفذ في هذا المسار SOURCE-ONLY.
- يلزم بعد التطبيق المنفصل اختبار RPC ALLOW للمكلّف المالي المباشر وDENY لكل مستخدم آخر ولكل admin/registrar/dean bypass.
- يبقى `student_visible` دون تغيير حتى اكتمال runtime والمصفوفة الأمنية وE2E ببيانات اختبار معتمدة.

Production impact now: none.
