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
- Draft SHA256: `9d85fb4b6d7cd5b1ad4c19fb99d913d13b48fce6c83fcde7fca10340a934f1d6`

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
