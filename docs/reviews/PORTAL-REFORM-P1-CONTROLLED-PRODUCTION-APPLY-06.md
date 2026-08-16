# PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06

Date (UTC): 2026-08-16
Verdict: **HOLD_PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06_SOURCE_DEPLOY_REQUIRED_FIRST**

MIGRATIONS_APPLIED = 0 · PRODUCTION_WRITES = 0 · DEPLOY = 0 · PUBLISH = 0 · STUDENT_SERVICES_ACTIVATED = 0

---

## 0. Frozen package gate — PASS

Hash contract: `SHA256_LF_NORMALIZED_V1` (`scripts/sha256_lf_normalized_v1.py`).

| File | Recomputed SHA256_LF | Expected | Match |
| --- | --- | --- | --- |
| P1-01-DETAIL-MODELS.sql | 5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648 | same | YES |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be | same | YES |
| P1-03-WORKFLOW-SEEDS.sql | 4d0d3ad825a43b26a01951cac9be3b351ebf7830086b4721dd123c116fed2b19 | same | YES |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337 | same | YES |
| P1-05-PASS-THRESHOLD-48.sql | bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f | same | YES |

FROZEN_PACKAGE_MATCH = YES
P1_PACKAGE_SHA256 = 949094b2c312db8a23d653296a821a9844e980d9d51d7440dcae7f2110d94905 (as pinned by the mission order; all five member hashes verified identical)

No source file was modified in this mission.

## 1. Deployed-runtime compatibility gate — FAIL (blocking)

DEPLOYED_RUNTIME_IDENTIFIER = https://quboolye.com (= https://saba-uni-portal.lovable.app, 302 → custom domain)
DEPLOYED_RUNTIME_SOURCE_SHA = b277088c7887177a121fe4324d5dc2992efdec47
Evidence: `GET /version.json` → `{"sha":"b277088c…"}`; `<meta name="build-sha" content="b277088c…">` on the served HTML.
Current source HEAD = 1470fb81a698303704c7b4404e573bc54c64109b (deployed SHA is an ancestor; **610 commits behind**, 166 changed files under `src/`).

P1_SOURCE_COMPATIBLE_WITH_NEW_DB = **NO**

Concrete incompatibilities of the deployed bundle against the post-P1-05 database contract:

1. `src/lib/academic/grading-scale.ts` and `src/lib/academic/pass-threshold.ts` do **not exist** in b277088c — the deployed runtime has no official-grading (48 / normalize-to-50 / Arabic band) logic at all.
2. `src/lib/academic-status.functions.ts@b277088c` consumes `get_admin_progress_kpis().avgGpa`; P1-05 replaces that output with `avgOfficialPercentage` and removes the GPA indicator. `src/routes/admin/executive-dashboard.lazy.tsx@b277088c` renders `progress.avgGpa.toFixed(2)` and exports «متوسط GPA» — after P1-05 this reports a permanent 0.00 GPA on the live executive dashboard, i.e. a false academic indicator.
3. `src/lib/admin-dashboard.functions.ts@b277088c` reads `successRate` computed by the legacy 60% pass mark; P1-05 re-bases it on 48. The deployed labels/report exports are still legacy-worded.
4. P1 student-service contracts (October exam entry, replacement card, formal final-result appeal — 21 files / +1410 lines under `src/lib/student-requests` and `src/lib/academic`) are absent from the deployed bundle, so the seeded workflows/types from P1-02/P1-03 would have no matching client contract.

Per mission section 1, the run **stopped before any production write**. No preflight write, no migration, no ledger entry.

## 2–13. Not executed

Sections 2 through 13 were not run because section 1 mandates an unconditional stop.

## Report fields

```
FROZEN_PACKAGE_MATCH=YES
P1_PACKAGE_SHA256=949094b2c312db8a23d653296a821a9844e980d9d51d7440dcae7f2110d94905
DEPLOYED_RUNTIME_IDENTIFIER=https://quboolye.com (saba-uni-portal.lovable.app)
DEPLOYED_RUNTIME_SOURCE_SHA=b277088c7887177a121fe4324d5dc2992efdec47
P1_SOURCE_COMPATIBLE_WITH_NEW_DB=NO
DEPLOYED_RUNTIME_COMPATIBILITY=FAIL
PRE_APPLY_PREFLIGHT=NOT_RUN
SAFE_TO_APPLY=NOT_EVALUATED
P1_01_VERSION=NOT_CREATED
P1_01_APPLY=NOT_RUN
P1_01_POSTVERIFY=NOT_RUN
P1_02_VERSION=NOT_CREATED
P1_02_APPLY=NOT_RUN
P1_02_POSTVERIFY=NOT_RUN
P1_03_VERSION=NOT_CREATED
P1_03_APPLY=NOT_RUN
P1_03_POSTVERIFY=NOT_RUN
GRADE_APPEAL_TYPE_CREATED=NO
GRADE_APPEAL_VISIBLE=FALSE (unchanged; type still absent in production)
P1_04_VERSION=NOT_CREATED
P1_04_APPLY=NOT_RUN
P1_04_POSTVERIFY=NOT_RUN
P1_05_VERSION=NOT_CREATED
P1_05_APPLY=NOT_RUN
P1_05_POSTVERIFY=NOT_RUN
OFFICIAL_GRADING_SCALE=NOT_APPLIED_TO_PRODUCTION
GPA_ACTIVE=UNCHANGED_LEGACY (production still legacy; no P1 change made)
AUTHZ_SMOKE=NOT_RUN
DIRECT_RPC_BYPASS=NOT_RUN
MIGRATION_LEDGER=UNCHANGED (0 new entries)
REAL_STUDENT_REQUESTS_CREATED=0
REAL_STUDENT_RESULTS_CHANGED=0
REAL_GRADE_COMPONENTS_CHANGED=0
REAL_STUDENT_PROFILES_CHANGED=0
REAL_FINANCIAL_ROWS_CREATED=0
STUDENT_VISIBLE_ROWS_CHANGED=0
STUDENT_REQUEST_TESTS=NOT_RUN (no source change this mission)
ACADEMIC_TESTS=NOT_RUN
MOBILE_TESTS=NOT_RUN
TYPECHECK=NOT_RUN
BUILD=NOT_RUN
DIFF_CHECK=CLEAN (no source modified)
DEPLOY=0
PUBLISH=0
STUDENT_SERVICES_ACTIVATED=0
```

FINAL: **HOLD_PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06_SOURCE_DEPLOY_REQUIRED_FIRST**

## Required unblocking step (owner decision, not performed here)

Deploy/publish the current P1-closed source (HEAD `1470fb81`, or the reviewed release SHA of your choice containing `src/lib/academic/grading-scale.ts`, `pass-threshold.ts`, and the P1 service contracts), verify the runtime SHA via `/version.json`, then reissue `PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_APPLY_06`. The frozen five-file package needs no changes.
