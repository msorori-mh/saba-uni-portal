# PORTAL-COUNCILS-C5-DIGEST-SEARCH-PATH-SOURCE-REVISION-LONGRUN-13

## Verdict

`PASS_PORTAL_COUNCILS_C5_DIGEST_SEARCH_PATH_SOURCE_REVISION_LONGRUN_13`

Source-only C5 Revision 02 created. No production apply.

## Identity

```
MISSION=PORTAL-COUNCILS-C5-DIGEST-SEARCH-PATH-SOURCE-REVISION-LONGRUN-13
BASE_SHA=cde33de20581ceeba62fcc8dc16dc28e864dd338
BASE_PR=#321 / fix/councils-preflight-ledger-lineage-10
BRANCH=fix/councils-c5-digest-source-revision-13
FINAL_SHA=<filled after tip commit>
```

## C5 freeze / revision

```
C5_V1=supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql
C5_V1_SHA=85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25
C5_V1_STATUS=SUPERSEDED_DO_NOT_APPLY
C5_V1_BYTE_UNCHANGED=YES

C5_V2_VERSION=20260810180000
C5_V2=supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql
C5_V2_SHA=0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8
C5_V2_STATUS=CANONICAL_APPLY_CANDIDATE
HASH_CONTRACT=SHA256_LF_NORMALIZED_V1
```

## Root cause

```
ROOT_CAUSE=approve_and_lock_council_minutes is SECURITY DEFINER with search_path=public, pg_temp while pgcrypto digest lives in schema extensions; unqualified digest() resolves to 42883 at lock time.
DEFECT_REPRODUCED=YES (PG17: digest('x','sha256') → 42883; extensions.digest('x','sha256') succeeds)
FIX_STRATEGY=FULLY_QUALIFIED_EXTENSIONS_DIGEST
```

Preferred fix applied: keep `SET search_path = public, pg_temp` and qualify `extensions.digest(...)`. Fail-closed prerequisite `to_regprocedure('extensions.digest(text,text)')` before object creation. No `CREATE EXTENSION` in the migration.

## Semantic delta (V1 → V2)

```
C5_V1_V2_SEMANTIC_DELTA_COUNT=2
C5_UNRELATED_SEMANTIC_DELTA=0
V1_V2_SEMANTIC_DELTA=
  1) source revision metadata/comments
  2) fail-closed extensions.digest prerequisite
  3) encode(extensions.digest(...)) qualification
```

After stripping comments and applying the two permitted transforms, normalized business SQL is byte-equivalent.

## PG17 results

```
PG17_RESULT=PASS
AUTHORIZATION_MATRIX=PASS (secretary review; chair lock; non-chair/admin/dean/registrar/member lock denied)
LOCK_RESULT=PASS
FINGERPRINT_RESULT=PASS (non-null, lowercase hex length 64)
IMMUTABILITY=PASS (locked minutes update/delete; agenda/vote/vote-result mutation denied)
POST_VERIFIER_C5=PASS (includes extensions.digest body assertion)
DEDICATED_VERIFIER=tests/academic-councils/postgres-c5-rev02-digest-verifier.sql
DEDICATED_TEST=tests/academic-councils/councils-c5-digest-source-revision-02.test.ts
```

Full `bun test tests/academic-councils` = 82+ pass including C0→C9 readiness, legacy reconciliation, anti-false-pass lineage (C5 retargeted to V2).

## Governance updates

- `COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md`: logical C5 → Revision 02 only; V1 marked `SUPERSEDED_DO_NOT_APPLY`
- Manifest / HASHES / preflight / rollback / POST-VERIFIER-C5 retargeted to V2
- Local harness installs pgcrypto into `extensions` (production contract)
- C0–C4 pins unchanged

## Production read-only preflight (no apply)

```
PRODUCTION_C4_STATE=APPLIED (ledger tip alias 20260810012715 / 72757e0e-3b8b-46fa-b252-8e1c8b594d3e)
PRODUCTION_C5_STATE=ABSENT (V1 absent, V2 absent, minutes_status type absent, amendments absent, lock RPC absent)
EXTENSIONS_DIGEST_PRESENT=YES
C6_C9_ABSENT=YES
B1_VISIBLE_COUNT=5
PRODUCTION_READS=YES (SELECT catalog/ledger only)
PRODUCTION_WRITES=0
BUSINESS_RPC_CALLS=0
MIGRATION_APPLIED=NO
READY_FOR_SEPARATE_C5_REV02_APPLY_APPROVAL=YES
```

## Validation

```
bun test tests/academic-councils                        PASS
bun test tests/academic-councils/councils-c5-digest-*    PASS
bunx tsc --noEmit                                       PASS
bun run build                                           PASS
git diff --check                                        PASS
```

## Assumptions

- Production apply remains a separate owner-authorized apply-one session after this PR merges and is retargeted as needed.
- V1 remains in `supabase/migrations/` as a frozen historical artifact; operators must follow the apply-one plan (V2 only).

## Risks

- Fresh full-directory migration scanners could still encounter V1 before V2; mitigated by governance + apply-one explicit path.
- C5 V2 timestamp `20260810180000` is after production C4 tip and collision-free; logical C6–C9 order unchanged in the apply plan.

## Blockers

None for source PASS.

## Production impact

None this mission (writes=0, apply=NO). Next authorized step: separate C5 Rev02 apply-one approval.

## Decision

`PASS_PORTAL_COUNCILS_C5_DIGEST_SEARCH_PATH_SOURCE_REVISION_LONGRUN_13`
