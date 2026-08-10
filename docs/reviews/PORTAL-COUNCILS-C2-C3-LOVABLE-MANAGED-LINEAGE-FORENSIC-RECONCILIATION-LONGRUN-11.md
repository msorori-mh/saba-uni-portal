# PORTAL-COUNCILS-C2-C3-LOVABLE-MANAGED-LINEAGE-FORENSIC-RECONCILIATION-LONGRUN-11

**FINAL_DECISION:** `HOLD_PORTAL_COUNCILS_C2_C3_LINEAGE_C4_MARKER_PRESENT`

MODE: SOURCE FIX + PRODUCTION READ-ONLY FORENSIC ATTESTATION  
DATE: 2026-08-10  
REPOSITORY: `msorori-mh/saba-uni-portal`  
BRANCH: `fix/councils-preflight-ledger-lineage-10`  
PR: `#321`  
PRODUCTION SUPABASE: `wpmicqriltrowwonknox`

---

## Identity

| Field | Value |
|---|---|
| STARTING_SHA | `8a0e3fe79fc7449d261587985f35f344546294c9` |
| FINAL_SHA | `17e00d58dbff2c4cc8bb5f8700ae39bd2429309f` |
| REMEDIATION_SHA | `c72518ee5db53b35631d8e9e328bad92da96380e` |
| PRODUCTION_WRITES | **0** |
| BUSINESS_RPC_CALLS | **0** |
| MIGRATION_APPLIED | **NO** |

---

## G1 — Historical report verification

Independent validation of:

- `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C2-LOVABLE-APPLY-ONE-01.md`
- `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C3-LOVABLE-APPLY-ONE-01.md`

| Item | C2 | C3 |
|---|---|---|
| SOURCE VERSION | `20260808122000` | `20260808130000` |
| MANAGED VERSION | `20260810010400` | `20260810011456` |
| SOURCE SHA256 LF | `f969c6c0…0e364e` (match) | `e7361f6c…c0de6` (match) |
| Managed body statement | outer BEGIN/COMMIT removed | outer BEGIN/COMMIT removed |
| Pre → post ledger | 215 → 216 | 216 → 217 |
| Decision token | `PASS_PORTAL_PRODUCTION_COUNCILS_C2_LOVABLE_APPLY_ONE_01` | `PASS_PORTAL_PRODUCTION_COUNCILS_C3_LOVABLE_APPLY_ONE_01` |
| Predates current tip | YES (main commits `a152dff0` / `cc1e0a0b`) | YES |

Reports align with current production ledger tip progression and live object surfaces.

---

## G2 — Production ledger exact identity (READ ONLY)

| Logical | version | name | row count |
|---|---|---|---|
| C2 managed | `20260810010400` | `4e2c4b05-5ff0-4b23-9084-18d8b1b29c86` | 1 |
| C3 managed | `20260810011456` | `430aac8f-1f38-4e9d-99aa-022ea2680fc4` | 1 |
| C2 canonical `20260808122000` | — | — | 0 |
| C3 canonical `20260808130000` | — | — | 0 |

No duplicates for either managed identity.

---

## G3 — Semantic body proof

Normalization used (proven required by managed runner / storage):

1. LF normalization
2. Removal of single outer `BEGIN;` / matching final `COMMIT;`
3. C2 only: strip managed transport header naming the source file
4. C2 only: comment glyph fold `→` → `->` (3 comment occurrences; SQL unchanged)

| Step | Verdict | Confidence |
|---|---|---|
| C2_MANAGED_BODY_EQUIVALENT | **YES** | HIGH (byte-identical after proven transport normalizations; SHA `063ef5215d8a3ef636ed5d20b3541215784900ea896ea9a1336697f2ffed0816`) |
| C3_MANAGED_BODY_EQUIVALENT | **YES** | HIGH (exact byte match after BEGIN/COMMIT strip; SHA `9b3cb8a4ca139776ff724babd1467badd0f445e8a466f17293ab12784a590b9e`) |

---

## G4 — Live C2 poststate

| Check | Result |
|---|---|
| Required 10 signatures | PRESENT |
| `trg_actopics_lifecycle` | exactly 1 |
| Obsolete C0 submit/review signatures | ABSENT |
| SECURITY DEFINER / search_path | matches source contract (`council_topic_transition_is_legal` IMMUTABLE non-definer) |
| `authenticated` direct topic INSERT/UPDATE/DELETE | DENIED |
| anon EXECUTE | false |

C2_POSTSTATE=PASS

---

## G5 — Live C3 poststate

| Inventory | Result |
|---|---|
| Tables | 5/5 |
| Enum types | 4/4 |
| Functions | 16/16 |
| Attendance audit trigger | present |
| SELECT policies | 5; write policies 0 |
| authenticated direct writes | DENIED |
| `meeting_has_valid_quorum` | present (fail-closed structural contract) |

C3_POSTSTATE=PASS

---

## G6/G7 — Classifier encoding

Extended official preflight:

- Logical C2: CANONICAL **or** pinned Lovable alias `(20260810010400, 4e2c4b05-…)` exactly
- Logical C3: CANONICAL **or** pinned Lovable alias `(20260810011456, 430aac8f-…)` exactly
- Canonical+alias coexistence → `HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE`
- C1 SPLIT_COMPLETE contract unchanged
- No fuzzy / wildcard UUID acceptance

---

## G8/G12 — Production attestation after remediation

| Marker | Observed |
|---|---|
| PREFLIGHT_C1_LINEAGE | `SPLIT_COMPLETE` |
| PREFLIGHT_C2_LINEAGE | `LOVABLE_MANAGED_ALIAS` |
| PREFLIGHT_C3_LINEAGE | `LOVABLE_MANAGED_ALIAS` |
| PREFLIGHT_LOGICAL_LEDGER_PREFIX | **4** (C0–C3; 1-based step count) |
| PREFLIGHT_SCHEMA_PREFIX | **5** (C0–C4 markers contiguous) |
| PREFLIGHT_LAST_APPLIED_LOGICAL | would be `C3` if schema matched |
| PREFLIGHT_NEXT_EXPECTED_LOGICAL | blocked |
| PREFLIGHT_STATE_CLASSIFICATION | `HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH` |
| C4_LEDGER_COUNT (canonical) | 0 |
| C4 managed ledger `20260810012715` / `72757e0e-3b8b-46fa-b252-8e1c8b594d3e` | **PRESENT (1)** |
| C4_MARKER_PRESENT (`academic_council_votes`) | **true** |
| B1_VISIBLE_COUNT (five-service set) | **5** |

### Why not PARTIAL_NEW_CHAIN_EXACT_PREFIX / NEXT=C4

Mission G8 requires STOP if C4 marker already exists. Live production has:

- C4 schema marker `academic_council_votes` (+ `academic_council_vote_results` and C4 RPCs)
- Historical PASS report `PORTAL-PRODUCTION-COUNCILS-C4-LOVABLE-APPLY-ONE-01`
- Managed ledger row `20260810012715` / `72757e0e-3b8b-46fa-b252-8e1c8b594d3e`

C4 is **not** accepted by this remediation (scope = C2/C3 only).  
Logical prefix 4 ≠ schema prefix 5 → fail-closed HOLD.  
No silent advance to NEXT=C4 / PARTIAL with C4 absent.

Note: mission brief text `LOGICAL_LEDGER_PREFIX=3` conflicts with established classifier semantics
(`prefix N` = count of satisfied steps from C0; last=C3 ⇒ prefix **4**). Local PG17 alias fixture
proves prefix **4** / NEXT=C4 when schema stops at C3.

---

## G9/G10/G11 — Tests and gates

| Gate | Result |
|---|---|
| `bun test tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts` | PASS (5) |
| `bun test tests/academic-councils/councils-c0-c9-production-readiness-package.test.ts` | PASS (8) |
| `bun test tests/academic-councils/councils-c0-c9-release-qualification-remediation.test.ts` | PASS (2) |
| `bun test tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts` | PASS (2) |
| `bun test tests/academic-councils` | PASS (81) |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

Local PG17 models C0 + C1 split + C2/C3 Lovable aliases + schema through C3 →
`PARTIAL_NEW_CHAIN_EXACT_PREFIX`, NEXT=C4. All required anti-false-pass alias cases HOLD as specified.

---

## Source changes

- `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql` — C2/C3 exact alias registry
- `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts` — G9 matrix
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md` — document aliases
- `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C2-LOVABLE-APPLY-ONE-01.md` — historical evidence (from main)
- `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C3-LOVABLE-APPLY-ONE-01.md` — historical evidence (from main)
- this report

C0–C9 migration SQL files and pinned hashes unchanged. No ledger repair. No apply.

---

## Assumptions / risks / blockers

- Assumptions: Lovable project `90f4dcde-07fb-4441-b86a-6ad5510833b8` maps to `wpmicqriltrowwonknox`.
- Risk: C4 managed alias remains unrecognized → intentional HOLD until a governed C4 lineage mission.
- Blocker: `C4_MARKER_PRESENT=true` prevents FINAL PASS criteria of this mission.

## Production impact

None from this task: source-only + read-only attestation. No migration apply, deploy, publish, B1 change, or DDL/DML.

---

## FINAL_DECISION

`HOLD_PORTAL_COUNCILS_C2_C3_LINEAGE_C4_MARKER_PRESENT`

C2 and C3 Lovable aliases are forensically proven and encoded. Production cannot be classified as
`PARTIAL_NEW_CHAIN_EXACT_PREFIX` with NEXT=C4 / C4 absent because C4 is already present on schema
and as an unpinned managed ledger row.
