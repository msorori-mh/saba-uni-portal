# PORTAL-SWARM-TEST-AND-CI-MATRIX

آخر تحديث: 2026-07-21 — المرجع: `origin/main@ff570f3b`

## بوابات الإلزام لكل PR مصدري

`tests المطلوبة → typecheck → lint → build → git diff --check → Web CI → Android CI (حيث ينطبق) → مراجعة مستقلة (CRITICAL=0 HIGH=0 MEDIUM=0)`

## أحدث أدلة نظيفة (clean-room على main + تقرير #180)

| البوابة | النتيجة | المصدر |
|---|---|---|
| bun install --frozen-lockfile | PASS | #180 |
| tests/student-requests | 561/561 PASS | #180 |
| route/navigation + Register contract | 15/15 PASS | #180 |
| tsc --noEmit | PASS | #180 |
| bun run build | PASS (SSR) | #180 |
| git diff --check | PASS | #180 |
| post-build git status | ⛔ HOLD — routeTree.gen.ts dirty (Register footer قانوني) | #180 — بوابة B-4 |
| Web CI على #173/#174/#175/#179 | PASS | أجساد PRs |
| Android CI على #174/#175/#179 runtime pushes | PASS | #180 |

## أدلة قواعد البيانات المنفذة محلياً (PostgreSQL 17 disposable)

| الحزمة | النتيجة | المرجع |
|---|---|---|
| B1 safe RPC matrix (5 خدمات، 24 خطوة) | 285/285 PASS | #166/#169 |
| B1 local PG17 compile (candidate drafts) | 17/17 ثم 18/18 PASS | #162/#167 |
| graduates-affairs draft verifier | PASS | #179 |
| graduation-projects lifecycle/RPC matrix + PG17 verifier | PASS (exit 0 موثق؛ تحقق #178 أكد اكتماله) | #174 |
| academic-clearance PG17 positive/negative | PASS (11 اختبار/63 تأكيد) | #175 |

## مصفوفة الاختبارات الناقصة (فجوات)

| النظام | الفجوة | المهمة |
|---|---|---|
| B1 الخمس | لا E2E موثق؛ لا RPC matrix على الإنتاج؛ لا post-activation smoke | G3 — بعد التفويضات |
| المقاصة | لا اختبارات محضر/اعتمادات/تقارير | Q-14 |
| مشاريع التخرج | PG verifier غير مدرج في CI (Web CI = Install/Lint/Typecheck/Build فقط) | Q-20 |
| المحاضرات | لا شيء بعد | Q-17 |
| المواد | لا اختبارات signed-URL/وصول E2E | Q-18 |
| عام | لا regression suite دورية بعد كل 3 دمجات | يُفعّل مع Q-19+ |

## قاعدة LOW

كل LOW يُعالج أو يُوثَّق سبب قبوله في تقرير المراجعة الخاص بالمهمة.
