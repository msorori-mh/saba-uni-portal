# GRADUATION-PROJECTS — GP-09 FINAL SECURITY AUDIT REPORT

- Phase: GP-09
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Base SHA: `2d1aaff5a78a34e78fc72adb70d192978786cff7` (GP-08 commit)
- Migrations created: 0 — Migrations applied: 0 — Production operations: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP09_FINAL_AUDIT_CLOSED`

---

## 1. Findings register

| ID | Severity | Finding | Status |
|---|---|---|---|
| GP-07-HIGH-1 | High | Result conclusion skipped panel members with no recorded evaluation | **Fixed in M7** (panel completeness guard) |
| GP-09-MED-1 | Medium | `listGraduationProjectAssignmentCandidates` exposed the department roster (student/faculty names) to any project member, including students | **Fixed** — server fn now requires a management role (`coordinator`/`department_head`/`dean`) from the authorized detail payload; regression test added |
| GP-08-CONTRACT-1 | Medium (contract gap) | A defense could be recorded held with an empty committee | **Fixed in M8** (`panel incomplete for defense`) |
| GP-09-LOW-1 | Low | Packaged migrations have no dedicated CI leg (the source-identical drafts remain CI-verified; local PG17 chain covers the package) | Documented — recommendation for rollout (not security, not blocking) |
| GP-09-LOW-2 | Low | Reminder notifications (milestone due, evaluation incomplete) need a scheduler at rollout; the dedupe log is ready for it | Documented |
| GP-09-LOW-3 | Low | First department bootstrap assignment (G4) remains a privileged manual step by design | Documented in the rollout checklist |

**Open Critical = 0, High = 0, Medium = 0.** Remaining lows are documented,
non-security, non-blocking, each with a clear recommendation.

## 2. Adversarial checklist (mission map → evidence)

- Cross-department / cross-project leakage → matrix rows (dept B head vs dept A; outsider detail; cross-project object key) — closed.
- Team/supervisor/committee membership forgery → guard trigger identity check + manager-only assignment RPCs + server-side profile→user derivation — closed.
- Grade leakage / tampering / viewing other evaluators' scores → SQL evaluation scoping (students: finalized only), MEDIUM-1 viewer scoping, draft-only save + one-way finalize + unique seat — closed.
- Duplicate evaluations / transitions / double clicks / replay / stale state → unique keys, version guards, correlation idempotency (E2E exactly-once) — closed.
- Concurrency → `for update` row locks in every write RPC — closed.
- Direct RPC bypass / role bypass / admin bypass → 68-row matrix, fail_rows=0 — closed.
- File path guessing / signed-URL scope → server-built random-token keys, exposed only when scan-clean; no public URLs; no buckets — closed.
- Archived-project mutation → state gates verified in matrix — closed.
- Notification duplication → dedupe unique key + ON CONFLICT — closed.
- Audit completeness → append-only events trigger + per-action correlation — closed.
- RLS / SECURITY DEFINER interaction, search_path safety, GRANT drift → new catalog audit `postgres-security-audit-verifier.sql` (12 invariants: RLS-everywhere, zero policies, table revokes, pinned search_path on every definer fn, anon zero-execute, authenticated exec whitelist, service path closed, triggers, unique indexes, no buckets, enum shape, co-supervisor read-only) — **SECURITY AUDIT PASS**.
- Error-message data leakage → all denial messages are literal constants (test asserts no interpolation/UUID patterns) — closed.
- UI/Backend action mismatch → action-matrix mirrors SQL; literal parity tests — closed.
- Mobile/desktop regressions → visual/accessibility QA suite — closed.
- Regression on non-GP modules → full `bun test` (only the pre-existing G4 wrangler environmental failure) and full PG17 regression chain — closed.

## 3. Re-verification after remediation

| Suite | Result |
|---|---|
| PG17 package (8 migrations + audit leg) | PASS — matrix 68/68, E2E 53/53, audit 12/12 |
| `bun test tests/graduation-projects` | 155 pass / 0 fail (1647 expects) |
| `bun test` (full) | 1 pre-existing environmental fail (G4 wrangler spike), all else pass |
| `bunx tsc --noEmit` | clean |
| `bun run build` | success |
| `git diff --check` | clean |

## 4. Files changed

- `src/lib/graduation-projects/portal.functions.ts` (GP-09-MED-1 manager gating)
- `tests/graduation-projects/postgres-security-audit-verifier.sql` (new, 12 invariants)
- `tests/graduation-projects/graduation-projects-security-audit.test.ts` (new, 6 tests)
- `tests/graduation-projects/run-pg17-migration-package.sh` (audit leg)
- `docs/GRADUATION-PROJECTS-GP09-FINAL-SECURITY-AUDIT-REPORT.md` (new)

## 5. Blockers

None.
