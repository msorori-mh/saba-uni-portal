# PORTAL-COUNCILS-C4-C9-LOVABLE-MANAGED-LINEAGE-FORENSIC-CLOSURE-LONGRUN-12

**FINAL_DECISION:** `PASS_PORTAL_COUNCILS_C4_C9_LOVABLE_MANAGED_LINEAGE_FORENSIC_CLOSURE_LONGRUN_12`

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
| STARTING_SHA | `8da2f0168e9aee288aeffda56798a5dd67060c55` |
| FINAL_SHA | `2385fdef888f4f24a79e4fd50fe47faac37d8196` |
| REMEDIATION_SHA | `530e933bb49258b2432fd9c69f69f08b2531a47f` |
| PRODUCTION_WRITES | **0** |
| BUSINESS_RPC_CALLS | **0** |
| MIGRATION_APPLIED | **NO** |
| PRODUCTION_READS | **YES** |

---

## G1 — Canonical C4–C9 pin

| Step | File | SHA256_LF |
|---|---|---|
| C4 | `20260808140000_councils_c4_session_voting_01.sql` | `d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd` |
| C5 | `20260808150000_councils_c5_minutes_lifecycle_01.sql` | `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25` |
| C6 | `20260808160000_councils_c6_decisions_followup_01.sql` | `1051df7e816fc2e260616a9f1f9dba457e5e39e001c5ab06a91f376b84d92b43` |
| C7 | `20260808170000_councils_c7_audit_archive_01.sql` | `3fd74518d57722b7018b06ba9ce50f7fb9033c2d8527fe515d5ad133a4081f6a` |
| C8 | `20260808171000_councils_c0_c8_final_security_closure_01.sql` | `6cb87098f9f038d0d6174aa08c37c524b1b4d91cca49244251cbc03ab6df37c3` |
| C9 | `20260808180000_councils_c9_notifications_reporting_01.sql` | `c15f3378d12de10a0ef04d93ce033adca06f70fd7d9d53b764a21e828c329d4e` |

`python scripts/sha256_lf_normalized_v1.py --self-test` → PASS. All six pins match. Migrations unmodified.

---

## G2 — Production managed ledger sweep (READ ONLY)

Rows after known C3 managed tip `20260810011456`:

| version | name | statements | order |
|---|---|---|---|
| `20260810012715` | `72757e0e-3b8b-46fa-b252-8e1c8b594d3e` | 1 body (len 25673) | tip |

`rows_after_c4 = 0`. No C5–C9 managed or canonical council ledger candidates exist.

UUID-only / non-council historical rows were **not** classified as council steps.

---

## G3 — Schema marker sweep

| Marker | Present |
|---|---|
| C4 `academic_council_votes` | **true** |
| C5 `academic_council_minutes_amendments` | false |
| C6 `issue_council_decision` | false |
| C7 `academic_council_audit_events` | false |
| C8 `council_decision_transition_is_legal` | false |
| C9 `academic_council_notifications` | false |

`SCHEMA_PREFIX=5` (C0–C4 contiguous). No later-marker-with-predecessor-gap.

Secondary C4 objects also present: `academic_council_vote_results`, vote/session enums, 9 C4 RPCs.

Note: legacy `academic_council_minutes` / `academic_council_decisions` tables exist from base schema and are **not** C5/C6 markers.

---

## G4 — Forensic C4 proof

| Field | Value |
|---|---|
| CANONICAL_VERSION | `20260808140000` |
| CANONICAL_NAME | `councils_c4_session_voting_01` |
| CANONICAL_SHA | `d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd` |
| MANAGED_VERSION | `20260810012715` |
| MANAGED_NAME | `72757e0e-3b8b-46fa-b252-8e1c8b594d3e` |
| BODY_EQUIVALENCE | **YES** |
| LIVE_POSTSTATE | **PASS** |
| LINEAGE_VERDICT | `LOVABLE_MANAGED_ALIAS` |

### Body equivalence normalization (proven transport only)

1. LF normalization
2. Outer `BEGIN;` / matching final `COMMIT;` removal (canonical)
3. Full-line SQL comment / blank-line strip (managed rewrote promotional header and omitted section divider comments; SQL statements unchanged)

After normalization both bodies:

- length `25346`
- SHA256 `25625759788059ca2d46c0ae37f0b9a4ff6168218675a1d0f88c1a71104510df`

### Live poststate (read-only)

- Enums: `academic_council_vote_value={yes,no,abstain}`; session status 5 labels
- Tables + RLS + SELECT-only policies `ac_votes_select` / `ac_vote_results_select`
- Meeting/agenda session columns present (4/4 each)
- 9/9 C4 functions, all SECURITY DEFINER
- Indexes/unique constraints present
- authenticated: SELECT yes; INSERT/UPDATE/DELETE no
- anon EXECUTE on C4 RPCs: false
- No admin/dean/registrar operational bypass in C4 write paths
- Vote/result business rows: 0
- Canonical C4 ledger row: 0 (no duplicate lineage)

---

## G5 — Forensic C5–C9

| Step | Marker | Ledger candidate | Verdict |
|---|---|---|---|
| C5 | absent | none | `NOT_APPLIED` / `ABSENT` |
| C6 | absent | none | `NOT_APPLIED` / `ABSENT` |
| C7 | absent | none | `NOT_APPLIED` / `ABSENT` |
| C8 | absent | none | `NOT_APPLIED` / `ABSENT` |
| C9 | absent | none | `NOT_APPLIED` / `ABSENT` |

No schema-without-ledger or ledger-without-schema HOLDs for C5–C9. No aliases guessed.

---

## G6 — Historical apply reports

| Report | Recovered | Validation vs production |
|---|---|---|
| `PORTAL-PRODUCTION-COUNCILS-C4-LOVABLE-APPLY-ONE-01` | **YES** (`35d597ea`, on `main`) | Aligns: managed `20260810012715` / `72757e0e-…`, PASS token, C5 not applied |
| `PORTAL-PRODUCTION-COUNCILS-C5-LOVABLE-APPLY-ONE-01` | **YES** (`54b85e90`, on `main`) | Aligns: **HOLD** (digest/search_path), `Migrations applied=0`, C5 still absent |
| C6 / C7 / C8 / C9 LOVABLE-APPLY-ONE-01 | **REPORT_NOT_RECOVERED** | Rely on live ledger+schema only |

---

## G7/G8 — Classifier registry + true prefix

Pinned exact aliases (no fuzzy UUID):

- C2: `(20260810010400, 4e2c4b05-…)` unchanged
- C3: `(20260810011456, 430aac8f-…)` unchanged
- C4: `(20260810012715, 72757e0e-…)` **new**
- C1 SPLIT_COMPLETE unchanged
- C5–C9: canonical only

Production classification after remediation:

| Field | Value |
|---|---|
| C0_LINEAGE | `CANONICAL` |
| C1_LINEAGE | `SPLIT_COMPLETE` |
| C2_LINEAGE | `LOVABLE_MANAGED_ALIAS` |
| C3_LINEAGE | `LOVABLE_MANAGED_ALIAS` |
| C4_LINEAGE | `LOVABLE_MANAGED_ALIAS` |
| C5_LINEAGE | `ABSENT` |
| C6_LINEAGE | `ABSENT` |
| C7_LINEAGE | `ABSENT` |
| C8_LINEAGE | `ABSENT` |
| C9_LINEAGE | `ABSENT` |
| LOGICAL_LEDGER_PREFIX | **5** |
| SCHEMA_PREFIX | **5** |
| LAST_APPLIED_LOGICAL | `C4` |
| FIRST_UNAPPLIED_LOGICAL | `C5` |
| PREFLIGHT_STATE_CLASSIFICATION | `PARTIAL_NEW_CHAIN_EXACT_PREFIX` |
| B1_VISIBLE_COUNT (five-service set) | **5** |

### Next governed action (NOT applied this mission)

| Field | Value |
|---|---|
| FIRST_UNAPPLIED_LOGICAL | `C5` |
| Canonical migration | `20260808150000_councils_c5_minutes_lifecycle_01.sql` |
| Canonical LF SHA | `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql` |
| Dependency note | Historical C5 HOLD: `extensions.digest` under `search_path=public,pg_temp` — requires governed source revision before apply |

---

## G11/G12/G13 — Tests and gates

| Gate | Result |
|---|---|
| `bun test tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts` | PASS (5) |
| `bun test tests/academic-councils/councils-c0-c9-production-readiness-package.test.ts` | PASS (8) |
| `bun test tests/academic-councils/councils-c0-c9-release-qualification-remediation.test.ts` | PASS (2) |
| `bun test tests/academic-councils/councils-legacy-production-to-c0-c9-reconciliation.test.ts` | PASS (2) |
| `bun test tests/academic-councils` | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |

Local PG17 models C0 + C1 split + C2/C3/C4 Lovable aliases + schema through C4 →
`PARTIAL_NEW_CHAIN_EXACT_PREFIX`, NEXT=`C5`. Required anti-false-pass cases HOLD as specified.

---

## Source changes

- `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql` — exact C4 alias registry + C5–C9 lineage notices
- `tests/academic-councils/councils-preflight-anti-false-pass-classifier.test.ts` — C4 alias matrix
- `docs/production-preflight/COUNCILS-C0-C9-APPLY-ONE-OPERATOR-PLAN-01.md` — document C4 alias
- `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C4-LOVABLE-APPLY-ONE-01.md` — recovered historical PASS
- `docs/reviews/PORTAL-PRODUCTION-COUNCILS-C5-LOVABLE-APPLY-ONE-01.md` — recovered historical HOLD
- this report

C0–C9 migration SQL files and pinned hashes unchanged. No ledger repair. No apply.

---

## Assumptions / risks / blockers

- Assumptions: Lovable project `90f4dcde-07fb-4441-b86a-6ad5510833b8` maps to `wpmicqriltrowwonknox`.
- Risk: C5 historical HOLD implies next apply-one must not blindly apply pinned C5 without digest/search_path remediation.
- Blocker: none for this forensic closure mission.

## Production impact

None from this task: source-only + read-only attestation. No migration apply, deploy, publish, B1 change, or DDL/DML.

---

## FINAL_DECISION

`PASS_PORTAL_COUNCILS_C4_C9_LOVABLE_MANAGED_LINEAGE_FORENSIC_CLOSURE_LONGRUN_12`

Every existing C4–C9 production step has exact provable lineage (only C4 exists among them).  
No unknown managed council row remains after C3. Prefixes match at 5. Next unapplied logical step is C5. Anti-false-pass intact. B1 visible=5. Writes=0. Migration applied=NO.
