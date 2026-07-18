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

## 2026-07-19 gates retained

- `B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL`.
- Draft PR #166 is HOLD with CRITICAL=0 HIGH=3. Remediation must close predecessor authorization across all five B1 services and extend the harness to the complete coordinated draft order plus actual mutation zero-delta and realistic source/target department isolation evidence.
- The implementation remediation belongs to the already isolated Cursor source-remediation path; this cycle made no overlapping edit.
- Department-chair package PR #165 is source-only and unapplied. Applying it requires separate explicit authorization and production preflight.
- Release pack PR #164 records actual deployed SHA as `UNKNOWN`; no release, deploy, migration, workflow activation, or visibility action is authorized.
