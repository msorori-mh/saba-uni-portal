# PORTAL-B1-THIRD-MIGRATION-BLOCKER-ONLY-PREFLIGHT-01 — REPORT

**التاريخ:** 2026-07-23 · **النطاق:** preflight مانع-فقط لـ Migration 3 — لا SQL إنتاجي، لا apply، لا تفعيل، لا تعديل بيانات.
**خط الأساس:** `origin/main = e32dbb4b573110655326bda6beadcf66367163c5` — `HEAD == origin/main`، شجرة نظيفة، `git diff HEAD origin/main` فارغ (لا source drift).

## 1. هوية الملف — مُثبتة

| البند | القيمة | النتيجة |
|---|---|---|
| الملف | `docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql` | ✅ موجود على HEAD وorigin/main |
| Git blob | `aedb1d8cff31f13d097a8f6dc798604fa85dc6c9` | ✅ مطابق في `git ls-tree` للاثنين |
| Canonical SHA-256 (git blob/LF) | `3ef082a214a434471f233fc6b6c1802103ecc2a57004039f9a44359aa10135cb` | ✅ مطابق (`git cat-file blob … \| sha256sum`) |

## 2. فحص commits Lovable بعد Migration 1 و2

| Commit | الوصف | المحتوى |
|---|---|---|
| `f9b45c6` | Applied PORTAL-B1-FIRST-MIGR-01 | `20260723061809_….sql` (إصلاح `cancel_official_document`/log-audit) + حذف 10 أسطر من `routeTree.gen.ts` (drift مولّد معروف B-4) |
| `e32dbb4` | هجرة B2 كاملة | `20260723070041_….sql` (`user_matches_workflow_runtime_step`) + `20260723070217_….sql` (actor authorization hardening + `can_current_user_act_on_step` الحالية) + `types.ts` + نفس drift المولّد |

لا commits أخرى بعدهما؛ `e32dbb4` هو tip. الـdrift في `routeTree.gen.ts` مولّد من Lovable ومتطابق بين HEAD وorigin/main — لا يوجد drift مصدري غير معروف.

## 3. الاختبارات المحلية المرتبطة — كلها PASS

| فحص | النتيجة |
|---|---|
| حزام PG17 المركز `scripts/b1-runtime-predecessor-guard-focused-pg17/02-run.ps1` (Docker postgres:17 معزول: schema + hardening + المسودة + الحالات) | ✅ `focused_summary: {"total":5,"failed":0,"passed":5}` — exit 0 |
| `bun test tests/student-requests` | ✅ 566 pass / 0 fail (52 ملفاً) |
| `bunx tsc --noEmit` | ✅ exit 0 |
| `git diff --check` | ✅ exit 0 |

ملاحظة بيئية (لا أثر مصدري): احتاجت البيئة `bun install --frozen-lockfile` وإصلاح تلف كاش bun لحزمة `lucide-react@0.575.0` (`rm -rf ~/.bun/install/cache/lucide-react*` عند تكرار `Cannot find package 'lucide-react'`).

## 4. السجلات المحمية والطلبات القديمة — آمنة بنيوياً

المسودة تحتوي فقط 3× `CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT` داخل `begin/commit` — **صفر DML** (لا INSERT/UPDATE/DELETE). لا يمكنها تعديل أو حذف:
`SR-20260713-2DE64041`، `SR-20260715-FEDCB3E1`، `SR-20260716-26BAD4C8`، `USR-2026-000001`، `USR-2026-000002`، ولا الطلبات القديمة `absence_excuse=14` / `transfer=1` (بلا runtime steps أصلاً). الخطر المكتشف أدناه وظيفي (منع خدمة حية) وليس إتلاف بيانات.

## 5. ⛔ المانع — Migration 3 كما هي تُسقط enrollment_certificate الحية

المسودة تستبدل `can_current_user_act_on_step` بتعريف موحد صارم لكل الأنواع، بينما النسخة المطبقة حالياً (`20260723070217_….sql:343`) تمنح غير-B1 مساراً متساهلاً. إعداد enrollment_certificate الإنتاجي (workflow v2 — 7 خطوات/9 انتقالات، مثبت بـ `20260713020000` ومطابق لـ `request-workflow-preview-registry.ts:387-399`) يكسر الحارس الجديد بثلاثة إخفاقات مستقلة:

1. **رفض فوري لخطوة `initial_review`:** M3 تشترط `p_action = config.action_type` (`review`)، لكن الواجهة تنفذ خطوات المراجعة بـ `p_action='approve'` (`staff-inbox.functions.ts:917` `REVIEW_STEP_EXECUTABLE_ACTIONS` + استدعاء RPC في `:987-992`). وحتى `review` نفسه مرفوض: أحدث `is_valid_actor_request_action` مطبقة (`20260714234442_….sql:6-25`) لا تتضمن `review` ولا `assess_fee`.
2. **حارس السوابق يرفض `registrar_signature` دائماً:** الحارس يفحص **كل** الحواف الواردة؛ حافتا `fee_assessment` (`payment_required` و`fee_not_required`) غير قانونيتين لأن `workflow_action_result_matches` لا حالة فيها لـ `assess_fee` (else false)، وحافة `initial_review→fee_assessment` بنتيجة `approve` بينما `review` يتوقع `reviewed`. كل طلب (مدفوع أو مجاني) يتجمد عند توقيع المسجل.
3. **المسار العودي القانوني مكسور:** بسبب الحواف غير القانونية لا يوجد مسار موجه قانوني من الخطوة الأولى لأي خطوة لاحقة ⇒ `dean_signature`/`document_issuance`/`archive` غير قابلة للوصول.

نقاط الارتطام الإنتاجية: `act_on_student_request_step` (`20260714234724_….sql:516-518`)، و`issue_enrollment_certificate_from_workflow_step` (`20260715010540_….sql:149`)، و`archive_enrollment_certificate_from_workflow_step` (`20260716034114_….sql:37`)، وصندوق «قابل للتنفيذ` (`20260716052558_….sql:244`) — كلها تبواب بـ `can_current_user_act_on_step`. النتيجة: إيقاف كامل للخدمة الحية الوحيدة فور التطبيق.

**ملاحظة حاكمة:** مسودة الإصلاح اللاحقة `B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql` (المخطط لها لاحقاً في السلسلة) توسع المفردات وتعيد `current_user_has_exact_processing_binding`، لكنها **تُبقي** نفس حارس السوابق الموحد وشرط `p_action = action_type` على كل الأنواع — أي أنها لا تعالج هذا المانع رغم أن تعليقها ينص على «Preserve the pre-existing contract for every non-B1 request type, including enrollment_certificate». النية الموثقة والتنفيذ متعارضان.

## 6. خيارات المعالجة (قرار المالك)

- **(أ) — الأقل كلفة والمطابق للنية الموثقة:** تعديل مسودة M3 (أو مسودة مرافقة تُطبق معها/قبلها) لتقييد الحارس الصارم وشرط تطابق الفعل بأنواع B1 المخزنة فقط (`is_b1_stored_request_type`)، مع الإبقاء على المسار الحالي لغير-B1. يلغي هذا تعارض النية/التنفيذ ولا يلمس enrollment_certificate إطلاقاً. **يغيّر blob/SHA-256 المثبتين — يلزم إعادة تثبيت.**
- **(ب)** توسيع `workflow_action_result_matches` لقبول مفردات enrollment_certificate القديمة (`review→approve`, `assess_fee→payment_required/fee_not_required`) — يضعف المخطط القانوني ولا يحل شرط `p_action = action_type` لخطوة المراجعة.
- **(ج)** ترحيل enrollment_certificate إلى نسخة workflow بمفردات قانونية — مكلف ويُجهض الطلبات الجارية المثبتة على v2.

## 7. القرار

**HOLD_THIRD_MIGRATION_BLOCKED_ENROLLMENT_CERTIFICATE_REGRESSION**

- لم يُسلَّم أمر Lovable لمسودة -01: تسليم أمر تطبيق لمسودة تُسقط الخدمة الحية الوحيدة يناقض قاعدة «أقصر مسار آمن» ومراجعة الأثر الإلزامية.
- كل بوابات الهوية والاختبارات والسجلات المحمية PASS؛ المانع الوحيد هو أثر -01 على `enrollment_certificate`.
- السجلات المحمية والطلبات القديمة: لم تُمَس، ولا يمكن للمسودة مسّها (صفر DML).

## 8. ملحق — مسودة المعالجة المقترحة -02 (بانتظار اعتماد المالك)

طبّقنا الخيار (أ) كمسودة جديدة مصدرية فقط (لم يُعدَّل أي ملف قائم):

| البند | القيمة |
|---|---|
| الملف | `docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql` |
| Git blob | `3fb5340a431204db12cf30b6a9caef7a55a242f3` |
| Canonical SHA-256 (LF — الملف خالٍ من `\r`) | `54c1544296374f83bfda9637cfdbd3d3f5f9a9420cb9395daf30034aa4876216` |

**مضمونها:** الدالتان الجديدتان (`workflow_action_result_matches`, `workflow_runtime_predecessors_satisfied`) منسوختان حرفياً من -01. أما `can_current_user_act_on_step` فتنطلق من التعريف **المطبق حالياً** (`20260723070217`) وتقيد الحارس الصارم (توافق config/runtime + حارس السوابق + بوابة الفعل/الانتقال) بفرع B1 فقط (`v_is_b1` — بما فيه الأسماء القديمة `absence_excuse`/`transfer`/`extra_chance`)، مع الإبقاء حرفياً على مسار غير-B1 الذي تشتغل به `enrollment_certificate` اليوم. لا تلمس `is_valid_actor_request_action` (توسيع المفردات مهمة مسودة التقوية اللاحقة — إنكار B1 حتى تفعيلها سلوك fail-closed صحيح).

**التحقق:** حزام PG17 معزول جديد `scripts/b1-runtime-predecessor-guard-scoped-pg17/` — `scoped_summary: {"total":13,"failed":0,"passed":13}` ومنه حارسا الانحدار الحاسمان: موظف مخوّل على `initial_review` بفعل `approve` ← **ALLOW**، وخطوة `sign` عبر مسار الرسوم الصفرية ← **ALLOW**؛ مع رفض الفاعل الخاطئ/بلا ربط/مجهول/المالك/الأدمن بلا تعيين، ورفع B1 الصارم (سلف معلّق ← DENY، مكلف صحيح بفعل مطابق ← ALLOW). البوابات: `bun test tests/student-requests` ‏566/566، `tsc` سليم، `git diff --check` سليم. تكييفان داخل الحزام فقط (موثقان في README الحزام): تعريف فعلي لـ `is_owner_of_request` بدل stub المخطط المصغر، وإسقاط قيدي CHECK اصطناعيين على مفردات `action_type`/`action_result` لأنهما يسبقان مفردات الإنتاج.

**الحالة:** `OWNER_DECISION_REQUIRED_M3_AMENDMENT` — عند اعتماد المالك لـ -02 بديلاً عن -01 في خانة M3، يُجهَّز أمر Lovable الواحد بإثباتات -02 أعلاه. تنبيه للسلسلة: مسودة التقوية اللاحقة (`B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01`) تحتاج نفس التقييد لفرع B1 قبل دورها وإلا أعادت المانع.

## 9. قرار المالك (2026-07-23)

- **اعتمد المالك -02 لخانة M3** بديلاً عن -01 (الخيار «أ» في §6)، وحُظرت `-01` من الإنتاج نهائياً (NEVER-PROMOTE). أُدرج صف M3 في runbook-07 بعد الترتيب 2، وأصبح المدخل 3 في `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` هو `-02` بالتثبيتين أعلاه (blob `3fb5340a…`، SHA-256 `54c15442…`).
- **أُغلقت R-1/R-2/R-3 في هذا الـ PR المصدري الواحد** بتعديل المسودات في مكانها مع إعادة التثبيت: تقييد مسودة التقوية بفرع B1 (R-1)، وإزالة REVOKE دور `authenticated` عن `submit_student_request(uuid)` مع **تأجيله إلى مرحلة cutover منفصلة** (R-2)، وإعادة `'assess_fee'` للقيد البديل (R-3).
