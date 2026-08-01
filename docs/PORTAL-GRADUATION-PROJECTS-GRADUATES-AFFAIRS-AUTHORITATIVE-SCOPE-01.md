# PORTAL-GRADUATION-PROJECTS-GRADUATES-AFFAIRS-AUTHORITATIVE-SCOPE-01

Mission: PORTAL-GRADUATION-PROJECTS-AND-GRADUATES-AFFAIRS-OVERNIGHT-MASTER-01
Base: `origin/main` @ `6393f3d46d278cbbe31553f9ed1e0fd785e0d2cb` ("B1 preflight held (G0 fail)", 2026-08-01)
Worktree: `C:\projects\saba-uni-portal-graduation-alumni-overnight-20260801`
Branch: `feat/graduation-projects-graduates-affairs-overnight-20260801` (clean at mission start, tracking origin/main)

All findings below are derived from repository evidence only: current main source, migrations,
docs, tests, and the eleven prior branches. No product requirement was invented from general knowledge.

---

## 1. Prior branch inventory and reconciliation matrix

HEAD SHAs and relations recorded at mission start (fetch of 2026-08-01):

| Branch | HEAD | Ahead/Behind main | Verdict | Evidence |
|---|---|---|---|---|
| codex/graduation-projects-mvp-audit-design-01 | c5b234d3 | 0 / 1043 | CURRENT_MAIN | Fully merged (docs-only audit/design). |
| codex/graduation-projects-mvp-foundation-01 | fff3e73b | 6 / 964 | CURRENT_MAIN | All 9 files byte-identical on main (merged via PR #174, f970b9c9). |
| codex/review-graduation-projects-mvp-foundation-01 | 6a001844 | 1 / 964 | SUPERSEDED | Independent review doc (HOLD vs draft PR #174); findings HIGH-01/MEDIUM-01/MEDIUM-02 remediated on main before merge (composite same-project FKs etc., commit 4559fdd7). Historical record only. |
| feat/graduation-projects-completion-01 | 160d0cc5 | 11 / 942 | CURRENT_MAIN | All 18 files byte-identical on main (merged via PR #190, 809c06c9), incl. review-4982 fixes (MEDIUM-1 viewer-scoped own-evaluation derivation, LOW-1..7). |
| feat/graduation-projects-portal-integration-01 | 22137266 | 4 / 811 | SUPERSEDED (by k3) | Ancestor of k3/graduation-projects-completion; portal-layer content lives on in k3 in hardened form. |
| k3/graduation-projects-completion | 9ebfcb67 | 19 / 73 | REUSE | The consolidated graduation-projects release candidate (GP-01..GP-10): 8 migration files, portal server functions, 9 routes, nav wiring, 68-row authorization matrix, 53-step E2E, 12-invariant security audit, release-candidate docs. Zero overlapping file edits vs main since merge-base 80fa785a. |
| review/graduation-projects-ui-visual-qa-01 | 6dc045ba | 3 / 811 | SUPERSEDED | Strict subset of portal-integration-01, contained in k3. |
| codex/graduates-affairs-mvp-audit-design-01 | a58deaa5 | 0 / 1038 | CURRENT_MAIN | Fully merged (docs-only audit/design). |
| codex/graduates-affairs-mvp-foundation-01 | 9a1b2a28 | 1 / 964 | CURRENT_MAIN | Patch-equivalent on main (PR #179, 53c40148); all 6 files identical. |
| feat/graduates-affairs-completion-01 | ab1bf95e | 8 / 942 | CURRENT_MAIN | All 15 files byte-identical on main (merged via PR #186, 331b7bcd), incl. review remediation (per-cell suppression, fail-closed D-13, append-only follow-ups). |
| review/graduates-affairs-ui-visual-qa-01 | 9c036a78 | 1 / 811 | REUSE | Only branch with unmerged runtime value: presentational privacy/a11y hardening of the 4 graduates-affairs panels + `display-format.ts` + 416-line privacy guard test + QA report. Findings NOT addressed on main (main still renders raw programId UUIDs and question machine keys, lacks submit lock). |

Categories used: CURRENT_MAIN (already integrated), REUSE (port), REIMPLEMENT (none needed),
SUPERSEDED (do not port), REJECT_SECURITY (none found — no branch weakens authorization, RLS or PII
protection; none adds admin bypasses or client-supplied actor ids), NEEDS_PRODUCT_DECISION (see §5).

---

## 2. Graduation Projects — scope extraction

### 2.1 Already implemented on main
- Pure domain layer `src/lib/graduation-projects/domain.ts`: 14-state lifecycle, 6 project roles,
  13 actions, fail-closed `authorizeProjectAction`, transition table, progress/readiness helpers.
- View-model `src/lib/graduation-projects/lifecycle.ts`: 26 lifecycle actions, Arabic label maps
  (states/roles/actions/33 audit events), per-state per-role action matrix (UX mirror only),
  evaluation visibility rules, score validation, corrections helpers, typed detail/report contracts.
- RPC client `src/lib/graduation-projects/rpc.ts`: typed client over 19 write + 6 read RPCs,
  ~50 mapped Arabic error labels, correlation-id idempotency, service-unavailable mapping.
- 11 components in `src/components/graduation-projects/` (list, workspace, panels for proposal,
  milestones, discussion, evaluation, result/corrections/archive, reports, readiness, state badge).
- SQL DRAFTS only: `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` (2 enums,
  15 tables, RLS-everywhere default-deny, 7 RPCs) and `GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`
  (21 additional RPCs). Nothing applied; no graduation_project* object exists in supabase/migrations.
- Tests: 4 bun suites (42 tests green) + 2 executable PG verifiers with recorded PG17 PASS evidence.
- Docs: audit/design, foundation, completion reports; reports-catalog entries (8 GP entries,
  4 without data source).

### 2.2 Implemented only on the legacy k3 branch (ported by this mission)
- 8 migration files M1–M8 (supabase/migrations/20260730100000–…100007): full schema + 25+ RPCs +
  co_supervisor enum + hardening (file scan states, rubrics, notification log, partial unique
  indexes) + attachments/notifications + per-department settings/rubrics/defense report/CSV export +
  GP-07-HIGH-1 fix (result conclusion panel-completeness guard) + GP-08 fix (defense held requires
  complete panel).
- `src/lib/graduation-projects/portal.functions.ts` (25+ createServerFn wrappers;
  auth.uid()-authoritative, never client-supplied actor ids), `portal-privacy.ts` (student-viewer
  redaction), `availability.ts` (fail-closed probe), `index.ts` barrel.
- 5 new/modified components (AssignmentsPanel, GraduationProjectAdmin,
  GraduationProjectPortalWorkspace, PortalRuntimeStates, gp-datetime) + panel updates.
- 9 routes: admin/graduation-projects{,.index,.$projectId}, faculty-portal.graduation-projects{,.index,.$projectId},
  student.graduation-project{,.index,.$projectId}; nav wiring in AdminShell, admin-nav,
  student.index, faculty-portal.index.
- Extended test suite (11 bun test files incl. authorization-closure, security-audit, hardening,
  e2e portal journeys, admin settings, files/notifications, portal integration, visual-UX-QA) +
  8 PG17 preflights + 8 postgres verifiers + runner.
- GP-01..GP-09 reports, release-candidate doc set, migration package doc.
- CI: migration-review exact-line DELETE allowlist (only meaningful together with migrations in
  supabase/migrations — see §6 decision).

### 2.3 Designed but not implemented (repository evidence)
- Binary file upload: deliberately disabled pending storage-policy approval
  (`buildPrivateObjectKey` doc, MilestonesPanel alert). File metadata registration only.
- `cancelled` state: reserved, no RPC produces it (deliberate).
- 4 of 8 catalogued reports without data source (supervisor load, late milestones, defense results,
  university summary) — `required_role: ["pending:graduation_projects_report_roles"]`.

### 2.4 Explicitly deferred / unresolved product decisions (from main docs)
Per docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md and
docs/GRADUATION-PROJECTS-COMPLETION-01-REPORT.md: eligibility rules (course/program/level),
team-size and supervisor-load limits (partially addressed by k3 M6 settings), rubric/quorum
configuration (partially M6), notification scheduling (needs a scheduler at rollout), grade
writeback, orphaned object-key cleanup, state-change notification execution, first-department
bootstrap (deliberate manual privileged step), route wiring (addressed by k3, ported here).

---

## 3. Graduates Affairs — scope extraction

### 3.1 Already implemented on main
- Pure contract layer `src/lib/graduates-affairs/` (8 files, 1,141 lines): foundation gates
  (official-decision-only graduate record creation, consent model, privacy-safe counts),
  graduate file assembly (no raw contact values), consents (purpose+version scoped, append-only),
  employment (append-only events, supersession chain), surveys (consent-gated, aggregate-only),
  reports (cohort program×year, min cell size 5, aggregate-safety assert), communications
  (consent + verified contact point gating, follow-up lifecycle), account continuity (D-13,
  fail-closed default).
- 4 presentational RTL components in `src/components/graduates-affairs/` (no network calls).
- SQL DRAFTS only: `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-FOUNDATION-01.sql` (5 enums,
  14 tables, RLS default-deny, zero policies, one RPC revoked from all client roles) and
  `GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` (follow-ups, communication events, account continuity
  policies, 2 security-definer functions revoked from clients).
- Tests: 2 bun suites (29 tests) + 2 executable PG verifiers + audit-report contract test.
- Reports catalog: 9 ALU-* entries, all `route: null`, `required_role: ["pending:g4_authorization_package"]`.

### 3.2 Implemented only on legacy branch (ported by this mission)
- review/graduates-affairs-ui-visual-qa-01: `display-format.ts` (Arabic purpose labels, ar-EG
  dates), panel fixes (cohort "الفوج N" instead of raw UUID, "السؤال N" instead of machine keys,
  submit lock, role=status/alert, suppressed-cell aria-label, mobile grid collapse), 416-line
  privacy non-regression test, QA report.

### 3.3 Designed but not implemented (repository evidence)
- G4 authorization package: RLS policies + EXECUTE grants + ALLOW/DENY matrix for graduates-affairs
  staff — explicit hard precondition documented in the completion report; all ALU report entries
  carry `pending:g4_authorization_package`.
- Routes/navigation: none exist on any branch; route wiring documented as follow-up.
- Runtime RPC adapters/server functions: none anywhere; all contracts pure/draft.
- Approved message-template registry (`template_code` is a text contract).
- Contact-value encryption/protection mechanism (raw email/phone isolated in
  `graduate_contact_points.protected_value` pending an approved mechanism).
- Row-level exports (prohibited until purpose-scoped expiring assignments + audited approval exist).
- Upstream official-decision integration (registrar/university SoR must supply ledger rows).

### 3.4 Conflicting (documented, unresolved)
- `graduate_affairs` unit label conflict: roles-catalog titles `graduates_director/graduates_officer`
  ("شؤون الخريجين", app_role `registrar`, migrations 20260611001252/20260611002102) vs request-processing
  unit `graduate_affairs` labeled "شؤون الدراسات العليا" (migration 20260716172804). Same key, different
  meaning. Left untouched by this mission; flagged as NEEDS_PRODUCT_DECISION.
- Staff functional roles `graduate_affairs_manager/specialist` currently fall back to app_role
  `student_affairs` with an explicit expansion note. No new role enum is created by this mission.

### 3.5 Explicitly deferred
D-13 account continuity (NEEDS_USER_INPUT; default denies everything), employer portal and job
applications (excluded unless separately approved), follow-up cadence, survey rules, report
thresholds beyond the documented minimums, one-current-employment-event DB constraint (noted as
future).

---

## 4. Missing entirely (no repository evidence — out of scope)
- Graduates-affairs routes, server functions, and staff/graduate UIs beyond the 4 panels.
- Any graduates-affairs runtime authorization (blocked on G4 product decision).
- Graduation-projects binary upload/storage bucket, notification scheduler, grade writeback.

## 5. NEEDS_PRODUCT_DECISION register (documented, not resolved by this mission)
1. GP eligibility rules (course/program/level) and enrollment gating.
2. GP notification delivery/scheduler at rollout.
3. GP grade writeback to the academic record.
4. GP first-department bootstrap operator procedure.
5. G4 graduates-affairs authorization package (RLS policies, EXECUTE grants, ALLOW/DENY matrix).
6. `graduate_affairs` unit label conflict (alumni vs postgraduate affairs).
7. D-13 graduate account continuity policy.
8. Approved message-template registry for graduate communications.
9. Contact-value encryption mechanism for `graduate_contact_points.protected_value`.
10. Whether/when the M1–M8 SQL drafts may be promoted from source-only drafts (operator decision).

## 6. Mission-level database decision (binding)
The mission forbids placing SQL in `supabase/migrations` and forbids applying migrations. The k3
branch carries its schema as `supabase/migrations/2026073010000*.sql` (unapplied). This mission
ports that SQL as source-only drafts under `docs/migration-drafts/` with `.NOT_APPLIED.sql`
suffixes and adapts the verifier/test references accordingly. The k3 migration-review CI allowlist
change is therefore not ported (it is only meaningful when the SQL lives in supabase/migrations);
it is documented here as part of the future promotion package.
