# PORTAL-GRADUATION-PROJECTS-PR272-AUDIT-REMEDIATION-INDEPENDENT-FINAL-REVIEW-07

Date: 2026-08-02  
Mode: LONG INDEPENDENT SOURCE-ONLY SECURITY AND DATABASE REVIEW  
Repository: `msorori-mh/saba-uni-portal`  
PR: [#272](https://github.com/msorori-mh/saba-uni-portal/pull/272)  
Review branch: `review/pr272-independent-final-07`  
Worktree: `C:\projects\saba-uni-portal-review-272`

## Final decision

`PASS_PORTAL_GRADUATION_PROJECTS_PR272_REMEDIATION_INDEPENDENT_FINAL_REVIEW`

This is a source-package readiness decision for integrating Remediation-06
(M9 + F-0 + audit harnesses) into PR #271. It is **not** authorization to apply
SQL, connect to production, deploy, publish, or merge PR #272 / #271.

---

## Source gate

| Check | Result |
|---|---|
| Local HEAD | `bdc58ddbb0df9b1c9704f3df1e57d39ff7b2ced5` — **PASS** |
| Remote PR #272 head (`gh pr view 272`) | `bdc58ddbb0df9b1c9704f3df1e57d39ff7b2ced5` — **PASS** |
| Base PR #271 SHA | `13cae0ac700713c68458b97f41459ac086e63cbf` — **PASS** |
| Full PR diff vs base | 21 files, +4022 / −2 — **PASS** |
| Working tree clean at review | **PASS** |
| No `supabase/migrations` touch | **PASS** |
| No B1 / Graduates Affairs / enrollment-certificate / `student_visible` paths | **PASS** |

| SHA role | Value |
|---|---|
| Exact reviewed SHA | `bdc58ddbb0df9b1c9704f3df1e57d39ff7b2ced5` |
| Base PR #271 HEAD | `13cae0ac700713c68458b97f41459ac086e63cbf` |
| PR head branch | `audit/graduation-projects-migrations-overnight-20260801` |
| Base branch | `feat/graduation-projects-graduates-affairs-overnight-20260801` |
| M9 blob (`git rev-parse` / `hash-object`) | `795c324a1915a97cb4ebe5d1b586abb5e158cbb4` |

---

## Changed-file inventory (`13cae0ac..bdc58dd`)

| Path | Role |
|---|---|
| `.gitattributes` | EOL/LF rules for audit-06 SQL |
| `docs/GRADUATION-PROJECTS-M1-M8-AUDIT-FINDINGS-REMEDIATION-06-REPORT.md` | Author remediation report |
| `docs/GRADUATION-PROJECTS-M1-M8-DEPENDENCY-GRAPH-05.md` | Audit-05 dependency graph |
| `docs/GRADUATION-PROJECTS-M1-M8-INDEPENDENT-OVERNIGHT-AUDIT-05-REPORT.md` | Overnight audit-05 report |
| `docs/GRADUATION-PROJECTS-M1-M8-PROMOTION-RUNBOOK-05.md` | Promotion runbook (now includes M9) |
| `docs/GRADUATION-PROJECTS-M1-M8-SECURITY-AUDIT-05.md` | Security findings F-0..F-10 |
| `docs/migration-drafts/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql` | **F-0 only** (+2 PUBLIC EXECUTE revokes) |
| `docs/migration-drafts/GRADUATION-PROJECTS-M5-FILES-AND-NOTIFICATIONS.NOT_APPLIED.sql` | **F-0 only** (+1 PUBLIC EXECUTE revoke) |
| `docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql` | **New** forward-only remediation |
| `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md` | Package index touch |
| `tests/graduation-projects/audit-05/*` | Audit-05 harness + runtime results |
| `tests/graduation-projects/audit-06/*` | Audit-06 harness + runtime results |
| `tests/graduation-projects/graduation-projects-audit-remediation-06.test.ts` | Bun source-contract tests for M9 |
| `tests/graduation-projects/postgres-security-audit-verifier.sql` | Cap bumps for M9 inventory |

---

## M1–M8 byte-equivalence proof vs PR #271

Git blob identity (`git rev-parse <sha>:path`):

| Draft | Base blob | Head blob | Verdict |
|---|---|---|---|
| M1 FOUNDATION | `e022f089…` | `bc4767a3…` | **DIFFERS — F-0 only** (+3 lines: revoke `guard_graduation_project_assignment`, `reject_graduation_project_event_mutation`) |
| M2 LIFECYCLE-COMPLETION | `3bc52d9f…` | `3bc52d9f…` | **IDENTICAL** |
| M3 CO-SUPERVISOR-ENUM | `64cadd26…` | `64cadd26…` | **IDENTICAL** |
| M4 COMPLETION-HARDENING | `5fcd6830…` | `5fcd6830…` | **IDENTICAL** |
| M5 FILES-AND-NOTIFICATIONS | `166f4484…` | `fd3fdfd7…` | **DIFFERS — F-0 only** (+2 lines: revoke `graduation_project_notify_from_event`) |
| M6 ADMIN-SETTINGS | `a4d90340…` | `a4d90340…` | **IDENTICAL** |
| M7 EVALUATION-COMPLETENESS | `8920a94b…` | `8920a94b…` | **IDENTICAL** |
| M8 PANEL-COMPLETENESS | `8d38d78e…` | `8d38d78e…` | **IDENTICAL** |

`git diff --numstat` confirms zero content delta for M2–M4/M6–M8; M1/M5 deltas are exclusively the F-0 PUBLIC EXECUTE revokes (in-scope item 7). Remediation-06 functional fixes are forward-only in M9. No graduation M\* drafts under `supabase/migrations`.

---

## M9 object inventory

File: `docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql`  
Blob: `795c324a1915a97cb4ebe5d1b586abb5e158cbb4`  
Governance: single transaction; `.NOT_APPLIED.sql` suffix; preflight refuses missing M1–M8, missing M7/M8 guard texts, and ambiguous retry; `commit` at end.

| Object | Kind | Notes |
|---|---|---|
| `graduation_project_events.department_id` | column + FK | nullable; project events keep it null |
| `graduation_project_events_scope` | CHECK | exactly one of `project_id` / `department_id` |
| `graduation_project_events_department_correlation_key` | partial unique index | `(department_id, correlation_id, event_type)` where `project_id is null` |
| `graduation_project_assignment_rank(role)` | function | SECURITY INVOKER, pinned `search_path`; **REVOKE ALL** from `public, anon, authenticated` |
| `end_graduation_project_assignment` | REPLACE | F-1 rank boundary; grants re-issued |
| `upsert_graduation_project_settings` | REPLACE | F-2 department-scoped audit |
| `upsert_graduation_project_rubric` | REPLACE | F-2 department-scoped audit |
| `create_graduation_project` | REPLACE | F-6 dept-scoped replay |
| `add_graduation_project_team_member` | REPLACE | F-7 replay-before-state |
| `resolve_graduation_project_supervisor_note` | REPLACE | F-9 note ownership |

No table grants, no RLS policies, no storage/bucket objects, no production credentials.

---

## F-1 verdict — assignment rank boundary

**PASS**

Source (`end_graduation_project_assignment` in M9):

* Actor whitelist unchanged: `coordinator` / `department_head` via `require_graduation_project_assignment` → **`auth.uid()` only**.
* Rank table from existing role semantics: dean 60 > department_head 50 > coordinator 40 > supervisor/co_supervisor 30 > panel_member 20 > student 10; unknown → 0 (fail-closed).
* Strictly-greater required; same-rank and higher-rank denied with `assignment termination authority denied`.
* Rank check runs **before** the already-ended no-op return (stale higher/same-rank still denied).
* **Dean is not whitelisted** — no universal bypass.
* Self-end, cross-project assignment id, terminal-state, and missing assignment remain denied.

Independent PG17 matrix (`audit-06/part3-rank-matrix.sql`, executed this review): required cases all PASS, including coordinator↛department_head/dean, same-rank deny, wrong-dept/anonymous/unrelated deny, legitimate lower-scope ends, replay idempotency, zero-mutation on rejects, ended-user write lockout, stale+rank deny.

Bypass probes covered by the matrix: direct RPC under spoofed JWT claim; forged/cross-project assignment id; wrong-department coordinator; anonymous (null `auth.uid()`); stale ended targets.

---

## F-2 verdict — canonical audit / correlation

**PASS**

Source (`upsert_graduation_project_settings` / `upsert_graduation_project_rubric`):

* Null `p_correlation_id` → `correlation id required` before any write.
* Success appends **exactly one** department-scoped row on `graduation_project_events` (`project_id` null, `department_id` set) with actor (`auth.uid()`), entity target, correlation id, and safe payload (`operation` / `changed_keys` / `before` / `after` scalars — no PII keys).
* Faithful replay returns recorded id; no second event; settings row untouched.
* Same correlation with different args does not mutate (recorded state preserved).
* Auth denials (coordinator/student/unrelated/anonymous/wrong-dept head) and constraint failures leave zero new events.
* Scope CHECK + append-only trigger preserved; department unique key enforces dedupe.
* Extends the existing event table — **no parallel audit subsystem**.
* Department settings/rubric events do not fan out notifications.

Independent PG17 matrix (`audit-06/part4-audit-correlation.sql`): success, replay, null correlation, auth denial, invalid payload, append-only, scope CHECK, unique dedupe, PII-key absence, rank ACL — all PASS.

Residual (non-blocking): true multi-session concurrent replay is enforced fail-closed by the unique index (loser may see `23505` rather than a soft idempotent return). Sequential replay and unique-constraint probes pass. Malformed correlation is rejected at the UUID bind layer before the function body.

---

## Low findings + deferred

| Finding | Verdict |
|---|---|
| F-0 PUBLIC EXECUTE on trigger helpers | **PASS** — M1/M5 revokes present; audit-06 ACL probes confirm rank helper denied to anon/authenticated |
| F-6 create replay dept-scoped | **PASS** (audit-06 part 5) |
| F-7 team-member replay-before-state | **PASS** (audit-06 part 5) |
| F-9 note ownership | **PASS** (audit-06 part 5) |
| F-3 / F-4 / F-5 | **Accepted fail-closed deferrals** — product decisions; ACL still deny (e.g. scan-state 42501); documented in remediation + security audit |

---

## PostgreSQL 17 results (independent re-run, disposable `postgres:17`)

Executed 2026-08-02 from the review worktree via Git Bash + Docker. No real/shared database touched; containers destroyed on exit.

| Suite | Result |
|---|---|
| `tests/graduation-projects/run-pg17-migration-package.sh` (M1–M8 + all verifiers) | `MIGRATION PACKAGE PG17 VERIFICATION PASS` |
| `tests/graduation-projects/audit-06/run-audit-06.sh` (M1–M9 sequential + wrong-order + rank + correlation + low) | `AUDIT-06 RUNTIME: PASS (106 checks, 0 unexpected)` |
| `tests/graduation-projects/audit-05/run-audit-05.sh` (M1–M8 package audit) | `AUDIT-05 RUNTIME: PASS (158 checks, 0 unexpected)` |

Notes:

* Audit-05 still **records** pre-M9 F-1 as INFO (`T3.e.coord-ends-dept-head`) because that suite applies M1–M8 only — expected documentation of the defect M9 fixes. Remediation proof is Audit-06.
* Audit-06 wrong-order probe records M9-on-M1..M7 refusal (`M7/M8 completeness guards missing`) as INFO — expected fail-closed preflight.

---

## Application / toolchain results

| Command | Result |
|---|---|
| `bun test tests/graduation-projects` | **194 pass / 0 fail** |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | **183 pass / 0 fail** |
| `bun test tests/student-requests` | **1060 pass / 0 fail** |
| `bun test` (full) | **2574 pass / 0 fail** |
| `bunx tsc --noEmit` | **exit 0** |
| `bun run build` | **exit 0** |
| `git diff --check` | **clean** |

Fresh `bun install` was required in the review worktree (no pre-existing `node_modules`). Build output stayed under ignored `.output/`. No generated noise committed. CI checks were not reported on the PR head branch at review time; local PG17 + Bun evidence above is the verification basis.

---

## Promotion runbook

`docs/GRADUATION-PROJECTS-M1-M8-PROMOTION-RUNBOOK-05.md` correctly sequences **M1→M9**, documents M9 deltas, requires post-M9 Audit-06, and keeps all drafts NOT_APPLIED. Stop conditions and preflight/verifier order are consistent with the harnesses re-run in this review.

---

## Risks

1. **Not applied** — drafts remain source-only; production schema unchanged until a separate authorized promotion.
2. **Concurrent settings/rubric upsert race** — unique index fails closed; clients may see unique_violation instead of soft replay under true concurrency.
3. **F-3/F-4/F-5 still open as product decisions** — current ACL fail-closed is preserved; not remediated by M9.
4. **Dean may still administer department settings/rubrics** (pre-existing M6 actor set) — distinct from F-1 termination whitelist; not a new bypass introduced by M9.
5. **GitHub PR checks empty** on the reviewed branch at review time — rely on the disposable PG17 + Bun evidence recorded here.

---

## Exact integration recommendation into PR #271

1. **Safe to integrate** PR #272 (`bdc58dd…`) into PR #271 (`13cae0ac…`) as source-only: M9 draft + F-0 revokes on M1/M5 + audit-05/06 harnesses + docs/runbook updates.
2. Preserve apply order **M1 → M8 → M9**; never skip M7/M8 completeness bodies; never place drafts under `supabase/migrations` until an authorized promotion.
3. After integration, re-run `run-pg17-migration-package.sh`, `audit-05/run-audit-05.sh`, and `audit-06/run-audit-06.sh` on the merged tip before any human promotion.
4. Do **not** merge to `main`, do **not** apply, do **not** deploy from this review decision.

---

## Assumptions

* Review scope is the exact SHAs named in the mission; no production DB was consulted.
* “M1–M8 byte-unchanged” is satisfied by blob identity for M2–M4/M6–M8 plus intentional in-scope F-0-only deltas on M1/M5.
* Audit-05 INFO records of F-1 on the M1–M8-only path are expected and do not contradict M9 remediation.

## Production impact

**None from this review.** Report-only commit on the review branch. No migrations applied, no data changed, no deploy/publish.

## Obstacles

* Review worktree initially lacked `node_modules` (resolved with local `bun install`).
* Docker Desktop service was stopped at session start; started successfully for PG17 runs.
* Mission B (PR #273) was explicitly out of scope for this agent and was not executed.

---

## Final decision (token)

`PASS_PORTAL_GRADUATION_PROJECTS_PR272_REMEDIATION_INDEPENDENT_FINAL_REVIEW`
