# PORTAL-B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09 — Report

Mode: **SOURCE-ONLY REMEDIATION**
Entry HEAD: `a1a5985c063c9ebe4e58b1e4cb9b9a785ba898f1`

Decision: **PASS_B1_NEGATIVE_RPC_MATRIX_STALE_BASELINE_INVALIDATED_SOURCE_READY_FOR_REVIEW**

## 1. Stale baseline inventory (as found)

| Field | Value |
| --- | --- |
| path | `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` |
| status | `PINNED` |
| fingerprint | `be5040a4fd34fc1fbab235e118c509d0` |
| captured_at_utc | `2026-07-29T23:20:07Z` |
| valid_for_minutes | `120` |
| reviewed_package_sha | `a1c86ea42b600e67f38c69a1cd610a916a33c312` |
| migration head attested | `20260729173359` |
| scope | 8 request numbers (5 TEST_ONLY B1 fixtures + 3 protected legacy) |
| manifest artifact_sha256 | `71b0ddf9cad59c22ed5281aa8729140106240cdaf46a40f57a4d784a7f32f510` |

## 2. Expiration calculation

`2026-07-29T23:20:07Z + 120 min = 2026-07-30T01:20:07Z`.
Current mission time `2026-07-31T21:30Z` → expired by **~44 h 10 min**. FAIL.

## 3. SHA mismatch

`reviewed_package_sha = a1c86ea4…` vs. current execution SHA `a1a5985c…` (entry HEAD) → **mismatch**. FAIL.

## 4. Migration-head mismatch

Baseline attests `20260729173359`; production head after the Stage 3 forward-only cleanup is
`20260731203030` → **mismatch**. FAIL.

Additionally the request scope changed: the Stage 3 cleanup deleted 37 TEST_ONLY requests, so the
pinned scope and the pinned fingerprint can no longer be reproduced.

## 5. Archived evidence path

`scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json`
sha256 `01b55cd4322d2bb9ecc2c058e4a5ff99919ee3f1308bbbdacaac6ca7936099d4`

Archival metadata: `status = STALE`, `execution_authorized = false`,
`selectable_by_launcher = false`, `invalidated_after_migration = 20260731203030`,
`on_selection_attempt = HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE`, and the five
`invalidated_reason` entries (expiry, SHA mismatch, migration-head mismatch, scope change,
TEST_ONLY deletions). All historical values are preserved verbatim under `historical_record`.
The launcher hard-codes the canonical active path and rejects anything under `baseline/archive/`.

## 6. Active PENDING baseline

`scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json`
sha256 `242d1080cbc10e08b62dc7a83f45b71bb09a530c9d1e236b6d5254bd6addef28`

```
status                     = PENDING
execution_authorized       = false
fingerprint                = null
captured_at_utc            = null
valid_for_minutes          = null
reviewed_package_sha       = null
migration_head             = null
expected_migration_head    = 20260731203030   (required, NOT captured)
scope                      = []
operator_preflight_executed= false
negative_cases_executed    = 0
contains_secrets           = false
on_mismatch                = HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE
```

No production fingerprint and no request ID from the stale baseline were carried over (asserted by test).
`TARGET-MANIFEST.json → authoritative_baseline` mirrors this state and pins the new artifact hash.

## 7. Launcher / preflight fail-closed rules

Rejection family for every rule: **`HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE`**
(launcher exit code 3, before any render and before psql is invoked).

1. `status != PINNED`
2. `execution_authorized != true`
3. `fingerprint` is null (manifest or artifact) / manifest↔artifact fingerprint mismatch
4. baseline expired (`captured_at_utc + valid_for_minutes` in the past)
5. `reviewed_package_sha` differs from the exact execution SHA (`git rev-parse HEAD`)
6. migration head differs from `20260731203030`
7. matrix SHA differs
8. package-source hash differs (baseline artifact sha256 vs. manifest pin)
9. function graph differs
10. request scope differs / empty scope
11. service visibility differs
12. `enrollment_certificate` protected baseline differs
13. current production fingerprint differs (SQL preflight + post-run `fingerprint-check.sql`)
14. baseline path is not the canonical active path (archived artifacts never selectable)

SQL layer: `00-preflight.sql` section 6 now also gates `baseline_execution_authorized`,
`baseline_artifact_path` and `baseline_expected_migration_head`/`baseline_migration_head`; every
raise carries the HOLD family token. `generated/fingerprint-check.sql` renders
`v_expected text := NULL` and raises the same family.

## 8. Test results

| Command | Result |
| --- | --- |
| `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | rendered 267 negative cases + master (245 executable / 22 blocked) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **176 pass / 0 fail** (5 files) |
| `bun test tests/student-requests` | **1048 pass / 0 fail** (96 files) |
| `bunx tsc --noEmit` | clean |
| `bun run build` | success |
| `git diff --check` | clean |

New offline proofs (`stale-baseline-invalidation-09.test.ts`): PENDING blocks, expired PINNED blocks,
wrong `reviewed_package_sha` blocks, wrong migration head blocks, stale scope blocks, null fingerprint
blocks, fingerprint mismatch blocks, archived baseline not selectable, only the canonical active path
accepted, operator preflight unexecuted, production RPC count zero.

## 9. Changed files

- `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` (reset to PENDING)
- `scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json` (new)
- `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json`
- `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts`
- `scripts/b1-rpc-principal-harness-01/00-preflight.sql`
- `scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1`
- `scripts/b1-rpc-principal-harness-01/generated/pins.sql`, `generated/fingerprint-check.sql` (re-rendered)
- `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts`
- `tests/b1-five-services-rpc-authorization-preflight-01/stale-baseline-invalidation-09.test.ts` (new)
- `docs/B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09-REPORT.md` (this file)

## 10. Git sync

- Final commit SHA: `275b582f317446a2096c8aceac4f1ca919d4ef01`
- Local == remote after sync; working tree clean (`git diff --check` clean, no unstaged changes).

## 11. Flags

```
STALE_BASELINE_ARCHIVED
ACTIVE_BASELINE_PENDING
ACTIVE_FINGERPRINT_NULL
EXECUTION_AUTHORIZED_FALSE
EXPECTED_MIGRATION_HEAD_20260731203030
OPERATOR_PREFLIGHT_NOT_RUN
NEGATIVE_CASES_EXECUTED_0
ZERO_RPC_CALLS
ZERO_PRODUCTION_WRITES
NO_ROLE_CHANGE
NO_MIGRATION
NO_DEPLOY
NO_PUBLISH
```
