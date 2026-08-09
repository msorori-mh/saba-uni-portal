# ACADEMIC-COUNCILS-PR311-FULL-CHAIN-PRODUCTION-GUARD-CLOSURE-LONGRUN-16

**Mission:** `ACADEMIC-COUNCILS-PR311-FULL-CHAIN-PRODUCTION-GUARD-EARLY-RETURN-CLOSURE-LONGRUN-16`  
**PR:** #311  
**Branch:** `fix/councils-legacy-production-reconciliation-longrun-13`  
**OLD_SHA:** `6ff245fc0245db3ce8ecbe3e5fb80a2362027c0f`  
**NEW_SHA:** `10db4d70f7cb842d22b491e84ed9c62821cf67a8`  
**Decision:** `PASS_ACADEMIC_COUNCILS_PR311_FULL_CHAIN_PRODUCTION_GUARD_CLOSURE`

Closes the LONGRUN-16 HIGH finding: in production-ledger context, when the ledger+schema already classify as `FULL_NEW_CHAIN_VERIFIED`, the preflight was returning the successful terminal before enforcing the production-only forbidden configuration guards (`councils.fingerprint_expected` and `councils.local_test_fingerprint_mode`).

---

## HIGH reproduction

Disposable PostgreSQL 17, full C0–C9 schema + full promoted ledger:

**Before fix:**
- `SET councils.fingerprint_expected = 'override';` → `FULL_NEW_CHAIN_VERIFIED` / `NO_APPLY_REQUIRED`
- `SET councils.local_test_fingerprint_mode = 'LOCAL_TEST_ONLY';` → `FULL_NEW_CHAIN_VERIFIED` / `NO_APPLY_REQUIRED`

**After fix:**
- `HOLD: HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN`
- `HOLD: HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN`

The same guards now also protect `LEGACY_SUPPORTED_EXACT` and `PARTIAL_NEW_CHAIN_EXACT_PREFIX` successful terminals.

---

## Structural remediation

`docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`

- Added **Phase D** immediately after cross-product classification (Phase C) and before any successful terminal return.
- Phase D is unconditional for production ledger context and fail-closed:
  - `councils.fingerprint_expected` non-empty → `HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN`
  - `councils.local_test_fingerprint_mode` non-empty → `HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN`
- `PARTIAL_NEW_CHAIN_EXACT_PREFIX` no longer returns early inside Phase C; it sets `v_final` and reaches Phase D, then emits its terminal after the guard passes.
- Legacy-path override checks were simplified to the non-production deprecated guard; production overrides are now structurally rejected in Phase D before any successful terminal.

---

## Guard regression matrix (PG17)

Covered in `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts`:

| Scenario | Expected | Result |
|---|---|---|
| 1. full C0-C9 + `fingerprint_expected` override | `HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN` | `FULL_CHAIN_OVERRIDE_REJECTION=PASS` |
| 2. full C0-C9 + `LOCAL_TEST_ONLY` | `HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN` | `FULL_CHAIN_LOCAL_TEST_MODE_REJECTION=PASS` |
| 3. legacy exact + `fingerprint_expected` override | `HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN` | `LEGACY_OVERRIDE_REJECTION=PASS` |
| 4. legacy exact + `LOCAL_TEST_ONLY` | `HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN` | `LEGACY_LOCAL_TEST_MODE_REJECTION=PASS` |
| 5. full C0-C9 with no forbidden settings | `FULL_NEW_CHAIN_VERIFIED` / `NO_APPLY_REQUIRED` | `FULL_NEW_CHAIN_VERIFIED_NORMAL_PATH=PASS` |
| 6. exact legacy with no forbidden settings | `READY_FOR_APPLY_C0` | `LEGACY_SUPPORTED_EXACT_NORMAL_PATH=PASS` |
| 7. local disposable `LOCAL_TEST_ONLY` expected-digest path | valid `READY_FOR_APPLY_C0` | `LOCAL_TEST_ONLY_DISPOSABLE_PATH=PASS` |
| 8. ledger-only + empty schema | `HOLD_FULL_LEDGER_SCHEMA_MISMATCH` | `LEDGER_ONLY_FALSE_PASS=HOLD` |

---

## Validation

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/academic-councils` | 55 pass / 0 fail |
| `bun test tests/student-requests` | 1066 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Production reads/writes | 0 / 0 |
| Migration applied | NO |
| Merge | NO |

---

## Assumptions / risks / blockers

- Phase D runs after classification but before any successful terminal, so every PASS/apply marker now flows through the production forbidden-setting guard.
- `LOCAL_TEST_ONLY` remains usable only in disposable local-test contexts where `supabase_migrations.schema_migrations` is absent.
- No previously verified classifier, legacy-to-C9, C9 security, fingerprint, or partial-prefix contracts were weakened.

**Production impact:** source/preflight/docs/tests only. No production mutation.

**Decision:** PASS
