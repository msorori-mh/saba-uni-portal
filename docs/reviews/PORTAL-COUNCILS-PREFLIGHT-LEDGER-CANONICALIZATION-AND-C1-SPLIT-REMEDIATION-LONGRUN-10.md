# PORTAL-COUNCILS-PREFLIGHT-LEDGER-CANONICALIZATION-AND-C1-SPLIT-REMEDIATION-LONGRUN-10

**FINAL_DECISION:** `HOLD_PORTAL_COUNCILS_PREFLIGHT_REMEDIATION_HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH`

MODE: SOURCE FIX + PRODUCTION READ-ONLY ATTESTATION  
DATE: 2026-08-10  
REPOSITORY: `msorori-mh/saba-uni-portal`  
BRANCH: `fix/councils-preflight-ledger-lineage-10`  
PRODUCTION SUPABASE: `wpmicqriltrowwonknox`

---

## Identity

| Field | Value |
|---|---|
| BASE_SHA | `acf2e48c6f4dfdf2816c364743d35809ff26ddb7` |
| FINAL_SHA | `eddfe5bcf5cee95ce44e1efa9c123e9e639847e6` (branch tip; remediation `7374d101f3a89b6f0a5e22554b8c5e6259010e90`) |
| EXPECTED_BASE_SHA match | YES |
| Prior HOLD evidence preserved | `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C2-APPLY-ONE-LONGRUN-09.md` (not rewritten as PASS) |

---

## ROOT_CAUSE

Official preflight Phase A matched ledger rows with:

```sql
sm.name = ANY(v_promoted)
```

where `v_promoted` held full composite identities such as
`20260808120000_councils_c0_write_surface_hardening_01`.

Production Lovable/Supabase stores **short** `name` values (e.g. `councils_c0_write_surface_hardening_01`)
and represents logical C1 via an **approved split** of two physical rows
(`20260810003111` + `20260810003305`), not original `20260808121000`.

Result of the old classifier on production: `LEDGER_HITS=0` → `LEDGER_NONE` +
`SCHEMA_PARTIAL_EXACT` → `UNKNOWN_UNSAFE`
(`HOLD_PORTAL_PRODUCTION_COUNCILS_C2_G6_PREFLIGHT_CLASSIFIER_DISAGREE`).

---

## OBSERVED_PRODUCTION_LEDGER_FORMAT

`PRODUCTION_LEDGER_FORMAT=VERSION_PLUS_SHORT_NAME`

| version | name |
|---|---|
| `20260808120000` | `councils_c0_write_surface_hardening_01` |
| `20260810003111` | `01d86704-d31c-42e9-9efa-aa5fe4d6a8c9` |
| `20260810003305` | `c75271d6-2ef1-407a-96f5-66aaf2386afe` |
| `20260810010400` | `4e2c4b05-5ff0-4b23-9084-18d8b1b29c86` _(non-canonical C2 body; see below)_ |

Canonical C2 (`20260808122000` / `councils_c2_topic_intake_review_01`): **ABSENT**.

---

## Logical chain model

| Logical step | Accepted physical identity |
|---|---|
| LOGICAL_C0 | version `20260808120000` + short **or** composite name |
| LOGICAL_C1 | **ORIGINAL** one row `20260808121000`… **OR** **SPLIT_COMPLETE** both `20260810003111`… **and** `20260810003305`… |
| LOGICAL_C2…C9 | pinned version + short/composite exact name |

Matching rules:

- primary = `version`
- secondary = normalized exact `name` (short OR `version||'_'||short`)
- no `LIKE`, no fuzzy match, no ordering-only inference
- wrong version + correct name → `HOLD_LEDGER_IDENTITY_MISMATCH`
- correct version + arbitrary name → `HOLD_LEDGER_IDENTITY_MISMATCH`
- incomplete C1 split → `HOLD_C1_SPLIT_INCOMPLETE`
- original + split coexistence → `HOLD_C1_LINEAGE_AMBIGUOUS`
- contiguous **logical** prefix compared to independent schema marker prefix

---

## C0 / C1 physical identities (production)

| Field | Value |
|---|---|
| C0_LEDGER_IDENTITY | `version=20260808120000;name=councils_c0_write_surface_hardening_01` |
| C1_LINEAGE | `SPLIT_COMPLETE` |
| C1_SPLIT_A | `version=20260810003111;name=01d86704-d31c-42e9-9efa-aa5fe4d6a8c9` |
| C1_SPLIT_B | `version=20260810003305;name=c75271d6-2ef1-407a-96f5-66aaf2386afe` |

---

## Classifier results

| Field | OLD (LONGRUN-09) | NEW (repaired) on current production |
|---|---|---|
| LEDGER | `LEDGER_NONE` (0 hits) | `LEDGER_CONTIGUOUS_PREFIX` logical prefix **2** |
| C1 | unrecognized | `SPLIT_COMPLETE` |
| SCHEMA_PREFIX | 2 _(at LONGRUN-09)_ | **3** _(C2 marker now present)_ |
| CLASSIFICATION | `UNKNOWN_UNSAFE` | `HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH` |
| NEXT (logical ledger) | n/a | would be C2 if schema matched |

### Current production repaired preflight outcome

| Marker | Value |
|---|---|
| PREFLIGHT_C1_LINEAGE | `SPLIT_COMPLETE` |
| PREFLIGHT_LOGICAL_LEDGER_PREFIX | `2` |
| PREFLIGHT_SCHEMA_PREFIX | `3` |
| PREFLIGHT_LAST_APPLIED_LOGICAL | `C1` |
| PREFLIGHT_NEXT_EXPECTED_LOGICAL | `C2` |
| PREFLIGHT_STATE_CLASSIFICATION | `HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH` |

### Why not PARTIAL_NEW_CHAIN_EXACT_PREFIX

Between LONGRUN-09 and this attestation, production gained C2 schema objects
(`council_resubmit_topic`, intake helpers, `trg_actopics_lifecycle`) **without**
the canonical C2 ledger identity `20260808122000`.

A non-canonical ledger row exists:

- `version=20260810010400`
- `name=4e2c4b05-5ff0-4b23-9084-18d8b1b29c86`
- statements prefix identifies source as `ACADEMIC-COUNCILS-C2-TOPIC-INTAKE-REVIEW-01`
  / `20260808122000_councils_c2_topic_intake_review_01`

Fail-closed policy: **do not** treat arbitrary UUID Lovable rows as canonical C2.
Ledger alone ≠ schema alone. Prefix mismatch → HOLD.

| Check | Value |
|---|---|
| C2_LEDGER_COUNT (canonical) | `0` |
| C2_MARKER_PRESENT | `true` |
| B1_VISIBLE_COUNT (five-service set) | `5` |

---

## Local PG17 proof

1. Current-production-like happy path (C0 + C1 split short names, schema markers C0+C1 only):
   - `PARTIAL_NEW_CHAIN_EXACT_PREFIX`
   - `PREFLIGHT_NEXT_EXPECTED_LOGICAL=C2`
   - `PREFLIGHT_C1_LINEAGE=SPLIT_COMPLETE`
2. Current-production drift (same ledger + C2 marker without canonical C2):
   - official file → `HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH` (ledger 2 / schema 3)
3. G8 anti-false-pass matrix in
   `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts`
   — all cases PASS (short names, split incomplete/ambiguous, identity mismatch,
   prefix mismatch both directions, full chain verified only with structural proof).

---

## Tests / gates

| Gate | Result |
|---|---|
| `bun test tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts` | PASS (4) |
| `bun test tests/academic-councils/councils-c0-c9-production-readiness-package.test.ts` | PASS (8) |
| `bun test tests/academic-councils/councils-c0-c9-release-qualification-remediation.test.ts` | PASS (2) |
| `bun test tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts` | PASS (2) |
| `bun test tests/academic-councils` | PASS (80) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

---

## Safety accounting

| Field | Value |
|---|---|
| PRODUCTION_READS | YES (catalog / ledger SELECT + read-only classifier attestation) |
| PRODUCTION_WRITES | **0** |
| BUSINESS_RPC_CALLS | **0** |
| MIGRATION_APPLIED | **NO** |
| C2_APPLY | **NOT_ATTEMPTED** |
| DEPLOY / PUBLISH | NO |
| B1 visibility change | NO |

---

## Source changes

- `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`
  — logical identity model + C1 split + short-name normalization + stable notices
- `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts`
  — realistic ledger fixtures + G8 matrix
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md`
  — logical vs physical + C1 split documentation
- prior HOLD evidence copy preserved under `docs/reviews/`

C0–C9 migration SQL files and pinned hashes **unchanged**.  
C2 pinned hash remains
`f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e`.

---

## Assumptions

- Production Lovable project `90f4dcde-07fb-4441-b86a-6ad5510833b8` is the
  live database for ref `wpmicqriltrowwonknox`.
- Non-canonical row `20260810010400` is out-of-band relative to the pinned C2
  identity and must not silently satisfy LOGICAL_C2.
- B1 sentinel remains the five-service visible set (not total `student_visible=true`,
  which includes `enrollment_certificate`).

## Risks

- Production now has C2 object surface without canonical ledger identity —
  governance drift requiring a separate governed remediation (not this mission).
- Future Lovable UUID applies for later Cn steps would likewise HOLD until
  exact identities are pinned (fail-closed; intentional).

## Blockers / HOLD reason

Repaired classifier correctly recognizes C0 + C1 split and short names, but
current production **schema prefix 3 ≠ logical ledger prefix 2**.

Mission FINAL PASS required `PARTIAL_NEW_CHAIN_EXACT_PREFIX` with C2 absent.
Observed: C2 marker present + canonical C2 ledger absent →
`HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH`.

## Production impact

None from this task: source-only fix + read-only attestation. No apply, no deploy,
no B1 visibility change, no DDL/DML.

---

## FINAL_DECISION

`HOLD_PORTAL_COUNCILS_PREFLIGHT_REMEDIATION_HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH`
