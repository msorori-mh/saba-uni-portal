# GRADUATION-PROJECTS — UI ROUTES AND TEST INVENTORY

## 1. UI route inventory

| Route | Audience | Guard chain |
|---|---|---|
| `/student/graduation-project` | طالب | `/student` beforeLoad → server fn auth → RPC assignment |
| `/student/graduation-project/$projectId` | طالب | same |
| `/faculty-portal/graduation-projects` | مشرف/مشارك/منسق/عضو لجنة | `/faculty-portal` beforeLoad → same |
| `/faculty-portal/graduation-projects/$projectId` | same | same |
| `/admin/graduation-projects` | رئيس قسم/عميد | `/admin` beforeLoad → nav role gate (UI-only) → same |
| `/admin/graduation-projects/$projectId` | same | same |

All routes RTL, responsive, with loading/empty/error/unavailable states
(`PortalRuntimeStates`), back-navigation, and fail-closed direct-URL behavior
(authentication redirect, then exact assignment denials in Arabic).

Entry links: student services card, faculty dashboard card, admin nav
«مشاريع التخرج» (`/admin/graduation-projects`, UI-gated to
`department_head`/`dean`).

## 2. Test inventory

### bun suites (13 files, 155 tests, 1647 expects — all green)

| Suite | Focus |
|---|---|
| `graduation-projects-foundation.test.ts` | domain model, authorization, transitions, object keys |
| `graduation-projects-lifecycle.test.ts` | action matrix, visibility, scoring, viewer scoping |
| `graduation-projects-sql-draft.test.ts` | foundation draft contract pins |
| `graduation-projects-lifecycle-sql-draft.test.ts` | lifecycle draft contract pins |
| `graduation-projects-hardening.test.ts` | co-supervisor, exactly-one, scan RPC, wrappers (6) |
| `graduation-projects-portal-integration-01.test.ts` | routes, privacy, runtime fail-closed |
| `graduation-projects-visual-ux-qa-01.test.ts` | RTL, responsive, accessibility, no-id leakage |
| `graduation-projects-lifecycle-completion-ui.test.ts` | GP-04 server fns + workspace wiring |
| `graduation-projects-files-notifications.test.ts` | attachment policy, notification contract |
| `graduation-projects-admin-settings.test.ts` | settings/rubrics/defense report |
| `graduation-projects-authorization-closure.test.ts` | inventory coverage, hard gates, M7 |
| `graduation-projects-e2e-portal-journeys.test.ts` | journey pins, transition chain, route guards |
| `graduation-projects-security-audit.test.ts` | leakage, secrets hygiene, audit coverage |

### PG17 executable verification (disposable docker postgres:17)

| Leg | Rows/checks | Result |
|---|---|---|
| `postgres-foundation-verifier.sql` | foundation behavior | PASS |
| `postgres-lifecycle-verifier.sql` | full lifecycle + idempotency + visibility | PASS |
| `postgres-hardening-verifier.sql` | co-supervisor, exactly-one, scan, rubric, dedupe | PASS |
| `postgres-files-notifications-verifier.sql` | attachment policy, fan-out, scoped reads | PASS |
| `postgres-admin-settings-verifier.sql` | settings authority + enforcement + rubrics | PASS |
| `postgres-authorization-matrix-verifier.sql` | 68 rows positive/negative | PASS, fail_rows=0 |
| `postgres-e2e-journeys-verifier.sql` | 53 steps / 22 journeys | PASS, fail=0 |
| `postgres-security-audit-verifier.sql` | 12 catalog invariants | PASS |
| `pg17/preflight-0{1..8}-*.sql` | read-only apply gates | PASS |

Runner: `tests/graduation-projects/run-pg17-migration-package.sh`
(one migration at a time, preflight → apply → verifier, regression re-runs).

### Repo-wide

- `bunx tsc --noEmit` — clean.
- `bun run build` — success (routeTree + register validated).
- `bun test` (full, 2412 tests) — all pass except one pre-existing
  environmental failure (`G4 — Arabic PDF spike on Wrangler Worker runtime`,
  60s timeout; no wrangler runtime in this environment; unrelated to GP;
  verified against base).
- `git diff --check` — clean.
