# PORTAL_REFORM_P1_SOURCE_ONLY_PRODUCTION_DEPLOY_05C

Date (UTC): 2026-08-16
Scope: application source deploy only. No SQL, no migration, no DB write, no service activation.

## Result

PASS_PORTAL_REFORM_P1_SOURCE_ONLY_PRODUCTION_DEPLOY_05C_READY_FOR_P1_APPLY

## Evidence

| Key | Value |
| --- | --- |
| PRE_DEPLOY_LIVE_SHA | b277088c7887177a121fe4324d5dc2992efdec47 |
| APPROVED_SOURCE_SHA | 3e47c1c65235f70198a507feb33b825814ab64af |
| DEPLOYED_SOURCE_SHA | 3e47c1c65235f70198a507feb33b825814ab64af |
| DEPLOYMENT_ID | lovable-publish (quboolye.com), verified by runtime SHA propagation |
| DEPLOYMENT_TIMESTAMP | 2026-08-16T17:2x UTC (propagation confirmed at poll #9) |
| DEPLOYED_URL | https://quboolye.com |
| VERSION_JSON_SHA | 3e47c1c65235f70198a507feb33b825814ab64af |
| META_BUILD_SHA | 3e47c1c65235f70198a507feb33b825814ab64af |
| SOURCE_SHA_MATCH | YES |
| WORKTREE_CLEAN (pre/post build) | YES |
| RUNTIME_DELTA_AFTER_1470FB81 | ZERO (2 docs + 1 test only) |
| P1_SOURCE_CONTRACT | PASS |
| TYPECHECK | PASS (tsgo --noEmit) |
| BUILD | PASS (bun run build) |
| DIFF_CHECK | PASS |
| ROUTETREE | PASS (regeneration produced no diff) |
| PUBLIC_ROUTE_SMOKE | PASS (/, /portal-login ×3 types, /admin, /verify-document → HTTP 200, no fatal errors) |
| AUTHENTICATED_RUNTIME_SMOKE | PASS (student + faculty demo accounts, read-only) |
| PRE_P1_05_RUNTIME_SAFETY | PASS |
| TRANSCRIPT_28_COLUMN_COMPAT | PASS (progress/results render official percentages) |
| FALSE_GPA_DISPLAYED | NO |
| OCTOBER_VISIBLE | FALSE |
| REPLACEMENT_CARD_VISIBLE | FALSE |
| FINAL_RESULT_APPEAL_VISIBLE | FALSE |
| MIGRATIONS_APPLIED | 0 |
| PRODUCTION_DB_WRITES | 0 |
| STUDENT_VISIBLE_ROWS_CHANGED | 0 |
| WORKFLOWS_ACTIVATED | 0 |
| STUDENT_REQUESTS_CREATED | 0 |
| GRADES_CHANGED | 0 |
| FINANCIAL_ROWS_CREATED | 0 |

## Release stamp note

The publish sandbox has no `.git`, so `vite.config.ts` resolves the build SHA
from the committed release stamp `build-sha.generated.json`. The stamp was
updated from `b277088c…` to the approved candidate `3e47c1c6…` before publish;
this is a non-runtime metadata file and is the mechanism by which
`/version.json` and `<meta name="build-sha">` now report the deployed source
identity. Both were verified live after propagation.

## Runtime observations (new source on pre-P1 database)

- `/student/progress`: official percentage model live (النتيجة التراكمية 79.9%,
  التقدير: جيد/ضعيف), no GPA/4.0 anywhere.
- `/student/requests`: renders «الخدمات الطلابية»; only the pre-P1 services are
  listed. October exam entry, replacement card and final-result appeal are absent.
- `/student/reports`, `/student/study-plan`, `/faculty-portal`,
  `/faculty-portal/courses` load without page errors.
- No crash from missing `october_exam_entry_details`, `replacement_card_details`
  or `p1_*` RPCs.

## Next authorized step

P1-01 … P1-05 controlled production apply (separate mission, one migration per gate).
