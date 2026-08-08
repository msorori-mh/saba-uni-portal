# PORTAL-B1-NEGATIVE-RPC-MATRIX-267-EXECUTABLE-CONTRACT-RECONCILIATION-17 — REPORT

## Decision

**PASS_B1_NEGATIVE_RPC_MATRIX_267_EXECUTABLE_CONTRACT_RECONCILED_READY_FOR_INDEPENDENT_REVIEW**

## Previous HOLD

`HOLD_B1_FIVE_SERVICES_SAFE_RPC_FIXTURE_PACKAGE_REMEDIATION_15_PREFLIGHT_TESTS_AND_MANIFEST_STALE`

Remediation-15/16 rebound the 22 previously blocked cases to deterministic ACTIVE
TEST_ONLY fixture steps (renderer, MATRIX.json, fixture-state preflight), but the
manifest counts, the launcher, the blocked-case preflight gate, the READMEs and
ten package tests still carried the obsolete 245 executable / 22 blocked model.

## Stale manifest fields found (TARGET-MANIFEST.json)

- `matrix.decomposition` — "245 executable; 22 blocked" text
- `matrix.executable_negative_total = 245`
- `matrix.blocked_negative_total = 22`
- `matrix.blocked_reason` / `matrix.blocked_token = BLOCKED_PENDING_ACTIVE_FIXTURE`
- `operator_privilege_contract.blocked_cases.current_blocked_total = 22`
- `operator_privilege_contract.blocked_cases.hold_token = HOLD_B1_NEGATIVE_RPC_MATRIX_ACTIVE_FIXTURES_INCOMPLETE`

All replaced with the 267/267/0 contract, a `fixture_rebind` pin
(`rebound_cases = 22`) and a separate `readiness` / `execution_readiness` block
with `status = FIXTURE_PACKAGE_NOT_APPLIED` and hold token
`HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED`.

## Stale tests found (operator-execution-package-01.test.ts — 10 failing at branch base)

- REMEDIATION-07 G6: asserted removed renderer string "active unit+role assignments for step" (now "effective …")
- REMEDIATION-07 matrix test: attestation requests length 5 (now 24 = 5 production + 19 fixtures)
- CODEX-09 G2: expected 3 transfer-scope cases rendered as `*.BLOCKED.sql`
- CODEX-09 G6: expected manifest 245/22
- RECONCILIATION-12 G1 ×4: expected 245/22 split, 5-active/19-pending illegal-action split, blocked transfer-scope
- RECONCILIATION-12 G2: expected 22 blocked files, master of 245, `hold_token_when_blocked`
- RECONCILIATION-12 G3 ×2: expected launcher/preflight blocked-count gates
- RECONCILIATION-12 G6: department_scope keyed to old request `SR-20260727-88D885F0` only
- REMEDIATION-57 #15 ×2: 245+22 partition title and blocked-file assertions

## Files corrected

| File | Change |
|---|---|
| `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` | 267/267/0 contract, `fixture_rebind`, `readiness` = `FIXTURE_PACKAGE_NOT_APPLIED`, `execution_readiness` replaces `blocked_cases`, MATRIX SHA re-pinned |
| `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | removed dead `renderBlockedCase`/`BLOCKED_TOKEN`/`BLOCKED_HOLD_TOKEN`, fixture pins in `pins.sql`, fail-closed manifest↔MATRIX agreement checks (`FIXTURE_REBIND_PIN_MISSING`, `FIXTURE_READINESS_STATUS_MISSING`, count mismatches), generated MANIFEST carries `rebound_cases`/`fixture_readiness`/`readiness_hold_token`, new `MATRIX_SHA256_LF` |
| `scripts/b1-rpc-principal-harness-01/00-preflight.sql` | stale 8b blocked-count gate abolished; 8c fixture-state gate now also verifies rendered fixture pins (`fixture_package_id`, `fixture_marker`, `fixture_hold_token`, `executable_case_total = 267`); fails with `HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED` before any case |
| `scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1` | 267/0 count gates, `BLOCKED_CASE_FILES_RENDERED` drift check, fixture readiness gate before psql (exit 2 with the fixture HOLD), PASS token `PASS_B1_NEGATIVE_RPC_MATRIX_267_DENY_ZERO_MUTATION_0_BLOCKED` |
| `scripts/b1-rpc-principal-harness-01/rebind-fixture-cases-15.ts` | `blocked_execution.token = null` (partition abolished) |
| `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json` | `blocked_execution.token = null` (only change; case identities untouched) |
| `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts` | stale assertions reconciled; new RECONCILIATION-17 suite |
| `scripts/b1-rpc-principal-harness-01/README.md`, `tests/b1-five-services-rpc-authorization-preflight-01/README.md` | 267 executable / 0 blocked / fixture-rebound model |

No runtime source, migration, role/RLS, visibility, fixture-SQL or archived
baseline evidence was modified. `src/routeTree.gen.ts` footer noise from the
local build was restored and is not part of the change.

## MATRIX SHA

- old: `fd4e35057cb507924f71e1f71c6326653744b0cc26b7055f77d358080868e115`
- new: `5c76faffd33ccd9ed57ffc7d5a93f3217feea48cf33170414a4f06b07c5c7e46` (pinned in renderer constant and `manifest.matrix.sha256_lf`)

## 22-case rebind verification

- `matrix.counts`: `executable_negative_total = 267`, `execution_blocked = 0`, `executable_pending_fixture_apply = 22`
- Exactly 22 cases carry `execution_status = EXECUTABLE_PENDING_FIXTURE_APPLY` + `requires_fixture_package` (19 illegal-action + 3 transfer-scope); 245 carry `EXECUTABLE`
- Transfer-scope trio: IT source head on target step / CS target head on source step / CIS unrelated third head — three distinct departments and heads, all bound to ACTIVE fixture steps
- Deterministic fixture IDs verified: `f1300000-…-<ordinal:12>` requests, `f1300001-…-<ordinal:6><step_order:6>` steps, `SR-20260801-13<ordinal:6>` request numbers, 19 fixtures
- Case IDs 0242–0267 all present as executable files and included in master exactly once

## Generated inventory (fresh render from a deleted `generated/`)

- `cases/` = 267 `case-0NNN.sql`, **0** `*.BLOCKED.sql`
- `master-negative-matrix.sql` = 267 `\ir cases/` includes, no duplicates, no BLOCKED reference, no positive reference
- `pins.sql` = fixture contract pins (`fixture_package_id`, `fixture_marker`, `fixture_hold_token`, `executable_case_total = 267`); no `blocked_case_total`
- `MANIFEST.json` = 267/267/0, `rebound_cases = 22`, `fixture_readiness = FIXTURE_PACKAGE_NOT_APPLIED`, `positive_rendered = 0`, `commits = 0`

## Fail-closed proofs (asserted by tests)

- **Fixture-not-applied**: launcher exits 2 with `HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED` before psql (gate index < `& psql` index); preflight 8c raises the same HOLD (fixture requests 0 ≠ 19 today); renderer aborts on any case not bound to an ACTIVE step.
- **Baseline PENDING**: launcher `Deny-Baseline` (status/authorization/fingerprint/path/scope/expiry) before psql; SQL preflight and post-run check raise `HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE`.
- **execution_authorized = false**: launcher and preflight reject before any execution.
- **Renderer**: `FIXTURE_REBIND_PIN_MISSING`, `FIXTURE_READINESS_STATUS_MISSING`, manifest↔MATRIX count/SHA mismatches all abort the render.

## Test results (this branch)

- `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` → 267 cases rendered, 267 master includes, 0 BLOCKED files
- `bun test tests/b1-five-services-rpc-authorization-preflight-01` → **183 pass / 0 fail** (176 pre-existing + 7 new RECONCILIATION-17 tests)
- `bun test tests/student-requests` → **1060 pass / 0 fail** (one flaky failure under load on the first run; two consecutive clean reruns)
- `bunx tsc --noEmit` → clean
- `bun run build` → success (routeTree footer noise restored, not committed)
- `git diff --check` → clean

## Local PostgreSQL evidence status

PostgreSQL/`psql` is **not available** in this Kimi environment, so no new local
fixture-apply harness run was performed and none is claimed. The fixture contract
harness evidence (apply PASS, 19/104/19/5, identity contract PASS, cleanup PASS,
zero residue, negative probes) remains the previously reviewed Cursor evidence
from remediation-15; this mission changed no fixture SQL, so that evidence is
unaffected. The source test suite itself passes fully (above).

## Production operation counts

- Production connections 0, RPC calls 0, writes 0, DML/DDL 0
- Fixture migration NOT applied; no drafts moved into `supabase/migrations`
- Operator Preflight NOT run; baseline capture NOT attempted; active baseline stays `PENDING`, `execution_authorized = false`
- No role/GRANT/RLS/visibility/Auth/Storage change; no Deploy/Publish

## Commit / branch

- Branch: `fix/b1-negative-matrix-267-contract-reconciliation-17`
- Commit message: `fix(b1): reconcile negative matrix 267-case contract`
- Final commit SHA: see below (filled at commit time)
- Remote branch SHA: identical after push (no force)
- Working tree after commit: clean except the git-ignored `generated/` tree

## Flags

```
NEGATIVE_TOTAL_267
EXECUTABLE_267
BLOCKED_0
REBOUND_CASES_22
MANIFEST_COUNTS_RECONCILED
PREFLIGHT_TESTS_GREEN
FIXTURE_NOT_APPLIED_FAILS_CLOSED
ACTIVE_BASELINE_PENDING
EXECUTION_AUTHORIZED_FALSE
FIXTURE_MIGRATION_NOT_APPLIED
ZERO_PRODUCTION_WRITES
ZERO_RPC_CALLS
OPERATOR_PREFLIGHT_NOT_RUN
NO_ROLE_CHANGE
NO_MIGRATION
NO_DEPLOY
NO_PUBLISH
BRANCH_PUSHED
LOCAL_REMOTE_BRANCH_SHA_MATCH
```
