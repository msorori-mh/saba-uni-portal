
## Addendum — residual test-failure triage (source-only)

- Triaged the 54 non-P1 failures. 42 are environment-gated (no PG17/Docker locally).
- 11 are pre-existing contract-drift assertions in Councils / GA / GP / PWA modules;
  their test files were last touched on or before 2026-08-13, i.e. before the first P1
  commit `d1929b74` (2026-08-15), and none of the source files P1 touched are asserted
  by them.
- 1 failure WAS caused by the approved P1 terminology rename:
  `tests/student-portal/dashboard-ux-simplification-01.test.ts` still pinned the old
  copy «قسم طلبات شؤون الطلاب». Updated the assertion to the approved
  «قسم الخدمات الطلابية». Now 7/7 PASS.

### Pre-P1-05 runtime degradation check (closed)

Production `get_admin_progress_kpis` still returns the legacy `avgGpa` key and no
`avgOfficialPercentage`. Verified that `getAdminProgressKpisFast` is consumed only by
`src/routes/admin/index.lazy.tsx`, where the value is fetched but **not rendered**
(the progress cards were previously hidden). `/admin/executive-dashboard` uses
`getProgressDashboardKpis`, which computes the official weighted average in
application code from `student_grades`, so it is correct both before and after P1-05.
No false GPA or false percentage is displayed on the deployed surface.

Transcripts normalize `percentage` client-side via `grading-scale.ts`, so they render
correctly against both the pre-P1 and post-P1-05 schemas.

Verification: `tsgo --noEmit` clean, `bun run build` OK, `git diff --check` clean,
routes `/`, `/portal-login`, `/student`, `/faculty-portal`, `/admin` all return 200.

**PASS_PORTAL_REFORM_P1_SOURCE_DEPLOY_PREFLIGHT_05B (addendum confirmed)** —
DEPLOY / PUBLISH / MIGRATION_APPLY / PRODUCTION_WRITE remained DENY throughout.
