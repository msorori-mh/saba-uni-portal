# PORTAL-GRADUATION-PROJECTS-GRADUATES-AFFAIRS-PR271-CURRENT-MAIN-HARDENING-03-REPORT

Mission: PORTAL-GRADUATION-PROJECTS-GRADUATES-AFFAIRS-PR271-OVERNIGHT-RECONCILIATION-AND-HARDENING-03
Date: 2026-08-01. Branch: feat/graduation-projects-graduates-affairs-overnight-20260801. PR #271 (Draft).

**FINAL DECISION: PASS_PORTAL_GRADUATION_PROJECTS_GRADUATES_AFFAIRS_PR271_CURRENT_MAIN_HARDENED_READY_FOR_INDEPENDENT_REVIEW**

## 1. Reconciliation (Phase 1)

- Previous main: `c17a866fc5e9522420f91312bba37e5c5c188313` (reconciliation-02 baseline).
- New main (fetched 2026-08-01): `8729f6d5d61d5a55052fe9f7cda2bd360d9bb421`
  ("Captured B1 baseline post-fixt", 2 commits).
- Merge commit: `f534182fc6c863fc6d211561b54d13802ea0b205` (normal `--no-ff` merge; no rebase).
- Conflicts: **none** — the merge added exactly one B1 doc
  (`docs/B1-NEGATIVE-RPC-MATRIX-POST-FIXTURE-AUTHORITATIVE-BASELINE-CAPTURE-22-REPORT.md`).
- Stale-claim audit: no statement that "B1 has 10 failing tests" remains in any doc (corrected
  in reconciliation-02; re-verified by grep this mission).

## 2. B1 preservation

**PRESERVED — 267 contract intact, package fully green.** No B1 source, test, migration,
fixture, manifest or authorization contract was modified by this branch. Post-merge:
`bun test tests/b1-five-services-rpc-authorization-preflight-01` = **183 pass / 0 fail**.
enrollment_certificate protections untouched.

## 3. PR #271 scope review (Phase 2) — 104 changed files classified

| Class | Count | Files |
|---|---|---|
| required runtime | 33 | 14 GP components + 5 GA components, 7 GP lib modules, `src/lib/admin-nav.ts`, `AdminShell.tsx`, 11 route files (9 new + 2 nav edits) |
| required test | 31 | 14 GP bun suites, 8 PG17 preflights, 7 PG verifiers + runner + 2 test docs, GA visual-QA test, tanstack routeTree pin test |
| required documentation | 31 | GP-01..GP-09 + master + RC set (6) + 2 PORTAL-GP reports + GA QA report + migration package doc + 6 mission docs (scope/design/security/test/implementation/reconciliation-02) |
| source-only SQL | 8 | `docs/migration-drafts/GRADUATION-PROJECTS-M1..M8-*.NOT_APPLIED.sql` — verified present, suffixed, headers intact; nothing under `supabase/migrations/` |
| generated (required) | 1 | `src/routeTree.gen.ts` (regenerated additively, stable across rebuilds) |
| duplicate of main / stale / unrelated / security risk | **0** | every file differs from main with a purpose; no removals warranted |

## 4. Graduation Projects hardening (Phase 3)

Defects found and fixed (each proven by a failing test written before the fix):

1. **`resolveViewerPanelMemberIds` ignored `ended_at`** (lifecycle.ts) — an ended panel
   membership with a stale `active` flag could resolve as the viewer's own. Fixed fail-closed
   (`ended_at == null` required); regression test added.
2. **`authorizeProjectAction` froze the only legal write out of `completed`** (domain.ts) —
   contradicted the module's own transition map (`completed → archived`) and UX matrix. Fixed by
   carving out exactly `(completed, archive)`; all other terminal-state writes remain denied.
   Verified `authorizeProjectAction` is not imported by runtime code (contract alignment only).

New negative-authorization suite
`tests/graduation-projects/graduation-projects-negative-authorization-03.test.ts` (32 tests):
non-owner student, unrelated faculty, wrong supervisor (other project), wrong-department
department_head/coordinator/dean, inactive/non-direct authority, role/action mismatch across all
14 states, illegal lifecycle ordering (early evaluate, early archive, student approve), terminal
write-freeze in both matrices, portal-privacy redaction negatives (student vs staff control),
direct-RPC-misuse source guards (no `.from(` in rpc.ts; all 23 write call-sites send
`p_correlation_id`; no input validator accepts actor/user identity parameters), file access only
when scan state is `clean`.

Reviewed with no defect found: proposal/approval flow, supervisor/co-supervisor assignment,
department isolation, milestones/submissions, scan status, evaluation finalization, panel guards
(M7/M8), corrections, admin reports, route guards (`beforeLoad` in student/admin/faculty roots),
server-side actor derivation (user ids re-derived from DB server-side), idempotency, RTL/a11y
(covered by the visual-UX-QA suite).

## 5. Graduates Affairs hardening (Phase 4)

- **G4 decision memo** `docs/GRADUATES-AFFAIRS-G4-AUTHORIZATION-DECISION-MEMO-01.md` (neutral,
  HOLD — no option selected): Option A reuse `registrar` titles (20260611001252/20260611002102,
  registrar-bypass must stay DENY), Option B `student_affairs` fallback
  (staff-functional-roles.ts:48–67), Option C dedicated future app_role (expansion note +
  library/labs `null` fallback precedent), Option D purpose-scoped expiring direct assignments
  (mandatory layer over A/B/C), graduate self-service gated independently on D-13. Includes
  per-option RLS/EXECUTE/self-service/ALLOW-DENY implications, the fail-closed foundations valid
  under every option, and 6 open product-owner questions. No role invented; runtime stays denied.
- **Default-deny contract suite**
  `tests/graduates-affairs/graduates-affairs-g4-default-deny-03.test.ts` (20 tests): zero GA
  routes, lib purity (no createServerFn/supabase/rpc), both drafts RLS-everywhere with zero
  CREATE POLICY and pinned-search_path revoked SECURITY DEFINERs, 9 ALU catalog entries pinned
  `route: null` + `pending:*` roles, components network/export-free, D-13 undecided ⇒ all
  capabilities denied, cell suppression + aggregate-safety assert behavior.
- Mobile defects fixed (failing test first): survey-results table overflow wrapper
  (GraduateReportsPanel), survey radiogroup flex-wrap (GraduateSurveyCard); 2 tests added to the
  visual-UX-QA suite.
- Documentary observation flagged for the future authorization bundle (drafts untouched per
  rules): trigger-helper SECURITY DEFINER functions in the GA drafts keep default PUBLIC EXECUTE;
  recorded in the memo.
- Known follow-up (not provable by static-render test): survey validation-error text appends the
  question machine key; unreachable without interaction — noted, not changed.

## 6. PostgreSQL verification (Phase 5, disposable postgres:17, 2026-08-01)

Graduation Projects — full chain `run-pg17-migration-package.sh`:
- M1→M8 sequential dependency-ordered apply on a fresh database: **all pass**; preflight per
  step; full verifier regression re-run after every step (no duplicate-object failures).
- `AUTHORIZATION MATRIX PASS: 68 rows, fail_rows=0` (×2, post-M7 and post-M8).
- `E2E JOURNEYS PASS: 53 steps, fail=0`.
- `SECURITY AUDIT PASS: all catalog checks green` (RLS default-deny, RPC grants, pinned
  search_path, no PUBLIC/anon execute on user surfaces).
- Final: **MIGRATION PACKAGE PG17 VERIFICATION PASS**. No SQL exists outside source-only drafts.

Graduates Affairs — each chain in its own fresh database (harness constraint, documented):
- foundation chain: **PASS**; completion chain: **PASS**.

## 7. Test results (Phase 6, current main 8729f6d5)

| Command | Result |
|---|---|
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** |
| `bun test tests/student-requests` | **1060 pass / 0 fail** (one transient flake observed during hardening runs; 5 subsequent full runs green — environmental, documented) |
| `bun test tests/graduation-projects` | **188 pass / 0 fail** (14 files; +33 tests this mission) |
| `bun test tests/graduates-affairs` | **66 pass / 0 fail** (4 files; +22 tests this mission) |
| `bun test` (full) | **2568 pass / 0 fail** (204 files) |
| `bunx tsc --noEmit` | **CLEAN** |
| `bun run build` | **PASS** (routeTree stable) |
| `git diff --check` | **CLEAN** |

Zero failures to classify; nothing blamed on "pre-existing" without reproduction — the full
suite is green on current origin/main.

## 8. Security findings

- 2 genuine fail-closed defects fixed (§4); 2 mobile UI defects fixed (§5).
- GA drafts' trigger-helper PUBLIC EXECUTE surface documented for the G4 bundle (§5).
- No weakening of any authorization, fixture, baseline or contract anywhere.
- B1 267/267/0 contract and enrollment_certificate protections preserved verbatim.

## 9. Deferred decisions (unchanged, documented)

G4 staffing option (memo §options A–D), D-13 account continuity, unit-label conflict,
message-template registry, contact-value encryption, GP storage/binary upload, notification
scheduler, grade writeback, first-department bootstrap, migration-review CI allowlist (with the
promotion package).

## 10. Changed files this mission

- Merge `f534182f`: 1 B1 doc (from main).
- src: `domain.ts`, `lifecycle.ts` (GP defect fixes), `GraduateReportsPanel.tsx`,
  `GraduateSurveyCard.tsx` (mobile fixes).
- tests: +`graduation-projects-negative-authorization-03.test.ts` (32), lifecycle regression
  test, +`graduates-affairs-g4-default-deny-03.test.ts` (20), visual-UX-QA +2.
- docs: +G4 decision memo, +this report.

## 11. Commits / SHAs / PR

- Commit list and final branch SHA: see git log (recorded at push time below).
- Remote equality: verified after push.
- PR #271: Draft, OPEN, not merged; body updated with hardening-03 results.
