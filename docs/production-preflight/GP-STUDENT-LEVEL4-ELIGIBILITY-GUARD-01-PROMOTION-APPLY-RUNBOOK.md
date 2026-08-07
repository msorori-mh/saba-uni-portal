# GP Student Level-4 Eligibility Guard — Promotion / Apply Runbook

**Mission:** `GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01`  
**Scenario:** **P1-U** (production ledger has exactly SET U; SET N quarantined)  
**Promoted migration:** `supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql`  
**Draft SHA256:** `9d85fb4b6d7cd5b1ad4c19fb99d913d13b48fce6c83fcde7fca10340a934f1d6`  
**Status:** SOURCE READY — **NOT APPLIED**

## Canonical predecessor set (production)

| # | Ledger version | File |
|---|---|---|
| U1 | `20260806235348` | `supabase/migrations/20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql` |
| U2 | `20260807000230` | `supabase/migrations/20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql` |
| U3 | `20260807001114` | `supabase/migrations/20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql` |
| U4 | `20260807023229` | `supabase/migrations/20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql` |

SET N is evidence-only under `docs/migration-evidence/graduation-projects/duplicate-predecessor-set/`.

## Apply-one procedure (P1-U)

1. Confirm maintenance advisory (brief function catalog locks only; no data rewrite).
2. Run **read-only** preflight:
   `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-PREFLIGHT.sql`
   Expect notice: `GP_L4_PRODUCTION_PREFLIGHT_PASS scenario=P1-U ...`
3. Verify source hash of promoted migration still matches the reviewed draft body
   (header metadata may differ; SQL from `begin;` must match draft).
4. Apply **only**:
   `supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql`
   Single-migration approval. No batching. No concurrent applies.
5. Run **read-only** post-verifier:
   `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-POST-VERIFIER.sql`
   Expect notice: `GP_L4_PRODUCTION_POST_VERIFIER_PASS`
6. Optionally replay disposable PG17 behavioral verifier:
   `tests/graduation-projects/postgres-student-level4-eligibility-guard-verifier.sql`
   (**never** against production).

## Stop conditions

- Preflight raises any `GP_L4_PREFLIGHT_*` exception
- Ledger shows mixed N+U, partial U, or L4 already present (P2)
- Bucket missing/public
- Storage policy not predicate-bound
- Source hash mismatch vs reviewed draft body

## Rollback-by-forward (source-only companion)

File: `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01-ROLLBACK-BY-FORWARD.sql`

- Restores pre-L4 bodies from SET U for seven functions
- Uses **safer** signed-download contract (authz-before-replay preserved; L4 gate removed only)
- Drops the four L4-only helpers
- **DO NOT APPLY** unless an explicit recovery approval is issued
