# GRADUATION-PROJECTS — GP-07 AUTHORIZATION CLOSURE REPORT

- Phase: GP-07
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `4cea9b7cf525a94846218793d2c55e2a27b870ec` (GP-06 commit)
- Migrations created: 1 (M7) — Migrations applied: 0 (disposable local PG17 only) — Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP07_AUTHORIZATION_FULLY_CLOSED`

---

## 1. Result

- **Positive matrix**: complete — every role performs its exact contract actions
  (walked end-to-end inside the matrix fixture).
- **Negative matrix**: complete — 40+ denial rows with exact P0001 messages /
  42501 grant walls.
- **Direct RPC matrix**: `tests/graduation-projects/postgres-authorization-matrix-verifier.sql`
  — **68 rows, fail_rows = 0** on disposable PostgreSQL 17 (full package chain
  M1–M7 + all regression verifiers re-run after M7).
- **Critical/High findings after remediation: 0.**

## 2. Finding closed during this phase

**GP-07-HIGH-1 — missing-evaluation result bypass (High, fixed).**
`conclude_graduation_project_result` verified only that every *recorded*
evaluation was finalized; a panel member who never submitted left no row, so
the result could be concluded with a missing evaluation (the matrix caught it:
"expected denial not raised"). Fixed in
`supabase/migrations/20260730100006_b953bddf-de2d-43f6-9d3d-10755d8a9da6.sql`:
the guard now requires **every panel member of the held discussion** to hold a
finalized evaluation (`evaluations not finalized`). Signature, grants, and
outcome literals unchanged; all prior verifiers re-run green.

## 3. Matrix coverage (68 rows)

- **Student**: member ✓ / non-member ✗ / other-department ✗ / forged project ✗ /
  wrong version ✗ / archived mutation ✗ / post-close deliverable ✗.
- **Supervisor**: direct ✓ / other-project ✗ (assignment wall) / co-supervisor
  write ✗ / archived note ✗.
- **Co-supervisor**: staff read ✓ / zero write authority ✗.
- **Department head**: own department ✓ / other department ✗ (detail, report,
  conclude, create) / forged department ✗.
- **Committee**: assigned member ✓ / unassigned ✗ / finalize another member's
  evaluation ✗ (`evaluator panel assignment mismatch`) / second chair ✗ /
  re-save after submit ✗ / conclusion before all finalized ✗.
- **Management**: coordinator/head literal actions ✓ / wrong literal action ✗ /
  institutional roles not RPC-assignable ✗ / second supervisor ✗ / archived
  assignment ✗.
- **Admin/system roles**: no bypass — unassigned user create ✗; `authenticated`
  role grant walls (scan RPC, direct insert, direct select) = 42501 ✓.
- **Idempotency**: repeated submit/discussion/archive correlation replays
  return the recorded entity with exactly-once events ✓.
- **Settings**: non-authority settings/rubric writes ✗.
- **Visibility**: students see only finalized evaluations (SQL side) ✓;
  portal-layer redaction covered by the integration suites.
- **UI access**: role-gated actions covered by
  `graduation-projects-lifecycle.test.ts` / `-portal-integration-01.test.ts` /
  `-visual-ux-qa-01.test.ts`; server-function auth+schema gates covered by
  `graduation-projects-authorization-closure.test.ts`.

## 4. Inventory

`docs/GRADUATION-PROJECTS-GP07-RPC-AUTHORIZATION-INVENTORY.md` — every RPC
(signature, literal actions, principal, lifecycle gate, idempotency, exact
denials), every read RPC, every privileged/service RPC, and all 35 server
functions. A bun test asserts the inventory covers 100% of client-called RPCs
and server functions.

## 5. Test results

| Suite | Result |
|---|---|
| PG17 package (7 migrations, sequential) | PASS — matrix 68/68, fail_rows=0 |
| `bun test tests/graduation-projects` | 144 pass / 0 fail (1333 expects; +9 new) |
| `bunx tsc --noEmit` | clean |
| `git diff --check` | clean |

## 6. Files changed

- `supabase/migrations/20260730100006_b953bddf-de2d-43f6-9d3d-10755d8a9da6.sql` (new, M7)
- `tests/graduation-projects/postgres-authorization-matrix-verifier.sql` (new, 68-row matrix)
- `tests/graduation-projects/pg17/preflight-07-evaluation-completeness.sql` (new)
- `tests/graduation-projects/graduation-projects-authorization-closure.test.ts` (new)
- `tests/graduation-projects/run-pg17-migration-package.sh` (M7 + matrix legs)
- `docs/GRADUATION-PROJECTS-GP07-RPC-AUTHORIZATION-INVENTORY.md` (new)
- `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`, `tests/graduation-projects/POSTGRES-17-MIGRATION-PACKAGE-VERIFICATION-RESULT.md` (updated)

## 7. Notes

- Docker Desktop required one restart during the phase (API 500); no impact on evidence.
- E2E journeys build on this closure in GP-08; no Production/Staging contact was made.
- Blockers: none.
