# Academic Councils C0–C9 — Apply-One Operator Plan

- **Mission:** `ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-FORWARD-RECONCILIATION-LONGRUN-13`
- **Base:** PR #306 / `1f50e7dcc8042cf15780c7817ecefa579c49f431`
- **Hash contract:** `SHA256_LF_NORMALIZED_V1` (FULL file LF hash — authoritative)
- **Rule:** **ONE migration per session.** No batch. No parallel. No CI auto-apply.
- **Supported preflight outcomes:** `LEGACY_SUPPORTED_EXACT` authorizes C0; `PARTIAL_NEW_CHAIN_EXACT_PREFIX` and `FULL_NEW_CHAIN_VERIFIED` are successful STOP states. Unknown variation = HOLD.
- **Status:** SOURCE READY — **NOT APPLIED**

Pinned hashes: `docs/migration-evidence/academic-councils/HASHES.txt`  
Manifest: `docs/migration-evidence/academic-councils/MIGRATION_MANIFEST.json`

## Cross-platform hash verification (before every apply)

```bash
python scripts/sha256_lf_normalized_v1.py --self-test
python scripts/sha256_lf_normalized_v1.py <migration.sql>
```

Expect `FULL_SHA256_LF=` to match the pinned value for that step.  
**STOP** on mismatch. Do not use `Get-FileHash` / `sha256sum` on raw checkout bytes.

---

## Global sequence (STOP after every gate)

```
PREFLIGHT
  → C0 apply → C0 post-verifier → STOP
  → C1 apply → C1 post-verifier → STOP
  → C2 apply → C2 post-verifier → STOP
  → C3 apply → C3 post-verifier → STOP
  → C4 apply → C4 post-verifier → STOP
  → C5 apply → C5 post-verifier → STOP
  → C6 apply → C6 post-verifier → STOP
  → C7 apply → C7 post-verifier → STOP
  → C8 apply → C8 post-verifier → STOP   (security closure; before C9)
  → C9 apply → C9 post-verifier → STOP
```

Feature flags remain **OFF**. No deploy. No merge from this package alone.

---

## Step 0 — Preflight (READ ONLY)

1. Run `docs/migration-drafts/COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01.sql`
2. Interpret the terminal Phase N result:
   - `LEGACY_SUPPORTED_EXACT` → `READY_FOR_APPLY_C0`; C0 may be considered under the separate approval process.
   - `PARTIAL_NEW_CHAIN_EXACT_PREFIX` → **STOP** and report `PREFLIGHT_NEXT_EXPECTED_LOGICAL`; do not apply automatically.
   - `FULL_NEW_CHAIN_VERIFIED` → **NO APPLY**; expect `COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED`.
3. **STOP** on any `HOLD:`. A full ledger alone never produces `READY_FOR_APPLY_C0`.

### Ledger identity contract (logical vs physical)

The classifier does **not** match raw `schema_migrations.name` against full composite filenames alone.

| Layer | Meaning |
|---|---|
| Logical step | `LOGICAL_C0` … `LOGICAL_C9` — contiguous prefix authority |
| Physical row | One (or, for C1 split, two) `supabase_migrations.schema_migrations` row(s) |
| Primary identity | `version` (exact) |
| Secondary identity | normalized `name`: short (`councils_c2_topic_intake_review_01`) **or** composite (`20260808122000_councils_c2_topic_intake_review_01`) — exact only |

Supabase/Lovable production commonly stores the **short** name. Both forms are accepted only when they map to the same pinned `(version, short-name)` identity. No `LIKE`, no fuzzy match, no ordering inference.

### C1 split lineage (one logical C1)

Logical C1 is satisfied by **exactly one** of:

| Lineage | Physical proof |
|---|---|
| `ORIGINAL` | `version=20260808121000` + name `councils_c1_meeting_state_machine_01` (or composite) |
| `SPLIT_COMPLETE` | **both** `20260810003111` / `01d86704-d31c-42e9-9efa-aa5fe4d6a8c9` **and** `20260810003305` / `c75271d6-2ef1-407a-96f5-66aaf2386afe` |

- One split half only → `HOLD_C1_SPLIT_INCOMPLETE`
- Original + any split half → `HOLD_C1_LINEAGE_AMBIGUOUS` (fail closed)

Stable notices include: `PREFLIGHT_LEDGER_STORAGE_FORMAT`, `PREFLIGHT_C0_LEDGER_IDENTITY`, `PREFLIGHT_C1_LINEAGE`, `PREFLIGHT_C1_SPLIT_PART_A/B`, `PREFLIGHT_LOGICAL_LEDGER_PREFIX`, `PREFLIGHT_SCHEMA_PREFIX`, `PREFLIGHT_LAST_APPLIED_LOGICAL`, `PREFLIGHT_NEXT_EXPECTED_LOGICAL`, `PREFLIGHT_STATE_CLASSIFICATION`.

Ledger alone is never enough. Schema alone is never enough. Prefix mismatch → HOLD.

## Step C0

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql` |
| FULL_SHA256_LF | `7b7686535e3f77cae5bc72146e2f65db2231a92de75a1815170305d7abac6029` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C0.sql` |
| Pass marker | `COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS` |
| Local behavioral (never prod) | `tests/academic-councils/postgres-c0-write-surface-verifier.sql` |

**STOP** after verifier PASS. Record ledger version. Do not continue without explicit next-step approval.

## Step C1

| Field | Value |
|---|---|
| Migration (ORIGINAL lineage) | `supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql` |
| FULL_SHA256_LF | `498a8d8c274277ff3ffc96e95fa30202e859aa2a2cfd74bcfaaa9f5d39a033d5` |
| Approved SPLIT lineage (production remediation) | **both** required for one logical C1: `20260810003111_01d86704-d31c-42e9-9efa-aa5fe4d6a8c9.sql` **and** `20260810003305_c75271d6-2ef1-407a-96f5-66aaf2386afe.sql` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C1.sql` |
| Pass marker | `COUNCILS_C1_PRODUCTION_POST_VERIFIER_PASS` |

Do not treat ORIGINAL + SPLIT coexistence as a single satisfied C1 — preflight holds `HOLD_C1_LINEAGE_AMBIGUOUS`.

### C2 / C3 / C4 pinned Lovable managed aliases

Logical C2 is satisfied by **exactly one** of:

| Lineage | Physical proof |
|---|---|
| `CANONICAL` | `version=20260808122000` + name `councils_c2_topic_intake_review_01` (or composite) |
| `LOVABLE_MANAGED_ALIAS` | `version=20260810010400` + name `4e2c4b05-5ff0-4b23-9084-18d8b1b29c86` (or composite) |

Logical C3 is satisfied by **exactly one** of:

| Lineage | Physical proof |
|---|---|
| `CANONICAL` | `version=20260808130000` + name `councils_c3_attendance_quorum_01` (or composite) |
| `LOVABLE_MANAGED_ALIAS` | `version=20260810011456` + name `430aac8f-1f38-4e9d-99aa-022ea2680fc4` (or composite) |

Logical C4 is satisfied by **exactly one** of:

| Lineage | Physical proof |
|---|---|
| `CANONICAL` | `version=20260808140000` + name `councils_c4_session_voting_01` (or composite) |
| `LOVABLE_MANAGED_ALIAS` | `version=20260810012715` + name `72757e0e-3b8b-46fa-b252-8e1c8b594d3e` (or composite) |

- Canonical + alias coexistence → `HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE`
- Wrong version or wrong name on the pinned alias → `HOLD_LEDGER_IDENTITY_MISMATCH`
- Arbitrary UUID names are never accepted
- C5 may be CANONICAL (statements present) or `CANONICAL_NULL_STATEMENTS_ANOMALY` (exact version+name with `statements IS NULL`); NULL statements are never body proof
- C6–C9 may be CANONICAL or pinned LOVABLE_MANAGED_ALIAS (exact version+name only; no fuzzy UUID)

Stable notices also include: `PREFLIGHT_C2_LINEAGE`, `PREFLIGHT_C2_LEDGER_IDENTITY`, `PREFLIGHT_C3_LINEAGE`, `PREFLIGHT_C3_LEDGER_IDENTITY`, `PREFLIGHT_C4_LINEAGE`, `PREFLIGHT_C4_LEDGER_IDENTITY`, and `PREFLIGHT_C5_LINEAGE`..`PREFLIGHT_C9_LINEAGE`.

## Step C2

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql` |
| FULL_SHA256_LF | `f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810010400` / `4e2c4b05-5ff0-4b23-9084-18d8b1b29c86` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C2.sql` |
| Pass marker | `COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS` |

## Step C3

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql` |
| FULL_SHA256_LF | `e7361f6c85014fb37b6f8d97bd468dc1205700748a526cb7a8063f82ff6c0de6` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810011456` / `430aac8f-1f38-4e9d-99aa-022ea2680fc4` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C3.sql` |
| Pass marker | `COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS` |

## Step C4

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808140000_councils_c4_session_voting_01.sql` |
| FULL_SHA256_LF | `d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810012715` / `72757e0e-3b8b-46fa-b252-8e1c8b594d3e` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C4.sql` |
| Pass marker | `COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS` |

## Step C5

| Field | Value |
|---|---|
| Migration (V1 — SUPERSEDED_DO_NOT_APPLY) | `supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql` |
| V1 FULL_SHA256_LF (frozen) | `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25` |
| Migration (V2 — CANONICAL_APPLY_CANDIDATE) | `supabase/migrations/20260810180000_councils_c5_minutes_lifecycle_02.sql` |
| V2 FULL_SHA256_LF | `0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql` |
| Pass marker | `COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS` |

**Logical C5 apply path:** Revision 02 only. V1 remains in-repo as a frozen historical artifact (`SUPERSEDED_DO_NOT_APPLY`; never applied to production). Do not apply V1.

## Step C6

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql` |
| FULL_SHA256_LF | `1051df7e816fc2e260616a9f1f9dba457e5e39e001c5ab06a91f376b84d92b43` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810123158` / `e4d9fe06-550d-43df-89cb-803fb49df1da` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C6.sql` |
| Pass marker | `COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS` |

## Step C7

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql` |
| FULL_SHA256_LF | `3fd74518d57722b7018b06ba9ce50f7fb9033c2d8527fe515d5ad133a4081f6a` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810123359` / `8d8851ce-18d9-465b-b9a9-b34d62fc14fb` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C7.sql` |
| Pass marker | `COUNCILS_C7_PRODUCTION_POST_VERIFIER_PASS` |

## Step C8 (security closure — required before C9)

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql` |
| FULL_SHA256_LF | `6cb87098f9f038d0d6174aa08c37c524b1b4d91cca49244251cbc03ab6df37c3` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810123616` / `7aac7456-a80d-464d-84fc-bc9671ae2e4e` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C8.sql` |
| Pass marker | `COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS` |

## Step C9

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql` |
| FULL_SHA256_LF | `7c18cab2ed35264155af241a7810d0d387ceec0b09a0c32216a10d59bc002a30` |
| Approved LOVABLE_MANAGED_ALIAS (production) | `20260810124128` / `8b20af1b-8607-42cd-94d8-f71793d9a687` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C9.sql` |
| Pass marker | `COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS` |

After C9 PASS, optionally run observability:
`docs/migration-drafts/COUNCILS-C0-C9-OBSERVABILITY-READONLY-01.sql`

---

## STOP conditions (any step)

- Preflight / post-verifier raises `HOLD:`
- LF hash mismatch vs pinned `HASHES.txt`
- Ledger already contains the migration being applied
- Partial object surface without matching ledger entry
- Any ERROR during apply
- Attempt to batch more than one migration

On STOP: enter the matching **partial safe HOLD** state documented in  
`docs/migration-drafts/COUNCILS-C0-C9-PARTIAL-SAFE-HOLD-STATES-01.md`.  
Use rollback-by-forward guidance only — **no DROP TABLE reset**.

## Forbidden

- Production apply from this readiness package without separate governed approval
- Feature flag activation
- Deploy / publish / merge as part of apply
- Destructive rollback / truncate / delete of non-TEST_ONLY rows
