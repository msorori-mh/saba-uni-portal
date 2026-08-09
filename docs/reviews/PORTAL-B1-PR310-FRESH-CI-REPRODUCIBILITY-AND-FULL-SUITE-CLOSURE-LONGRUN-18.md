# PORTAL-B1-PR310-FRESH-CI-REPRODUCIBILITY-AND-FULL-SUITE-CLOSURE-LONGRUN-18

## Mission Identification

| Field | Value |
|-------|-------|
| MISSION_ID | PORTAL-B1-PR310-FRESH-CI-REPRODUCIBILITY-AND-FULL-SUITE-CLOSURE-LONGRUN-18 |
| START_SHA | bf23ee86838dc49c3be299b4e1774b089243163d |
| FINAL_SHA | cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2 |
| PR_NUMBER | #310 |
| BRANCH | fix/b1-production-state-reconciliation-longrun-10 |
| PR_URL | https://github.com/msorori-mh/saba-uni-portal/pull/310 |
| CI_RUN_URL | https://github.com/msorori-mh/saba-uni-portal/actions/runs/31333334324 |

## Release Supersession

SUPERSEDED_RELEASE_VERDICT_LONGRUN17=YES

LONGRUN-17 produced useful local evidence, but its release PASS is superseded because GitHub Web CI failed on the same branch. LONGRUN-17 evidence is treated as locally valid but not release-valid; only the CI-green LONGRUN-18 SHA is authoritative.

## Root Causes

ROOT_CAUSE_FRESH_PG_FAILURE: The canonical fixture included `canonical-fixture/05-operator-provision.sql`, which granted EXECUTE on observer functions to `b1_matrix_operator` before that role existed. On a truly pristine PostgreSQL 17 environment (CI and both local rehearsals), the role did not preexist, so the fixture load failed with `ERROR: role "b1_matrix_operator" does not exist`. The prior LONGRUN-17 local success relied on hidden state/order (operator already present or scripts executed in a different sequence).

ROOT_CAUSE_BUN_SUITE_FAILURE: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json` `step_state_pins` contained stale keys such as `SR-20260801-13000015|archive` that no longer matched the authoritative Fixture-15 / forward-only reissue workflow. `tests/b1-fixture-15-forward-only-reissue-44.test.ts` fail-closed on the drift rather than accepting it.

## Local B1 Verification

### Fresh PG17 State

FRESH_DB_OPERATOR_PREEXISTS=0
FRESH_DB_OBSERVER_PREEXISTS=0
HIDDEN_STATE_DEPENDENCY_REPRODUCED=YES

### Lifecycle Fixes

PRISTINE_FIXTURE_LOAD=PASS
OBSERVER_GRANT_BEFORE_OPERATOR_CREATE=0
PREEXISTING_OPERATOR_ACCEPTED=NO
GLOBAL_PUBLIC_PRIVILEGE_MUTATIONS=0
DROP_OWNED_USED=NO

### 36-Function Authority

FUNCTION_GRAPH_COUNT=36
LOCAL_FUNCTION_COUNT=36
LOCAL_FUNCTION_HASH_MATCH=36/36
SEMANTIC_HISTORICAL_MIGRATION_REWRITES=0

### Fixture-15 Authority Reconciliation

FIXTURE15_AUTHORITY_RECONCILED=YES
FIXTURE15_FORWARD_REISSUE_TESTS=PASS

### Actor Identity

ACTOR_IDENTITY_MODEL=PASS
SET_ROLE_AUTHENTICATED_REQUIRED=NO

### Observation Least Privilege

OBSERVER_PUBLIC_PRIVILEGES=0
OPERATOR_DML_PRIVILEGES=0
OPERATOR_DDL_PRIVILEGES=0
OPERATOR_ARBITRARY_EXECUTE=0

### 267 Negative Authorization Harness

CASE_FILES=267
ATTEMPTED=267
EXPECTED_DENIALS=267
UNEXPECTED_ALLOWS=0
UNEXPECTED_DENIALS=0
SKIPPED=0
BEGIN_COUNT=267
ROLLBACK_COUNT=267
COMMIT_COUNT=0
PRE_PIN_PASS=267
BEFORE_FINGERPRINT_COUNT=267
IN_TX_FINGERPRINT_COUNT=267
AFTER_ROLLBACK_FINGERPRINT_COUNT=267
ZERO_MUTATION_CASES=267

### Failure-Injection Matrix

FAILURE_INJECTION_TOTAL=17
FAILURE_INJECTION_HELD=17

### Cleanup and Residue

OPERATOR_ROLE_RESIDUE=0
OBSERVER_ROLE_RESIDUE=0
OPERATOR_SESSION_RESIDUE=0
OPERATOR_OWNERSHIP_RESIDUE=0
OPERATOR_GRANT_RESIDUE=0
UNRELATED_PRIVILEGE_FINGERPRINT_MATCH=YES

### Repository Test Suite

B1_AUTH_TESTS=202/202
STUDENT_REQUEST_TESTS=1066/1066

The targeted B1 suites passed. The CI-equivalent general Bun suite (excluding LONGRUN-14, exactly as Web CI runs it) passed on GitHub; the same local Windows run showed one environmental Wrangler Worker runtime timeout (see G4 classification below). No B1 source file overlaps with the Wrangler/PDF test area.

### Source Hygiene

TSC=PASS
BUILD=PASS
DIFF_CHECK=PASS

### Pristine Rehearsals

FRESH_REHEARSAL_1=PASS
FRESH_REHEARSAL_2=PASS
HIDDEN_STATE_DEPENDENCY=0

Both rehearsals created a brand-new `postgres:17-alpine` container, asserted operator/observer absence, built and loaded the canonical fixture, provisioned operator/observer/harness, ran the full 267-case architecture harness plus failure-injection matrix, ran explicit cleanup, verified zero residue, and destroyed the container.

## G4 / Wrangler Worker Runtime Classification

UNRELATED_G4_SOURCE_OVERLAP=0
LOCAL_WINDOWS_G4_STATUS=ENVIRONMENTAL_WINDOWS_WRANGLER_TIMEOUT
CI_EQUIVALENT_GENERAL_SUITE=PASS (GitHub)
GITHUB_G4_STATUS=PASS (GitHub Bun tests job)

The only local failure in the CI-equivalent general suite was the existing `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` Wrangler Worker test, which times out on Windows when spawned under `bun:test` concurrency. This test passes individually and passes on GitHub Linux CI. No files under `tools/arabic-pdf-worker-spike/**`, `tests/documents/**`, `wrangler.toml`, or the Arabic PDF worker implementation were modified by LONGRUN-18.

## GitHub CI Result

GITHUB_WEB_CI=PASS
B1_DEFINITIVE_OPERATOR_JOB=PASS
BUN_FULL_TEST_JOB=PASS

All required Web CI jobs are green for FINAL_SHA `cd78a6b4`.

## Safety Boundary

PRODUCTION_READS=0
PRODUCTION_RPC_CALLS=0
PRODUCTION_WRITES=0
PRODUCTION_MIGRATIONS_APPLIED=0
PRODUCTION_ROLE_CHANGES=0
DEPLOYS=0
PR_MERGES=0

No production access, no deployment, and no merge were performed.

## Files Changed (Mission-Scoped Only)

- `scripts/b1-definitive-operator-architecture-14/canonical-fixture/03-observer-functions.sql`
- `scripts/b1-definitive-operator-architecture-14/canonical-fixture/04-harness-functions.sql`
- `scripts/b1-definitive-operator-architecture-14/canonical-fixture/05-operator-provision.sql` (deleted)
- `scripts/b1-definitive-operator-architecture-14/harness/render-negative-cases.ts`
- `scripts/b1-definitive-operator-architecture-14/operator-role/04-cleanup.sql`
- `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json`
- `scripts/b1-rpc-principal-harness-01/rebind-fixture-cases-15.ts`
- `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts`
- `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
- `tests/b1-definitive-operator-architecture-14/fixture-reproducibility-14.test.ts` (new)

## Mandatory Report Return Paths

REPORT_RELATIVE_PATH=docs/reviews/PORTAL-B1-PR310-FRESH-CI-REPRODUCIBILITY-AND-FULL-SUITE-CLOSURE-LONGRUN-18.md
REPORT_ABSOLUTE_PATH=C:/projects/saba-b1-310-definitive-operator-remediation/docs/reviews/PORTAL-B1-PR310-FRESH-CI-REPRODUCIBILITY-AND-FULL-SUITE-CLOSURE-LONGRUN-18.md
REPORT_FILE_URI=file:///C:/projects/saba-b1-310-definitive-operator-remediation/docs/reviews/PORTAL-B1-PR310-FRESH-CI-REPRODUCIBILITY-AND-FULL-SUITE-CLOSURE-LONGRUN-18.md

FINAL_SHA=cd78a6b480e9059d9fb829fb6e64a8e5fd1d98a2
PR_URL=https://github.com/msorori-mh/saba-uni-portal/pull/310
CI_RUN_URL=https://github.com/msorori-mh/saba-uni-portal/actions/runs/31333334324

## Terminal Pass Condition

PASS_B1_PR310_FRESH_CI_REPRODUCIBILITY_AND_FULL_SUITE_CLOSURE_LONGRUN_18
