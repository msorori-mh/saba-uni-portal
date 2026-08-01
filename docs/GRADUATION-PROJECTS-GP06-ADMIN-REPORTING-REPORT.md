# GRADUATION-PROJECTS — GP-06 ADMINISTRATION AND REPORTING REPORT

- Phase: GP-06
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `a28f579b68cc129ff175c94498aaf220a7e3ac17` (GP-05 commit)
- Migrations created: 1 (M6) — Migrations applied: 0 (disposable local PG17 only) — Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP06_ADMIN_AND_REPORTING_COMPLETE`

---

## 1. Settings (M6 — `20260730100005_...`)

`graduation_project_settings` (per department, optional per academic year;
`nulls not distinct` key, year-specific row wins over the department default):

- team_min / team_max, supervisor_capacity, co_supervisor_allowed,
  correction_window_days, defense_notice_days, proposal window opens/closes.
- Write authority: direct active `department_head`/`dean` assignment on a
  project of the department — no admin bypass (`settings administration
  assignment required`). Read: coordinator/head/dean.
- **In-RPC enforcement** (fail-closed, settings-driven, no fixtures):
  - `add_graduation_project_team_member` → `team size limit reached`.
  - `submit_graduation_project_proposal` → `proposal window closed`,
    `team below minimum size`.
  - `assign_graduation_project_faculty` → `supervisor capacity reached`
    (cross-project, same department), `co-supervisor not allowed by settings`.

## 2. Rubrics (M6)

- `upsert_graduation_project_rubric` (department_head/dean): validated criteria
  (codes/labels/max>0/weight>0/unique sequences), create or atomic criteria
  replace, `rubric payload invalid` / `rubric not found`.
- `list_graduation_project_rubrics` for department staff — feeds the
  evaluation form's rubric versions; score weights remain criterion-level
  (`maximum_score` normalization, see GP-04 decision 3).

## 3. Reports and administration surface

- New `get_graduation_project_defense_report`: scheduled defenses (panel size,
  chair presence), missing evaluations (held discussions with pending
  evaluations), results distribution buckets — same department authority as the
  existing four reports.
- Admin index page: `GraduationProjectAdmin` (settings form + rubric manager),
  defense tab in `GraduationProjectReports`.
- CSV export on all five reports via the existing `src/lib/reports/export.ts`
  utility (no new export infrastructure, no server changes).

Administration never executes student/supervisor/panel stages: the panel only
manages settings/rubrics and reads reports; lifecycle actions stay with their
direct-assignment roles (verified by the action matrix tests).

## 4. Test results

| Suite | Result |
|---|---|
| PG17 migration package (6 migrations, sequential) | PASS incl. `postgres-admin-settings-verifier.sql` |
| `bun test tests/graduation-projects` | 135 pass / 0 fail (1109 expects; +9 new) |
| `bunx tsc --noEmit` | clean |
| `bun run build` | success |
| `git diff --check` | clean |

## 5. Files changed

- `supabase/migrations/20260730100005_a69a1dc9-8b9f-4dfc-a5e8-69a335909c8b.sql` (new)
- `tests/graduation-projects/pg17/preflight-06-admin-settings.sql` (new)
- `tests/graduation-projects/postgres-admin-settings-verifier.sql` (new)
- `tests/graduation-projects/graduation-projects-admin-settings.test.ts` (new)
- `tests/graduation-projects/run-pg17-migration-package.sh` (M6 leg)
- `src/lib/graduation-projects/{rpc,lifecycle,portal.functions}.ts`
- `src/components/graduation-projects/GraduationProjectAdmin.tsx` (new), `GraduationProjectReports.tsx`
- `src/routes/admin/graduation-projects.index.tsx`
- `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`, `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md` (updated)

## 6. Assumptions / risks / blockers

- `ON CONFLICT ... NULLS NOT DISTINCT` is not supported as a conflict target;
  the settings upsert uses an explicit select-then-insert/update guarded by the
  unique index instead (verified).
- Academic-year/term data itself stays owned by the portal's existing terms
  module; GP settings only reference it.
- No B1 files touched. Blockers: none.
