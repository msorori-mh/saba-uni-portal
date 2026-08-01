# PORTAL-GRADUATION-PROJECTS-GRADUATES-AFFAIRS-TEST-RESULTS-01

Mission: PORTAL-GRADUATION-PROJECTS-AND-GRADUATES-AFFAIRS-OVERNIGHT-MASTER-01
Date: 2026-08-01. Machine-local runs (Windows, bun 1.3.14, Docker Server 29.6.1, postgres:17 image).

## 1. Baseline (clean main @ 6393f3d4, before any mission change)

| Command | Result |
|---|---|
| `bunx tsc --noEmit` | CLEAN (exit 0) |
| `bun test` | 2365 pass / 12 fail — 10 in `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts` (B1 fixture-drift assertions, e.g. expects `BLOCKED_PENDING_ACTIVE_FIXTURE`, fixture says `EXECUTABLE_PENDING_FIXTURE_APPLY`; "245 executable" vs 267) + 2 timeout failures in `tests/imports/import-templates.test.ts` (xlsx workbook generation > 5s under load; environmental) |

The 10 B1 failures are pre-existing on main and live inside the mission's B1 isolation
boundary (`tests/b1-five-services-rpc-authorization-preflight-01/**`) — not modified,
not suppressed, documented here per mission rules.

## 2. Final (this branch, after all mission changes)

| Command | Result |
|---|---|
| `bun test tests/student-requests` | **1060 pass / 0 fail** |
| `bun test` (full, 202 files) | **2496 pass / 10 fail** — the SAME 10 pre-existing B1 operator-execution-package failures; the 2 environmental import-templates timeouts did not recur; zero new failures |
| `bunx tsc --noEmit` | **CLEAN** |
| `bun run build` | **PASS** (nitro build completed; routeTree.gen.ts regenerated identically — no post-build diff) |
| `git diff --check` | **CLEAN** (also `git diff --cached --check` before every commit) |

Focused suites:

| Suite | Result |
|---|---|
| `bun test tests/graduation-projects` (13 files) | **155 pass / 0 fail** |
| `bun test tests/graduates-affairs` (3 files) | **44 pass / 0 fail** |
| `bun test tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` | **9 pass / 0 fail** (pin matches regenerated routeTree) |

## 3. Executable SQL verification (disposable PostgreSQL 17, 2026-08-01)

Graduation Projects — `tests/graduation-projects/run-pg17-migration-package.sh`
(postgres:17 container, ON_ERROR_STOP, verifiers end in ROLLBACK, container destroyed):
- M1–M8 NOT_APPLIED drafts applied one at a time (preflight → apply → verifier), full verifier
  regression re-run after every step: **all pass**.
- `AUTHORIZATION MATRIX PASS: 68 rows, fail_rows=0` (observed at post-M7 and post-M8 stages).
- `E2E JOURNEYS PASS: 53 steps, fail=0`.
- `SECURITY AUDIT PASS: all catalog checks green`.
- Final line: **MIGRATION PACKAGE PG17 VERIFICATION PASS**.

Graduates Affairs — each chain in its own fresh database (required: verifiers assume a single
graduate record; pg-setup creates cluster-level roles):
- setup → GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql → foundation verifier: **PASS**
  (forged/pending decision inserts rejected, record↔decision identity, RLS/ACL default-deny).
- setup → foundation draft → GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql → completion verifier:
  **PASS** (consent binding, immutability, suppression math, revocation propagation).
- Note: running both chains in one database fails by design (duplicate fixture UUIDs) — this is
  a harness-usage constraint, not a draft defect; each chain's header documents its own sequence.

## 4. Production impact of test activity

Zero. All SQL verification ran in throwaway local Docker containers. No production or remote
Supabase connection was made. No migration was applied anywhere. bun suites are deterministic
and DB-free except the docker chains above.

## 5. Known pre-existing defects (documented, not hidden)

1. `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts`
   — 10 failing assertions (G1/G2/G3/G6 pins vs fixture drift: 245 vs 267 executable cases,
   BLOCKED vs EXECUTABLE fixture statuses). Pre-existing on main; B1 isolation boundary;
   belongs to the active B1 track.
2. `tests/imports/import-templates.test.ts` — 2 tests exceed the 5s timeout under machine load
   (observed once in the baseline run, absent in the final run). Environmental.
