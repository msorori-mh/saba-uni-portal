# GRADUATION-PROJECTS M1–M8 — AUDIT-FINDINGS REMEDIATION-06 — REPORT

Mission: `PORTAL-GRADUATION-PROJECTS-M1-M8-AUDIT-FINDINGS-REMEDIATION-06`
Mode: source-only remediation of Audit-05 findings on branch
`audit/graduation-projects-migrations-overnight-20260801` (Draft PR #272,
base PR #271). No production connection, no migration apply, no deploy/publish,
no B1 or Graduates Affairs source touched, no authorization weakened, no
bypass created, no merge, no force push.

## FINAL STATUS

**PASS_GRADUATION_PROJECTS_M1_M8_AUDIT_FINDINGS_F1_F2_REMEDIATED_READY_FOR_INDEPENDENT_REVIEW**

F-1 and F-2 (mandatory) plus F-6, F-7, F-9 remediated by one new forward-only
draft, `docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql`,
with zero unexpected failures across the full independent PostgreSQL and
application verification. F-3, F-4, F-5 are product-decision-dependent and
left fail-closed, unchanged.

## Phase A — source gate

- `git fetch origin`: PR #271 head = `13cae0ac700713c68458b97f41459ac086e63cbf`
  (unchanged); confirmed ancestor of the audit branch.
- Audit head at start: `f3ee0d04feb6ae490affd467f56ce8f8da1f2eca` (exact match).
- Working tree clean at start. No drift to reconcile.
- **F-1 reproduced (pre-fix, verbatim, audit-05 T3.e on this exact head):**
  `T3.e.coord-ends-dept-head|INFO|RECORD: completed without error`;
  `T3.e.ended-head-state|INFO|RECORD: false / <ts>` — a coordinator ended the
  project's department_head assignment.
- **F-2 reproduced (pre-fix, verbatim, disposable PG17, dept-head actor):**
  settings upsert returned `5bee3954-…`, rubric upsert returned `8d21a2be-…`,
  then `F2-REPRO events_after_settings_rubric_upserts=0` and
  `F2-REPRO events_with_correlation_c1=0` — both mutations wrote zero audit
  events and the correlation id was nowhere.

## Previous/new SHAs (git hash-object)

| Draft | Before remediation-06 | After |
|---|---|---|
| M1 FOUNDATION | `bc4767a3d68726f495a76bde000124db18467845` | unchanged |
| M2–M4, M6–M8 | (audit-05 SHAs) | unchanged |
| M5 FILES-AND-NOTIFICATIONS | `fd3fdfd7bc51e799018e50644319bf1398af7935` | unchanged |
| **M9 AUDIT-REMEDIATION-06** | — (new) | **`795c324a1915a97cb4ebe5d1b586abb5e158cbb4`** |

M1..M8 are byte-untouched by this remediation; all fixes are forward-only in M9.

## F-1 — reproduction and fix

**Defect (M2 `end_graduation_project_assignment`):** actor whitelist
`coordinator, department_head` with only a self-end exclusion — any
coordinator could terminate department_head/dean assignments (see verbatim
reproduction above).

**Fix (M9, CREATE OR REPLACE, signature/grants/literals preserved):**
- Authority rank derived only from existing assignment-role semantics:
  dean 60 > department_head 50 > coordinator 40 > supervisor/co_supervisor 30
  > panel_member 20 > student 10; unknown/null → 0 (fail closed). Implemented
  as internal `graduation_project_assignment_rank(role)` (SECURITY INVOKER,
  pinned search_path, revoked from public/anon/authenticated — no app grant).
- Strictly-greater requirement:
  `if rank(actor.role) <= rank(target.role) then raise exception
  'assignment termination authority denied';` — lower-rank can never
  terminate higher; same-rank cross-actor denied (no existing contract
  permits it); checked **before** the already-ended no-op return, so stale
  higher/same-rank attempts also deny.
- Actor whitelist unchanged (coordinator/department_head). Dean is NOT added
  — no new grant, no dean/admin bypass. Actor identity is `auth.uid()` only.
  Department scope unchanged (assignment is project-scoped; cross-department
  actors fail `exact direct processing assignment required`).
- Legitimate flows preserved: coordinator→supervisor/co_supervisor/
  panel_member/student; department_head→coordinator and below.
- Audit evidence: allowed attempts append the canonical `assignment_ended`
  event with the correlation id (unchanged). Rejected attempts raise distinct
  deterministic exceptions and are verified to leave **zero mutation** —
  persistent rejection rows are impossible inside the aborted transaction;
  this matches the repository's own audit convention (B1 `log_audit` writes
  success-side rows only).

**Verification (audit-06 part 3, 21 cases, all PASS):** every required case
from the mission list — coordinator→supervisor allowed, coordinator→
department_head/dean denied, wrong-department denied, department_head→lower
allowed, department_head→dean denied, same-rank cross-actor denied,
dean-attempt denied (not whitelisted), unrelated faculty denied, anonymous
denied, stale/already-ended (lower-rank: no-op contract preserved;
higher-rank: denied), cross-project assignment id denied, replay idempotent
with no duplicate event/notification, ended-user lockout, and zero-mutation
proof on every rejection.

## F-2 — reproduction and fix

**Defect (M6 `upsert_graduation_project_settings` /
`upsert_graduation_project_rubric`):** no audit event written;
`p_correlation_id` accepted but never referenced (see verbatim reproduction).

**Fix (M9):** the canonical mechanism is extended, not duplicated:
- `graduation_project_events`: `project_id` made nullable, new nullable
  `department_id` (FK departments, restrict), CHECK
  `graduation_project_events_scope` (exactly one scope per row; all existing
  rows satisfy it), partial unique index
  `graduation_project_events_department_correlation_key(department_id,
  correlation_id, event_type) where project_id is null` (dedupe for
  department events; the project-scoped unique constraint is untouched).
  Append-only trigger and RLS default-deny cover the new rows; the M5 notify
  trigger falls through the new event types (zero notifications — verified).
- Both upserts now: require non-null `p_correlation_id`
  (`correlation id required`); replay faithfully via the department dedupe
  scope (return the recorded entity id — existing repository idempotency
  pattern); on success append **exactly one** department-scoped event with
  actor (`auth.uid()`), operation (insert/update), target entity id,
  before/after non-PII config scalars, changed keys, correlation id and
  server timestamp. Rejections raise before any write → zero mutation, zero
  event (verified per case).
- Recorded behavior (INFO, verbatim): a **reused correlation id with
  different arguments** returns the original recorded result without applying
  the new values (`T4.03 … 1/3 | updated_at_unchanged=true`) — faithful
  at-least-once replay semantics, consistent with the package's existing
  replay contract; documented for operators.

**Verification (audit-06 part 4, 21 cases, all PASS):** event shape/payload
verbatim for settings and rubric (insert + update paths), replay idempotency
(row and `updated_at` untouched, no duplicate event, no duplicated criteria),
null-correlation denial, invalid-payload/not-found/unauthorized/wrong-
department denials with zero events, append-only UPDATE/DELETE denial on
department events, scope CHECK violations (both/b neither scope), department
dedupe unique violation, zero notification fan-out, rank function 42501 as
authenticated/anon.

## Low findings disposition

| Finding | Classification | Disposition |
|---|---|---|
| F-3 scan RPC ACL-only | product-decision-dependent (scanner authn contract undefined) | unchanged; fail-closed at ACL (42501 re-verified) |
| F-4 scores not bound to rubrics | product-decision-dependent (authoritative rubric per discussion) | unchanged; shape/magnitude floor kept |
| F-5 wide detail payload | product-decision-dependent (UI read contract) | unchanged; assignment-gated |
| F-6 unscopeable create replay | actionable, unambiguous | **fixed in M9**: replay lookup department-scoped; dept2 collision returns a new dept2 project (verbatim `T5.f6.dept2-collision`), own replay still returns the recorded id |
| F-7 replay/state-gate ordering | actionable, unambiguous | **fixed in M9**: `add_graduation_project_team_member` replays before state gates; wrong-state new calls still denied (`submit_graduation_project_proposal` was already replay-first) |
| F-9 cross-supervisor note resolve | actionable, fail-closed | **fixed in M9**: `note ownership required`; denied attempt leaves note unresolved with zero events |

## Exact SQL draft changes

One new file, `docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql`
(single `begin;…commit;`; preflight: M1..M8 sentinels + M7/M8 guard-text
verification + ambiguous-retry guard):
1. `alter table graduation_project_events`: drop `project_id` NOT NULL;
   add `department_id`; add CHECK `graduation_project_events_scope`;
   add partial unique index `graduation_project_events_department_correlation_key`.
2. New internal `graduation_project_assignment_rank(role)` + revoke from
   public/anon/authenticated.
3. CREATE OR REPLACE ×6 with unchanged signatures/SECURITY DEFINER/pinned
   search_path, explicit revoke-from-public/anon + grant-to-authenticated
   re-issued: `end_graduation_project_assignment` (F-1),
   `upsert_graduation_project_settings` (F-2), `upsert_graduation_project_rubric`
   (F-2), `create_graduation_project` (F-6), `add_graduation_project_team_member`
   (F-7), `resolve_graduation_project_supervisor_note` (F-9).

No table grants, no RLS policies, no storage objects, no `supabase/migrations`
placement, deterministic sequencing (M9 hard-fails on replay and on any
missing M1..M8 guard — including the guard-text check added after the first
audit-06 run exposed that M7/M8 sentinels exist since M2).

Verifier change (reviewed, not a behavior change):
`tests/graduation-projects/postgres-security-audit-verifier.sql` caps bumped
with documented history — `function-inventory` 45→46 (M9 rank helper),
`co-supervisor-read-only` 6→7 (F-1 comment text); the actual co_supervisor
write whitelist is unchanged.

## PostgreSQL verification (disposable PG17, zero unexpected failures)

| Suite | Result |
|---|---|
| M1–M9 clean sequential apply | OK |
| Existing package harness (M1–M8, preflight→apply→verifier per step) | `MIGRATION PACKAGE PG17 VERIFICATION PASS` (68-row matrix ×2, 53-step E2E, catalog invariants) |
| Audit-05 suite (158 checks, M1–M8) | `AUDIT-05 RUNTIME: PASS (158 checks, 0 unexpected)` |
| Audit-06 suite part 1: all 8 existing verifiers re-run on M1..M9 | 8/8 PASS |
| Audit-06 part 2: wrong-order (minimal-only, M1..M7), replay guard, object-count invariance | PASS (M1..M7 now raises `M7/M8 completeness guards missing`) |
| Audit-06 part 3: F-1 rank-boundary matrix | 21/21 PASS |
| Audit-06 part 4: F-2 audit/correlation matrix | 21/21 PASS |
| Audit-06 part 5: F-6/F-7/F-9 + F-3/MIME sanity | PASS |
| **Audit-06 total** | **`AUDIT-06 RUNTIME: PASS (106 checks, 0 unexpected)`** |

Verbatim outcomes: `tests/graduation-projects/audit-06/AUDIT-06-RUNTIME-RESULTS.md`
(first-run history + post-fix addendum), `tests/graduation-projects/audit-05/AUDIT-05-RUNTIME-RESULTS.md`.

## Bun / full-suite results

| Command | Result |
|---|---|
| `bun test tests/graduation-projects` | 194 pass / 0 fail (15 files; incl. new `graduation-projects-audit-remediation-06.test.ts`, 6 tests) |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` + `tests/student-requests` + graduation-projects (combined) | 1437 pass / 0 fail (one transient single-test flake observed in an earlier combined run; immediate re-run green, no code change) |
| `bun test` (full) | **2574 pass / 0 fail** across 205 files — vs PR #271 reported baseline 2568/0: delta = +6 (the new M9 structural test), no regressions |
| `bunx tsc --noEmit` | clean |
| `bun run build` | success (incl. route-tree validation) |
| `git diff --check` | clean |

## Files changed (focused commits)

- New: M9 draft; `tests/graduation-projects/audit-06/` (runner, 3 verifier
  SQL files, results); `tests/graduation-projects/graduation-projects-audit-remediation-06.test.ts`;
  this report.
- Modified: `tests/graduation-projects/postgres-security-audit-verifier.sql`
  (documented cap bumps); `docs/migration-drafts/GRADUATION-PROJECTS-MIGRATION-PACKAGE-01.md`
  (M9 row); `docs/GRADUATION-PROJECTS-M1-M8-SECURITY-AUDIT-05.md` (dispositions);
  `docs/GRADUATION-PROJECTS-M1-M8-PROMOTION-RUNBOOK-05.md` (step 9, queue);
  `.gitattributes` (audit-06 EOL);
  `tests/graduation-projects/audit-06/AUDIT-06-RUNTIME-RESULTS.md` (addendum).

## PR state / local-remote equality

- Branch `audit/graduation-projects-migrations-overnight-20260801` pushed
  (no force); local HEAD == `origin/audit/graduation-projects-migrations-overnight-20260801`.
- PR #272 remains **Draft**, base
  `feat/graduation-projects-graduates-affairs-overnight-20260801`; body updated.
  Not merged. PR #271 untouched.

## Production impact

Zero. No production/staging connection, no apply, no deploy, no publish.
All verification ran in destroyed docker `postgres:17` containers.
M1..M8 byte-unchanged; M9 is a new NOT_APPLIED source-only draft.
