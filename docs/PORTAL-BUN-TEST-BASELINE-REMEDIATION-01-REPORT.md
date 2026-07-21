# PORTAL-BUN-TEST-BASELINE-REMEDIATION-01

| الحقل | القيمة |
|---|---|
| البرنامج | `PORTAL-BUN-TEST-BASELINE-REMEDIATION-AND-PR194-MERGE-01` |
| المستودع | `msorori-mh/saba-uni-portal` |
| الفرع | `ci/add-tests-and-pg-verifiers` |
| الأساس | `origin/main` @ `df90f1a8379da4b15c561a87ebc21e3a31e2550e` |
| تاريخ الإصلاح | 2026-07-21 |
| Bun | `1.3.14` |
| بيئة التحقق | Windows host (`npx bun@1.3.14`) + Docker `oven/bun:1.3.14` للاختبارات المستهدفة؛ إثبات baseline على worktree `origin/main` |
| سجل فشل CI | `C:\projects\portal-local-reports\PR194-BUN-TESTS-FAILURE-LOG.txt` (run `29850894949` / job `88703195105`) |

## 1) جدول الاختبارات الثمانية / الفاشلة

| # | الملف | الحالة | التصنيف | السبب الجذري |
|---|---|---|---|---|
| 1–2 | `tests/security/student-to-cohort-binding-audit-01.test.ts` | كان يفشل منفرداً ومجتمِعاً | **stale expectation** | التوقعات وثّقت مسار `student_academic_status` sibling fallback؛ المصدر أغلقه بـ exact enrollment + `fetchCanonicalCurrentTerm` |
| 3 | `tests/student-portal/canonical-current-term-resolver-01.test.ts` | كان يفشل منفرداً | **stale expectation** | توقّع `const currentTerm = await…` بينما المصدر يستخدم `currentTerm = await…` بعد `let` |
| 4 | `tests/student-portal/detail-eligibility-banner-ux-fix-01.test.ts` | كان يفشل منفرداً | **stale expectation** | العقد الحقيقي: لا بطاقة حمراء للطالب المؤهل؛ بطاقة معلومات زرقاء (`role=note`) مسموحة |
| 5 | `tests/documents/enrollment-certificate-worker-storage-implementation-01.test.ts` (B2) | كان يفشل منفرداً | **stale expectation** | `start.ts` يستورد `auth-attacher.local` عمداً (تجديد JWT) |
| 6–7 | `tests/imports/revalidate-update-existing.test.ts` | ينجح منفرداً؛ يفشل بعد `import-validators-linking` | **mock/shared-state leakage** | `spyOn(getImportDb)` بلا `mockRestore` يعطّل `runWithImportDb` للملفات اللاحقة |
| 8 | `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` (G4) | يفشل عند غياب `bunx` / جاهزية wrangler | **platform/path** (+ harden) | استبدال `bunx` بـ `bun x` + جاهزية stdout/stderr/HTTP |

إثبات baseline: نفس إخفاقات التوقعات على worktree `origin/main` @ `df90f1a` قبل الإصلاح (ليست خاصة بـ #194).

## 2) الملفات المعدّلة

| ملف | نوع الإصلاح |
|---|---|
| `tests/security/student-to-cohort-binding-audit-01.test.ts` | مواءمة الأدلة مع عقد الجمهور الحالي (exact enrollment / fail-closed) |
| `tests/student-portal/canonical-current-term-resolver-01.test.ts` | regex مرن لتعيين `currentTerm` |
| `tests/student-portal/detail-eligibility-banner-ux-fix-01.test.ts` | إثبات «لا بطاقة حمراء» بدل فراغ HTML مطلق |
| `tests/documents/enrollment-certificate-worker-storage-implementation-01.test.ts` | قبول `auth-attacher` أو `auth-attacher.local` |
| `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` | `bun x wrangler` + readiness أقوى |
| `tests/imports/import-validators-linking.test.ts` | `afterEach` + `mockRestore` لـ `getImportDb` |
| `tests/imports/student-academic-status-importer.test.ts` | نفس استعادة الـspy |
| `tests/imports/student-eligibility-importer.test.ts` | نفس استعادة الـspy |

لا حذف اختبارات، لا `skip`/`todo`، لا تضييق `bun test tests/`، لا `continue-on-error`.

## 3) لماذا الإصلاح صحيح وليس تخطياً

- عقود الأمن/الخصوصية للمواد (exact enrollment) والـauth refresh بقيت كما في المصدر؛ حُدّثت التوقعات لتطابق العقد الحالي الموثّق في الكود.
- تسرب `getImportDb` spy أصل حقيقي لتلوث المجموعة — إصلاحة يمنع كذباً إيجابياً/سلبياً بين ملفات الاستيراد.
- G4 harden يقلّل فشل المنصة دون إضعاف إثبات PDF على Worker.

## 4) نتائج التحقق

| الفحص | النتيجة |
|---|---|
| الملفات المستهدفة (Docker Linux، بدون G4) | 50/50 PASS |
| `tests/imports/` مجتمعة | 78/78 PASS |
| `bun test tests/` #1 | **1242 pass / 0 fail** |
| `bun test tests/` #2 (عملية جديدة) | **1242 pass / 0 fail** |
| `tsc --noEmit` | PASS |
| `bun run build` | PASS؛ شجرة نظيفة بعد البناء |
| `git diff --check` | PASS |

## 5) مخاطر متبقية

- G4 يعتمد على `wrangler dev` المحلي؛ فشل بيئة Docker المتداخلة ممكن بينما GitHub Actions Ubuntu ينجح.
- أي `spyOn(getImportDb)` مستقبلي بلا restore سيعيد تلوث المجموعة — النمط الآن موثّق في ثلاثة ملفات استيراد.

## القرار داخل هذا التقرير

جاهز لـ push وإعادة تشغيل بوابات PR #194 ثم squash merge عند:
`quality` + `bun-tests` + `pg-verifiers` 8/8 = PASS على HEAD الجديد ثم على `main`.
