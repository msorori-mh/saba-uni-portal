# B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01

الحالة: READY_FOR_AUTHORIZED_EXECUTION — حزمة قراءة فقط كاملة
أُعدت: 2026-07-21 — القائد العام (برنامج PORTAL-AUTONOMOUS-SWARM-COMPLETION-PROGRAM-01)
المرجع: `origin/main@8f229d09` — المشروع: Supabase `wpmicqriltrowwonknox`
المرجع القانوني للترتيب: docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md

## 0. لماذا هذه الحزمة

D-02 عملية قراءة فقط لا تتطلب موافقة مسبقة، لكنها تتطلب **قناة تنفيذ مفوضة** (لا توجد اعتمادات إنتاجية في بيئة الوكلاء — لا يجوز إدخال أي سر في المستودع). هذه الحزمة تُنفَّذ عبر إحدى قناتين:

- **القناة أ (مفضلة):** Supabase Dashboard → SQL Editor (سياق service) — ينفذها المستخدم ويلصق المخرجات.
- **القناة ب:** psql بدور read-only مؤقت يُنشأ ويُسحب من قبل المستخدم (بيان إنشاء الدور خارج هذه الحزمة).

يُمنع منعاً باتاً: أي GRANT، أي SQL كتابي، أي DDL/DML، أي استدعاء RPC إنتاجي. كل الاستعلامات أدناه SELECT على الكتالوج فقط.

## 1. حارس الجلسة (يُنفَّذ أولاً)

```sql
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
```

**تنبيه تنفيذي مهم:** في Supabase SQL Editor كل ضغطة Run جلسة/معاملة مستقلة. لذلك يجب لصق الحارس **والاستعلامات التالية في نفس السكربت/الـRun الواحد** حتى يبقى `begin read only` فعالاً. عند الانتهاء: `rollback;` في نفس السكربت.

## 2. Q1 — سجل التطبيق الكامل

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

إن فشل الاستعلام بصلاحيات: سجّل `SCHEMA_MIGRATIONS_UNREADABLE` — هذا بحد ذاته نتيجة حاكمة (تعذّر العدّ بالدور المتاح) وتوقف.

## 3. Q2 — كشف الغموض (أي تطابق جزئي مع أسماء الـ18)

```sql
select version, name
from supabase_migrations.schema_migrations
where name ilike any(array[
  '%LOG-AUDIT-CALL-DISAMBIGUATION%','%WORKFLOW-ACTOR-AUTHORIZATION%',
  '%PROCESSING-DOMAINS-EXPANSION%','%ATOMIC-SUBMIT-ACTION%',
  '%RELEASE-EVIDENCE-STAMP%','%EXTERNAL-UNIVERSITY-PAYMENT%',
  '%SECURE-ATTACHMENTS%','%TRUSTED-REFERENCE-VALIDATORS%',
  '%EXCUSED-ABSENCE%','%FILE-WITHDRAWAL%','%TRANSFER-SECURE%',
  '%FINAL-CHANCE%','%RPC-WRITE-BOUNDARIES%','%SERVICE-DETAILS%',
  '%FREE-SERVICE-WORKFLOWS%','%ACL-CUTOVER%'
])
order by version;
```

## 4. فحوص وجود الكائنات (probes كتالوجية قراءة فقط)

**شغّل كل استعلام منفرداً والتقط مخرجاته** (SQL Editor يعرض نتيجة الاستعلام الأخير فقط عند التشغيل الجماعي).

### Q3a — overloads `log_audit` (البوابة B-6)

```sql
select p.oid::regprocedure as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='log_audit'
order by 1;
```

المتوقع قبل migration الترتيب 1: توقيعان (6-arg و7-arg). أي عدد ≠ 2 = `D02_HOLD_LOG_AUDIT_SIGNATURE_MISMATCH` (توقف فوري — انظر §7).

### Q3b — كائنات متوقع غيابها قبل التطبيق (وجودها = partial/ambiguous)

```sql
select
  to_regclass('public.student_request_service_details') as service_details,
  to_regclass('public.student_request_secure_attachments') as secure_attachments,
  to_regclass('public.external_university_payment_confirmations') as ext_payment;
```

### Q3c — RPCs الحزمة

```sql
select p.oid::regprocedure as signature
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'submit_student_request_atomic','confirm_external_university_payment',
  'write_final_chance_request','cancel_official_document'
)
order by 1;
```

قاعدة الحكم على Q3b/Q3c: وجود كائن مع غياب سطر مطابق في Q1 = `partial` (كائن بلا سجل تطبيق) → توقف وسجّل. عدم وجود كائن متوقع غيابه = متسق مع `not_applied`.

## 5. مصفوفة المطابقة (تُعبأ من Q1/Q2/Q3)

لكل ملف من الـ18 (الترتيب القانوني runbook-07) سجّل: `applied` (سطر exact في Q1) / `not_applied` / `ambiguous` (تطابق جزئي في Q2 فقط) / `partial` (كائن في Q3 بلا سطر في Q1) + عمود الدليل (version المطابق أو اسم الكائن).

| # | الملف | الحكم | الدليل |
|---:|---|---|---|
| 1 | REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | | |
| 2 | STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | | |
| 3 | REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | | |
| 4 | REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | | |
| 5 | REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | | |
| 6 | EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | | |
| 7 | STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | | |
| 8 | REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | | |
| 9 | REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | | |
| 10 | REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | | |
| 11 | REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | | |
| 12 | REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | | |
| 13 | FINAL-CHANCE-CANONICAL-WRITE-03.sql | | |
| 14 | REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | | |
| 15 | REQUEST-B1-SERVICE-DETAILS-05A.sql | | |
| 16 | B1-FREE-SERVICE-WORKFLOWS-08.sql | | |
| 17 | EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | | |
| 18 | REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | | |

## 6. Q4 — provenance النشر (قراءة فقط، خارج قاعدة البيانات)

قاعدة البيانات لا تثبت SHA التطبيق المنشور. مصادر القراءة المقبولة:
1. سجل النشر في Lovable (Publish history) — لقطة مع التاريخ والـcommit إن عرضه.
2. ترويسات الاستجابة للسطح الحي (curl -I) — أي x-deployment-id / x-build.
3. أي endpoint إصدار موثق في المشروع (إن وجد).

سجّل: `DEPLOYED_SHA_PROVEN` (مع الدليل) أو `HOLD_RELEASE_SHA_UNPROVEN` — لا تخمين، لا اختلاق.

## 7. شروط التوقف

- فشل Q1 بصلاحيات → توقف، النتيجة `SCHEMA_MIGRATIONS_UNREADABLE`.
- عدد توقيعات `log_audit` ≠ 2 → توقف فوري، النتيجة `D02_HOLD_LOG_AUDIT_SIGNATURE_MISMATCH`.
- أي `ambiguous` أو `partial` في المصفوفة → توقف، لا متابعة لأي خطوة لاحقة.
- أي إغراء لكتابة → ممنوع مطلقاً؛ هذه الحزمة SELECT فقط.

## 8. الأثر المتوقع بعد التنفيذ الناجح

1. سجل تطبيق موثق للـ18 (متوقع: not_applied بالكامل — باستثناء ما قد يكشفه Q2).
2. إثبات/نفي provenance المنشور الحي → يحسم بوابة B-2.
3. تأكيد وجود overloads log_audit (متوقع: توقيعان) → يمهد حزمة D-03 (migration الترتيب 1 فقط).

## 9. forward-fix plan

| اكتشاف | المعالجة |
|---|---|
| partial (كائن بلا سجل) | لا حذف؛ تقرير فوري للقائد العام → خطة forward-correction موثقة جديدة |
| ambiguous (اسم قريب) | مطابقة SHA يدوية للمحتوى قبل أي حكم |
| log_audit signatures ≠ 2 | توقف — تحقق كتالوجي أعمق بقرار منفصل، لا إصلاح فوري |
| provenance مثبت لـSHA غير متوقع | توقف — مقارنة مع سجل الدمج قبل أي migration |

## 10. سجل التنفيذ (يُعبأ بعد التشغيل)

- التاريخ/المنفذ/القناة: ____
- مخرجات Q1 الخام: ____
- مخرجات Q2/Q3a/Q3b/Q3c/Q4: ____
- الحكم النهائي: `D02_COMPLETE_CLEAN` / `D02_HOLD_<سبب>`
