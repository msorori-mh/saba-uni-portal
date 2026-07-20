# PORTAL-SWARM-PR-LEDGER

آخر تحديث: 2026-07-21 — المرجع: `origin/main@ff570f3b`

## PRs مفتوحة

| PR | العنوان | النوع | الفحص | التصرف |
|---|---|---|---|---|
| #181 | docs: portal swarm coordination program 01 | تنسيق docs-only (هذا البرنامج) | مراجعة مستقلة مطلوبة قبل الدمج | قيد المراجعة |
| #178 | review: graduation projects MVP foundation 01 | مراجعة مستقلة (draft) على #174 المدموج | findings: HIGH 1 / MEDIUM 4 / LOW 1 عند head b2938c1 | ✅ مغلق 2026-07-21 — SUPERSEDED_BY_MERGED_REMEDIATION (تحقق مستقل: commits 4559fdd→fff3e73 داخل #174 عالجت الكل قبل الدمج f970b9c) |
| #177 | docs: independent review of B1 activation preflight 02 | مراجعة مستقلة (draft) على #173 المدموج | HIGH 1 (تعارض ترتيب) / LOW 1 | ✅ مغلق 2026-07-21 — SUPERSEDED_BY_RECONCILIATION (تحقق مستقل: 18/18 MATCH مع runbook-07 على main@ff570f3b) |
| #155 | feat: current-term course read contract (draft) | مصدر | build محلي HOLD؛ CI هو الحكم | إبقاء — D-20 |
| #149 | docs: cohort/delivery-group integration audit (draft) | توثيق معماري | مراجعة 0/0/0/0 | إبقاء — D-20 |
| #118 | fix: public home hero desktop fit | UI | قديم | Q-19 تقييم |
| #98 | codex: staff functional roles rebuild (draft) | مصدر | قديم؛ ملاحظات app_role enum | Q-19 تقييم |
| #86 | docs: department councils seed planning | توثيق | قديم | Q-19 تقييم |
| #70 | docs: student-affairs workflow security QA (draft) | توثيق أمني BLOCKED | قديم؛ إصلاحات لاحقة محتملة | Q-19 تقييم |
| #49 | security: HR officer people RLS | مصدر + migration | قديم جداً (22 يونيو) | Q-19؛ لا دمج دون مراجعة migration معاصرة |

## PRs مدموجة — دورة التوازي الأخيرة (18–21 يوليو)

| PR | العنوان | الدمج | القرار |
|---|---|---|---|
| #180 | reconcile portal parallel activation and expansion cycle | 2026-07-20 `ff570f3` | سجل الحقيقة المرحلي الحاكم |
| #179 | graduates affairs MVP foundation 01 | `53c4014` | PASS_SOURCE_READY (0/0/0) |
| #176 | B1 production activation command cycle 01 | — | FIRST_MIGRATION_READY = NONE |
| #175 | academic clearance foundation 01 | `b565200` | PASS_SOURCE_READY (0/0/0) |
| #174 | graduation projects MVP foundation 01 | `f970b9c` | PASS_SOURCE_READY — findings #178 محسومة SUPERSEDED بالتحقق المستقل |
| #173 | B1 five-services activation preflight 02 | `0477206` | HOLD_B1_PRODUCTION_ACTIVATION_PREFLIGHT — الترتيب متسق مع runbook-07 (تحقق مستقل) |
| #172 | accept legal Lovable generated Register footer | — | validator fail-closed |
| #171 | stabilize TanStack Start Register augmentation | — | مرتبط ببوابة B-4 |
| #170 | make B1 release build reproducible | — | — |
| #169 | B1 runtime predecessor guard | `7501156` | 285/285 PG17 |
| #167 | B1 preflight blockers remediation (log_audit) | — | SOURCE REMEDIATED |
| #166 | B1 safe RPC matrix harness | `a0794cc` | 285/285 |
| #165 | department chairs controlled fix package | `b50979a` | جاهز — ينتظر D-01 |
| #164 | B1 release & first-service preflight pack | `754cdc2` | deployed SHA = UNKNOWN |

## قاعدة الإغلاق

لا يُغلق أي PR إلا بعد توثيق السبب في هذا السجل: `SUPERSEDED_BY_<PR#>` أو `OBSOLETE_BECAUSE_<سبب>` أو `MERGED_EQUIVALENT`.
