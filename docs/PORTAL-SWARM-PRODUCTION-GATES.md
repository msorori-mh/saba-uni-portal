# PORTAL-SWARM-PRODUCTION-GATES

آخر تحديث: 2026-07-21 — المرجع: `origin/main@ff570f3b`

قاعدة ملزمة: كل عملية إنتاجية تُقدَّم كحزمة تفويض مستقلة (عملية واحدة فقط لكل موافقة). لا موافقة عامة على عدة migrations.

## بوابة G0 — متطلبات سابقة لأي SQL إنتاجي

| البوابة | الحالة | المطلوب |
|---|---|---|
| deployed-artifact provenance | ⛔ HOLD | إثبات أن المنشور الحي مبني من SHA معروف (بيان نشر Lovable أو read-back) |
| قراءة `supabase_migrations.schema_migrations` | ⛔ HOLD | elevated read-only مفوض لمرة واحدة |
| بيان الـ18 الملزم مقابل 29 مسودة مرئية | 🟡 جزئي | runbook-07 يحدد 18؛ يلزم تأكيد عدم وجود drafts دخيلة في حزمة التطبيق |
| overloads `log_audit` (6/7 args) | 🟡 معالج مصدرياً (#167) | يُغلق بتطبيق migration الترتيب 1 |
| تصحيح رؤساء الأقسام (CS=0/IT=2/IS=1) | 🟡 حزمة جاهزة (#165) | تفويض مستقل — انظر G1 |
| routeTree/Register clean-tree | ⛔ HOLD | إصلاح مصدر مستقل قبل ترشيح release جديد |

## G1 — حزمة تفويض رؤساء الأقسام (P0-03) — جاهزة للتقديم

- **العملية:** DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01 — تصحيح forward-only واحد.
- **الهويات المعتمدة حصراً:**
  - علوم الحاسوب: د. أسامة عبدالجليل أحمد سيف — F2025006
  - تقنية المعلومات: د. خالد قاسم محمد البراحي — F2025005
  - نظم المعلومات: د. رمزي حميد الجابري — F2025004
- **المرجع:** PR #165 (مدموج، `b50979a`) — preflight + controlled correction + verifier + rollback-by-forward-correction + authorization matrix.
- **الأدلة:** PG17 PASS، CI PASS، SQL لم يطبق قط.
- **شروط التوقف:** أي اختلاف عن الهويات الثلاث، أي partial apply، أي صف غير متوقع في verifier.
- **الأثر المتوقع:** CS=1 / IT=1 / IS=1 — يفك حجب `department_transfer`.
- **الحالة:** ⏳ NEEDS_USER_AUTHORIZATION (عملية واحدة فقط).

## G2 — تسلسل migrations الخدمات الخمس (runbook-07 — الترتيب القانوني)

كل صف = تفويض مستقل. لا يُطبَّق صف لاحق قبل PASS الصف السابق.

| الترتيب | الملف | SHA-256 (LF/git-blob) | البوابة |
|---:|---|---|---|
| D | Release منشور يتضمن atomic caller | `MISSING RELEASE EVIDENCE` حتى read-back بعد Deploy | Deploy/Publish — تفويض مستقل |
| 1 | REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql | 3b8e2cfd…32dab | أول SQL apply |
| 2 | STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql | 0627b142…f6c0 | أول runtime migration |
| 3 | REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql | e5b5ee1c…8edf | تحقق read-only من الهويات |
| 4 | REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql | a92505d7…b58a | dispatcher stub |
| 5 | REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql | 893a2979…f357 | يتطلب SHA منشوراً فعلياً |
| 6 | EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql | da4eadb7…872e4b | سداد خارجي فقط |
| 7 | STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql | bf95bb4b…11f20 | + موافقة Storage مستقلة |
| 8 | REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql | 52936640…44897c | — |
| 9 | REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql | e2d1cbe1…a4205 | — |
| 10 | REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql | 1bdbc6f7…54cdbe | — |
| 11 | REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql | 1a2bba07…bf9ee9 | — |
| 12 | REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql | d80f691c…32aa284 | — |
| 13 | FINAL-CHANCE-CANONICAL-WRITE-03.sql | 9a013924…c9f704 | — |
| 14 | REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql | 85fdd4f4…92495 | — |
| 15 | REQUEST-B1-SERVICE-DETAILS-05A.sql | d8eec185…74600c | — |
| 16 | B1-FREE-SERVICE-WORKFLOWS-08.sql | 1e8b6437…db44c | مسودات غير مفعّلة |
| 17 | EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql | 64e3436c…7cd8250 | transfer + final_chance فقط |
| 18 | REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql | 55f008fa…38383 | cutover ذري واحد |
| 19 | تفعيل كل خدمة + student_visible | SEPARATE APPROVAL | لكل خدمة على حدة |

## G3 — تفعيل الخدمات الخمس (بعد G2)

الترتيب الملزم: enrollment_suspension → excused_absence → file_withdrawal → department_transfer → final_chance.

لكل خدمة (بوابات مستقلة):
`Migration → verifier → schema/RLS checks → RPC matrix (+/−) → Workflow activation → E2E موثق → student_visible=true → smoke`

- department_transfer وfinal_chance: مدفوعتان بسداد خارجي يؤكده الموظف المالي يدوياً (EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION) — لا بوابة دفع، لا مبلغ/عملة/فاتورة داخل البوابة.
- department_transfer إضافياً: لا يُفعَّل قبل اكتمال G1 (رؤساء الأقسام) واعتماد وحدة/دور الشؤون الأكاديمية.

## G4 — بوابات أنظمة التوسعة (P2)

| النظام | البوابة الإنتاجية المعلّقة |
|---|---|
| المقاصة الأكاديمية | Migration مستقل + اعتماد وحدة/دور الشؤون الأكاديمية + مفردات النتيجة الرسمية (NEEDS_USER_INPUT) |
| مشاريع التخرج | Migration مستقل + موافقة Storage (مرفقات خاصة) + هويات منسق المشاريع |
| شؤون الخريجين | Migration مستقل + سياسة استمرارية الحسابات + لا إنشاء خريج قبل قرار تخرج رسمي |
| المواد التعليمية | feature flags بعد الاختبارات فقط + سياسات bucket خاص |

## السجلات المحمية (لا Backfill / لا إعادة إشعارات / لا تصحيح)

- الطلب `93807768-a281-42de-bfb4-0c0c03786b20` — SR-20260713-2DE64041
- الطلب `9cfd55a4-b2bf-4266-9c06-52f007ef3afe` — SR-20260715-FEDCB3E1
- الوثيقة USR-2026-000001
- بيانات الاختبار: `ec85cca4-ac93-462c-a0a5-83e8b915bedc` — SR-20260716-26BAD4C8 — USR-2026-000002
