# PORTAL_B1_E2E_88_PREFLIGHT_LEDGER_PERMISSION_FIX_108

## Decision

`PASS_B1_E2E_88_PREFLIGHT_LEDGER_PERMISSION_FIX`

| field | value |
|---|---|
| Base HEAD | `e0b1448ab0bfb192d0bb4e4c49586af3cb6780b3` |
| Final HEAD | `b511d7ded7422e4774eed5b1c21582a539afce84` |
| Draft PR | https://github.com/msorori-mh/saba-uni-portal/pull/283 |
| Working tree | clean after commit |
| Branch | `fix/b1-e2e-88-preflight-ledger-permission-108` |
| Production ref | `wpmicqriltrowwonknox` |
| Production access | **NONE** |
| Production writes | **ZERO** |
| Migration apply | **NONE** |
| Auth writes | **NONE** |
| Deploy/Publish | **NONE** |
| Migration 88 modified | **NO** |

## Problem

Production read-only preflight aborted under Lovable role `sandbox_exec` with:

`permission denied for schema supabase_migrations`

Root cause: Package 97 SQL probed / selected `supabase_migrations.schema_migrations` (including `has_table_privilege` name resolution), which requires schema USAGE. The managed read-only role lacks that privilege. Production writes: **ZERO**.

## Files modified

| path | change |
|---|---|
| `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql` | Remove all executable managed-ledger references; G02 fail-closed UNPROVEN + pg_catalog object-state |
| `docs/production-preflight/B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97.md` | Trusted Lovable ledger attestation contract for final G02 |
| `tests/b1-e2e-88-production-readonly-preflight-97/package-97-contract.test.ts` | Hash pins + ledger-unreadable contracts |
| `tests/b1-e2e-88-production-readonly-preflight-97/pg17-readonly-smoke.test.ts` | Six PG17 scenarios under USAGE-denied role |
| this report | Remediation evidence |

## G02

| check | result |
|---|---|
| Static ledger reference removed | **YES** (no `supabase_migrations.schema_migrations`, no `has_table_privilege`, no dynamic EXECUTE) |
| Unreadable result | `status=UNPROVEN`, `detail=HOLD_B1_E2E_88_MIGRATION_LEDGER_UNREADABLE` |
| Object-state inference | pg_catalog only: `OBJECT_STATE_NOT_APPLIED` / `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` / `OBJECT_STATE_APPLIED_OR_EQUIVALENT` / `HOLD` |
| External Lovable attestation | Required outside SQL for final G02; user prompt / GUC / `set_config` rejected |
| Fail-closed behavior | Missing Lovable migration-history metadata ⇒ final G02 **HOLD**; partial objects ⇒ SQL G02 **HOLD**; G03–G14 still return |

## Preflight SQL pin

| field | value |
|---|---|
| LF SHA-256 | `e65dc4ae5f36a692e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68` |
| LF bytes | `57376` |
| LF lines | `1262` |
| Gates | G01–G14 (14) |

## PG17

| scenario | result |
|---|---|
| Schema absent | no SQL error; 14 gates; G02 UNPROVEN |
| USAGE denied | no SQL error; 14 gates; G02 UNPROVEN |
| Table unavailable | no SQL error; 14 gates; G02 UNPROVEN |
| Partial objects | HOLD `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |
| Complete objects | G02 UNPROVEN + `OBJECT_STATE_APPLIED_OR_EQUIVALENT`; G03 HOLD |
| Gate row count | **14** |
| Before/after fingerprint | unchanged for read-only runs (ROLLBACK) |

## Tests

| suite | result |
|---|---|
| Focused Package 97 | **PASS** (23 tests) |
| `b1-e2e-request-scoped-support-88` | **PASS** |
| `b1-authoritative-positive-fixture-matrix-19` | **PASS** |
| `student-requests` | **PASS** |
| Full CI `CI=true bun test tests/` | **PASS** (2472 pass / 0 fail) |
| Typecheck `bunx tsc --noEmit` | **PASS** |
| Build `bun run build` | **PASS** |
| `git diff --check` | **PASS** |
| routeTree | **UNCHANGED** |

## Assumptions

1. Lovable `sandbox_exec` (and equivalents) may never receive USAGE on the managed migration schema; SQL must not depend on it.
2. Trusted Lovable migration-history metadata is available outside SQL for final operational G02.
3. Object-state inference is evidence only and does not by itself authorize apply or prove ledger NOT_APPLIED.

## Risks

- Operators may misread `OBJECT_STATE_NOT_APPLIED` as definitive ledger proof; package text forbids that.
- Without Lovable attestation, final G02 remains HOLD even when objects are absent.

## Production impact

**None.** Source docs + tests only. No production connection. No SQL apply. No Auth writes. No deploy/publish.

## routeTree

routeTree: UNCHANGED

## Final recommendation

`READY_FOR_FAST_DELTA_REVIEW_AND_REEXECUTION`
