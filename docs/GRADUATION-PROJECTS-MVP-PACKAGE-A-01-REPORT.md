# GRADUATION-PROJECTS-MVP-PACKAGE-A-01-REPORT

**Mission:** `PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_A_DATABASE_STORAGE_IMPLEMENTATION_01`  
**Branch:** `feat/gp-mvp-package-a-01`  
**Frozen contract SHA:** `7b67539aeb21bd223287de39d480cb1e6c0332b0`  
**Implementation commit:** `f5abc75c39352d9deea28e365f5ffcf0a9c4bea2`  
**Sole authority:** `docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md`

## Decision

**PASS_GRADUATION_PROJECTS_MVP_PACKAGE_A_SOURCE_READY**

## Scope delivered

Package A source-only database/storage implementation:

| Slice | Draft | Promoted migration (NOT APPLIED) |
|---|---|---|
| A1 foundation/schema | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql` | `supabase/migrations/20260806120000_gp_mvp_package_a1_foundation_01.sql` |
| A2 private storage | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql` | `supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql` |
| A3 lifecycle RPCs/reads | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql` | `supabase/migrations/20260806120200_gp_mvp_package_a3_lifecycle_01.sql` |

Legacy drafts `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` and `GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` are marked **SUPERSEDED BY PACKAGE A**.

## Contract overrides honored

- `final_decision` is separate from `lifecycle_state` (`passed` \| `revisions_required` \| `failed`)
- Exact assigned coordinator alone reviews proposal, assigns supervisor, schedules defense, concludes, archives
- No `department_head` / `dean` / admin / registrar operational bypass
- Exactly one leader; one active GP membership per student
- Supervisor assignment starts `pending`; accept/decline required before operate
- Proposal attachment mandatory; private PDF bucket `graduation-projects`
- Final/progress files private; signed download authorize RPC only (300s contract)

## Objects (summary)

**Enums:** state, assignment_role (student/supervisor/coordinator/panel_member), final_decision, file_category, supervision_status, file_upload_status, scan_state

**Tables:** department_coordinators, projects, assignments, approvals, progress_entries, files, discussions (defense), panel_members, evaluations, final_archives, events

**Storage:** private bucket contract `graduation-projects` (PDF, 20MB); INSERT-only storage policy; orphan cleanup inventory RPC (no delete)

**RPCs:** full freeze write/read inventory for Package A (storage + lifecycle + reads). Package D owns `cleanup_graduation_project_test_artifacts`.

## Tests and verification

| Check | Result |
|---|---|
| Disposable PostgreSQL 17 A1→A2→A3→verifier | PASS (`PACKAGE_A_VERIFIER_PASS`, `ROLLBACK`) |
| `bun test tests/graduation-projects` | see commit verification |
| `bunx tsc --noEmit` | not required for SQL-only Package A (no Package B TS mirrors edited) |
| `git diff --check` | see commit verification |

Evidence: `tests/graduation-projects/POSTGRES-17-PACKAGE-A-VERIFICATION-RESULT.md`

## Explicit non-actions

- **NO PRODUCTION APPLY**
- **NO DEPLOY**
- **NO PUBLISH**
- No production bucket creation
- No Package B runtime (`src/lib/graduation-projects/**`) edits
- No Package C UI/routes edits
- No Package D E2E roster provisioning

## Assumptions

- Department coordinator bootstrap uses `graduation_project_department_coordinators` (capability table), seeded only in disposable verifiers / future authorized ops -- not title-based `user_roles`.
- Scan gate is coordinator-mediated `mark_graduation_project_file_scan_state` in MVP source (external scanner integration out of scope).
- `discussion*` SQL names retained for defense compatibility; user-facing term remains «مناقشة مشروع التخرج».
- Disposable finalize may skip `storage.objects` object presence via `gp.verify.skip_storage_object_check=on`.

## Risks

- Promoted migrations include bucket INSERT; applying them still requires separate explicit authorization.
- Package B domain/lifecycle TypeScript still mirrors pre-freeze vocabulary until Package B aligns.
- Administration overview is gated on department coordinator capability (read-only); broader admin-viewer grant remains a future authorized concern if product requires non-coordinator viewers.

## Blockers

None for source readiness. Runtime activation remains blocked on separately authorized apply + Packages B/C/D.

## Production impact

**Zero.** Source and disposable verification only.

## Changed files (Package A ownership)

- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` (supersede banner)
- `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` (supersede banner)
- `supabase/migrations/20260806120000_gp_mvp_package_a1_foundation_01.sql`
- `supabase/migrations/20260806120100_gp_mvp_package_a2_storage_01.sql`
- `supabase/migrations/20260806120200_gp_mvp_package_a3_lifecycle_01.sql`
- `tests/graduation-projects/postgres-minimal-schema.sql`
- `tests/graduation-projects/postgres-package-a-verifier.sql`
- `tests/graduation-projects/POSTGRES-17-PACKAGE-A-VERIFICATION-RESULT.md`
- `tests/graduation-projects/graduation-projects-package-a-sql-draft.test.ts`
- `tests/graduation-projects/graduation-projects-sql-draft.test.ts`
- `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts`
- `docs/GRADUATION-PROJECTS-MVP-PACKAGE-A-01-REPORT.md` (this file)
