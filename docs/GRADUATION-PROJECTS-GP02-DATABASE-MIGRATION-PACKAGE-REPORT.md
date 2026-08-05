# GRADUATION-PROJECTS — GP-02 DATABASE AND MIGRATION PACKAGE REPORT

> SOURCE-ONLY RELOCATION (2026-08-01): the `supabase/migrations/2026073010000*.sql`
> files referenced below were ported to this branch as source-only drafts
> `docs/migration-drafts/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql` …
> `GRADUATION-PROJECTS-M8-PANEL-COMPLETENESS.NOT_APPLIED.sql` (see
> `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`). They are
> NOT_APPLIED and must not be placed under `supabase/migrations/` from this branch.

- Phase: GP-02
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `bbb177fd0f31703c1984be1b42ff7132f2df7828` (GP-01 commit)
- Migrations created: 4 — Migrations applied to production/staging: **0** (local disposable PG17 only)
- Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP02_DATABASE_PACKAGE_READY_NOT_APPLIED`

---

## 1. What was done

### 1.1 Packaged the reviewed drafts as forward-only migrations (verbatim)

- `supabase/migrations/20260730100000_b1b476e7-0c92-42cf-80e3-925d7941d780.sql` — foundation (identical body to `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`, draft banner replaced by package header).
- `supabase/migrations/20260730100001_96beebe1-d809-4302-a782-c2f6483e102a.sql` — lifecycle completion (identical body to `GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`).

### 1.2 New migrations closing GP-01 gaps

- `20260730100002_c8f89b6d-...sql` — `co_supervisor` enum value, isolated (PG cannot use a new enum label inside its own transaction).
- `20260730100003_1811ed11-...sql` — completion hardening:
  - co-supervisor activation: subject-shape check widened; `assign_graduation_project_faculty` whitelist; staff-level read in `get_graduation_project_detail`; zero write authority (contract decision).
  - Exactly-one constraints: active supervisor/co-supervisor per project, pending discussion request per project, panel chair per discussion — partial unique indexes + guarded P0001 messages (no raw 23505).
  - `set_graduation_project_file_scan_state` — one-way service-path scan RPC, revoked from app roles, conditional `service_role` grant, audit columns `scan_decided_at`/`scan_correlation_id` (scanner holds no `auth.users` identity).
  - `graduation_project_rubrics` + `graduation_project_rubric_criteria` (reference data; GP-06 admin write path).
  - `graduation_project_notification_log` (GP-05 dedupe contract: `unique(project_id, recipient_user_id, notification_type, entity_id)`).
  - All new tables: RLS enabled, zero policies, grants revoked — deny-by-default preserved.

### 1.3 RPC client contract closure (TS)

- 6 missing foundation wrappers added to `src/lib/graduation-projects/rpc.ts`: `submitProposal`, `addTeamMember`, `setMilestone`, `requestDiscussion`, `finalizeEvaluation`, `archiveProject` — all idempotent via `p_correlation_id`.
- `AssignableFacultyRole` now includes `co_supervisor`; 7 new `ERROR_LABELS` entries.
- `domain.ts`/`lifecycle.ts`: `co_supervisor` role mirror (read-only action surface, staff read visibility, Arabic label `مشرف مشارك`).

### 1.4 Verification package

- 4 read-only preflights: `tests/graduation-projects/pg17/preflight-0{1..4}-*.sql`.
- `tests/graduation-projects/postgres-hardening-verifier.sql` (structure + behavior, rollback-only).
- `tests/graduation-projects/run-pg17-migration-package.sh` — sequential one-at-a-time apply with preflight/verifier gates, plus post-hardening re-run of both merged verifiers (regression proof for the 4 `create or replace` functions).
- Manifest with expected deltas + stop conditions: `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`.
- Result: `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md` — **PASS**.

## 2. Test results

| Suite | Result |
|---|---|
| `bun test tests/graduation-projects` | 62 pass / 0 fail (499 expects; +20 new hardening tests) |
| `bunx tsc --noEmit` | clean |
| PG17 migration package run | PASS (4 migrations sequential + 4 verifier legs) |
| `git diff --check` | clean |

## 3. Contract decisions (documented, minimal)

1. **Message precedence preserved**: `request_graduation_project_discussion` checks readiness before the new pending guard so the merged foundation contract (`discussion readiness failed`) and the existing CI verifier legs stay green unchanged.
2. **co_supervisor read-only**: no write RPC whitelists the role; staff-level reads only. Supervisor remains the sole reviewing authority.
3. **Version guards**: assessed per GP-01 — kept as-is (only the merged `p_expected_version` RPCs); no new guards added to avoid contract churn.
4. **Scan RPC events**: no events-log rows from the scanner path (no `auth.users` identity); audit lives on the file row. No new event types → `EVENT_LABELS` parity (33/33) untouched.
5. **CI**: existing draft-based verifier legs untouched; a packaged-migration CI leg is deferred to GP-10 (avoids editing the shared `.github/workflows/ci.yml` mid-program).

## 4. Files changed

- `supabase/migrations/20260730100000_...sql`, `...100001_...sql`, `...100002_...sql`, `...100003_...sql` (new)
- `src/lib/graduation-projects/rpc.ts`, `domain.ts`, `lifecycle.ts` (modified)
- `tests/graduation-projects/graduation-projects-hardening.test.ts` (new)
- `tests/graduation-projects/postgres-hardening-verifier.sql`, `run-pg17-migration-package.sh`, `pg17/preflight-0{1..4}-*.sql`, `POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md` (new)
- `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md` (new)

## 5. Assumptions / risks / blockers

- Settings/eligibility tables remain deferred to GP-06 by design (gap map).
- Binary upload stays disabled; GP-05 owns the storage contract.
- No shared files modified (routeTree, nav, types, CI all untouched).
- B1 separation: no B1-track file touched.
- Blockers: none.
