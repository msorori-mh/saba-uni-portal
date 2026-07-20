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
- Predecessor remediation #169 and safe RPC matrix #166 are resolved and merged source-only; final PostgreSQL 17 result is 285/285 with independent review CRITICAL=0 HIGH=0 MEDIUM=0.
- Department-chair package #165 is merged source-only and remains unapplied. Applying it requires separate explicit authorization and production preflight.
- Release pack #164 is merged source-only and records actual deployed SHA as `UNKNOWN`; no release, deploy, migration, workflow activation, or visibility action is authorized.

## 2026-07-21 parallel-cycle production decisions

- `B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL` remains unchanged.
- No first Migration is ready for apply authorization until exact deployed-artifact provenance, the authoritative 18-file apply manifest, readable applied-Migration evidence, the `log_audit` overload gate, and the CS/IT chair correction gate all pass.
- Academic clearance needs an owner-approved exact academic-affairs processing unit/role and official passed-result vocabulary before its draft may be promoted.
- Graduation projects and graduates affairs remain source-only foundations; their SQL, Storage/runtime activation, permissions and production data creation require separate future approvals.
