# GP Student Level-4 Eligibility Guard — Promotion / Apply Runbook

- **Mission:** `GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01`
- **Scenario:** **P1-U** (production ledger has exactly SET U; SET N quarantined)
- **Promoted migration:** `supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql`
- **Hash contract:** `SHA256_LF_NORMALIZED_V1` (SHA256 over UTF-8 after CRLF/CR → LF; not native checkout SHA256)
- **Draft BODY SHA256_LF:** `9e0422f84d7b5605a63c56b12be2428e97db1cf4fe44a48d0d6b894e2d1086c3`
- **Status:** SOURCE READY — **NOT APPLIED**

## Canonical predecessor set (production)

| # | Ledger version | File |
|---|---|---|
| U1 | `20260806235348` | `supabase/migrations/20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql` |
| U2 | `20260807000230` | `supabase/migrations/20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql` |
| U3 | `20260807001114` | `supabase/migrations/20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql` |
| U4 | `20260807023229` | `supabase/migrations/20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql` |

SET N is evidence-only under `docs/migration-evidence/graduation-projects/duplicate-predecessor-set/`.

## Cross-platform source hash verification (required before apply)

Do **not** use platform-native `sha256sum` / `Get-FileHash` on the raw checkout bytes as the STOP signal.
Checkout line endings (CRLF vs LF) can differ across Windows, Linux, and CI while the Git content is the same.

Use the repository contract `SHA256_LF_NORMALIZED_V1`:

```bash
python scripts/sha256_lf_normalized_v1.py \
  docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql \
  --body

python scripts/sha256_lf_normalized_v1.py \
  supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql \
  --body
```

Expect both to print:

`BODY_SHA256_LF=9e0422f84d7b5605a63c56b12be2428e97db1cf4fe44a48d0d6b894e2d1086c3`

Pinned evidence: `docs/migration-evidence/graduation-projects/L4_PROMOTION_HASHES.txt`

Authoritative promotion equivalence: `DRAFT_BODY_SHA256_LF == PROMOTED_BODY_SHA256_LF` (`BODY_MATCH=true`).

Optional self-check of the hasher itself:

```bash
python scripts/sha256_lf_normalized_v1.py --self-test
```

## Apply-one procedure (P1-U)

1. Confirm maintenance advisory (brief function catalog locks only; no data rewrite).
2. Run **read-only** preflight:
   `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-PREFLIGHT.sql`
   Expect notice: `GP_L4_PRODUCTION_PREFLIGHT_PASS scenario=P1-U ...`
3. Verify canonical LF-normalized BODY hashes match (procedure above).
   Header metadata may differ; SQL from `begin;` must match the reviewed draft after LF normalization.
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
- **Canonical LF-normalized BODY hash mismatch** (`DRAFT_BODY_SHA256_LF` ≠ `PROMOTED_BODY_SHA256_LF`, or either ≠ pinned evidence)

## Rollback-by-forward (source-only companion)

File: `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01-ROLLBACK-BY-FORWARD.sql`

- Restores pre-L4 bodies from SET U for seven functions
- Uses **safer** signed-download contract (authz-before-replay preserved; L4 gate removed only)
- Drops the four L4-only helpers
- **DO NOT APPLY** unless an explicit recovery approval is issued
