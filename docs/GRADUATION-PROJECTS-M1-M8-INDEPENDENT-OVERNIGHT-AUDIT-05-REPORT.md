# GRADUATION-PROJECTS M1–M8 — INDEPENDENT OVERNIGHT AUDIT 05 — FINAL REPORT

Mission: `PORTAL-GRADUATION-PROJECTS-M1-M8-MIGRATION-PACKAGE-INDEPENDENT-OVERNIGHT-AUDIT-05`
Mode: independent source-only database and security review.
Scope: `docs/migration-drafts/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql`
through `…-M8-PANEL-COMPLETENESS.NOT_APPLIED.sql`.
No production/staging connection, no migration apply outside disposable
containers, no deploy/publish, no runtime UI changes.

## FINAL DECISION

**PASS_GRADUATION_PROJECTS_M1_M8_INDEPENDENT_MIGRATION_PACKAGE_READY_FOR_REVIEW**

"Ready for review" means: the package is structurally sound, sequentially
consistent, replay-guarded, deny-by-default, free of actor-spoofing and
admin/dean bypass paths, and fully runtime-verified in disposable PostgreSQL
17. One LOW defect was found and fixed by this audit (F-0, trigger-function
PUBLIC EXECUTE) with the full chain re-verified green. Two MEDIUM findings
(F-1 peer revocation of oversight assignments, F-2 unaudited settings/rubric
mutations) plus LOW/INFO findings (F-3..F-10) are documented with verbatim
evidence and tracked for the next package revision — they are review items,
not blockers. Promotion must follow
`docs/GRADUATION-PROJECTS-M1-M8-PROMOTION-RUNBOOK-05.md` and requires explicit
human sign-off; this audit applied nothing anywhere.

## What was executed (evidence)

| Suite | Result |
|---|---|
| `tests/graduation-projects/run-pg17-migration-package.sh` (docker postgres:17; minimal schema → preflight → apply → verifier per migration; verifiers end in ROLLBACK) | `MIGRATION PACKAGE PG17 VERIFICATION PASS` — incl. authorization matrix `68 rows, fail_rows=0` (×2), `E2E JOURNEYS PASS: 53 steps`, `SECURITY AUDIT PASS` |
| `tests/graduation-projects/audit-05/run-audit-05.sh` (new, independent; 9 disposable databases) | first run `INVESTIGATE (1 unexpected)` → C2.5 fixed in drafts → **final `AUDIT-05 RUNTIME: PASS (158 checks, 0 unexpected)`** |
| `bun test tests/graduation-projects` | **155 pass / 0 fail** at audit time; **188 pass / 0 fail** after PR #271 reconciliation merge (incl. new negative-authorization-03 suite) |
| `bunx tsc --noEmit` | **clean** |
| `git diff --check` | clean |
| `bun run security:test` | NOT RUN — requires a staging Supabase environment; forbidden by mission scope (no production/staging access). Recorded as an environmental limitation, not a failure. |

Audit-05 runtime coverage (all in disposable PG17, fixtures rolled back):
wrong-order M2-before-M1 and M4-before-M3 (exact preflight failures);
preflight-02 without foundation; M1 replay guard with identical object counts
after refusal; replay of each of M2..M8 (M2–M6 hard-fail with
`refuse ambiguous retry`; M7/M8 idempotent rc=0 — F-10); partial-apply
atomicity via conflicting pre-object and mid-migration `select 1/0` fault
injection (zero leftover objects both times); preflight replay matrix;
10 independent catalog checks (RLS on all 19 tables, 0 policies, 0 table
grants, 41/41 definer functions search_path-pinned, full grant inventory,
no storage buckets, files key constraint, ownership,
`security_invoker=true` confirmed); ~130-row extended actor matrix:
anonymous/unrelated/owner/non-owner/team member/supervisor/co-supervisor/
unrelated faculty/correct & wrong dept head/panel member/unrelated panel
member/dean across the previously untested RPC surface (reject discussion,
review submission, resubmit, activate, end assignment, resolve note, 5
department reports, notifications scoping, orphan-files & scan-state 42501
ACL, file policy MIME/size/scope/stage-binding, unattached-panel evaluation,
finalize negatives, M6 settings enforcement team_max/team_min/window/
capacity/co-supervisor rule, archive negatives, notification dedupe,
direct-table-access 42501 proof, stale-version optimistic concurrency).

Full verbatim outcomes: `tests/graduation-projects/audit-05/AUDIT-05-RUNTIME-RESULTS.md`.

## Files modified by this audit

- `docs/migration-drafts/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql`
  — F-0 fix: explicit revokes for the two trigger functions.
- `docs/migration-drafts/GRADUATION-PROJECTS-M5-FILES-AND-NOTIFICATIONS.NOT_APPLIED.sql`
  — F-0 fix: explicit revoke for the notify trigger function.
- `.gitattributes` — EOL normalization (`text eol=lf`) for
  `docs/migration-drafts/GRADUATION-PROJECTS-*.sql` and
  `tests/graduation-projects/**/*.sql`, same convention the repo already uses
  for the B1 packages; fixes a Windows CRLF checkout failure in
  `graduation-projects-hardening.test.ts` (test asserts a multi-line LF
  substring).

No application runtime files touched. All SQL stays under
`docs/migration-drafts` and NOT_APPLIED.

## Files created by this audit

- `docs/GRADUATION-PROJECTS-M1-M8-DEPENDENCY-GRAPH-05.md` — full object
  inventory (schemas/tables/enums/columns/constraints/indexes/triggers/
  functions/grants/RLS/storage/audit), dependency graph M1→M8, function
  replacement chain, guard structure.
- `docs/GRADUATION-PROJECTS-M1-M8-SECURITY-AUDIT-05.md` — actor-spoofing
  review, per-RPC authorization matrix, SECURITY DEFINER/grants/RLS/PII/storage
  analysis, findings F-0..F-10 with verbatim evidence.
- `docs/GRADUATION-PROJECTS-M1-M8-PROMOTION-RUNBOOK-05.md` — preconditions,
  apply order, stop conditions, rollback-by-forward strategy, post-promotion
  checklist.
- `tests/graduation-projects/audit-05/run-audit-05.sh`,
  `part2-catalog-checks.sql`, `part3-actor-matrix.sql`,
  `AUDIT-05-RUNTIME-RESULTS.md` — the independent runtime suite.
- This report.

## Findings (summary — details in the security audit doc)

- **F-0 LOW (FIXED)**: 3 trigger functions carried default PUBLIC EXECUTE;
  explicit revokes added to M1/M5; chain re-verified.
- **F-1 MEDIUM (documented)**: a coordinator can end a department_head/dean
  assignment (no rank guard); evidence verbatim; recommend next-revision guard.
- **F-2 MEDIUM (documented)**: settings/rubric mutations write no audit event;
  `p_correlation_id` unused in `upsert_graduation_project_settings`.
- **F-3..F-7, F-9 LOW (documented)**: ACL-only protection on the scan-state
  RPC; scores not bound to administered rubrics; wide detail payload;
  unscopeable create replay; replay/state-gate ordering inconsistency;
  cross-supervisor note resolution.
- **F-8, F-10 INFO**: revoked-from-everyone reporting view
  (`security_invoker=true` confirmed); M7/M8 + preflights 07/08 tolerate
  replay by design (idempotent CREATE OR REPLACE).

No HIGH findings. No actor spoofing. No broad admin/dean/registrar bypass —
zero `is_admin|is_dean|is_registrar|bypass` shortcuts; every privileged action
flows through per-project direct assignments. No client-supplied actor IDs.
All 41 SECURITY DEFINER functions pin `search_path=public,pg_temp`. No dynamic
SQL with user input. No RLS policies (default-deny real), no table grants to
app roles, no PUBLIC EXECUTE (post-fix), no storage buckets/public URLs, no
PII in notifications.

## Assumptions

- The minimal base schema (`tests/graduation-projects/postgres-minimal-schema.sql`)
  faithfully represents the production surface the package touches
  (`auth.users`, `auth.uid()` via `request.jwt.claim.sub`, departments,
  profiles, roles). Production has additional objects; the package's FKs and
  RPCs only touch the listed surface.
- Supabase-provided roles (`anon`, `authenticated`, `service_role`) exist in
  the real environment; M4/M5 service_role grants are conditional where the
  role is absent.
- Verifiers that end in ROLLBACK are safe to run on a live database; they
  were only run in disposable containers here.
- The E2E/authorization fixtures are synthetic; no real student data exists
  in any test path.

## Risks / residual gaps

- F-1/F-2 are real design weaknesses accepted for this revision; they must be
  answered by the package owner before or shortly after promotion.
- MIME validation is client-declared; binary content scanning is a deferred
  pipeline decision (bucket creation is intentionally NOT in this package).
- The reporting view is currently unusable by every role (revoked from all);
  either wire it to a role or drop it in a follow-up.
- Production apply onto a schema with pre-existing graduation-projects data
  is out of scope (manifest stop condition 5).

## Obstacles encountered (resolved)

- Fresh Windows checkout: `core.autocrlf=true` rendered SQL drafts CRLF,
  failing one bun structural test; fixed repo-level via `.gitattributes`
  `text eol=lf` for the GP drafts/verifiers (existing B1 convention).
- `node_modules` absent; `bun install --frozen-lockfile` restored tsc/test
  capability. Lockfile unchanged.
- `bun run security:test` not runnable without staging access (see above).

## Production impact

None. Nothing was applied, connected, published, or deployed. The only draft
edits are the two additive REVOKE statements (F-0) — post-fix SHAs are
recorded in `tests/graduation-projects/audit-05/AUDIT-05-RUNTIME-RESULTS.md`
and must match what gets promoted.

## PR #271 reconciliation

The audit branch tracks `feat/graduation-projects-graduates-affairs-overnight-20260801`.
PR #271 head was fetched before finalizing. The head **moved while the audit
ran**: `cac60ce0` → `13cae0ac` (hardening-03 batch: fail-closed fixes in
`src/lib/graduation-projects/*`, mobile fixes, new suites
`graduation-projects-negative-authorization-03.test.ts`,
`graduates-affairs-g4-default-deny-03.test.ts`, plus docs).
**No file under `docs/migration-drafts/` changed** between the two heads
(verified by `git diff cac60ce0 13cae0ac --stat`), so the audited drafts and
all runtime evidence remain valid. The new head was merged into this branch
(`--no-ff`); post-merge verification: `bun test tests/graduation-projects`
**188 pass / 0 fail** (14 files, incl. the new negative-authorization suite),
`bun test tests/graduates-affairs` **66 pass / 0 fail**, `tsc --noEmit` clean,
`git diff --check` clean.

## Sign-off

Decision: **PASS_GRADUATION_PROJECTS_M1_M8_INDEPENDENT_MIGRATION_PACKAGE_READY_FOR_REVIEW**
with findings F-1..F-10 tracked. Promotion gate: human review of the draft PR
+ runbook preconditions 0.1–0.6.
