# GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01 — Report

**Decision:** `PASS_GP_PRODUCTION_MIGRATION_RECONCILIATION_AND_PROMOTION_REVIEW_SHA_READY`

**Mission:** `GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01`  
**Repository:** `msorori-mh/saba-uni-portal`  
**Branch:** `fix/gp-production-migration-reconciliation-01`  
**Base main SHA:** `df4c08b4c601303cc5d18064a8c8c5b9f0d8805d`  
**Qwen predecessor report:** `GP-STUDENT-LEVEL4-PRODUCTION-DB-PREFLIGHT-QWEN-01`  
**Mode:** PRODUCTION READ-ONLY STATE PROBE + SOURCE RECONCILIATION + L4 PROMOTION PACKAGE

## Production scenario

**P1-U** — Exactly complete SET U is applied; SET N is absent from the ledger; L4 predicate absent.

### Production state evidence (read-only Lovable Cloud / Supabase catalog)

Channel: Lovable MCP `query_database` against published project `90f4dcde-07fb-4441-b86a-6ad5510833b8` (config `project_id = wpmicqriltrowwonknox`).

| Probe | Result |
|---|---|
| Ledger U1-U4 | PRESENT (`20260806235348`, `20260807000230`, `20260807001114`, `20260807023229`) |
| Ledger N1-N4 | ABSENT |
| `graduation_projects` | PRESENT |
| A2 upload intent RPC | PRESENT |
| A3 `create_graduation_project_team` | PRESENT |
| `can_upload_graduation_project_object(text)` | PRESENT |
| `student_is_current_fourth_academic_level(uuid)` | ABSENT |
| bucket `graduation-projects` | EXISTS, `public = false` |
| policy `graduation_projects_storage_insert` | predicate-bound (`can_upload_graduation_project_object(name)`) |
| `academic_levels.level_number = 4` | PRESENT |

`PRODUCTION_RPC_CALLS: 0` · `PRODUCTION_WRITES: 0` · `MIGRATION_APPLIED: NO`

## Semantic equivalence (SET N ↔ SET U)

Independent normalized SQL comparison (strip comment lines, `begin;`/`commit;`, blank lines; case-fold):

| Pair | Semantic EQ |
|---|---|
| N1 ↔ U1 | PASS |
| N2 ↔ U2 | PASS |
| N3 ↔ U3 | PASS |
| N4 ↔ U4 | PASS |

Differences are header banners, transaction wrappers, trailing newline only.

## Source reconciliation

- **Canonical predecessor set:** SET U (kept in `supabase/migrations`)
- **Quarantined set:** SET N → `docs/migration-evidence/graduation-projects/duplicate-predecessor-set/` (+ `MANIFEST.json`)
- **Promoted L4:** `supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql` (NOT APPLIED)
- Hash contract: `SHA256_LF_NORMALIZED_V1` (SHA256 over UTF-8 after CRLF/CR → LF; not native checkout SHA256)
- Draft FULL SHA256_LF: `1a0b4558dc071f96948a1d6d7e7a7ee79b9ec2881b12a5c158ce379e5b789f4e`
- Draft/Promoted BODY SHA256_LF: `9e0422f84d7b5605a63c56b12be2428e97db1cf4fe44a48d0d6b894e2d1086c3` (`BODY_MATCH=true`)

## Companion package

| Artifact | Path |
|---|---|
| Preflight | `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-PREFLIGHT.sql` |
| Post-verifier | `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-POST-VERIFIER.sql` |
| Rollback-by-forward | `docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01-ROLLBACK-BY-FORWARD.sql` |
| Runbook | `docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PROMOTION-APPLY-RUNBOOK.md` |

Rollback preserves authz-before-replay for signed download (does **not** restore A2 replay-before-authz defect).

## CI

`pg-verifiers` matrix now uses SET U for GP foundation/lifecycle chains and adds dedicated `graduation-projects-level4` chain:

`minimal → U1 → U2 → U3 → U4 → L4 promoted → L4 verifier`

Existing GA / other legs retained.

## Assumptions

- Lovable Cloud database for project `90f4dcde-...` is the production database matching `supabase/config.toml` project_id `wpmicqriltrowwonknox`.
- SET U ledger rows correspond to the semantically equivalent GP A1/A2/A3/storage-fix SQL (object probes corroborate).

## Risks

- Future `db push` against a database that somehow recorded SET N would fail closed; production is SET U.
- Operator must not apply SET N evidence files.
- L4 apply still requires separate single-migration approval after preflight.

## Production impact

None yet. Source/package only. No migration applied, no deploy, no publish.

## Controls

```
PRODUCTION_READS_EXECUTED: YES (catalog/SELECT only)
PRODUCTION_RPC_CALLS: 0
PRODUCTION_WRITES: 0
MIGRATION_APPLIED: NO
DEPLOY: NO
PUBLISH: NO
```

## KIMI-FINAL-MEDIUM-HASH-PORTABILITY: CONFIRMED_FIXED

Prior recorded SHA256 values for L4 draft / quarantine evidence were computed from Windows CRLF checkout bytes. Committed Git content is LF, so a Linux/CI operator using native physical-file SHA256 could hit a false production STOP even though the SQL was identical.

- No SQL semantic defect existed; L4 SQL body from first `begin;` is unchanged vs START_SHA `7918bf4c`.
- Canonical contract is now `SHA256_LF_NORMALIZED_V1` (`scripts/sha256_lf_normalized_v1.py`).
- Authoritative promotion proof is LF-normalized BODY equality (`DRAFT_BODY_SHA256_LF == PROMOTED_BODY_SHA256_LF`).
- Quarantine `MANIFEST.json` evidence/canonical hashes now use the same LF-normalized contract.
- P1-U production evidence (ledger probes, SET U identity, SET N quarantine paths) remains unchanged; no production reads/writes in this remediation.
