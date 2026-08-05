# GRADUATION-PROJECTS — GP-01 RECONCILIATION AND FINAL GAP MAP

- Phase: GP-01
- Date: 2026-07-30
- Branch: `k3/graduation-projects-completion`
- Worktree: `C:\projects\saba-uni-portal-k3-graduation-projects-completion` (verified correct, clean at start)
- Base SHA (origin/main): `c9beca3ec1fa3a7d259311319d8d7795e359875d`
- Production operations: 0 — Migrations applied: 0
- Decision: `PASS_GRADUATION_PROJECTS_GP01_RECONCILIATION_COMPLETE`

---

## 1. Environment verification

| Check | Result |
|---|---|
| Worktree path | `C:/projects/saba-uni-portal-k3-graduation-projects-completion` ✓ |
| Branch | `k3/graduation-projects-completion` ✓ |
| origin/main | `c9beca3ec1fa3a7d259311319d8d7795e359875d` ✓ |
| Worktree clean before start | ✓ (`git status --porcelain` empty) |
| Remote | `https://github.com/msorori-mh/saba-uni-portal.git` ✓ |

## 2. Inventory — EXISTING AND COMPLETE (merged on main, verified on this branch)

### 2.1 Database draft layer (source-only, NOT_APPLIED, PG17-verified)

- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` (365 lines, `DRAFT ONLY — DO NOT APPLY`):
  - Enums: `graduation_project_state` (14 values), `graduation_project_assignment_role` (6 values).
  - 15 tables: `graduation_projects`, `_assignments`, `_approvals`, `_milestones`, `_submissions`, `_supervisor_notes`, `_files`, `_discussion_requests`, `_discussions`, `_panel_members`, `_evaluations`, `_evaluation_scores`, `_corrections`, `_final_archives`, `_events`.
  - RLS enabled on all 15 tables with **zero policies** (deny-by-default); all table grants revoked from anon/authenticated.
  - Triggers: `guard_graduation_project_assignment` (identity/department consistency), `reject_graduation_project_event_mutation` (append-only events).
  - Readiness predicate `graduation_project_is_discussion_ready(uuid)`; reporting view `graduation_project_reporting` (security_invoker, revoked).
  - Partial unique index `graduation_project_active_assignment` = exactly-one-active-assignment per (project, role, user).
  - Idempotency backbone: `unique(project_id, correlation_id, event_type)` on events; archive `correlation_id` globally unique.
  - 6 RPCs (all `security definer set search_path = public, pg_temp`, minimal grants): `require_graduation_project_assignment` (internal, revoked from authenticated), `submit_graduation_project_proposal`, `add_graduation_project_team_member`, `set_graduation_project_milestone`, `request_graduation_project_discussion`, `finalize_graduation_project_evaluation`, `archive_graduation_project`.
- `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` (853 lines, draft guard):
  - 19 write RPCs + 6 read RPCs: create/review/resubmit/activate project, assign/end faculty, submit/review deliverable, supervisor notes, register file, schedule/reject discussion, assign panel member, record discussion outcome, save evaluation, conclude result, complete/accept correction; reads: `list_my_graduation_projects`, `get_graduation_project_detail`, 4 report RPCs (states/assignments/evaluations/archive).
  - Literal action whitelists (`start_review|approve|reject|require_revision`, `accept|require_revision`, `held|postponed|cancelled`, `completed|corrections_required`).
  - Optimistic concurrency `p_expected_version` on submit/review/resubmit/activate/conclude/archive.
- Verifiers: `tests/graduation-projects/postgres-foundation-verifier.sql` (315 ln), `postgres-lifecycle-verifier.sql` (404 ln), fixture `postgres-minimal-schema.sql`.
- PG17 execution evidence: `tests/graduation-projects/POSTGRES-17-VERIFICATION-RESULT.md`, `POSTGRES-17-LIFECYCLE-VERIFICATION-RESULT.md` (docker postgres:17, ON_ERROR_STOP, ends in `rollback;`).
- CI: `.github/workflows/ci.yml` pg-verifiers legs `graduation-projects-foundation` (lines 156–166) and `graduation-projects-lifecycle` (170–182), disposable postgres:17 services.

### 2.2 Library layer (tested, 42 bun tests / 437 expects)

- `src/lib/graduation-projects/domain.ts` — 14 states, 6 roles, 13 actions, fail-closed `authorizeProjectAction`, transition map, progress calculation, object-key safety, readiness assessment, summarization.
- `src/lib/graduation-projects/lifecycle.ts` — 27 `LifecycleAction` literals, Arabic labels (states/roles/actions/33 event types), per-role action resolvers, evaluation visibility + viewer scoping (`resolveViewerPanelMemberIds`, `resolveViewerEvaluation` — review-4982 MEDIUM-1 fix), score validation, corrections helpers, report payload types.
- `src/lib/graduation-projects/rpc.ts` — transport-agnostic `GraduationProjectsRpcClient` (constructor-injected `RpcClient`), 26 methods, `p_correlation_id` idempotency on every write, `ERROR_LABELS` mapping ~55 exact SQL messages to Arabic, unavailable-detection (42883 → "الخدمة قيد التحديث").
- Tests: `tests/graduation-projects/graduation-projects-foundation.test.ts`, `-lifecycle.test.ts`, `-sql-draft.test.ts`, `-lifecycle-sql-draft.test.ts` (incl. EVENT_LABELS ↔ SQL parity, 33/33).

### 2.3 UI component kit (presentational, complete)

- `src/components/graduation-projects/`: `CreateProjectForm`, `GraduationProjectsList`, `GraduationProjectWorkspace`, `ProposalWorkflowPanel`, `MilestonesPanel`, `DiscussionPanel`, `EvaluationPanel`, `ResultCorrectionsArchivePanel`, `GraduationProjectReports`, `GraduationProjectStateBadge`, `ProjectReadinessCard`.
- All RTL, action-gated via `availableProjectActions`, empty states present; purely presentational (props + callbacks, type-only imports from rpc.ts).

### 2.4 History (merged PRs)

- #159 audit/design, #174 MVP foundation, #190 lifecycle completion (incl. review-4982 remediation), #194 CI verifiers.

## 3. Inventory — EXISTING BUT INCOMPLETE / NOT ON THIS BRANCH

### 3.1 Portal integration (IMPLEMENTED BUT NOT ROUTED on this branch)

- `origin/feat/graduation-projects-portal-integration-01` = **open PR #226** (+7,488 lines, 82 files): routes `admin/graduation-projects.{tsx,index.tsx,$projectId.tsx}`, `faculty-portal.graduation-projects.{tsx,index.tsx,$projectId.tsx}`, `student.graduation-project.{tsx,index.tsx,$projectId.tsx}`; `GraduationProjectPortalWorkspace.tsx` (250 ln), `PortalRuntimeStates.tsx`, `portal.functions.ts` (620 ln), `availability.ts`, `portal-privacy.ts`, `src/lib/graduation-projects/index.ts`, nav/AdminShell wiring, 411-line portal integration test, 2 reports.
- `origin/review/graduation-projects-ui-visual-qa-01` fixes (PR #231) merged **into #226 branch only**, not main.
- PR #226 status: OPEN, **all remote CI checks FAILURE**, branch carries `1b0edd00` "record PR226 remote CI infrastructure HOLD" (attributed to CI infra; unverified as-is).
- GP-03 plan: integrate this content into the k3 branch and verify locally (bun test / tsc / build / PG17 verifiers); do not wait on remote CI.

### 3.2 RPC client wrappers missing (SQL exists, TS wrapper absent)

`src/lib/graduation-projects/rpc.ts` lacks methods for 6 foundation RPCs:
`submit_graduation_project_proposal`, `add_graduation_project_team_member`, `set_graduation_project_milestone`, `request_graduation_project_discussion`, `finalize_graduation_project_evaluation`, `archive_graduation_project`.

### 3.3 Migration files

- `supabase/migrations/` contains **zero** graduation-projects objects (verified across all 265 files). Drafts live only in `docs/migration-drafts/`. Mission requires forward-only migration source files (`supabase/migrations/*graduation_project*`) — NOT_APPLIED.

## 4. Inventory — MISSING (gaps to close in GP-02..GP-06)

| Gap | Detail | Phase |
|---|---|---|
| Co-supervisor | No `co_supervisor` role/designation; only `supervisor` | GP-02 |
| Rubric definitions | No rubric tables; free-text `rubric_version` + caller-supplied criterion rows only | GP-02/GP-06 |
| Settings/configuration | No academic-year/term windows, team min/max, supervisor capacity, weights/thresholds, deadlines tables | GP-06 |
| Notifications references | Zero linkage to any notification system; no dedupe contract | GP-02/GP-05 |
| Storage integration | `scan_state` never transitions (no RPC); no bucket/signed-URL contract; orphan cleanup undefined | GP-05 |
| File binary upload | Disabled by design (`lifecycle.ts:287–290`); upload-window enforcement missing | GP-05 |
| Eligibility gating | No academic-eligibility/team-size enforcement (deferred as config input) | GP-06 (settings-driven) |
| Version guards | `p_expected_version` absent on deliverable/notes/file/discussion/panel/evaluation-save/correction RPCs | GP-02 (assess; keep minimal) |
| Exactly-one constraints | No exactly-one supervisor, exactly-one panel chair, exactly-one pending discussion request | GP-02 |
| Team invitations | Direct add only; no invite/accept contract | GP-04 (assess vs contract) |
| Final-manuscript lock | Indirect only (archive requires clean accepted final file) | GP-04 |
| Weighted result | `computeEvaluationTotal` is plain sum; weights not applied | GP-04/GP-06 |
| Routes/nav/guards | Nothing routed on this branch; no direct-URL fail-closed guard; no breadcrumbs; tables not responsive | GP-03 |
| Server functions | No `createServerFn` wiring for graduation projects | GP-03/GP-04 |
| E2E | No isolated operational E2E dataset/journeys | GP-08 |
| Bootstrap | First coordinator/department_head assignment requires privileged step (documented G4 caveat) | document in GP-10 rollout |

## 5. Lifecycle map — current vs required

Current implemented states (all in SQL drafts + TS mirror): `draft → submitted → under_review → approved → active → discussion_requested → discussion_scheduled → evaluating → (corrections_required ↔ evaluating) → completed → archived`; side exits `revision_required → submitted`, `rejected`; `cancelled` reserved/unreachable.

Required 30-step journey (mission GP-04) maps onto existing RPCs except: proposal submit / team add / milestone set / discussion request / evaluation finalize / archive lack TS client wrappers (§3.2); team invitation accept-flow, explicit final-manuscript lock, and weighted scoring need contract decisions (kept minimal, documented per phase).

## 6. Shared-file integration needs (anticipated, minimal-diff rule applies)

- `src/routeTree.gen.ts` — regenerated by tooling only.
- `src/lib/admin-nav.ts`, `src/components/admin/AdminShell.tsx` (or portal shells) — graduation-projects nav entries only (PR #226 diff carries exactly these; will be adopted with minimal diff).
- `src/integrations/supabase/types.ts` — only if types are regenerated due to local graduation-projects migration (likely NOT, since migrations stay NOT_APPLIED).
- `src/lib/reports/catalog/entries.ts` — already contains graduation-projects catalog entries; extend only if GP-06 adds reports.

## 7. B1 / five-services separation verdict

No B1-track file will be touched. GP work is confined to: `src/lib/graduation-projects/**`, `src/components/graduation-projects/**`, `tests/graduation-projects/**`, `docs/**GRADUATION-PROJECTS**`, `docs/migration-drafts/**GRADUATION-PROJECTS**`, `supabase/migrations/*graduation_project*`, graduation-projects routes + minimal nav/shell wiring (documented per phase).

## 8. Risks

- PR #226 content is unverified (remote CI infra HOLD); local verification after integration is mandatory before GP-03 PASS.
- PG17 local verification requires Docker or embedded-postgres (precedent: `tests/materials/run-postgres-verifier.mjs`); if unavailable, phase evidence downgrades to source-level + CI-deferred, recorded as HOLD item.
- Scope discipline: gaps deferred by prior academic decisions (rubric/quorum policies, grade writeback) will be implemented as configurable contracts, not hardcoded policy.
