# GRADUATION-PROJECTS-MVP-PACKAGE-A-01-REPORT

**Mission:** `PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_A_FINAL_COMPLETION_AND_REPORT_01`
**Branch:** `feat/gp-mvp-package-a-01`
**Frozen contract SHA:** `7b67539aeb21bd223287de39d480cb1e6c0332b0`
**Sole authority:** `docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md`

## Decision

**PASS_GRADUATION_PROJECTS_MVP_PACKAGE_A_SOURCE_READY**

## Branch / commit

| Item | Value |
|---|---|
| Branch | `feat/gp-mvp-package-a-01` |
| Frozen base | `7b67539aeb21bd223287de39d480cb1e6c0332b0` |
| Primary implementation commit | `f5abc75c39352d9deea28e365f5ffcf0a9c4bea2` |
| Final completion commit | _(recorded after push of verifier/report completion)_ |

## A1 / A2 / A3 migrations

| Slice | Draft | Promoted migration (NOT APPLIED) |
|---|---|---|
| A1 foundation/schema | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql` | `supabase/migrations/20260806120000_gp_mvp_package_a1_foundation_01.sql` |
| A2 private storage | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql` | `supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql` |
| A3 lifecycle/reads | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql` | `supabase/migrations/20260806120200_gp_mvp_package_a3_lifecycle_01.sql` |

Legacy drafts remain historical and are marked **SUPERSEDED BY PACKAGE A**.

## Tables / enums / constraints

**Enums:** `graduation_project_state`, `graduation_project_assignment_role` (student/supervisor/coordinator/panel_member only), `graduation_project_final_decision` (`passed` \| `revisions_required` \| `failed`), `graduation_project_file_category`, `graduation_project_supervision_status`, `graduation_project_file_upload_status`, `graduation_project_scan_state`

**Tables:** `graduation_project_department_coordinators`, `graduation_projects` (`lifecycle_state` + separate `final_decision`), `graduation_project_assignments` (`is_leader`, `supervision_status`), approvals, progress_entries, files, discussions (defense), panel_members, evaluations, final_archives (immutable `snapshot` jsonb), events (append-only)

**Key constraints/indexes:** one active leader/project; one active student team membership across projects; one pending/accepted supervisor/project; one current proposal file; one current final file; composite project-bound FKs; RLS default-deny on all GP tables

## RPC inventory (Package A)

**Storage:** `create_graduation_project_file_upload_intent`, `register_graduation_project_file`, `finalize_graduation_project_file` (sha256 required/verified), `mark_graduation_project_file_scan_state`, `create_graduation_project_signed_download` (300s authorize payload, no public URL), `cleanup_graduation_project_orphan_storage_contract` (inventory only)

**Lifecycle writes:** `create_graduation_project_team`, `add/remove_graduation_project_team_member`, `upsert/submit/resubmit_graduation_project_proposal`, `review_graduation_project_proposal` (accept/return/reject), `assign_graduation_project_supervisor`, `respond_graduation_project_supervision` (accept/decline), `submit/review_graduation_project_progress`, `submit/review_graduation_project_final`, `schedule_graduation_project_defense`, `assign_graduation_project_committee_member`, `mark_graduation_project_defense_held`, `submit_graduation_project_evaluation`, `conclude_graduation_project_result`, `archive_graduation_project`

**Reads:** `list_my_graduation_projects`, `get_graduation_project_detail` (own evaluation only for panel; aggregate for coordinator), `list_administration_graduation_projects_overview`

## Storage contract

- Private bucket id/name: `graduation-projects`
- PDF only; 20MB limit; no public URL
- Object keys: `graduation-projects/{project_id}/{category}/{token}-{safe_filename}.pdf`
- Upload intent → finalize → scan gate → signed download authorize RPC
- Orphan cleanup contract returns candidates only (no storage delete in MVP source)

## Authorization invariants

- RPC-only authenticated access; SECURITY DEFINER + fixed `search_path`
- Exact project assignment required; no title/global-role bypass
- Coordinator-only for review/assign/schedule/committee/held/conclude/archive
- Leader-only proposal/progress/final writes; accepted supervisor for progress/final review
- Committee member submits own immutable score 0..100 + notes; no peer leakage

## Idempotency / version behavior

- Every write RPC takes `p_correlation_id`
- `gp_take_replay` / request fingerprint: identical replay returns prior result; changed payload denied
- State transitions use `p_expected_version` + `FOR UPDATE`
- Deny ⇒ exception with zero side effects

## Verification results

| Check | Result |
|---|---|
| Disposable PG17: minimal → A1 → A2 → A3 → foundation verifier → lifecycle verifier → ROLLBACK | **PASS** |
| Foundation notice | `PACKAGE_A_FOUNDATION_VERIFIER_PASS` |
| Lifecycle notice | `PACKAGE_A_VERIFIER_PASS` |
| `bun test tests/graduation-projects` | **34 pass / 0 fail / 290 expects** |
| `bunx tsc --noEmit` | **PASS** (after local `bun install`; no Package B TS mirrors edited by Package A) |
| `git diff --check` | **PASS** |

Evidence: `tests/graduation-projects/POSTGRES-17-PACKAGE-A-VERIFICATION-RESULT.md`

## Package B integration dependencies

Package B must align client adapters to freeze RPC names/signatures (`create_graduation_project_team`, `final_decision`, supervisor accept/decline, defense schedule RPCs, signed-download authorize payload). Current `src/lib/graduation-projects/{domain,lifecycle,rpc}.ts` remains pre-freeze vocabulary until Package B owns those files.

## Explicit non-actions

- **NO PRODUCTION APPLY**
- **NO DEPLOY**
- **NO PUBLISH**
- No production bucket creation
- No Package B runtime edits
- No Package C UI/routes edits
- No Package D E2E roster provisioning

## Assumptions

- Department coordinator bootstrap uses `graduation_project_department_coordinators` (not title-based roles)
- Scan gate is coordinator-mediated `mark_graduation_project_file_scan_state` in MVP source
- `discussion*` SQL names retained for defense compatibility
- Disposable finalize may skip `storage.objects` presence via `gp.verify.skip_storage_object_check=on`

## Risks

- Promoted migrations include bucket INSERT; apply still requires separate authorization
- Package B/C/D must serialize against freeze before runtime activation

## Blockers

None for source readiness.

## Production impact

**Zero.**

## Changed files (Package A ownership)

- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A{1,2,3}-*.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` / `GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` (supersede banners)
- `supabase/migrations/20260806120000_gp_mvp_package_a1_foundation_01.sql`
- `supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql`
- `supabase/migrations/20260806120200_gp_mvp_package_a3_lifecycle_01.sql`
- `tests/graduation-projects/postgres-minimal-schema.sql`
- `tests/graduation-projects/postgres-package-a-verifier.sql`
- `tests/graduation-projects/postgres-package-a-foundation-verifier.sql`
- `tests/graduation-projects/postgres-foundation-verifier.sql`
- `tests/graduation-projects/postgres-lifecycle-verifier.sql`
- `tests/graduation-projects/POSTGRES-17-PACKAGE-A-VERIFICATION-RESULT.md`
- `tests/graduation-projects/graduation-projects-package-a-sql-draft.test.ts`
- `tests/graduation-projects/graduation-projects-sql-draft.test.ts`
- `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts`
- `docs/GRADUATION-PROJECTS-MVP-PACKAGE-A-01-REPORT.md`
