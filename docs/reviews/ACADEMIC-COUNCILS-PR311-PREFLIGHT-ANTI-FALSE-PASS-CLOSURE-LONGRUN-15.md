# ACADEMIC-COUNCILS-PR311-PREFLIGHT-ANTI-FALSE-PASS-CLOSURE-LONGRUN-15

**Mission:** `ACADEMIC-COUNCILS-PR311-FINAL-PREFLIGHT-ANTI-FALSE-PASS-AND-PRODUCTION-STATE-CLOSURE-LONGRUN-15`  
**PR:** #311  
**Branch:** `fix/councils-legacy-production-reconciliation-longrun-13`  
**OLD_SHA:** `b5613e66ea2e04abc8653c650ead5c763f339b09`  
**NEW_SHA:** `2541c2b4deaf561e2760dd448d60e46de056cec2`  
**Decision:** `PASS_ACADEMIC_COUNCILS_PR311_PREFLIGHT_ANTI_FALSE_PASS_CLOSURE`

Independent review LONGRUN-14 HIGH finding (ledger-only `FULL_NEW_CHAIN` false-pass) and fingerprint-override risk are closed in source. This report does not edit the independent Codex HOLD report.

CI (same PR #311):
- Web CI: https://github.com/msorori-mh/saba-uni-portal/actions/runs/31288143261 — SUCCESS
- Migration Review: https://github.com/msorori-mh/saba-uni-portal/actions/runs/31288143254 — SUCCESS

---

## HIGH reproduction

Disposable PostgreSQL 17:

1. Create `supabase_migrations.schema_migrations`
2. Insert all ten promoted C0–C9 ledger names
3. Zero `academic_council%` tables

**Before fix:** preflight classified `FULL_NEW_CHAIN` and emitted `READY_FOR_APPLY_C0 (FULL_NEW_CHAIN: nothing to do)` then `RETURN`.  
**After fix:** `HOLD: HOLD_FULL_LEDGER_SCHEMA_MISMATCH` with `PREFLIGHT_LEDGER_STATE: LEDGER_FULL` and `PREFLIGHT_SCHEMA_STATE: SCHEMA_NONE`.

Permanent regression: `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts`.

---

## Classifier model

Preflight now correlates independent axes before any PASS / apply marker:

| Axis | States |
|---|---|
| `LEDGER_STATE` | `LEDGER_NONE`, `LEDGER_CONTIGUOUS_PREFIX`, `LEDGER_FULL`, `LEDGER_NONCONTIGUOUS`, `LEDGER_UNKNOWN` |
| `SCHEMA_STATE` | `SCHEMA_NONE`, `SCHEMA_LEGACY_EXACT`, `SCHEMA_PARTIAL_EXACT`, `SCHEMA_FULL_EXACT`, `SCHEMA_UNKNOWN` |
| Final | derived only when ledger + schema agree |

| Final classification | Terminal |
|---|---|
| `LEGACY_SUPPORTED_EXACT` | `READY_FOR_APPLY_C0` (after fingerprint + inventory) |
| `PARTIAL_NEW_CHAIN_EXACT_PREFIX` | reports `PARTIAL_LAST_APPLIED` / `PARTIAL_NEXT_EXPECTED`; **no** automatic apply |
| `FULL_NEW_CHAIN_VERIFIED` | `COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED` + `NO_APPLY_REQUIRED` |
| Mismatches | `HOLD_FULL_LEDGER_SCHEMA_MISMATCH`, `HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER`, `HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH`, `HOLD_NONCONTIGUOUS_LEDGER`, `UNKNOWN_UNSAFE` |

Alias notice retained for searchability:  
`PREFLIGHT_CHAIN_ALIAS: FULL_NEW_CHAIN=FULL_NEW_CHAIN_VERIFIED (ledger+schema+security proof)`.

`READY_FOR_APPLY_C0` is never emitted from a full-ledger state.

---

## FULL_NEW_CHAIN structural proof

`LEDGER_FULL` + `SCHEMA_FULL_EXACT` must pass embedded catalog assertions at least as strict as POST-VERIFIER-C0..C9 combined:

- final tables + RLS
- final types / indexes / C8 archive triggers
- SECURITY DEFINER + `search_path=public, pg_temp`
- policy inventory
- C9 INTERNAL_ONLY not executable by PUBLIC / anon / authenticated
- C9 PUBLIC_ACTOR_SAFE ACL
- authenticated direct INSERT/DELETE denied; UPDATE denied except notifications ack surface
- storage contract when attachments present

Operator filesystem reuse:  
`docs/migration-drafts/councils-c0-c9-verifiers/FULL-CHAIN-CATALOG-ASSERTIONS-01.sql` (`\ir` of POST-VERIFIER-C0..C9 + DML/storage extras).

---

## Fingerprint authority

Canonical pin (unchanged):  
`3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9`

When `supabase_migrations.schema_migrations` exists:

- any non-empty `councils.fingerprint_expected` → `HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN`
- any `councils.local_test_fingerprint_mode` → `HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN`
- pin is the only authority

Disposable path:

- pin match → PASS
- else `councils.local_test_fingerprint_mode='LOCAL_TEST_ONLY'` **and** required `councils.local_test_fingerprint_expected` (silent self-match forbidden)

Algorithm frozen in:  
`docs/migration-drafts/COUNCILS-LEGACY-SCHEMA-FINGERPRINT-ALGORITHM-01.md`  
(forward clarification; does not rewrite historical evidence).

---

## Classifier matrix (automated)

Covered in `councils-preflight-anti-false-pass-classifier.test.ts`:

1. exact legacy → `LEGACY_SUPPORTED_EXACT`
2. legacy variant / fingerprint mutations → HOLD
3. no schema → HOLD / UNKNOWN
4. full ledger / no schema → `HOLD_FULL_LEDGER_SCHEMA_MISMATCH` (**HIGH**)
5. partial ledger / no schema → HOLD
6. full schema / incomplete or no ledger → `HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER`
7–9. C0 / C0–C3 / C0–C8 exact prefixes → `PARTIAL_NEW_CHAIN_EXACT_PREFIX`
10. full C0–C9 + ledger → `FULL_NEW_CHAIN_VERIFIED`
11. noncontiguous ledger → `HOLD_NONCONTIGUOUS_LEDGER`
12. ledger/schema prefix mismatch → HOLD
13–17. RLS / policy / ACL / function / C9 internal exposure drifts → HOLD
18. production fingerprint override attempt → `HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN`

---

## Operator / docs consistency

Updated:

- `docs/migration-drafts/COUNCILS-C0-C9-PARTIAL-SAFE-HOLD-STATES-01.md`
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md`

Semantics:

- legacy → owner C0 approval → apply-one → STOP
- exact partial → report NEXT_EXPECTED → STOP → separate owner approval
- full verified → NO APPLY / observability only

---

## Validation

| Gate | Result |
|---|---|
| `bun test tests/academic-councils` | 54 pass / 0 fail |
| anti-false-pass classifier | PASS (incl. HIGH repro) |
| legacy→C9 rehearsal + final preflight | `FULL_NEW_CHAIN_VERIFIED` / `NO_APPLY_REQUIRED` |
| PostgREST HTTP matrix | PASS |
| `bun test tests/student-requests` | 1066 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS (CRLF warning only on one test file) |
| Production reads/writes | 0 / 0 |
| Migration applied | NO |
| Merge | NO |

---

## Assumptions / risks / blockers

- Disposable fingerprint authority uses explicit `LOCAL_TEST_ONLY` + expected digest; production pin remains authoritative whenever the migration ledger relation exists.
- Partial exact-prefix support classifies contiguous ledger+schema agreement but never auto-authorizes the next migration.
- C9 notifications retain authenticated UPDATE for the own-read ack surface; other council tables remain RPC-only for writes.

**Production impact:** source/preflight/docs/tests only. No production mutation.

**Decision:** PASS
