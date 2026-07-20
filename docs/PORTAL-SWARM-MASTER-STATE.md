# PORTAL-SWARM-MASTER-STATE

البرنامج: PORTAL-AUTONOMOUS-SWARM-COMPLETION-PROGRAM-01
آخر تحديث: 2026-07-21 (Asia/Riyadh)
المرجع المعتمد: `origin/main = ff570f3b0d47b9d0898fa9511c524eceb3f764a8`
القائد العام: Kimi Orchestrator (تفويض قيادي كامل للأعمال غير الإنتاجية)

## مفتاح الحالات

| الرمز | المعنى |
|---|---|
| SOURCE_READY | المصدر مدموج ومجتاز للاختبارات والمراجعة المستقلة |
| PRODUCTION_APPLIED | طُبّق على قاعدة إنتاج Supabase |
| WORKFLOW_ACTIVE | سير العمل مفعّل إنتاجياً |
| STUDENT_VISIBLE | ظاهر للطلاب |
| E2E_VERIFIED | اجتاز E2E موثقاً بحسابات معتمدة |
| OPERATIONALLY_READY | جاهز تشغيلياً مؤسسياً |

## مصفوفة حالة الأنظمة

| النظام | المصدر | قاعدة البيانات | التفعيل | الطالب | E2E | تشغيلي | النسبة |
|---|---|---|---|---|---|---|---|
| الخدمات الطلابية — إثبات قيد (enrollment_certificate) | ✅ مدموج | ✅ مطبق | ✅ | ✅ | ✅ موثق | ✅ | 100% |
| خدمات B1 الخمس (suspension/absence/withdrawal/transfer/final_chance) | ✅ SOURCE_READY (#162/#167/#169/#147) | ⛔ لم تطبق — REQUIRES_USER_APPROVAL | ⛔ | ⛔ | ⛔ | ⛔ | ~55% |
| الخدمات الست المتبقية | ⏸️ DEFERRED_USER_LIFECYCLE_INPUT | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ~15% |
| المقاصة الأكاديمية | ✅ أساس SOURCE_READY (#175) | مسودة SQL فقط | ⛔ | ⛔ | ⛔ | ⛔ | ~35% |
| مشاريع التخرج | ✅ أساس SOURCE_READY (#174) — findings #178 محسومة SUPERSEDED | مسودة SQL فقط | ⛔ | ⛔ | ⛔ | ⛔ | ~30% |
| شؤون الخريجين | ✅ أساس SOURCE_READY (#179) | مسودة SQL فقط | ⛔ | ⛔ | ⛔ | ⛔ | ~30% |
| متابعة تنفيذ المحاضرات | ❌ لم يبدأ | ❌ | ⛔ | ⛔ | ⛔ | ⛔ | 0% |
| المواد التعليمية | 🟡 مجمد — عقود مدموجة (#154/#156/#157) | جزئي | ⛔ feature flags | ⛔ | ⛔ | ⛔ | ~40% |
| المجالس الأكاديمية | ✅ مدموج | ✅ مطبق | ✅ | — | ✅ | 🟡 | ~85% |
| التقارير ولوحات المؤشرات | 🟡 جزئي (PORTAL-REPORTING-COVERAGE-AUDIT-01) | 🟡 | 🟡 | 🟡 | ⛔ | ⛔ | ~40% |
| جودة البيانات والاستيراد | 🟡 جزئي (G9 importer، study plans) | 🟡 | — | — | ⛔ | ⛔ | ~45% |
| تكامل الجداول | 🟡 عقود مدموجة (#149/#150/#152/#153/#158) | 🟡 | 🟡 | 🟡 | ⛔ | ⛔ | ~50% |
| UX/العربية/الجوال | 🟡 تحسينات متفرقة | — | — | — | ⛔ | ⛔ | ~50% |
| التوثيق والتدريب والتشغيل | 🟡 أدلة جزئية (docs/training) | — | — | — | — | ⛔ | ~30% |

## العوائق النشطة (Blockers)

| # | العائق | الأثر | المعالجة |
|---|---|---|---|
| B-1 | `B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL` | يحجب تطبيق الـ18 migration | حزم تفويض فردية → المستخدم |
| B-2 | deployed-artifact provenance غير مثبت من السطح الحي | يحجب أول migration | يتطلب قراءة read-only مفوضة أو بيان نشر Lovable |
| B-3 | تعذّر عدّ `supabase_migrations.schema_migrations` بالدور المتاح | يحجب إثبات تاريخ التطبيق | elevated read-only مفوض |
| B-4 | drift في `src/routeTree.gen.ts` بعد build (Register footer قانوني) | main ليس release candidate نظيف الشجرة | مهمة مصدرية مستقلة (موثقة في #180) |
| B-5 | حالة رؤساء الأقسام CS=0 / IT=2 / IS=1 — حزمة التصحيح (#165) غير مطبقة | يحجب department_transfer | تفويض إنتاجي مستقل → المستخدم |
| B-6 | overloads `log_audit` (6-arg و7-arg) ما زالت مثبتة إنتاجياً | يحجب أول SQL apply | migration الترتيب 1 في runbook-07 |

## findings المراجعات المفتوحة (#177/#178) — محسومة بالتحقق المستقل (2026-07-21)

| المراجعة | نطاقها | حكم التحقق المستقل | القرار |
|---|---|---|---|
| #177 (على #173) | HIGH: تعارض ترتيب الـ18 migration مع runbook-07 | ✅ RECONCILED — 18/18 MATCH (اسم + SHA) على main@ff570f3b؛ المواضع 1/4/5 مطابقة؛ عبارة «production query was possible» محذوفة (0 ظهور)؛ deployed SHA ما زال HOLD/UNPROVEN بسلوك fail-closed صحيح | أُغلق SUPERSEDED |
| #178 (على #174) | HIGH 1 (composite integrity) + MEDIUM 4 + LOW 1 | ✅ SUPERSEDED_BY_MERGED_REMEDIATION — commits المعالجة الخمسة داخل #174 (4559fdd→fff3e73) عالجت الكل قبل الدمج؛ composite FKs على الجداول الـ11، guard trigger للملكية/القسم، archive RPC مغلق مع scan_state=clean، events append-only بـtrigger+revoke، PG17 verifier تنفيذي موثق (exit 0)، begin/commit + catalog precondition | أُغلق SUPERSEDED |

تحفظان توثيقيان غير حاسمين (مهام مستقبلية صغيرة): إدراج PG verifier في CI، وعدم تغطية TRUNCATE (مقبول — الامتياز مسحوب من runtime principals).

## PRs المفتوحة غير المدموجة (غير مراجعات)

| PR | العنوان | الحالة | التوصية |
|---|---|---|---|
| #155 | current-term course read contract (draft) | معلّق — قرارات ملكية معمارية | إبقاء مع NEEDS_USER_INPUT |
| #149 | cohort/delivery-group integration audit (draft) | معلّق لنفس السبب | إبقاء مع NEEDS_USER_INPUT |
| #118 | public home hero desktop fit | قديم (11 يوليو) | مراجعة صلاحية ثم دمج أو إغلاق |
| #98 | staff functional roles rebuild (draft) | قديم (7 يوليو) | تقييم تجاوز — يحتاج قرار |
| #86 | department councils seed planning | قديم (5 يوليو) | تقييم تجاوز |
| #70 | student-affairs workflow security QA (draft) | قديم (30 يونيو) — BLOCKED | تقييم تجاوز بعد إصلاحات لاحقة |
| #49 | HR officer people RLS | قديم (22 يونيو) — يحوي migration | تقييم تجاوز؛ لا دمج دون مراجعة migration |

## الوكلاء النشطون في هذه الدورة

| الوكيل | المهمة | الحالة |
|---|---|---|
| VERIFIER-GP-178 | التحقق من معالجة findings #178 على main | ✅ مكتمل — PASS |
| VERIFIER-B1-177 | التحقق من تسوية ترتيب migrations مع runbook-07 | ✅ مكتمل — RECONCILED |

## المهمة التالية (Next-up)

1. ~~إصدار حكم إغلاق/إبقاء #177 و#178~~ ✅ مكتمل — أُغلقا SUPERSEDED.
2. دمج PR التنسيق بعد مراجعة مستقلة.
3. تقديم حزمة تفويض P0-03 (رؤساء الأقسام) وأول حزمة migration للمستخدم.
4. بدء P2 الدفعة الأولى (المقاصة الأكاديمية + مشاريع التخرج) مصدرياً.
