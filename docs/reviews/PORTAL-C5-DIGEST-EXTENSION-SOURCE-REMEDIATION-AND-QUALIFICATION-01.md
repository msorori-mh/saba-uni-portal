# PORTAL-C5-DIGEST-EXTENSION-SOURCE-REMEDIATION-AND-QUALIFICATION-01

**Mission:** PORTAL-C5-DIGEST-EXTENSION-SOURCE-REMEDIATION-AND-QUALIFICATION-01  
**Owner authorization:** OWNER_APPROVE_COUNCILS_C5_DIGEST_SOURCE_REMEDIATION  
**Mode:** SOURCE REMEDIATION + LOCAL QUALIFICATION ONLY  
**Decision:** `PASS_PORTAL_C5_DIGEST_EXTENSION_SOURCE_REMEDIATION_AND_QUALIFICATION_01`

---

## Identity

```
BASE_SHA=b02241c5ccf92f8057213232092cde81a0231b48
BRANCH=fix/c5-digest-extension-qualification-01
TARGET=supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql
C5_PRODUCTION_STATUS=NOT_APPLIED (project execution record only; no production connection)
```

---

## A — Baseline / confirmed defect

`public.approve_and_lock_council_minutes(uuid, text)` was declared:

```
SECURITY DEFINER
SET search_path = public, pg_temp
...
v_fp := encode(digest(...), 'sha256'), 'hex');
```

With production `pgcrypto` installed in schema `extensions` (not `public`), unqualified `digest(...)` is unresolvable under the pinned `search_path`.

```
CONFIRMED_DEFECT=YES
```

---

## B — Exact source remediation

Semantic change count: **1** (one qualified function call).

**BEFORE:** `encode(digest(...), 'hex')`  
**AFTER:** `encode(extensions.digest(...), 'hex')`

```
SET search_path = public, pg_temp   # UNCHANGED
SEARCH_PATH_WIDENED=NO
C5_SEMANTIC_CHANGE_COUNT=1
C5_CHANGED_FUNCTION_COUNT=1
```

No changes to authorization, lifecycle, quorum, locking, fingerprint input composition, grants, RLS, triggers, or transaction boundaries.

---

## C — Extension contract

```
PGCRYPTO_SCHEMA=extensions
DIGEST_EXPLICITLY_QUALIFIED=YES
SEARCH_PATH_WIDENED=NO
```

Project precedent: `extensions.digest(...)` in enrollment-certificate / materials migrations. Explicit qualification is the narrower security choice versus widening `search_path` on this SECURITY DEFINER RPC.

---

## D — Static C5 scan

Scanned C5 migration for: `digest`, `gen_random_bytes`, `crypt`, `gen_salt`, `hmac`, `pgp_*`, uuid-extension helpers.

| Call | Status |
|---|---|
| `digest(...)` | Remediatied → `extensions.digest(...)` |
| `gen_random_uuid()` | Core `pg_catalog` (PG13+); not an extension-resolution blocker |

```
OTHER_C5_EXTENSION_RESOLUTION_BLOCKERS=0
```

---

## E — Hash re-pin

Contract: `SHA256_LF_NORMALIZED_V1` via `scripts/sha256_lf_normalized_v1.py`.

```
SOURCE_SHA256_RAW=a3f537dcca92645342c35e579932e118cc65d7cd0ba4482083ba978aa7c89648
OLD_SOURCE_SHA256_LF=85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25
NEW_SOURCE_SHA256_LF=364468ba45e1b7fe561316dbcfdcbc76820e63196d7b63df228868ab51011fe0
HASH_CHANGED=YES
```

Updated hash pins only where required for the C5 contract:

- `tests/academic-councils/councils-c0-c9-production-readiness-package.test.ts`
- `docs/migration-evidence/academic-councils/HASHES.txt`
- `docs/migration-evidence/academic-councils/MIGRATION_MANIFEST.json`
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md`

Local disposable fixture aligned to production pgcrypto schema placement (`extensions`) so qualification harnesses resolve `extensions.digest` accurately; fingerprint helpers in councils tests updated to match.

---

## F — PG17 empirical digest resolution proof

Disposable `postgres:17` with `CREATE EXTENSION pgcrypto WITH SCHEMA extensions`.

| Probe | Result |
|---|---|
| `search_path = public, pg_temp` + unqualified `digest(...)` | `ERROR 42883` → `OLD_DIGEST_RESOLUTION_REPRODUCED=YES` |
| same path + `extensions.digest(...)` | `NEW_DIGEST_RESOLUTION=PASS` |
| SECURITY DEFINER probe with pinned `search_path = public, pg_temp` calling `extensions.digest` | PASS |

---

## G — Full C5 disposable rehearsal

Applied predecessors → C0→C4 → remediated C5 on disposable PG17.

```
C5_MIGRATION_LOCAL_APPLY=PASS
```

Catalog probe after apply:

- function body contains `extensions.digest`
- `search_path` remains `public, pg_temp`
- `extensions.digest(text,text)` present

Behavioral C0→C7 chain (including lock path) passed via `councils-c4-c8-late-lifecycle` PG17 harness.

---

## H — Security invariants

```
AUTHORIZATION_SEMANTIC_DIFF=0
LOCKING_SEMANTIC_DIFF=0
RLS_ACL_SEMANTIC_DIFF=0
```

Unchanged by construction (single call-site qualification only):

- SECRETARY_DRAFT_AUTHORITY
- SECRETARY_REVIEW_SUBMIT_AUTHORITY
- CHAIR_APPROVE_LOCK_AUTHORITY
- C1_TRANSITION_CONTRACT
- C3_QUORUM_GATE
- LOCKED_MINUTES_IMMUTABILITY / LOCKED_AGENDA_EVIDENCE / LOCKED_VOTES / LOCKED_VOTE_RESULTS
- AMENDMENT_MODEL / RLS / ACL

---

## I — Focused tests

```
C5_TEST=PASS (bun test tests/academic-councils/councils-c4-c8-late-lifecycle.test.ts — 3 pass)
COUNCILS_READINESS_TEST=PASS (councils-c0-c9-production-readiness-package.test.ts — 8 pass)
COUNCILS_SUITE=PASS (bun test tests/academic-councils — 79 pass / 0 fail)
TSC=PASS (bunx tsc --noEmit)
DIFF_CHECK=PASS (git diff --check)
```

---

## J — Delta hygiene

Changed files:

1. `supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql` — qualify `digest` → `extensions.digest`
2. `tests/academic-councils/councils-c0-c9-production-readiness-package.test.ts` — C5 hash pin + fingerprint helper
3. `tests/academic-councils/councils-c0-c9-release-qualification-remediation.test.ts` — fingerprint helper
4. `tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts` — fingerprint helper
5. `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts` — fingerprint helper
6. `tests/academic-councils/postgres-minimal-schema.sql` — pgcrypto in `extensions` (+ session search_path alignment)
7. `docs/migration-evidence/academic-councils/HASHES.txt` — C5 LF hash
8. `docs/migration-evidence/academic-councils/MIGRATION_MANIFEST.json` — C5 LF hash
9. `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md` — C5 LF hash
10. `docs/reviews/PORTAL-C5-DIGEST-EXTENSION-SOURCE-REMEDIATION-AND-QUALIFICATION-01.md` — this report

No temp files, secrets, or generated junk committed.

---

## K — Git / PR

```
COMMIT_MESSAGE=fix(councils): qualify C5 pgcrypto digest
BRANCH=fix/c5-digest-extension-qualification-01
PR=Draft against main (DO NOT MERGE)
```

CI status recorded after push (Web CI / Migration Review if triggered).

---

## L — Terminal inventory

```
BASE_SHA=b02241c5ccf92f8057213232092cde81a0231b48
BASE_SHA=b02241c5ccf92f8057213232092cde81a0231b48
FINAL_SHA=3c43e69ffb0290465c934ea9eabfe094a5dfa1f8
BRANCH=fix/c5-digest-extension-qualification-01
PR_URL=https://github.com/msorori-mh/saba-uni-portal/pull/322

OLD_SOURCE_SHA256_LF=85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25
NEW_SOURCE_SHA256_LF=364468ba45e1b7fe561316dbcfdcbc76820e63196d7b63df228868ab51011fe0
HASH_CHANGED=YES

CONFIRMED_DEFECT=YES
DIGEST_EXPLICITLY_QUALIFIED=YES
SEARCH_PATH_WIDENED=NO
OTHER_C5_EXTENSION_RESOLUTION_BLOCKERS=0

OLD_DIGEST_RESOLUTION_REPRODUCED=YES
NEW_DIGEST_RESOLUTION=PASS
C5_MIGRATION_LOCAL_APPLY=PASS

C5_SEMANTIC_CHANGE_COUNT=1
C5_CHANGED_FUNCTION_COUNT=1

AUTHORIZATION_SEMANTIC_DIFF=0
LOCKING_SEMANTIC_DIFF=0
RLS_ACL_SEMANTIC_DIFF=0

C5_TEST=PASS
COUNCILS_READINESS_TEST=PASS
COUNCILS_SUITE=PASS
TSC=PASS
DIFF_CHECK=PASS

WEB_CI=PASS
MIGRATION_REVIEW=PASS

PRODUCTION_READS=0
PRODUCTION_WRITES=0
MIGRATION_APPLIED=NO
DEPLOY=NO
PUBLISH=NO
MERGE=NO

CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
```

`FINAL_SHA` above is the semantic remediation commit. Docs-only follow-ups may tip the branch beyond it; PR remains Draft / no merge.

## Final token

```
PASS_PORTAL_C5_DIGEST_EXTENSION_SOURCE_REMEDIATION_AND_QUALIFICATION_01
```
