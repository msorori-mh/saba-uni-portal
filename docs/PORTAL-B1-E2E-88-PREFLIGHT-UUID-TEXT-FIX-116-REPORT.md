# PORTAL_B1_E2E_88_PREFLIGHT_UUID_TEXT_FIX_116

## Decision

`PASS_B1_E2E_88_PREFLIGHT_UUID_TEXT_FIX`

| field | value |
|---|---|
| Base HEAD | `1c1e06a2ebd9e1d90719449c57f4a8867955d2a0` |
| Final HEAD | `77793e43f56a7ce7252731cb8d6e86e0f518d65e` |
| Branch | `fix/b1-e2e-88-preflight-uuid-text-116` |
| Draft PR | https://github.com/msorori-mh/saba-uni-portal/pull/286 |
| Working tree | clean after focused commit |
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
| routeTree | **UNCHANGED** |

## Problem

Production read-only preflight aborted with:

`invalid input syntax for type uuid: ""`

Exact failing expression:

`coalesce(fp.faculty_id, '') LIKE 'TEST_ONLY%'`

`public.faculty_profiles.faculty_id` is a UUID FK to `public.faculty(id)`. Coalescing it with empty text forces a uuid←text cast and aborts the whole G01–G14 result set.

Consumed SQL identity (must not reuse):

`e1c1e8a0ac2775e58412d6aa9fb6591abe6fd0da28190cd1d2b2b76fd0711d71`

## Files modified (allowed scope only)

| path | change |
|---|---|
| `docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql` | Cast `faculty_id` to text before empty-string coalesce / LIKE |
| `docs/production-preflight/B1-E2E-88-LOVABLE-READONLY-EXECUTION-PACKAGE-97.md` | New SQL identity + remediation pin |
| `tests/b1-e2e-88-production-readonly-preflight-97/package-97-contract.test.ts` | UUID/text static contract + consumed-id rejection |
| `tests/b1-e2e-88-production-readonly-preflight-97/pg17-readonly-smoke.test.ts` | faculty_id NULL / valid / absent + prior privileged scenarios |
| `tests/b1-e2e-88-production-readonly-preflight-97/pg17-stub-schema.sql` | `faculty_id uuid` to match production |
| this report | Remediation evidence |

## Faculty UUID fix

| check | result |
|---|---|
| Failing expression | `coalesce(fp.faculty_id, '') LIKE 'TEST_ONLY%'` |
| Replacement | `coalesce(fp.faculty_id::text, '') LIKE 'TEST_ONLY%'` |
| Occurrences corrected | **4** |
| TEST_ONLY detection preserved | yes (explicit text conversion) |

## Sibling UUID/text sweep

| pattern | result |
|---|---|
| `coalesce(<uuid>, '')` without `::text` | **none remaining** (faculty_id was the only hit) |
| `uuid = ''` | **none** |
| `uuid LIKE …` without `::text` | **none** |
| CASE arms forcing uuid/text via `''` | **none** |
| UUID concatenation without `::text` | already safe (`::text` / epoch text forms) |
| text-column `coalesce(..., '')` (names/email/employee_number) | left unchanged |

## Static contract

| check | result |
|---|---|
| Rejects `coalesce(fp.faculty_id, '')` | **yes** |
| Requires `faculty_id::text` before LIKE | **yes** |
| Rejects bare `_id = ''` / `_id LIKE` | **yes** |
| Stub `faculty_id` typed as `uuid` | **yes** |
| Consumed identity `e1c1e8a0…` rejected | **yes** |

## Gate continuity

| check | result |
|---|---|
| G01–G14 | always returned |
| Row count | **14** |
| G10 | `UNPROVEN` / `HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE` |
| G11 | fail-closed `HOLD` |
| Partial Migration-88 | `HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED` |

## Preflight SQL pin

| field | value |
|---|---|
| Raw SHA-256 | `ad3ce4f4d40418862d0e71e593eb96a78da64a59e14eadc1bccc015b7ffff4f5` |
| LF SHA-256 | `ad3ce4f4d40418862d0e71e593eb96a78da64a59e14eadc1bccc015b7ffff4f5` |
| Bytes (raw/LF) | `67078` / `67078` |
| LF lines | `1476` |
| Consumed identities rejected | `f58d5446…`, `e65dc4ae…`, `e1c1e8a0…` |

## PG17

| scenario | result |
|---|---|
| faculty_id NULL | no SQL error; 14 gates |
| faculty_id valid UUID | no SQL error; 14 gates |
| faculty profile absent | no SQL error; 14 gates |
| public TEST_ONLY absent | 14 gates; completeness MISSING |
| public TEST_ONLY partial | 14 gates |
| privileged schemas denied | no SQL error; 14 gates |
| Migration-88 absent | OBJECT_STATE_NOT_APPLIED |
| one Migration-88 object | HOLD_B1_E2E_88_PARTIAL_APPLY_DETECTED |
| Gate row count | **14** |
| Rollback | final `ROLLBACK` |
| Fingerprint | unchanged for read-only runs |

## Protected files

| path | status |
|---|---|
| `supabase/migrations/20260804120000_b1_88_request_scoped_e2e_support.sql` | **UNCHANGED** |
| `src/` | **UNCHANGED** |
| `src/routeTree.gen.ts` | **UNCHANGED** |
| Fixture-15 material | **UNCHANGED** |
| authorization functions | **UNCHANGED** |
| cleanup draft | **UNCHANGED** |

## Tests

| suite | result |
|---|---|
| Focused Package 97 | **PASS** (30 tests) |
| `b1-e2e-request-scoped-support-88` | **PASS** (18 tests) |
| `b1-authoritative-positive-fixture-matrix-19` | **PASS** (14 tests) |
| `tests/student-requests` | **PASS** (1065 tests) |
| Full CI `bun test tests/` | **PASS** (2479 tests, 0 fail) |
| Typecheck | **PASS** |
| Build | **PASS** |
| `git diff --check` | **PASS** |

## Final recommendation

`READY_FOR_MINIMAL_DUAL_REVIEW_AND_NEW_SQL_EXECUTION`
