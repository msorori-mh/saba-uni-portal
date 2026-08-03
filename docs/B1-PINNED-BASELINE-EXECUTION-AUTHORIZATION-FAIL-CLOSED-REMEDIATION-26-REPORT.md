# PORTAL-B1-PINNED-BASELINE-EXECUTION-AUTHORIZATION-FAIL-CLOSED-REMEDIATION-26 — Report

Mode: **SOURCE-ONLY SECURITY REMEDIATION** (no production connection, no production SQL,
no RPC execution, no Operator Preflight execution, no migration, no deploy, no publish)

Branch: `fix/b1-baseline-execution-authorization-fail-closed-26`
Base (old SHA): `87449f85b95d927436e7607ae3c2b6a73245eb0d` (= `origin/main` at mission start)

## 1. What this mission corrects

The CAPTURE-22-RERUN-25 baseline capture (report:
`docs/B1-NEGATIVE-RPC-MATRIX-POST-FIXTURE-AUTHORITATIVE-BASELINE-CAPTURE-22-RERUN-25-REPORT.md`)
correctly pinned the production state:

- fingerprint `4c95c6a344cee2f52ade4a5312bd8240` (recomputed in-transaction, drift NONE)
- migration head `20260801021541`
- function graph 28/28, entrypoint SHA256 `07d793b4…eaab9b`
- fixture state 19 requests / 104 steps / 19 active steps
- matrix contract 267/267/0, rebound cases 22

**but** the source artifacts set `execution_authorized = true` at capture time —
before any Operator Preflight and before any separate explicit owner authorization.
The approved capture contract required `execution_authorized = false`.

**The fingerprint capture itself was and remains valid.** The defect was only the
premature authorization flag in the source artifacts. Production was not changed,
no RPC was executed, no Operator Preflight ran, zero negative cases executed
(`capture_session.workflow_rpc_calls = 0`, `production_writes = 0`).

## 2. Reproduced premature-authorization path (pre-fix evidence)

A PINNED baseline with `execution_authorized = true` could advance farther than the
owner-approved contract permits, because the capture flag doubled as the execution
authorization at **both** enforcement layers:

1. `baseline/AUTHORITATIVE-BASELINE.json` line 5 — `"execution_authorized": true`,
   mirrored by `TARGET-MANIFEST.json → authoritative_baseline.execution_authorized: true`.
2. `run-negative-matrix.ps1` (gate 1b) required only
   `$bl.execution_authorized -eq $true && $baseline.execution_authorized -eq $true` —
   a PINNED, unexpired, sha-matching baseline satisfied the **only** authorization
   check in the launcher. No owner-approval artifact existed anywhere.
3. `00-preflight.sql` §6 required the rendered pin `baseline_execution_authorized = 'true'`
   and raised otherwise — i.e. the same capture flag was the in-session execution
   authorization as well.
4. There was no third gate: no operator-preflight result requirement and no
   owner-approved authorization artifact between the baseline and `case-0001`.

Only incidental freshness guards stood between the flag and psql
(`reviewed_package_sha` vs execution HEAD, the 120-minute validity window, the
fixture readiness gate) — none of which is an authorization gate.

## 3. Corrected gate state machine

Three independent fail-closed gates; no existing flag alone bypasses all three:

| Gate | State | Enforced by | Verdict when closed |
| --- | --- | --- | --- |
| 1. BASELINE CAPTURED | `status = PINNED`, fingerprint non-null, `execution_authorized = false`, `operator_preflight_executed = false`, `negative_cases_executed = 0`, unexpired, migration head `20260801021541` | launcher §1b, `00-preflight.sql` §6, renderer validation | `HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE` |
| 2. OPERATOR PREFLIGHT | read-only verification of the PINNED baseline; executes no workflow RPC; never sets execution authorization; sets session marker `b1.operator_preflight_passed` after its `ROLLBACK` | `00-preflight.sql`, marker checked by `01-execution-gate.sql` | run aborts before gate 3 |
| 3. EXECUTION AUTHORIZATION | separate owner-approved artifact `authorization/EXECUTION-AUTHORIZATION.json` with `status = GRANTED`, bound to the active baseline fingerprint + artifact sha256 + reviewed package SHA, unexpired | launcher §2c (before psql) and `01-execution-gate.sql` (before `case-0001`) | `HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED` |

A baseline carrying `execution_authorized = true` is now **contract drift** and fails
closed at gate 1 on both layers. Gate 3 is **NOT granted by this mission**: the
artifact ships as `NOT_GRANTED` with all binding fields `null`.

## 4. Exact baseline values after remediation

- `status`: `PINNED`
- `fingerprint`: `4c95c6a344cee2f52ade4a5312bd8240` (unchanged — historical capture data)
- `captured_at_utc`: `2026-08-01T23:33:44Z`, `valid_for_minutes`: 120 (unchanged)
- `migration_head` / `expected_migration_head`: `20260801021541` (unchanged)
- `reviewed_package_sha`: `0bc2e27f8c3985b8a35c2f1a19ed39955cb5007e` (unchanged)
- `execution_authorized`: **`false`** (the only changed capture field)
- `operator_preflight_executed`: `false`, `negative_cases_executed`: `0` (unchanged)
- function graph 28/28, entrypoint `07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b` (unchanged)
- fixture 19/104/19, state pins, protected state, scope, archived predecessor
  (STALE, non-selectable) — all unchanged
- new baseline artifact sha256 (LF): `758da22be7c6c46b45c5f2e5f613408b501db27bcbb84286ba909b894ad133a4`
  (re-pinned in `TARGET-MANIFEST.json`)

## 5. Affected-file inventory

Source (committed):

- `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` — flag flipped to `false`
- `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` — flag `false`, new artifact sha256 pin, revised `fail_closed_rules`, new `execution_authorization` block (`NOT_GRANTED`, sha-pinned)
- `scripts/b1-rpc-principal-harness-01/authorization/EXECUTION-AUTHORIZATION.json` — **new**, `NOT_GRANTED`
- `scripts/b1-rpc-principal-harness-01/01-execution-gate.sql` — **new**, read-only gate 3
- `scripts/b1-rpc-principal-harness-01/00-preflight.sql` — §6 rejects self-authorizing baselines, requires unused baseline (`operator_preflight_executed=false`, `negative_cases_executed=0`), emits gate-2 session marker after `ROLLBACK`
- `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` — validates baseline/authorization artifact sha + consistency fail-closed, renders the new pins, master includes `01-execution-gate.sql` between preflight and cases
- `scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1` — gate 1b denies self-authorizing baselines; new §2c execution-authorization gate before psql (exit 4, `HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED`)
- `scripts/b1-rpc-principal-harness-01/README.md` — documents the three-gate separation
- `tests/b1-five-services-rpc-authorization-preflight-01/execution-authorization-fail-closed-26.test.ts` — **new**, 14 fail-closed proofs + committed-state guards
- `tests/b1-five-services-rpc-authorization-preflight-01/stale-baseline-invalidation-09.test.ts` — gate mirror updated to the corrected semantics
- `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts` — assertions updated to the corrected semantics
- `docs/B1-PINNED-BASELINE-EXECUTION-AUTHORIZATION-FAIL-CLOSED-REMEDIATION-26-REPORT.md` — this report

Generated (git-ignored, deterministically re-rendered from source, never hand-edited):

- `scripts/b1-rpc-principal-harness-01/generated/pins.sql` — now carries
  `baseline_execution_authorized = 'false'`, `baseline_artifact_sha256`,
  `baseline_operator_preflight_executed = 'false'`, `baseline_negative_cases_executed = '0'`
  and the `execution_authorization_*` pins (`status = 'NOT_GRANTED'`, bindings `NULL`)
- `scripts/b1-rpc-principal-harness-01/generated/master-negative-matrix.sql` — includes
  `01-execution-gate.sql` after the preflight, before `case-0001`
- `scripts/b1-rpc-principal-harness-01/generated/cases/case-0001.sql … case-0267.sql` — unchanged case bodies
- `scripts/b1-rpc-principal-harness-01/generated/fingerprint-check.sql`, `MANIFEST.json`

## 6. Tests

14 fail-closed proofs (new test file), all mirrored offline — no connection, no RPC:

1. PENDING baseline blocks everything.
2. PINNED + `execution_authorized=false` permits baseline verification only.
3. A PINNED baseline does not itself authorize execution.
4. The Operator Preflight cannot execute any RPC (no invocation, no COMMIT, ROLLBACK-only).
5. A successful Operator Preflight alone does not authorize the 267 cases.
6. `execution_authorized=true` without a successful preflight remains blocked.
7. A successful preflight without explicit execution authorization remains blocked.
8. A stale fingerprint remains blocked.
9. An expired baseline (and an expired authorization) remains blocked.
10. A mismatched migration head remains blocked.
11. A function-graph mismatch remains blocked.
12. Direct launcher invocation cannot bypass the gates (no params/skip flags; gate order in launcher and master; the SQL gate re-proves all three gates in-session).
13. Manually editing generated pins without source consistency is detected (deterministic re-render is byte-identical and wipes tampering; renderer refuses manifest/artifact sha drift).
14. No RPC is invoked by the tests or the preflight/gate simulations.

## 7. Production impact

**Zero.** No production connection was opened, no production SQL ran, no workflow RPC
was executed, no Operator Preflight ran, no migration was applied, no cleanup ran, no
auth/storage/role/GRANT/RLS change was made, no service visibility changed, the captured
fingerprint and all production state pins are byte-identical to the capture, and nothing
was deployed or published. The baseline's 120-minute validity window
(`2026-08-01T23:33:44Z` + 120 min, expiring `2026-08-02T01:33:44Z`) closes any run by
wall clock shortly after this remediation regardless of the new gates.

## 8. Recapture requirement

A **fresh production read-only recapture will be required** before any future execution
attempt, because (a) the current baseline's validity window expires at
`2026-08-02T01:33:44Z` and (b) its `reviewed_package_sha` (`0bc2e27f…`) predates this
remediation, so it no longer equals the execution SHA. The recapture must keep
`execution_authorized = false`; execution additionally requires the fixture package
apply, a successful Operator Preflight and the separate owner-approved GRANTED
authorization artifact — none of which this mission creates.

## 9. Flags

```
BASELINE_PINNED_UNCHANGED_FINGERPRINT_4c95c6a344cee2f52ade4a5312bd8240
EXECUTION_AUTHORIZED_FALSE_EVERYWHERE_ACTIVE
OPERATOR_PREFLIGHT_EXECUTED_FALSE
NEGATIVE_CASES_EXECUTED_0
EXECUTION_AUTHORIZATION_NOT_GRANTED
THREE_GATE_FAIL_CLOSED_SEPARATION_RESTORED
ZERO_PRODUCTION_IMPACT
NO_RPC_EXECUTED
NO_MIGRATION
NO_DEPLOY
NO_PUBLISH
```
