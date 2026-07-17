# خطة migration — EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION

هذه خطة SOURCE-ONLY للموافقة والتنفيذ المنفصلين. لم يطبق SQL ولم يحدث اتصال بالإنتاج.

## Migration 1: عقد التأكيد الخارجي

1. إضافة حالة workflow `awaiting_payment_confirmation` ونتيجتي `payment_confirmed` و`payment_not_confirmed` ضمن القيود اللازمة فقط.
2. إنشاء سجل تأكيد مرتبط بـ `request_id` وruntime step، يحتوي فقط: status، `confirmed_by`، `confirmed_at`، `note`، timestamps.
3. منع أعمدة amount/currency/fee_type/invoice/gateway/reference/internal balance بعقد source واختبارات schema.
4. RPC قراءة السياق يعيد حالة الخطوة والتأكيد فقط.
5. RPC تأكيد SECURITY DEFINER يقفل الطلب والخطوة، ويتحقق من active step و`assigned_faculty_profile_id =` ملف الموظف الحالي، والوحدة `finance` والدور `revenue_finance_officer` والإجراء `confirm_payment`، ثم يسجل actor/time/note وaudit event وينقل إلى الخطوة التالية في transaction واحدة.
6. لا bypass لأي دور، ولا انتقال عند `payment_not_confirmed`.

## Migration 2: workflows للخدمتين

1. إنشاء/تحديث draft workflow لكل من `department_transfer` و`final_chance` دون `fee_assessment`.
2. ربط الموافقة السابقة مباشرة بـ`payment_confirmation` بحالة `awaiting_payment_confirmation`.
3. ربط `payment_confirmed` فقط بالخطوة التالية.
4. الخدمات المجانية لا تنشأ لها خطوة أو سجل تأكيد.

## Migration 3: final_chance canonical write

1. تثبيت `chance_type='final_chance'` في validator والكتابة الجديدة.
2. إبقاء القيم التاريخية قابلة للقراءة دون backfill أو delete أو rewrite.
3. مراجعة توافق `request_type='extra_chance'` التاريخي مع canonical `final_chance`; لا يغيّر مسار التخزين إلا بعد إثبات وجود صف request type والقيود والـtriggers المتوافقة.

## بوابات كل Migration

- hash موثق، source-contract/security tests PASS، مراجعة مستقلة PASS، ولا HIGH/CRITICAL.
- Preflight read-only، ثم تطبيق migration واحدة، ثم post-verification وALLOW/DENY RPC matrix وinvariants.
- عند أي partial apply تتوقف السلسلة بلا reset أو cleanup أو migration لاحقة.
- يمنع تغيير `student_visible` في هذه الخطة.
