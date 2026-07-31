# B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09 — REPORT

- Mission: `PORTAL-B1-FIRST-DELIVERY-FIVE-SERVICES-KIMI-MASTER-EXECUTION-10` / Phase B
- Sub-mission: `PORTAL-B1-NEGATIVE-RPC-MATRIX-STALE-BASELINE-INVALIDATION-09`
- Branch: `fix/b1-negative-rpc-stale-baseline-invalidation-09-kimi`
- Base SHA (origin/main): `a1a5985c063c9ebe4e58b1e4cb9b9a785ba898f1`
- Executed at (UTC): 2026-07-31
- Mode: SOURCE-ONLY. Zero production operations.

## 1. Stale baseline inventory

| Field | Stale value |
|---|---|
| Artifact | `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` (pre-invalidation) |
| Status | `PINNED` |
| Fingerprint | `be5040a4fd34fc1fbab235e118c509d0` |
| Captured at | `2026-07-29T23:20:07Z` (valid 120 minutes → expired `2026-07-30T01:20:07Z`) |
| Reviewed package SHA | `a1c86ea42b600e67f38c69a1cd610a916a33c312` |
| Attested migration head | `20260729173359` |
| Scope | 8 requests (5 × `SR-20260727-*` TEST_ONLY + 3 protected `enrollment_certificate` records) |

## 2. Invalidation reasons

1. **EXPIRED** — the 120-minute validity window closed on `2026-07-30T01:20:07Z`, before any matrix execution was authorized.
2. **PACKAGE_SHA_MISMATCH** — reviewed package SHA `a1c86ea4…` no longer matches the execution package at `a1a5985c…`.
3. **MIGRATION_HEAD_MISMATCH** — production migration head advanced to `20260731203030` (Stage 3 test cleanup).
4. **REQUEST_SCOPE_CHANGE** — Stage 3 cleanup changed the request scope the fingerprint was pinned to.
5. **DELETED_TEST_ONLY_REQUESTS** — 37 TEST_ONLY requests / 444 persistent rows deleted, including the five `SR-20260727-*` scope members; the pinned fingerprint can never match production again.

## 3. Archive path

`scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json`
(LF SHA256 `0c6cadce8c903d212d0da8e06288f7718b059b7de5c0821c13a3e198d00af8f2`)

Annotations added: `status=STALE`, `execution_authorized=false`, `selectable=false`,
`executable=false`, `invalidated_after_migration=20260731203030`, full
`invalidated_reason` list. Historical capture evidence (TLS attestation, capture
transaction, function graph, visibility) preserved verbatim.

## 4. Active PENDING baseline

`scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json`
(LF SHA256 `08cd678b58089d5c837206ec8c6162aa545046660d2b61cc72b3022c9887b6d8`,
pinned in `TARGET-MANIFEST.json` → `authoritative_baseline.artifact_sha256`)

- `status = PENDING`
- `fingerprint = null`
- `captured_at_utc = null`
- `valid_for_minutes = null`
- `reviewed_package_sha = null`
- `migration_head = null`
- `scope = []`
- `execution_authorized = false`
- `operator_preflight_executed = false`
- `negative_cases_executed = 0`
- `contains_secrets = false`

**No fresh baseline has been captured.** Production capture is not authorized in
this phase.

## 5. Expected migration head (next capture contract)

The next valid baseline MUST attest `migration_head = 20260731203030`, matrix LF
SHA256 `fd2621877d4db1df5927f0583d6de5a269c9e50b258578592c299f373459739d`,
function-graph closure 28/28, the current request scope, the five B1 services
`student_visible=false`, and the protected `enrollment_certificate`
(`student_visible=true`) baseline. Bound in
`AUTHORITATIVE-BASELINE.json → next_capture_contract` and
`TARGET-MANIFEST.json → authoritative_baseline.expected_*`.

## 6. Fail-closed rules

Failure family: `HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE`.

Enforcement layers:

- **Offline validator** `scripts/b1-rpc-principal-harness-01/validate-authoritative-baseline.ts`
  (`assertExecutableBaseline`) throws on: non-canonical or archived path,
  status ≠ `PINNED`, `execution_authorized ≠ true`, null/invalid fingerprint,
  missing/expired validity window, package SHA mismatch, package-source drift,
  migration-head mismatch, matrix SHA mismatch, function-graph mismatch,
  request-scope mismatch, service-visibility mismatch,
  `enrollment_certificate` baseline drift, production fingerprint mismatch.
- **SQL preflight** `00-preflight.sql` §6 fails closed when `baseline_status` is
  not `PINNED`, the fingerprint pin is null/empty, or the new
  `baseline_execution_authorized` pin is not `true`.
- **Post-run check** `generated/fingerprint-check.sql` raises
  `POST_RUN_FAIL: authoritative baseline is PENDING` while no fingerprint is
  pinned (verified offline after regeneration).

## 7. Changed files

- `scripts/b1-rpc-principal-harness-01/baseline/archive/AUTHORITATIVE-BASELINE-20260729-STALE.json` (new — archived stale baseline)
- `scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json` (reset to PENDING placeholder)
- `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` (`authoritative_baseline` → PENDING contract + archive record)
- `scripts/b1-rpc-principal-harness-01/validate-authoritative-baseline.ts` (new — fail-closed validator)
- `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` (+1 pin: `baseline_execution_authorized`)
- `scripts/b1-rpc-principal-harness-01/00-preflight.sql` (+5 lines: `execution_authorized` fail-closed check)
- `scripts/b1-rpc-principal-harness-01/README.md` (G5 section documents the archival and canonical-path rule)
- `tests/b1-five-services-rpc-authorization-preflight-01/stale-baseline-invalidation-09.test.ts` (new — 16 tests)
- `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts` (3 assertions updated to the PENDING/fail-closed contract)

No production migrations touched. `enrollment_certificate` source untouched
(only read-only visibility pins quoted from the archived attestation).

## 8. Test results (all offline)

| Command | Result |
|---|---|
| `bun scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | PASS — rendered 267 negative cases + master |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS — 162/162, 0 fail (incl. 16 new INVALIDATION-09 tests proving the 11 blocking conditions) |
| `bun test tests/student-requests` | PASS — 1048/1048, 0 fail |
| `bunx tsc --noEmit` | PASS — clean |
| `bun run build` | PASS — nitro bundle generated |
| `git diff --check` | PASS |

The 11 required proofs, all in `stale-baseline-invalidation-09.test.ts`:
PENDING blocks · expired PINNED blocks · wrong package SHA blocks · wrong
migration head blocks · null fingerprint blocks · wrong production fingerprint
blocks · stale scope blocks · archive files not selectable · only canonical path
accepted · Operator Preflight unexecuted · production RPC count zero.
A control test proves a fully valid PINNED baseline passes the gate (the
validator is not trivially rejecting).

## 9. Source SHA values

- Execution package base: `a1a5985c063c9ebe4e58b1e4cb9b9a785ba898f1`
- Stale reviewed package SHA: `a1c86ea42b600e67f38c69a1cd610a916a33c312` (mismatch → invalidation)
- Matrix SHA256 (LF): `fd2621877d4db1df5927f0583d6de5a269c9e50b258578592c299f373459739d`
- Stale production fingerprint: `be5040a4fd34fc1fbab235e118c509d0` (archived, non-executable)
- Canonical baseline artifact SHA256 (LF): `08cd678b58089d5c837206ec8c6162aa545046660d2b61cc72b3022c9887b6d8`
- Archived baseline artifact SHA256 (LF): `0c6cadce8c903d212d0da8e06288f7718b059b7de5c0821c13a3e198d00af8f2`

## 10. Zero-production-operation confirmation

- Production RPC calls: **0**
- Production writes (INSERT/UPDATE/DELETE/DDL): **0**
- Migrations applied or modified: **0**
- Role / GRANT / REVOKE / RLS changes: **0**
- Operator Preflight executed: **NO**
- Negative matrix cases executed: **0**
- `student_visible` changes: **0**
- Deploy / Publish: **NO**
- Secrets read or committed: **NO** (`contains_secrets=false`; no `.env`,
  credential store, or pgpass access)

## 11. Assumptions, risks, blockers

- Assumption: the archived fingerprint/attestation evidence is historical only;
  it is preserved verbatim for audit and marked non-executable.
- Assumption: the EOL policy for the harness package (no `.gitattributes`
  override) is unchanged; index stores LF and the manifest pins the LF SHA256.
- Risk: none introduced to runtime — the change only tightens fail-closed gates.
- Blockers: a fresh baseline capture, Operator Preflight and any matrix
  execution remain blocked behind HARD GATE 1 (external review) and require
  separate explicit approvals.

## 12. Decision

**PASS** — stale baseline invalidated, archived and replaced by a PENDING
fail-closed placeholder; execution remains impossible until a fresh capture is
authorized.
