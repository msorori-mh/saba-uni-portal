# GRADUATION-PROJECTS-MVP-INTEGRATION-AND-CONTRACT-RECONCILIATION-01-REPORT

**Mission:** `PORTAL_GRADUATION_PROJECTS_MVP_INTEGRATION_AND_CONTRACT_RECONCILIATION_01`  
**Mode:** IMPLEMENT · MERGE · RECONCILE · TEST · COMMIT · PUSH · SOURCE-ONLY  
**Branch:** `integration/gp-mvp-01`  
**Frozen contract:** `7b67539aeb21bd223287de39d480cb1e6c0332b0`  
**Date:** 2026-08-06  

## Decision

**PASS_GRADUATION_PROJECTS_MVP_INTEGRATION_READY**

## Package SHAs (inputs)

| Package | SHA | Role |
|---|---|---|
| Frozen contract | `7b67539aeb21bd223287de39d480cb1e6c0332b0` | Product semantics |
| A (integration base) | `1d3e5060dfb336b315cc4226a7ead1ecae3a6995` | DB RPC signatures / migrations |
| B | `0f6f82984d0def6a8031bcd1b0533329ed04f929` | Runtime adapter |
| C | `7a031f71a315d5e63b36412b8756fd95a2d4bdf7` | Routed UI |
| C Regression | `c6649101643efd1ac7d3be295d22c38053fb7883` | Visibility + route-tree baselines |
| D | `7b01a6d7b423c4be2759553a4a9e2214f5d04b67` | Auth matrix + E2E specs |

## Merge commits (`--no-ff`)

| Order | Merge commit | Message |
|---|---|---|
| 1 | *(base)* `1d3e5060` | Package A already on `integration/gp-mvp-01` |
| 2 | `d6c11a73` | `merge(gp): integrate Package B runtime adapter` |
| 3 | `a5bfedec` | `merge(gp): integrate Package C routed UI` |
| 4 | `e7a94b3e` | `merge(gp): integrate Package C regression closure` |
| 5 | `ff9b78a0` | `merge(gp): integrate Package D authorization and E2E` |
| 6 | *(reconciliation commit)* | `feat(gp): integrate MVP packages and reconcile contracts` |

## Storage correction

| Item | Result |
|---|---|
| Canonical bucket id | `graduation-projects` |
| A2 `storage.buckets` INSERT/UPSERT/UPDATE | **Removed** from draft + promoted migration |
| A2 prerequisite | Fail-closed DO block: bucket must exist, `public=false`, else raise |
| Bucket creation channel | Managed Lovable Stage S1 `storage_create_bucket` only |
| Disposable fixture | `postgres-minimal-schema.sql` seeds private bucket before A2 |
| Runtime constant | `GP_PRIVATE_BUCKET = "graduation-projects"` |

## Upload contract

1. `create_graduation_project_file_upload_intent` — `p_sha256` nullable while pending.  
2. Private binary upload via storage client (`upload`, never `getPublicUrl`).  
3. `finalize_graduation_project_file` — requires/verifies 64-hex `p_sha256`.  
4. Scan gate via `mark_graduation_project_file_scan_state`.  
5. `create_graduation_project_signed_download` → short-lived signed URL only.  
6. No clean/signed/final/archive path while sha256 is NULL after finalize requirement.

## Reconciled RPC inventory (Package A authoritative)

### Storage (A2)

| RPC | Parameters |
|---|---|
| `create_graduation_project_file_upload_intent` | `p_project_id, p_category, p_original_name, p_byte_size, p_correlation_id, p_sha256?` |
| `register_graduation_project_file` | same (returns `file_id`) |
| `finalize_graduation_project_file` | `p_file_id, p_correlation_id, p_sha256?` (required at finalize) |
| `mark_graduation_project_file_scan_state` | `p_file_id, p_scan_state, p_correlation_id` |
| `create_graduation_project_signed_download` | `p_file_id, p_correlation_id` → `{storage_bucket, storage_object_path, expires_in_seconds}` |
| `cleanup_graduation_project_orphan_storage_contract` | `p_project_id, p_correlation_id` |

### Lifecycle writes (A3)

| RPC | Key parameters |
|---|---|
| `create_graduation_project_team` | `p_department_id, p_leader_student_profile_id, p_leader_user_id, p_program_id, p_academic_year_id, p_semester_id, p_correlation_id` |
| `add_graduation_project_team_member` | `p_project_id, p_student_profile_id, p_student_user_id, p_correlation_id` |
| `remove_graduation_project_team_member` | `p_project_id, p_assignment_id, p_correlation_id` |
| `upsert_graduation_project_proposal` | `p_project_id, p_title, p_problem_statement, p_objectives, p_summary, p_expected_version, p_correlation_id` |
| `submit_graduation_project_proposal` / `resubmit_*` | `p_project_id, p_expected_version, p_correlation_id` |
| `review_graduation_project_proposal` | `p_project_id, p_action, p_reason, p_expected_version, p_correlation_id` |
| `assign_graduation_project_supervisor` | `p_project_id, p_faculty_profile_id, p_user_id, p_correlation_id` |
| `respond_graduation_project_supervision` | `p_project_id, p_response, p_expected_version, p_correlation_id` |
| `submit_graduation_project_progress` | `p_project_id, p_summary, p_file_id, p_correlation_id` |
| `review_graduation_project_progress` | `p_entry_id, p_action, p_comments, p_correlation_id` |
| `submit_graduation_project_final` | `p_project_id, p_file_id, p_expected_version, p_correlation_id` |
| `review_graduation_project_final` | `p_project_id, p_action, p_comments, p_expected_version, p_correlation_id` |
| `schedule_graduation_project_defense` | `p_project_id, p_starts_at, p_venue, p_expected_version, p_correlation_id` |
| `assign_graduation_project_committee_member` | `p_project_id, p_faculty_profile_id, p_user_id, p_correlation_id` |
| `mark_graduation_project_defense_held` | `p_project_id, p_expected_version, p_correlation_id` |
| `submit_graduation_project_evaluation` | `p_project_id, p_score, p_notes, p_correlation_id` |
| `conclude_graduation_project_result` | `p_project_id, p_decision, p_expected_version, p_correlation_id` |
| `archive_graduation_project` | `p_project_id, p_expected_version, p_correlation_id` |

### Reads (A3)

| RPC | Parameters |
|---|---|
| `list_my_graduation_projects` | *(none)* |
| `get_graduation_project_detail` | `p_project_id` |
| `list_administration_graduation_projects_overview` | *(none)* |

### Package D TEST_ONLY

| RPC | Notes |
|---|---|
| `cleanup_graduation_project_test_artifacts` | Fingerprint-scoped cleanup; not in A1–A3; Package D owned |

**Drift guard:** `tests/graduation-projects/graduation-projects-rpc-contract-drift.test.ts` fails if TypeScript RPC names/arguments diverge from A1/A2/A3 migrations.

## Package C integration

- `src/routes/-graduation-projects-adapter.ts` is now a **thin wrapper** over Package B (`createGraduationProjectsService` / configure hooks).
- Removed temporary RPC names (`*_mvp`, `prepare_*_private_upload`, `get_my_graduation_project_workspace`, etc.).
- Five GP routes preserved; Arabic/RTL/actor-aware/read-only admin preserved.
- No direct `.from("graduation_project...")` table writes; no `getPublicUrl`.

## Package D integration

- Canonical Package D contracts + E2E specs retained.
- Fingerprint/fixtures bucket aligned to `graduation-projects` with A key shape.
- Authorization matrix: coordinator-only ops; zero title bypass; archived E2E evidence preserved.

## Regression preserved

- Released five-services `student_visible=true` expectation (Package C regression suite).
- Updated stable route-tree hash (Package C regression suite).
- All five GP routes registered.
- `enrollment_certificate` untouched.

## Changed files (reconciliation layer)

- `supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql`
- `src/lib/graduation-projects/{domain,rpc,service,hooks,index}.ts`
- `src/routes/-graduation-projects-adapter.ts`
- `tests/graduation-projects/postgres-minimal-schema.sql`
- `tests/graduation-projects/graduation-projects-rpc-contract-drift.test.ts` *(new)*
- `tests/graduation-projects/graduation-projects-{runtime-adapter,package-a-sql-draft,lifecycle-sql-draft,package-c-ui}.test.ts(x)`
- `tests/graduation-projects/package-d-{fingerprint-contract.json,fixtures.sql}`
- `docs/GRADUATION-PROJECTS-MVP-INTEGRATION-AND-CONTRACT-RECONCILIATION-01-REPORT.md` *(this file)*

## Exact test counts

| Suite | Result |
|---|---|
| `bun test tests/graduation-projects` | **92 pass / 0 fail / 1038 expects** |
| `bun test tests/student-requests` | **1066 pass / 0 fail / 7923 expects** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run build` | **PASS** |
| `git diff --check` | **PASS** |

## PostgreSQL 17 disposable results

Environment: local Docker `postgres:17`, isolated DB `gp_mvp_int`.  
No remote/production connection. Container disposed after run.

| Step | Result |
|---|---|
| `postgres-minimal-schema.sql` (incl. private-bucket prerequisite fixture) | PASS |
| A1 foundation draft | PASS |
| A2 storage draft (fail-closed bucket assertion) | PASS |
| A3 lifecycle draft | PASS |
| `postgres-foundation-verifier.sql` | PASS — `PACKAGE_A_FOUNDATION_VERIFIER_PASS` + `ROLLBACK` |
| `postgres-lifecycle-verifier.sql` | PASS — `PACKAGE_A_VERIFIER_PASS` + `ROLLBACK` |
| `package-d-fixtures.sql` | PASS |
| `package-d-verifier.sql` | PASS (stub security/cleanup contracts loaded) |
| Final | ROLLBACK / container destroyed |

## Assumptions

- Managed Lovable Stage S1 creates the private `graduation-projects` bucket before any A2 apply in a real environment.
- Package D Postgres auth-matrix execution remains stub-level; Bun Package D contracts/E2E specs are the current executable authority for D.
- Freeze doc historically named bucket `graduation-projects-files`; mission mandatory correction + Package A control the canonical id `graduation-projects`.

## Risks

- Package D executable PG matrix is still stubbed (fixtures/verifier do not exercise full actor RPC matrix).
- UI adapter maps flat Package A detail JSON into Package C `mvp-ui` DTOs; coordinator option lists remain empty until a dedicated options RPC exists.
- Unrouted legacy GP components may still use older DTO shapes; five MVP routes use the reconciled path.

## Blockers

None for SOURCE-ONLY integration candidate.

## Production impact

**NONE.**

- NO PRODUCTION APPLY  
- NO DEPLOY  
- NO PUBLISH  
- Zero production writes  
- Zero production bucket creation  
- `request_types.student_visible` unchanged  
- `enrollment_certificate` unchanged  

## Final SHA

| Item | Value |
|---|---|
| Branch | `integration/gp-mvp-01` |
| Final HEAD | `0bf55def94aa0377db6b47c34c30356bf875a926` |
| Reconciliation commit | `0bece436` — `feat(gp): integrate MVP packages and reconcile contracts` |
| Report SHA pin | `0bf55def` — `docs(gp): pin MVP integration final HEAD SHA` |
