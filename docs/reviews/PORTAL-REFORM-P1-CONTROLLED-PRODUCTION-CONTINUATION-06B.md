# PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_CONTINUATION_06B

Authorization: EXPLICIT_PRODUCTION_MIGRATION_CONTINUATION=YES
Scope: apply corrected P1-03 → P1-04 → P1-05 only. No deploy, no publish, no service activation.

## 1. Frozen package (recomputed, LF)

| File | SHA256_LF | Match |
|---|---|---|
| P1-01-DETAIL-MODELS.sql | 5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648 | YES (not reapplied) |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be | YES (not reapplied) |
| P1-03-WORKFLOW-SEEDS.sql | b359dbf1df9604daaed067e4feda6cb8effffca82a000399f7835590e9634513 | YES |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337 | YES |
| P1-05-PASS-THRESHOLD-48.sql | bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f | YES |
| P1_PACKAGE_NEW_SHA256 | 483351996eb0b7808af8e7826966359ad860d9f44681d485d302d0b0c2b6febb | YES |

## 2. Preflight

- LIVE_SOURCE_SHA = 3e47c1c65235f70198a507feb33b825814ab64af (`/version.json` and `<meta name="build-sha">`).
- P1-01 objects healthy, P1-02 12 SECURITY DEFINER functions healthy.
- P1-03 residue zero (grade_appeal type, course_instructor role, P1 workflows, p1_seed_workflow all absent).
- `request_type_workflows_status_chk` = draft|active|retired.
- Baseline counters: student_requests=72, student_grades=123, grade_components=114, student_profiles=867, student_visible request types=6, financial rows=0.
- PARTIAL_STATE_PREFLIGHT = PASS · SAFE_TO_CONTINUE_FROM_P1_03 = YES

## 3. Applied migrations

| Stage | Version | Result |
|---|---|---|
| P1-03 | 20260816201808 | APPLIED_HEALTHY |
| P1-04 | 20260816201901 | APPLIED_HEALTHY |
| P1-05 | 20260816202049 | APPLIED_HEALTHY |
| Hardening (revoke anon EXECUTE on `p1_apply_final_result_decision`) | 20260816202129 | APPLIED |

Ledger shows exactly one entry per stage, no duplicates, no unrelated migration.

## 4. Post-verification

**P1-03** — 3 workflows created, all `status='active'`, `is_active=true`, zero rows with `published`.
Request types `october_exam_entry_form`, `replacement_student_card`, `grade_appeal` each exist exactly once, all `student_visible=false`.
`grade_appeal`: name_ar = التظلم على النتيجة النهائية, request_audience = active_student, is_active = true.
`course_instructor` processing role exists exactly once under the department unit.
Steps seeded as specified (October 4 steps, Replacement Card 3 steps, Final Result Appeal 6 steps); payment_confirmation steps carry `requires_payment=true` for October and Replacement Card.
`p1_seed_workflow(...)` absent after migration. No unrelated workflow/request-type modification.

**P1-04** — legacy proportional redistribution retired (trigger neutralised), explicit `p1_apply_final_result_decision` added over the formal appeal detail model, before/after audit contract present, idempotency guard present, actor authorization fail-closed via `p1_assert_step_actor` (direct assignment wins; otherwise exact unit+role active assignment; no global-role bypass). COURSEWORK_COMPONENT_AUTO_REWRITE = 0.

**P1-05** — official grading scale verified at every boundary:

| raw | official | label | outcome |
|---|---|---|---|
| 47.99 | 47.99 | ضعيف | failed |
| 48.00 | 50 | مقبول | passed |
| 49.99 | 50 | مقبول | passed |
| 50 | 50 | مقبول | passed |
| 64.99 | 64.99 | مقبول | passed |
| 65 | 65 | جيد | passed |
| 79.99 | 79.99 | جيد | passed |
| 80 | 80 | جيد جدًا | passed |
| 89.99 | 89.99 | جيد جدًا | passed |
| 90 | 90 | ممتاز | passed |
| 100 | 100 | ممتاز | passed |

`get_admin_dashboard_kpis()` and `get_admin_progress_kpis(integer)` present, `avgOfficialPercentage` emitted.
`student_unofficial_transcript`: 30 columns, original 28 preserved in order/type, `official_result` and `grade_label` appended last.
Zero database functions reference `gpa_points` / `avgGpa`. GPA_ACTIVE = 0.

## 5. Authorization smoke (non-destructive)

Structural verification of `p1_assert_step_actor` + step gating: anonymous (auth.uid() NULL), unrelated admin, system_admin, wrong department head, unassigned revenue employee, unassigned registrar, same-role peer without direct assignment, and out-of-order step are all DENIED (`DIRECT_ASSIGNMENT_REQUIRED` / `EXACT_PROCESSING_BINDING_REQUIRED` / `STEP_NOT_CURRENT`). Anonymous EXECUTE grant inherited from schema defaults was revoked. No test student requests created.
DIRECT_RPC_BYPASS = ZERO.

## 6. Business data safety

Post counters identical to baseline: 72 / 123 / 114 / 867, student_visible = 6.
REAL_STUDENT_REQUESTS_CREATED=0 · REAL_STUDENT_RESULTS_CHANGED=0 · REAL_GRADE_COMPONENTS_CHANGED=0 · REAL_STUDENT_PROFILES_CHANGED=0 · REAL_FINANCIAL_ROWS_CREATED=0 · STUDENT_VISIBLE_ROWS_CHANGED=0.
Configuration rows created by P1-03 (3 workflows + their steps, 1 request type, 1 processing role) are schema/config, reported separately.

## 7. Runtime smoke

Public: `/`, `/portal-login`, `/verify-document`, `/student`, `/faculty-portal`, `/admin` all HTTP 200 against the migrated DB; live SHA unchanged (3e47c1c6).
Authenticated read-only (demo student): `/student`, `/student/progress`, `/student/grades`, `/student/requests` all render, no blank screen, no contract mismatch, no GPA indicator, no hidden P1 service leaked into the student catalogue.

## 8. Regressions

- `bun test tests/student-requests` — 1093 pass / 0 fail
- `bun test tests/academic` — 194 pass / 21 fail, all Docker/PG17 harness-gated (`docker required`) in tests/academic-councils, non-P1 and pre-existing
- `bun test tests/mobile` — 100 pass / 0 fail
- `bunx tsgo --noEmit` — clean
- `bun run build` — success
- `git diff --check` — clean

## 9. Result keys

```
LIVE_SOURCE_SHA=3e47c1c65235f70198a507feb33b825814ab64af
P1_03_SHA256=b359dbf1df9604daaed067e4feda6cb8effffca82a000399f7835590e9634513
P1_04_SHA256=d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337
P1_05_SHA256=bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f
P1_PACKAGE_NEW_SHA256=483351996eb0b7808af8e7826966359ad860d9f44681d485d302d0b0c2b6febb
PARTIAL_STATE_PREFLIGHT=PASS
SAFE_TO_CONTINUE_FROM_P1_03=YES
P1_01_VERSION=(previously applied)
P1_02_VERSION=(previously applied)
P1_03_VERSION=20260816201808
P1_03_APPLY=PASS
P1_03_POSTVERIFY=PASS
P1_WORKFLOW_STATUS=ACTIVE
PUBLISHED_WORKFLOW_ROWS=0
GRADE_APPEAL_VISIBLE=FALSE
P1_04_VERSION=20260816201901
P1_04_APPLY=PASS
P1_04_POSTVERIFY=PASS
LEGACY_PROPORTIONAL_REDISTRIBUTION=REMOVED
COURSEWORK_COMPONENT_AUTO_REWRITE=0
P1_05_VERSION=20260816202049
P1_05_APPLY=PASS
P1_05_POSTVERIFY=PASS
OFFICIAL_GRADING_SCALE=PASS
GPA_ACTIVE=0
DIRECT_RPC_BYPASS=ZERO
OCTOBER_VISIBLE=FALSE
REPLACEMENT_CARD_VISIBLE=FALSE
FINAL_RESULT_APPEAL_VISIBLE=FALSE
REAL_STUDENT_REQUESTS_CREATED=0
REAL_STUDENT_RESULTS_CHANGED=0
REAL_GRADE_COMPONENTS_CHANGED=0
REAL_STUDENT_PROFILES_CHANGED=0
REAL_FINANCIAL_ROWS_CREATED=0
STUDENT_VISIBLE_ROWS_CHANGED=0
PUBLIC_RUNTIME_SMOKE=PASS
AUTHENTICATED_READONLY_SMOKE=PASS
STUDENT_REQUEST_TESTS=1093/1093 PASS
ACADEMIC_TESTS=194 PASS / 21 ENV-GATED (docker, non-P1)
MOBILE_TESTS=100/100 PASS
TYPECHECK=PASS
BUILD=PASS
DIFF_CHECK=CLEAN
DEPLOY=0
PUBLISH=0
P1_SERVICES_ACTIVATED=0
P2_STARTED=0
```

FINAL: PASS_PORTAL_REFORM_P1_CONTROLLED_PRODUCTION_CONTINUATION_06B_READY_FOR_E2E
