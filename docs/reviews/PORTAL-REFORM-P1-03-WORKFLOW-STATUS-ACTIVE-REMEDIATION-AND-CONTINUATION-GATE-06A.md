# PORTAL_REFORM_P1_03_WORKFLOW_STATUS_ACTIVE_REMEDIATION_AND_CONTINUATION_GATE_06A

Date: 2026-08-16 UTC · Mode: SOURCE-ONLY · PRODUCTION_WRITES=0 · MIGRATIONS_APPLIED=0 · DEPLOY=0 · PUBLISH=0

## 1. Root cause pin (production, read-only)

- `request_type_workflows_status_chk` = `CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))`
- Frozen P1-03 seed inserted `status='published'` → `23514` → whole transaction rolled back.
- Residue after rollback (all read-only counts):
  - `grade_appeal` request type = 0
  - `course_instructor` processing role = 0
  - P1 workflows (`change_note='P1 source closure 02 seed'`) = 0
  - `p1_seed_workflow` function = 0
- No production repair performed.

## 2. Source remediation (P1-03 only)

Single semantic line changed in `docs/migration-drafts/p1/P1-03-WORKFLOW-SEEDS.sql`:
`'published'` → `'active'` (canonical executable workflow state). Steps, roles, units,
request types, `student_visible`, and P1-01/02/04/05 semantics untouched. The production
constraint was NOT widened.

## 3. Harness production parity

`scripts/p1-source-closure-02-pg17/00-harness.sql` now declares the production-identical
constraint `request_type_workflows_status_chk CHECK (status IN ('draft','active','retired'))`.
New assertions in `scripts/p1-source-closure-02-pg17/04-status-parity-cases.sql`:

- HARNESS_PRODUCTION_STATUS_PARITY = PASS
- PUBLISHED_STATUS_REJECTED = PASS (insert fails on the named constraint)
- ACTIVE_STATUS_ACCEPTED = PASS
- No `published` workflow rows after P1-03; 3 seeded workflows are `active`; P1 services remain hidden.

## 4. Re-frozen package (SHA256_LF_NORMALIZED_V1)

| File | SHA256_LF |
|---|---|
| P1-01-DETAIL-MODELS.sql | 5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648 (unchanged) |
| P1-02-BACKEND-VALIDATION.sql | 02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be (unchanged) |
| P1-03-WORKFLOW-SEEDS.sql | b359dbf1df9604daaed067e4feda6cb8effffca82a000399f7835590e9634513 (NEW) |
| P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql | d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337 (unchanged) |
| P1-05-PASS-THRESHOLD-48.sql | bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f (unchanged) |

P1_PACKAGE_NEW_SHA256 (sha256 of the five hex digests, newline-separated, in order 01..05):
`483351996eb0b7808af8e7826966359ad860d9f44681d485d302d0b0c2b6febb`
The prior package hash `949094b2…` is retired.

## 5. Full PG17 rehearsal (clean baseline 01→05)

`bash scripts/p1-source-closure-02-pg17/run.sh` → `P1_PG17_REHEARSAL_PASS (5/5 drafts)`.
Each draft applied twice (idempotency). All approved cases pass: October Level4 +4 ALLOW /
+5 DENY / Level3 DENY, replacement-card duplicate DENY, transfer Level1 DENY, appeal
47→48→official 50, coursework components unmutated, revenue gates, positive+negative
authorization matrix with DIRECT_RPC_BYPASS=ZERO, grading boundaries, GPA_ACTIVE=0.

## 6. Partial-state continuation rehearsal

`bash scripts/p1-source-closure-02-pg17/run-partial-continuation.sh` — isolated cluster seeded
with the REAL production prefix (P1-01+P1-02 applied; 03/04/05 absent, asserted by
`PARTIAL_BASELINE_OK`), then corrected P1-03 → P1-04 → P1-05 only, each re-applied for
idempotency, followed by the full case suites →
`PARTIAL_STATE_CONTINUATION_REHEARSAL_PASS`.

## 7. Production read-only preflight

- P1-01 healthy: `october_exam_entry_details`, `replacement_card_details` present;
  `grade_appeal_details` carries all 8 P1-01 columns.
- P1-02 healthy: 12 `p1_*` SECURITY DEFINER functions present.
- P1-03/04/05 not applied; zero residue (section 1).
- Constraint = draft|active|retired (unchanged, not widened).
- Deployed runtime `version.json` sha = `3e47c1c65235f70198a507feb33b825814ab64af` = approved P1-compatible source.
- Safety counters (unchanged): student_requests 72, student_grades 123, grade_components 114,
  student_profiles 867, student_visible request types 6, financial rows 0.

## 8. Regressions

- `bun test tests/student-requests` → 1093 pass / 0 fail
- `bunx tsgo --noEmit` → 0 errors
- `bun run build` → success (routeTree Register footer present)
- `git diff --check` → clean

## Result block

```
ROOT_CAUSE=P1-03 seeded request_type_workflows.status='published' which violates production CHECK request_type_workflows_status_chk (draft|active|retired); harness lacked the constraint and masked it
PRODUCTION_ALLOWED_WORKFLOW_STATUSES=draft|active|retired
P1_03_OLD_STATUS=published
P1_03_NEW_STATUS=active
P1_01_SHA256=5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648
P1_02_SHA256=02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be
P1_03_NEW_SHA256=b359dbf1df9604daaed067e4feda6cb8effffca82a000399f7835590e9634513
P1_04_SHA256=d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337
P1_05_SHA256=bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f
P1_PACKAGE_NEW_SHA256=483351996eb0b7808af8e7826966359ad860d9f44681d485d302d0b0c2b6febb
HARNESS_PRODUCTION_STATUS_PARITY=PASS
PUBLISHED_STATUS_REJECTED=PASS
ACTIVE_STATUS_ACCEPTED=PASS
FULL_FIVE_REHEARSAL=PASS
SECOND_APPLY_IDEMPOTENCY=PASS
PARTIAL_STATE_CONTINUATION_REHEARSAL=PASS
P1_01_PRODUCTION_STATE=APPLIED_HEALTHY
P1_02_PRODUCTION_STATE=APPLIED_HEALTHY
P1_03_PRODUCTION_RESIDUE=ZERO
P1_04_PRODUCTION_STATE=NOT_APPLIED
P1_05_PRODUCTION_STATE=NOT_APPLIED
PRODUCTION_PARTIAL_STATE_PREFLIGHT=PASS
SAFE_TO_CONTINUE_FROM_P1_03=YES
STUDENT_VISIBLE_CHANGED=0
PRODUCTION_WRITES_THIS_MISSION=0
MIGRATIONS_APPLIED_THIS_MISSION=0
DEPLOY=0
PUBLISH=0
```

FINAL: PASS_PORTAL_REFORM_P1_03_WORKFLOW_STATUS_ACTIVE_REMEDIATION_AND_CONTINUATION_GATE_06A
