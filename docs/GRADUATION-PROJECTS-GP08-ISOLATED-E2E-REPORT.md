# GRADUATION-PROJECTS — GP-08 ISOLATED OPERATIONAL E2E REPORT

- Phase: GP-08
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `3069e401292cc916caedcfc427570169661a1496` (GP-07 commit)
- Migrations created: 1 (M8) — Migrations applied: 0 (disposable local PG17 only) — Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP08_ISOLATED_OPERATIONAL_E2E`

---

## 1. Environment

- Disposable PostgreSQL 17 container, created and destroyed per run
  (`run-pg17-migration-package.sh`). No production, no staging, no real
  secrets, no real data. All fixture ids are `7e57…`-prefixed and all titles
  carry `TEST_ONLY —`; every journey rolls back.
- Cleanup: no-op by construction (rollback); persistent-replay cleanup
  documented in `tests/graduation-projects/E2E-TEST-ONLY-DATASET-CLEANUP.md`.

## 2. Dataset

Academic structure (2 departments), 3 students (2 team + 1 individual),
supervisor, co-supervisor, department head, coordinator, committee chair,
second committee member, other-department admin — plus 4 projects (bootstrap,
J1 team, J2 individual, J4 withdrawal).

## 3. Journeys (53 steps, fail=0)

`tests/graduation-projects/postgres-e2e-journeys-verifier.sql`:

1. ✅ Team project end-to-end: create → team of 2 → proposal → return →
   resubmit → second review round → approve → activate → milestone plan →
   deliverable → return for revision → resubmit → accept → invalid-file
   rejected → cross-project key rejected → outsider detail denied → readiness
   gate → final deliverable → clean scan → defense request → schedule →
   **incomplete committee blocks held (J11)** → chair + member assigned → held →
   **missing evaluation blocks result (J12)** → each member submits/finalizes
   own evaluation (J13) → corrections → completed → **exactly-once
   double-click retry (J14/J18/J19)** → archive → archived-mutation denied (J17).
2. ✅ Individual project (team of 1) reaches submitted.
3. ✅ Returned proposal resubmitted and approved (inside J1).
4. ✅ Member withdrawal before lock removes all powers (read + write denied).
5. ✅ Supervisor + co-supervisor assignment (exactly-one slots).
6. ✅ Stage accepted; 7. ✅ Stage returned then resubmitted and accepted.
8. ✅ Invalid file rejected; 9. ✅ Cross-project file access denied (both the
   object-key scope and the detail read).
10. ✅ Defense request before readiness rejected.
16. ✅ Completion + archival with the clean final manuscript.
20–22. Screen sizes / direct-route / session-expiry: covered by the portal
suites — responsive structure in `graduation-projects-visual-ux-qa-01.test.ts`,
parent `beforeLoad` redirects + server-function `requireSupabaseAuth` in
`graduation-projects-e2e-portal-journeys.test.ts` and the GP-07 closure suite.

## 4. Contract change in this phase (M8)

`record_graduation_project_discussion_outcome` — the `held` outcome now
requires ≥1 panel member and an assigned chair (`panel incomplete for
defense`). Scheduling stays open (panel seats can only attach to a scheduled
discussion). Signature/grants/literals unchanged; Arabic label added;
lifecycle-verifier fixture p3 updated to `chair=true` (backward-compatible
with the draft CI leg).

## 5. Test results

| Suite | Result |
|---|---|
| PG17 package (8 migrations, sequential) | PASS — E2E 53 steps fail=0, matrix 68 rows fail_rows=0 |
| `bun test tests/graduation-projects` | 150 pass / 0 fail (1386 expects; +6 new) |
| `bunx tsc --noEmit` | clean |
| `git diff --check` | clean |

## 6. Files changed

- `supabase/migrations/20260730100007_4f682b52-7e51-486d-ad02-4d886d2331ec.sql` (new, M8)
- `tests/graduation-projects/pg17/preflight-08-panel-completeness.sql` (new)
- `tests/graduation-projects/postgres-e2e-journeys-verifier.sql` (new, 53 steps)
- `tests/graduation-projects/graduation-projects-e2e-portal-journeys.test.ts` (new)
- `tests/graduation-projects/E2E-TEST-ONLY-DATASET-CLEANUP.md` (new)
- `tests/graduation-projects/postgres-lifecycle-verifier.sql` (p3 chair fixture)
- `tests/graduation-projects/run-pg17-migration-package.sh` (M8 + E2E legs)
- `src/lib/graduation-projects/rpc.ts` (1 error label)
- `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`, `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md` (updated)

## 7. Blockers

None.
