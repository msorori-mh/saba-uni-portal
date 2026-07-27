# PORTAL-FIRST-DELIVERY-SOURCE-RC-01 — تقرير التسليم الأولي للمصدر

Date: 2026-07-26 (UTC) — updated 2026-07-27 (UTC) by PORTAL-FIRST-DELIVERY-FIVE-STUDENT-SERVICES-SOURCE-CLOSURE-FINAL-02
Coordinator: PORTAL-FIRST-DELIVERY-SOURCE-MERGE-COORDINATOR-OVERNIGHT-01
Repository: msorori-mh/saba-uni-portal
Final main SHA: `2b20cdc39302edcc1bca5ec619bf1b19121b0913` (بعد دمج #258 و#261 و#260؛ Web CI ✅ على هذا الـSHA)

## 1. PRs المدمجة في main خلال هذه المهمة

| PR | العنوان | merge commit | main CI |
|----|---------|--------------|---------|
| #257 | fix(b1): restore generated service contract types | `4d93d5a` | Web CI ✅ + Android ✅ |
| #255 | fix(admin-portal): navigation RTL and accessibility consistency | `bacc6df` | Web CI ✅ + Android ✅ |
| #259 | fix(faculty-portal): close mobile 360px overflow review — دُمجت في فرع #251 فقط (stacked) | `b0bade7` (على فرع #251) | — |
| #251 | fix(faculty-portal): navigation RTL and accessibility consistency | `f13fede` | Web CI ✅ + Android ✅ |
| #258 | docs/source(b1): SEQ07-B alternate apply package preflight | `357e50cb2498531037282bf01f5f03dadcd73434` | Web CI ✅ |
| #261 | docs/test(b1): prepare complete first-delivery backend sequence | `72813caca57ea1fccddf2d6497cb7c72198265ec` | Web CI ✅ |
| #260 | docs: add portal first-delivery independent release audit report | `2b20cdc39302edcc1bca5ec619bf1b19121b0913` | Web CI ✅ |

تحققات ما قبل الدمج المنفذة لكل PR:
- **#257**: HEAD مثبّت `babdc166…`، OPEN/NOT DRAFT/MERGEABLE/CLEAN، كل checks خضراء، الملفات فقط `src/integrations/supabase/types.ts` + تقرير remediation، freeze test 5/5، student-requests 823/823، وتأكيد احتواء types.ts على `file_withdrawal_details` و`student_request_attachment_uploads` وأسطح RPC المطلوبة.
- **#255**: دمج origin/main داخل الفرع بلا تعارضات، `bun test tests/admin` 245/245، `bun test tests` 1831/1832 (فشل وحيد flaky بيئي في `enrollment-certificate-arabic-pdf-worker-runtime` — يمر منفردًا وفي CI، موثق كقيد Windows/Miniflare سابق الوجود)، tsc ✅، eslint على الملفات المعدلة ✅، build ✅، browser smoke (Chrome headless حقيقي، 360/desktop) 24/24، `git diff --check` ✅، ثم CI أخضر على `b86a851` قبل الدمج.
- **#259**: HEAD مثبّت `07bda59a…`، base مؤكد `review/faculty-portal-navigation-rtl-a11y-qa-01`، وصف PR أُعيدت كتابته بترميز UTF-8 سليم (كان مشوّهًا)، faculty tests 61/61، browser smoke 72/72 PASS / 0 FAIL.
- **#251**: دمج origin/main (بعد #257 و#255) بلا تعارضات — بما فيها `NotificationsBell.tsx` (تداخل #255/#251 اندمج نظيفًا)، faculty tests 61/61، full tests 1881/1881، tsc ✅، eslint (0 أخطاء، 3 تحذيرات react-hooks سابقة الوجود)، build ✅، faculty browser smoke على 360/768/1366 ‏72/72 (يشمل RTL/A11y/logout/error-recovery/negative scenarios)، `git diff --check` ✅، ثم CI أخضر على `ba3111a` قبل الدمج.

## 2. PRs المتوقفة وأسبابها

- **PR #258**: ~~متوقفة~~ **أُغلقت بالدمج في 2026-07-27** (merge `357e50cb2498531037282bf01f5f03dadcd73434`) ضمن مهمة SOURCE-CLOSURE-FINAL-02 بعد اكتمال شروط البوابة (HEAD مثبت، CLEAN، checks خضراء، مراجعات PASS منشورة). الإيقاف السابق أدناه للسجل التاريخي فقط: كانت متوقفة بسبب غياب تعليق Cursor `PASS_B1_SEQ07_B_ALTERNATE_APPLY_PACKAGE_PREFLIGHT` ضمن نافذة المراقبة الليلية (03:15Z–07:15Z)، ولم تُجرَ أي محاولة دمج حينها.
- **PRs #249/#250 و#241–#248** (student portal navigation QA وسلسلة student-experience): خارج نطاق PRs المصدرية المحددة في هذا التفويض؛ لم تُدمج ولم تُمس.

## 2أ. إغلاق الخدمات الخمس (SOURCE-CLOSURE-FINAL-02، 2026-07-27)

- **PR #261** (HEAD نهائي `319d551d68196ad645a1b9013d4c7d4b69337001`): دُمجت بعد بوابة كاملة — HEAD/base/draft/CLEAN مثبتة، كل checks خضراء، مراجعة Codex النهائية `PASS_PR261_CODEX_STATIC_FINAL_SECURITY_REVIEW` على نفس الـHEAD (SOURCE_REVIEW=PASS، MOCK_ADAPTER_PRODUCTION_ISOLATION=PASS، DIRECT_RPC_NEGATIVE_AUTHORIZATION=PASS، NO_ROLE_BYPASS=PASS، ENROLLMENT_CERTIFICATE_REGRESSION=NONE). الـHOLD الوحيد كان بيئيًا (`HOLD_CODEX_EXECUTION_ENVIRONMENT_ONLY`, SOURCE_DEFECT_CONFIRMED=NO) — لا blocker مصدري مؤكد.
- **Operational E2E محلي للخدمات الخمس: 5/5 PASS.**
- **Real-app HTTP smoke (بناء Vite React حقيقي عبر CDP): PASS** — صفر أخطاء صفحة/كونسول/أصول، الأسطح الخمسة الحقيقية تعمل (`PASS_PR261_REAL_APP_HTTP_BROWSER_SMOKE` على HEAD `319d551d`).
- **سلسلة SEQ07-B→SEQ24 التسلسلية: PASS** (`PASS_B1_FIRST_DELIVERY_SEQUENTIAL_CHAIN`)، وGate25 محلي فقط (GATE25_LOCAL=PASS) — لا Gate25 إنتاجي.
- **عزل mock adapter عن Production مؤكد مصدرًا**: mock لا يُفعَّل إلا بـ`DEV && VITE_B1_UI_MOCK=1` أو smoke build محلي بعلمين صريحين؛ لا flag إنتاجي قابل للتفعيل الخطأ (`src/lib/student-requests/b1-ui/index.ts`).
- **PR #260** (تقرير التدقيق المستقل): حُدّث بأدلة سلسلة الدمج والخدمات الخمس ثم دُمج (`2b20cdc…`).
- لا migration/no bucket/no student_visible/no Deploy حدث بسبب هذه الدمجات — كلها docs/source فقط.

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

أُعيد تشغيلها في 2026-07-27 على main النهائي `2b20cdc39302edcc1bca5ec619bf1b19121b0913` (مطابق مصدريًا لهذا الفرع — التغيير الوحيد هنا توثيقي):

- `bun test tests/student-requests` = 828/828 PASS (78 ملفًا) ✅
- `bun test tests` = 1886/1886 PASS (163 ملفًا) ✅
- `bunx tsc --noEmit` = PASS ✅
- `bun run build` = PASS ✅ (TanStack generated Register footer: present)
- `git diff --check` = PASS ✅
- release verifier (`scripts/first-delivery/verify-operator-pack.ts`) = exit 0 ✅ (prompts: 17، unique_migrations: 18، bridge_19_20: true، gate25_non_migration: true)

## 14. تأكيدات إلزامية

- NO_PRODUCTION_MIGRATION_APPLY
- NO_PRODUCTION_WRITE
- NO_ACTIVATION
- NO_DEPLOY
- NO_PUBLISH
- NO_GATE25_PRODUCTION
- NO_STUDENT_VISIBLE_CHANGE
- SERVICES_REMAIN_HIDDEN_UNTIL_CONTROLLED_PRODUCTION_SEQUENCE
- لا force push / لا reset --hard / لا حذف worktrees / لا SQL apply طوال المهمة.

## القرار النهائي

**PASS_PORTAL_FIRST_DELIVERY_SOURCE_RC**

- المراحل 1–3 مكتملة: PRs ‏#257 و#255 و#259 و#251 مدمجة في main بتحققات كاملة وCI أخضر بعد كل دمج.
- المرحلة 4 (إغلاق الخدمات الخمس، 2026-07-27): PRs ‏#258 (`357e50c…`) و#261 (`72813ca…`) و#260 (`2b20cdc…`) مدمجة في main ببوابات كاملة — Auth Matrix ‏24/528/528/0، Secure Read ‏25/25، Secure Draft ‏35/35، Operational E2E ‏5/5، Real-app HTTP smoke PASS، لا bypass عام، enrollment_certificate بلا regression، الخدمات الخمس ما زالت مخفية إنتاجيًا.
- المرحلة 5: كل البوابات المحلية خضراء على فرع التقرير (انظر القسم 13)، وmain SHA النهائي `2b20cdc39302edcc1bca5ec619bf1b19121b0913` مع Web CI أخضر.
- الحد المتبقي الوحيد: **موافقة Production فقط** — حزمة التطبيق النهائية جاهزة في `docs/PORTAL-FIRST-DELIVERY-PRODUCTION-APPLY-PACKAGE-FINAL-01.md` (SOURCE-ONLY، بلا تخويل تنفيذ).
