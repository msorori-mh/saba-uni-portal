# PORTAL_B1_E2E_88_PREFLIGHT_PRIVILEGED_SCHEMAS_FIX_112

## Decision

`PASS_B1_E2E_88_PREFLIGHT_PRIVILEGED_SCHEMAS_FIX`

| field | value |
|---|---|
| Base HEAD | `966194001b24deebc68507403706cfe70a9e9250` |
| Implementation HEAD | `7f65b0aa72b4ccef86093a122e52f287c8a0eacb` |
| Final HEAD | `7f65b0aa72b4ccef86093a122e52f287c8a0eacb` |
| Branch | `fix/b1-e2e-88-preflight-privileged-schemas-112` |
| Draft PR | _(filled after PR create)_ |
| Working tree | clean for package paths; concurrent unrelated `src/lib/admin-navigation-config.ts` not committed |
| Production ref | `wpmicqriltrowwonknox` |
| Lovable project id (active) | `90f4dcde-07fb-4441-b86a-6ad5510833b8` |
| Lovable project id (historical/stale) | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| Production access | **NONE** |
| Production writes | **ZERO** |
| Migration apply | **NONE** |
| Auth writes | **NONE** |
| Deploy/Publish | **NONE** |
| Migration 88 modified | **NO** |
| Application source modified | **NO** |

## Problem

Production read-only preflight aborted under Lovable restricted read role with:

`permission denied for schema auth`

Failing executable reference: `auth.users`.

Observed production result code:

`HOLD_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_SQL_ERROR_PERMISSION_DENIED_FOR_SCHEMA_AUTH`

Consumed SQL identity `e65dc4ae…` executed exactly once; zero result rows; G01–G14 not returned; transaction rolled back; production writes ZERO; Migration 88 NOT applied.

## Files modified (allowed scope only)

| path | change |
|---|---|
| `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql` | Remove all executable privileged-schema access; G10 public-side inventory + Auth UNPROVEN fail-closed |
| `docs/production-preflight/B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97.md` | Active Lovable project id + external Auth/migration attestations; stale id marked historical |
| `tests/b1-e2e-88-production-readonly-preflight-97/package-97-contract.test.ts` | Privileged-schema whitelist contract + Auth fail-closed pins |
| `tests/b1-e2e-88-production-readonly-preflight-97/pg17-readonly-smoke.test.ts` | PG17 scenarios for auth/storage/sibling denial + identity states |
| `tests/b1-e2e-88-production-readonly-preflight-97/pg17-stub-schema.sql` | Restricted schema stubs + public profile email columns |
| this report | Remediation evidence |

## Privileged-schema sweep

| schema | executable access |
|---|---|
| auth | **REMOVED** (catalog/USAGE metadata only via `pg_catalog` / `has_schema_privilege`) |
| storage | **NONE** (catalog presence/USAGE only) |
| vault | **NONE** |
| realtime | **NONE** |
| supabase_functions | **NONE** |
| supabase_migrations | **NONE** (already removed in fix 108) |
| net / cron / pgmq | **NONE** |
| Other schemas | executable whitelist only: `public`, `pg_catalog`, `information_schema` |

## G10

| check | result |
|---|---|
| Public identity inventory | student/staff/faculty/role/assignment candidates from `public` only |
| Auth existence | **UNPROVEN** |
| Password usability | **UNKNOWN** |
| Session usability | **UNKNOWN** |
| Unreadable result | `status=UNPROVEN`, `detail=HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE` |

## G11

| check | result |
|---|---|
| Fail-closed result | always `HOLD` / `PREREQUISITES_NOT_READY_OR_UNPROVEN` while Auth/password/session unresolved |
| External attestation dependency | trusted Lovable Auth attestation required outside SQL |

## Gate continuity

| check | result |
|---|---|
| G01–G14 | always returned |
| Row count | **14** |
| Restricted schemas inaccessible | no SQL abort |
| Partial apply | `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |

## Preflight SQL pin

| field | value |
|---|---|
| Raw SHA-256 | `e1c1e8a0ac2775e58412d6aa9fb6591abe6fd0da28190cd1d2b2b76fd0711d71` |
| LF SHA-256 | `e1c1e8a0ac2775e58412d6aa9fb6591abe6fd0da28190cd1d2b2b76fd0711d71` |
| Bytes (raw/LF) | `67054` / `67054` |
| LF lines | `1476` |
| Consumed identities rejected | `f58d5446…`, `e65dc4ae…` |

## PG17

| scenario | result |
|---|---|
| auth absent | no SQL error; 14 gates; G10 UNPROVEN |
| auth USAGE denied | no SQL error; 14 gates; G10 UNPROVEN |
| auth.users unreadable | no SQL error; 14 gates; G10 UNPROVEN |
| all privileged schemas denied | no SQL error; 14 gates |
| identity absent / partial / complete+Auth unknown | 14 gates; Auth remains UNPROVEN |
| Migration-88 absent / partial / complete | appropriate OBJECT_STATE / PARTIAL HOLD |
| Gate row count | **14** |
| Fingerprint | unchanged for read-only runs |
| Rollback | final `ROLLBACK` |

## Tests

| suite | result |
|---|---|
| Focused Package 97 | **PASS** (26 tests) |
| `b1-e2e-request-scoped-support-88` | **PASS** (18 tests) |
| `b1-authoritative-positive-fixture-matrix-19` | **PASS** (14 tests) |
| `student-requests` | **PASS** (1065 tests) |
| Full CI `CI=true bun test tests/` | **PASS** (2496 pass / 0 fail) |
| Typecheck `bunx tsc --noEmit` | **PASS** |
| Build `bun run build` | **PASS** |
| `git diff --check` | **PASS** |
| routeTree | **UNCHANGED** |

## Assumptions

1. Lovable restricted read role never receives USAGE on privileged schemas; SQL must not depend on them.
2. Public profile `email` / `academic_number` / TEST_ONLY name markers are sufficient for public-side inventory evidence.
3. Trusted Lovable Auth + migration-history metadata are available outside SQL for final operational classification.
4. Concurrent unrelated working-tree changes outside allowed paths are not part of this package and must not be committed with it.

## Risks

- Operators may misread public profile candidates as Auth-user proof; package text forbids that.
- Without Lovable Auth attestation, G10/G11 remain fail-closed even when public identities look complete.
- Unrelated concurrent edits under `src/` / admin-navigation tests may dirty the tree; this package commits only allowed paths.

## Production impact

**None.** Source docs + tests only. No production connection. No SQL apply. No Auth writes. No deploy/publish.

## routeTree

routeTree: UNCHANGED

## Final recommendation

`READY_FOR_FAST_DUAL_REVIEW_AND_NEW_SQL_EXECUTION`
