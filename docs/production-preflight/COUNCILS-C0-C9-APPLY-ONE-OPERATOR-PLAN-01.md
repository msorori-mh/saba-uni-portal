# Academic Councils C0–C9 — Apply-One Operator Plan

- **Mission:** `ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09`
- **Base:** PR #304 / `2cb8baf73db6a97c5d8bfcd123c642b15a51b9fb`
- **Hash contract:** `SHA256_LF_NORMALIZED_V1` (FULL file LF hash — authoritative)
- **Rule:** **ONE migration per session.** No batch. No parallel. No CI auto-apply.
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
2. Expect: `READY_FOR_APPLY_C0`
3. **STOP** on any `HOLD:`

## Step C0

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql` |
| FULL_SHA256_LF | `cca51386d7c3bfe1a3b9ce5ec2cdfb3cd124e3e5eeef01f6270e4299c715dc13` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C0.sql` |
| Pass marker | `COUNCILS_C0_PRODUCTION_POST_VERIFIER_PASS` |
| Local behavioral (never prod) | `tests/academic-councils/postgres-c0-write-surface-verifier.sql` |

**STOP** after verifier PASS. Record ledger version. Do not continue without explicit next-step approval.

## Step C1

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql` |
| FULL_SHA256_LF | `498a8d8c274277ff3ffc96e95fa30202e859aa2a2cfd74bcfaaa9f5d39a033d5` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C1.sql` |
| Pass marker | `COUNCILS_C1_PRODUCTION_POST_VERIFIER_PASS` |

## Step C2

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql` |
| FULL_SHA256_LF | `f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C2.sql` |
| Pass marker | `COUNCILS_C2_PRODUCTION_POST_VERIFIER_PASS` |

## Step C3

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql` |
| FULL_SHA256_LF | `e7361f6c85014fb37b6f8d97bd468dc1205700748a526cb7a8063f82ff6c0de6` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C3.sql` |
| Pass marker | `COUNCILS_C3_PRODUCTION_POST_VERIFIER_PASS` |

## Step C4

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808140000_councils_c4_session_voting_01.sql` |
| FULL_SHA256_LF | `d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C4.sql` |
| Pass marker | `COUNCILS_C4_PRODUCTION_POST_VERIFIER_PASS` |

## Step C5

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql` |
| FULL_SHA256_LF | `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C5.sql` |
| Pass marker | `COUNCILS_C5_PRODUCTION_POST_VERIFIER_PASS` |

## Step C6

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql` |
| FULL_SHA256_LF | `1051df7e816fc2e260616a9f1f9dba457e5e39e001c5ab06a91f376b84d92b43` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C6.sql` |
| Pass marker | `COUNCILS_C6_PRODUCTION_POST_VERIFIER_PASS` |

## Step C7

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql` |
| FULL_SHA256_LF | `3fd74518d57722b7018b06ba9ce50f7fb9033c2d8527fe515d5ad133a4081f6a` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C7.sql` |
| Pass marker | `COUNCILS_C7_PRODUCTION_POST_VERIFIER_PASS` |

## Step C8 (security closure — required before C9)

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql` |
| FULL_SHA256_LF | `6cb87098f9f038d0d6174aa08c37c524b1b4d91cca49244251cbc03ab6df37c3` |
| Post-verifier | `docs/migration-drafts/councils-c0-c9-verifiers/POST-VERIFIER-C8.sql` |
| Pass marker | `COUNCILS_C8_PRODUCTION_POST_VERIFIER_PASS` |

## Step C9

| Field | Value |
|---|---|
| Migration | `supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql` |
| FULL_SHA256_LF | `f7b6133ced9d7b1ab56a7fc2b40c059986d4c70f0ddc6ca90b6e1b8de5c7d051` |
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
