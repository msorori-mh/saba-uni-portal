# PORTAL-FIRST-DELIVERY-SOURCE-RC-01 — تقرير التسليم الأولي للمصدر

Date: 2026-07-26 (UTC)
Coordinator: PORTAL-FIRST-DELIVERY-SOURCE-MERGE-COORDINATOR-OVERNIGHT-01
Repository: msorori-mh/saba-uni-portal
Final main SHA: `f13fede66f121e6f33d55712ebcb5fd6e5e9b7d8` (Web CI ✅ + Android Build ✅ على هذا الـSHA)

## 1. PRs المدمجة في main خلال هذه المهمة

| PR | العنوان | merge commit | main CI |
|----|---------|--------------|---------|
| #257 | fix(b1): restore generated service contract types | `4d93d5a` | Web CI ✅ + Android ✅ |
| #255 | fix(admin-portal): navigation RTL and accessibility consistency | `bacc6df` | Web CI ✅ + Android ✅ |
| #259 | fix(faculty-portal): close mobile 360px overflow review — دُمجت في فرع #251 فقط (stacked) | `b0bade7` (على فرع #251) | — |
| #251 | fix(faculty-portal): navigation RTL and accessibility consistency | `f13fede` | Web CI ✅ + Android ✅ |

تحققات ما قبل الدمج المنفذة لكل PR:
- **#257**: HEAD مثبّت `babdc166…`، OPEN/NOT DRAFT/MERGEABLE/CLEAN، كل checks خضراء، الملفات فقط `src/integrations/supabase/types.ts` + تقرير remediation، freeze test 5/5، student-requests 823/823، وتأكيد احتواء types.ts على `file_withdrawal_details` و`student_request_attachment_uploads` وأسطح RPC المطلوبة.
- **#255**: دمج origin/main داخل الفرع بلا تعارضات، `bun test tests/admin` 245/245، `bun test tests` 1831/1832 (فشل وحيد flaky بيئي في `enrollment-certificate-arabic-pdf-worker-runtime` — يمر منفردًا وفي CI، موثق كقيد Windows/Miniflare سابق الوجود)، tsc ✅، eslint على الملفات المعدلة ✅، build ✅، browser smoke (Chrome headless حقيقي، 360/desktop) 24/24، `git diff --check` ✅، ثم CI أخضر على `b86a851` قبل الدمج.
- **#259**: HEAD مثبّت `07bda59a…`، base مؤكد `review/faculty-portal-navigation-rtl-a11y-qa-01`، وصف PR أُعيدت كتابته بترميز UTF-8 سليم (كان مشوّهًا)، faculty tests 61/61، browser smoke 72/72 PASS / 0 FAIL.
- **#251**: دمج origin/main (بعد #257 و#255) بلا تعارضات — بما فيها `NotificationsBell.tsx` (تداخل #255/#251 اندمج نظيفًا)، faculty tests 61/61، full tests 1881/1881، tsc ✅، eslint (0 أخطاء، 3 تحذيرات react-hooks سابقة الوجود)، build ✅، faculty browser smoke على 360/768/1366 ‏72/72 (يشمل RTL/A11y/logout/error-recovery/negative scenarios)، `git diff --check` ✅، ثم CI أخضر على `ba3111a` قبل الدمج.

## 2. PRs المتوقفة وأسبابها

- **PR #258** (docs/source(b1): SEQ07-B alternate apply package preflight): **لم تُدمج — متوقفة بسبب عدم اكتمال شروط الدمج الإلزامية ضمن نافذة المراقبة.** رُوعيت كل 5 دقائق من ~03:15Z إلى 07:15Z (4 ساعات). عند نهاية النافذة: PR ليست Draft ✅، mergeStateStatus=CLEAN ✅، جميع checks خضراء ✅، مراجعة Codex المستقلة `PASS_PR258_INDEPENDENT_SEQ07_B_REVIEW` منشورة ✅، **لكن تعليق Cursor `PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT` لم يُنشر إطلاقًا** (صفر تعليقات على الـPR طوال النافذة). بقي HEAD ثابتًا على `34c533802a43ddeac9d90d6a7cdb85c8cfd991c9` ولم تُجرَ أي محاولة دمج. فحص تأكيدي أخير عند 16:36Z أظهر استمرار غياب تعليق Cursor. الخطوة التالية لهذه PR: إعادة تفعيلها عند نشر قرار Cursor ثم دمجها وفق نفس البوابات.
- **PRs #249/#250 و#241–#248** (student portal navigation QA وسلسلة student-experience): خارج نطاق PRs المصدرية المحددة في هذا التفويض؛ لم تُدمج ولم تُمس.

## 3. enrollment_certificate regression

- لا انحدار مفتوح على main: E2E المتكامل موثق «enrollment_certificate regression: PASS (all ec/* cases)» (`docs/PORTAL-B1-FIVE-SERVICES-INTEGRATED-RUNTIME-E2E-HARNESS-01-REPORT.md:59`).
- مخاطر السلسلة R-1/R-2/R-3 (من `B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01` وREVOKE على `submit_student_request(uuid)` وإسقاط `assess_fee`) مغلقة بقرار المالك 2026-07-23؛ الحزمة `-01` محظورة نهائيًا (NEVER-PROMOTE) (`docs/PORTAL-B1-CHAIN-REGRESSION-SWEEP-01-REPORT.md`).
- السجلات المحمية `SR-20260713-2DE64041` / `SR-20260715-FEDCB3E1` / `SR-20260716-26BAD4C8` والوثيقتان `USR-2026-000001/2` دون تغيير (`docs/B1-FRESH-PRODUCTION-READONLY-PREFLIGHT-03-REPORT.md:50-58`).
- الحراسة المصدرية: 7 ملفات `tests/student-requests/enrollment-certificate-*.test.ts` + `tests/documents/` (4 ملفات) + `tests/migrations/enrollment-certificate-g3-exception-condition.test.ts`.
- قيد بيئي معروف (ليس انحدار خدمة): `enrollment-certificate-arabic-pdf-worker-runtime` قد يفشل محليًا على Windows (Miniflare readiness) ويمر في CI Linux.

## 4. الخدمات الخمس B1

`enrollment_suspension`، `excused_absence`، `department_transfer`، `final_chance`، `file_withdrawal`:

- **Runtime RPC (مصدرًا)**: 18 migration مروّجة `20260725110000_b1_07` … `20260725160000_b1_24` في `supabase/migrations/`، PG17 compile محلي PASS 18/18. **غير مطبقة على الإنتاج.**
- **الأنواع المولّدة**: `src/integrations/supabase/types.ts` يحوي `enrollment_suspension_details`، `file_withdrawal_details`، `student_request_attachment_uploads`، دوال المرفقات الست، `submit_b1_student_request_atomic`، `act_on_b1_student_request_step_atomic`.
- **الاختبارات**: `bun test tests/student-requests` = **823/823 PASS عبر 77 ملفًا** (أُعيد تأكيده على هذا الفرع بعد الدمجات).
- freeze test `b1-five-services-backend-contract-freeze-01` = 5/5 PASS.

## 5. Student/Staff UI

- مسارات `/student/requests/b1/$service` و`/staff/b1-requests` مع 12 ملف اختبار في `tests/student-requests/b1-ui/` (components, journeys-student/staff, adapters, pages-contract, regression-guard, content-matrix, validation…).
- عقد fail-closed: لا تُعرض خدمة إلا بـ`studentVisible && runtimeAvailable` من الـbackend (`src/lib/student-requests/b1-ui/availability.ts`)؛ لا استيراد Supabase في المكونات؛ mock مقيد بـdevelopment + `VITE_B1_UI_MOCK=1`.
- regression-guard يمنع المفردات المالية، عرض UUIDs، الإرسال الناقص، تسريب storage internals، optimistic status.

## 6. Secure Read / Secure Draft

- **Secure Read** (b1_21): 9 RPCs قراءة، `SECURITY DEFINER` + رفض معتم `B1_READ_ACCESS_DENIED` + `REVOKE FROM PUBLIC,anon` ثم `GRANT authenticated` فقط، بلا bypass عام. PG17: 25/25 PASS.
- **Secure Draft** (b1_22): `create_b1_request_draft_for_student` + `save_b1_request_draft_for_student` مع allowlist صارم لكل خدمة، idempotency، تفرّد المسودة المفتوحة، `B1_STALE_REQUEST_VERSION`. PG17: 35/35 PASS + concurrency.
- اختبارات مصدرية: `b1-secure-read-contracts-01` (14) + `b1-secure-draft-mutations-01` (11) + مراجعتان مستقلتان.

## 7. عقود المرفقات (attachment contracts)

- جدول `student_request_attachment_uploads`: RLS مفعّل، `REVOKE ALL FROM PUBLIC,anon,authenticated`، `field_key='excuse_documents'` فقط، MIME `{pdf,jpeg,png}`، 1..5 MiB، `UNIQUE(bucket,path)`، trigger منع تغيير الهوية.
- حاوية `student-request-secure-attachments` خاصة (`public=false`) — **غير موجودة في الإنتاج بعد** (تُنشأ مع التطبيق).
- upload intent owner-only، object path يُبنى خادميًا (فشل traversal بنيويًا)، التنزيل عبر RPC تفويض + signed URL قصير، إزالة سياسات Storage SELECT المباشرة — القرار `PASS_SECURE_ATTACHMENTS_HIGH_FINDINGS_SOURCE_FIX`.

## 8. مصفوفة التفويض + الرفض السلبي على RPC

- الأبعاد: 5 خدمات × 24 خطوة موظف × 22 فئة رفض (`tests/b1-five-services-authorization/authorization-matrix.json`). القاعدة الإيجابية: فقط المعيّن المباشر النشط بالوحدة والدور المطابقَين.
- التحقق التنفيذي (PostgreSQL 17 disposable، ROLLBACK): **24 positive + 528 negative + 528 zero-mutation + 9 specialized = 0 فشل** — القرار `PASS_B1_FIVE_SERVICES_FULL_RPC_AUTHORIZATION_MATRIX`.
- الرفض يُثبت على مستوى RPC الحقيقي مباشرة (لا الواجهة) مع إثبات صفر mutation على 8 أسطح؛ `unassigned_admin` / `registrar_outside_step` / `dean_outside_step` فئات رفض صريحة — لا bypass عام.
- اختبارات مصدرية: `b1-five-services-authorization-verification-01` 7/7؛ `tests/b1-rpc-matrix/matrix.test.ts` 22/22.

## 9. Browser RTL/A11y

- **Faculty (PR #251 + #259)**: smoke حقيقي (Chrome headless) على 360/768/1366 — 72/72 PASS (privacy, overflow-safe, active-route, menu, notifications, breadcrumbs, logout, not-found, error-recovery + negative-launch/timeout). إغلاق overflow على 360px مؤكد.
- **Admin (PR #255)**: 24/24 PASS على Desktop 1280px وMobile 360px (off-canvas، hamburger، aria-expanded، Escape، فحص خصوصية DOM).
- **Student**: PRs #249/#250 خارج نطاق هذا التفويض ولم تُدمج.

## 10. تأكيد بقاء الخدمات مخفية (hidden-services)

- إثبات إنتاجي read-only: الخمس `student_visible=false` و`is_active=true` مع صفر workflows نشطة وصفر طلبات؛ `enrollment_certificate` دون تغيير (`docs/B1-FRESH-PRODUCTION-READONLY-PREFLIGHT-03-REPORT.md:39-48`).
- لا يوجد في المصدر أي migration يضبط `student_visible=true` للخدمات الخمس.
- الواجهة لا تعرض إلا ما يعيده الـbackend كمرئي — لا تفعيل حدث في هذه المهمة.

## 11. جاهزية الـMigrations

- manifest تسلسلي من 24 مدخلًا (`docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`) محروس بـ`tests/b1-manifest/b1-sequential-apply-manifest.test.ts`؛ سياسات: migration واحدة لكل جلسة، حظر batch/parallel/CI-auto-apply، موافقة بشرية لكل migration، rollback-by-forward فقط.
- Runbook-07 (`docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md`): قائمة never-apply، ترتيب تبعية مع SHA-256 لكل مسودة، متابعة REVOKE المؤجل.
- seq 8–20+ SOURCE_PROMOTED وغير مطبقة؛ الإثبات بأدلة catalog object-level فقط.

## 12. ما يلزم لتفعيل Production (خارج نطاق هذه المهمة)

- اكتمال تطبيق الترتيب التسلسلي 8→24 بجلسات منفصلة وبموافقة بشرية لكل migration.
- Gate 25: خطوة منفصلة مُراجَعة بعد اكتمال الترتيب 24 أخضر؛ تتطلب إثبات release-SHA/Deploy provenance (ختم `APPROVED_RELEASE_COMMIT_PLACEHOLDER` ما زال fail-closed).
- خطة أول تفعيل (`enrollment_suspension`) بست بوابات متسلسلة لكل منها تفويض مستقل، ثم `student_visible=true` لتلك الخدمة فقط، وE2E بهوية آمنة مصرّح بها.
- عوائق موثقة: تعارض رؤساء أقسام CS/IT (حزمة غير مطبقة)، وتطبيق migration إغلاق غموض `log_audit`.

## 13. بوابات هذا الفرع (release/portal-first-delivery-source-rc-01)

- `bun test tests/student-requests` = 823/823 PASS (77 ملفًا) ✅
- `bun test tests` = 1881/1881 PASS (162 ملفًا) ✅
- `bunx tsc --noEmit` = PASS ✅
- `bun run build` = PASS ✅ (TanStack generated Register footer: present)
- `git diff --check` = PASS ✅

## 14. تأكيدات إلزامية

- NO_PRODUCTION_MIGRATION_APPLY
- NO_ACTIVATION
- NO_DEPLOY
- SERVICES_REMAIN_HIDDEN_UNTIL_CONTROLLED_PRODUCTION_SEQUENCE
- لا force push / لا reset --hard / لا حذف worktrees / لا SQL apply طوال المهمة.

## القرار النهائي

**PASS_PORTAL_FIRST_DELIVERY_SOURCE_RC**

- المراحل 1–3 مكتملة: PRs ‏#257 و#255 و#259 و#251 مدمجة في main بتحققات كاملة وCI أخضر بعد كل دمج.
- المرحلة 4: PR #258 أُبقيت مفتوحة عمدًا وفق البروتوكول (غياب قرار Cursor الإلزامي) — هذا إيقاف احترازي موثق وليس فشل تسليم؛ لا يوجد EXACT_FAILURE يستدعي HOLD.
- المرحلة 5: كل البوابات المحلية خضراء على فرع التقرير (انظر القسم 13)، وmain SHA النهائي `f13fede66f121e6f33d55712ebcb5fd6e5e9b7d8` مع Web CI وAndroid Build خضراوين.
