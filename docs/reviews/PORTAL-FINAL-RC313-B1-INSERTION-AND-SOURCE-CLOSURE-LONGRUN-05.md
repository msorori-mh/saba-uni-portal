# PORTAL-FINAL-RC313-B1-INSERTION-AND-SOURCE-CLOSURE-LONGRUN-05

## Mission Identification

| Field | Value |
|-------|-------|
| MISSION_ID | PORTAL-FINAL-RC313-B1-INSERTION-AND-SOURCE-CLOSURE-LONGRUN-05 |
| DRAFT_PR | #313 |
| BRANCH | `rc/portal-final-v4-prebuild-non-b1-01` |
| B1_PR | #310 |
| START_RC_HEAD | `fc103581b71f26213e0b1dbab69166810047501f` |

## Unambiguous SHA vocabulary

```
OLD_RC_HEAD_SHA=fc103581b71f26213e0b1dbab69166810047501f
B1_IMPLEMENTATION_SHA=cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2
B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
FINAL_RC_PRODUCT_SHA=393626a81ba5b6200b56326ffb72c7604b1cdf8d
FINAL_RC_HEAD_SHA=fce000cb7a3823d96c7bcefbbad80ea3331a1f79
```

Do **not** use bare `RC_SHA`.

## A — Release head verification (pre-merge)

Resolved dynamically via `gh` / `git fetch`:

| Head | Expected | Observed | Match |
|------|----------|----------|-------|
| PR #313 | `fc103581…` | `fc103581b71f26213e0b1dbab69166810047501f` | YES |
| PR #310 | `1bdd2faf…` | `1bdd2fafd37515e18031ef79b4f62233ecb12e12` | YES |
| `origin/main` | (informational) | `0ba4ee53c012541fdd1f60977b3f9d54cb9a5e4f` | — |

Pre-merge gates:

| Gate | Result |
|------|--------|
| PR313 Web CI | PASS |
| PR313 Migration Review | PASS |
| PR310 Web CI | PASS |
| PR310 B1 Definitive Operator Architecture | PASS |
| PR310 Bun tests | PASS |

Neither head moved beyond the expected values. No extra delta inspection required.

## B — Merge B1 final head

```
git merge --no-ff 1bdd2fafd37515e18031ef79b4f62233ecb12e12
```

Parents of `FINAL_RC_PRODUCT_SHA`:

1. `fc103581b71f26213e0b1dbab69166810047501f` (OLD RC)
2. `1bdd2fafd37515e18031ef79b4f62233ecb12e12` (B1 final head)

Did **not** cherry-pick only `cd78a6b4`. Full current PR #310 head integrated.

## C — Conflict resolution

```
TEXT_CONFLICTS=1
SEMANTIC_CONFLICTS=0
```

Expected conflict: `.gitattributes`.

Resolved as **STRICT UNION**:

- Preserved all existing RC/GA LF policies (`scripts/ga-*`, `docs/migration-drafts/GA-*`, promoted GA migrations, `tests/graduates-affairs/**`).
- Preserved all B1 deterministic LF rules (packages 65/66 + `scripts/b1-rpc-principal-harness-01/**`).
- No duplicate contradictory patterns.
- No wholesale take of either side.

```
GITATTRIBUTES_SEMANTIC_LOSS=0
```

## D — LONGRUN-18 preservation (local disposable PG17)

Fresh `postgres:17` container on port `54329`. Fixture build artifact loaded; operator/observer/harness provisioned; architecture + failure-injection + fixture-reproducibility suites executed.

```
FIXTURE15_AUTHORITY_RECONCILED=YES
PRISTINE_FIXTURE_LOAD=PASS
OBSERVER_GRANT_BEFORE_OPERATOR_CREATE=0
PREEXISTING_OPERATOR_ACCEPTED=NO
GLOBAL_PUBLIC_PRIVILEGE_MUTATIONS=0
DROP_OWNED_USED=NO

FUNCTION_GRAPH_COUNT=36
LOCAL_FUNCTION_COUNT=36
LOCAL_FUNCTION_HASH_MATCH=36/36

CASE_FILES=267
ATTEMPTED=267
EXPECTED_DENIALS=267
UNEXPECTED_ALLOWS=0
UNEXPECTED_DENIALS=0
SKIPPED=0
BEGIN_COUNT=267
ROLLBACK_COUNT=267
COMMIT_COUNT=0
ZERO_MUTATION_CASES=267

FAILURE_INJECTION_TOTAL=17
FAILURE_INJECTION_HELD=17

OPERATOR_ROLE_RESIDUE=0
OBSERVER_ROLE_RESIDUE=0
OPERATOR_SESSION_RESIDUE=0
OPERATOR_OWNERSHIP_RESIDUE=0
OPERATOR_GRANT_RESIDUE=0
```

```
B1_LONGRUN18_PRESERVED=YES
```

## E — Cross-system security preservation

| Domain | Suite evidence | Token |
|--------|----------------|-------|
| GP Level-4 | `tests/graduation-projects` PASS (incl. disposable PG17 L4) | `GP_SECURITY_PRESERVED=YES` |
| GA authorization | `tests/graduates-affairs` PASS | `GA_SECURITY_PRESERVED=YES` |
| Councils C0–C9 | `tests/academic-councils` PASS | `COUNCILS_SECURITY_PRESERVED=YES` |
| Faculty / #314 | `tests/faculty-portal` + councils semantic remediation PASS | `FACULTY_SECURITY_PRESERVED=YES` |
| PWA / #315 | `tests/pwa` + `tests/mobile` PASS (private cache deny) | `PWA_SECURITY_PRESERVED=YES` |
| Admin / #317 | `tests/admin` PASS (RBAC / nav auth isolation) | `ADMIN_SECURITY_PRESERVED=YES` |
| Student Requests | `tests/student-requests` PASS | `STUDENT_REQUEST_SECURITY_PRESERVED=YES` |
| Enrollment Certificate | B1 preflight + matrix regression pins + EC protection asserts PASS | `ENROLLMENT_CERTIFICATE_PRESERVED=YES` |

No universal admin / dean / registrar bypass.

## F — Migration graph

```
B1_NEW_EXECUTABLE_MIGRATIONS=0
DUPLICATE_MIGRATION_VERSIONS=0
DUPLICATE_MIGRATION_FILENAMES=0
HISTORICAL_MIGRATION_REWRITES=0
```

No edits to existing migration SQL for integration.

## G — Route tree

```
ROUTE_TREE_IDENTICAL=true (vs OLD_RC_HEAD_SHA)
ROUTE_LOSS_COUNT=0
ROUTE_SEMANTIC_SHA256=0eb14f7ecafa41af96166f1f39d918bdff3feeef6a525b3c920ea937f22f6fef
```

Pin retained; no regeneration required.

## H — Manifest

Updated `docs/release/PORTAL-FINAL-RC-V4-INTEGRATION-MANIFEST.md`:

```
B1_PR310_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
B1_IMPLEMENTATION_SHA=cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2
B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
```

Integrated streams (FINAL SOURCE RC):

```
#293, #291, #299, #311, #312, #314, #315, #317, #310
```

No additional feature streams after this point.

## I — Full verification

| Check | Result |
|-------|--------|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS (202/202) |
| `bun test tests/b1-definitive-operator-architecture-14` (PG17) | PASS (10/10) |
| `bun test tests/student-requests` | PASS (1066/1066) |
| `bun test tests/pwa tests/mobile` | PASS (53/53) |
| `bun test tests/admin` | PASS (272/272) |
| `bun test tests/faculty-portal` | PASS (79/79) |
| `bun test tests/academic-councils` | PASS (79/79) |
| `bun test tests/graduates-affairs` | PASS (175/175) |
| `bun test tests/graduation-projects` | PASS (119/119) |
| `bun test tests/runbook` | PASS (21/21) |
| CI-equivalent broad suite (244 files, excl. LONGRUN-14) | 2891 pass / 1 fail* |
| Disposable PG17 B1 LONGRUN-14 | PASS |
| GP L4 disposable PG17 (inside GP suite) | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

\* Local Windows-only failure: `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` Wrangler Worker timeout under `bun:test` concurrency. Classified **environmental**, not product failure. Same classification as LONGRUN-18. GitHub Linux Bun tests previously green on both heads; re-validated on final push.

## J — Final RC security assertions

```
B1_AUTHORIZATION=PASS
GP_L4_GUARD=PASS
GA_AUTHORIZATION=PASS
COUNCILS_AUTHORIZATION=PASS
FACULTY_AUTHORIZATION=PASS
ADMIN_RBAC=PASS
PWA_PRIVATE_CACHE_DENY=PASS
STUDENT_REQUEST_AUTHORIZATION=PASS
ENROLLMENT_CERTIFICATE_PROTECTION=PASS
```

## Safety boundary

```
PRODUCTION_READS=0
PRODUCTION_WRITES=0
PRODUCTION_RPC=0
MIGRATION_APPLIED=NO
ROLE_CHANGES=NO
DEPLOY=NO
PUBLISH=NO
MERGE=NO
```

No production access. Draft PR #313 kept. No merge to main. No auto-merge.

## Files changed (LONGRUN-05 docs scope)

- `docs/release/PORTAL-FINAL-RC-V4-INTEGRATION-MANIFEST.md`
- `docs/reviews/PORTAL-FINAL-RC313-B1-INSERTION-AND-SOURCE-CLOSURE-LONGRUN-05.md`

Product insertion already landed at `FINAL_RC_PRODUCT_SHA` (merge commit).


## M — Hard GitHub gates (tip `fce000cb7a3823d96c7bcefbbad80ea3331a1f79`)

```
WEB_CI=PASS
MIGRATION_REVIEW=PASS
B1_DEFINITIVE_OPERATOR_JOB=PASS
BUN_FULL_TEST_JOB=PASS
PG17_VERIFIER_MATRIX=PASS
```

All required checks SUCCESS on Draft PR #313 tip `fce000cb7a3823d96c7bcefbbad80ea3331a1f79` (no task-scoped remediation required).

## Final token

`PASS_PORTAL_FINAL_RC313_B1_INSERTION_AND_SOURCE_CLOSURE_LONGRUN_05`

(Hard gates: Web CI + Migration Review must PASS on this tip. Docs pin FINAL_RC_HEAD_SHA to the tip identity commit parent when a follow-up pin lands; authoritative tip is git rev-parse HEAD on the Draft PR branch.)
