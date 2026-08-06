# Decision

**HOLD_GRADUATION_PROJECTS_MVP_UI_NO_RUNTIME_ROUTES_OR_INTEGRATION**

The repository contains a useful source-only graduation-project domain model, a typed client for draft RPCs, and eleven presentational components. It does **not** contain a graduation-project route, route-tree entry, navigation item, runtime data hook, query key, mutation hook, or instantiated RPC client. Therefore no MVP actor can reach or operate a graduation-project UI at the required base revision.

This is a docs-only, source-only audit. No UI/runtime source, migration, data, storage, production system, deployment, or publication was changed or contacted.

# Repository Identity

| Item | Audited value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| Worktree | `C:\projects\saba-gp-mvp-ui` |
| Required/audited base HEAD | `b71016d6f706cfe01dd1f402338e5d56a83184d8` |
| Base subject | `Released B1 five services` |
| Audit branch | `docs/gp-mvp-ui-audit-01` |
| Application | TanStack Start/Router + React Query + Supabase JS |
| Audit date | 2026-08-06 (Asia/Riyadh) |
| Initial tree | Clean |

Repository identity and base were verified before inspection. The worktree is isolated from `main` and was already on the required branch and exact required HEAD.

# MVP UI Boundary

The fixed UI boundary is limited to the six named actors and the screens/actions in the mission. Existing source uses domain roles `student`, `supervisor`, `coordinator`, `department_head`, `dean`, and `panel_member`. For this audit:

- student/team leader and team member map to a direct project `student` assignment, but the source has no leader/member UI distinction;
- coordinator maps to direct `coordinator` assignment;
- supervisor maps to direct `supervisor` assignment;
- committee member maps to direct `panel_member` assignment;
- authorized administration viewer is read-only and must not inherit the operational powers currently modeled for `department_head` or `dean`;
- global admin, registrar, dean, or title-based bypass is outside the boundary and must remain denied.

Classification meanings:

- `COMPLETE_FOR_MVP`: routed, reachable, data-integrated, mutation-integrated where applicable, guarded, and has required UX states.
- `PARTIAL_FOR_MVP`: reachable or reusable implementation exists but required MVP behavior is incomplete.
- `PLACEHOLDER`: deliberately non-operational or metadata/mock-only surface.
- `DEAD_OR_UNREACHABLE`: source exists but no runtime route/import path makes it usable.
- `MISSING_FOR_MVP`: required screen/capability has no usable implementation.
- `OUT_OF_SCOPE`: not required by the fixed MVP.

No audited graduation-project UI area qualifies as `COMPLETE_FOR_MVP` at this revision.

# Route Inventory

## Exact current route inventory

The exact graduation-project route inventory is empty. Searches of `src/routes`, `src/routeTree.gen.ts`, all navigation shells, dashboards, and imports found no graduation-project route or route-tree node. The only route occurrence of the Arabic phrase is static public copy in `src/routes/about.tsx`, not an application screen.

The following inventory records the minimum logical routes the fixed MVP needs. Route strings are recommendations, not existing routes and not an authorization to implement.

| Required route | Actor | Intended component/reuse | Current status | Data source | Mutations | Exact gap |
|---|---|---|---|---|---|---|
| `/student/graduation-projects` | student leader/member | `GraduationProjectsList`, dashboard summary | `MISSING_FOR_MVP` | Draft `list_my_graduation_projects` client method only | none | No route, query, loading/error state, navigation, or student-specific dashboard |
| `/student/graduation-projects/team` | student leader/member | new team workflow | `MISSING_FOR_MVP` | No runtime source | No client methods | No create/join/invite/leader/member form, status, or secure lookup |
| `/student/graduation-projects/$projectId` | student leader/member | `GraduationProjectWorkspace` plus team/decision/assignment views | `DEAD_OR_UNREACHABLE` | Draft `get_graduation_project_detail` client method | callback props only | Component is never imported by a route; team, decision, and supervisor identity are not rendered |
| `/faculty-portal/graduation-projects` | coordinator/supervisor/committee | `GraduationProjectsList` with actor-aware queues | `MISSING_FOR_MVP` | Draft list RPC only | none | No route, queue facets, query layer, navigation, or actor-specific empty states |
| `/faculty-portal/graduation-projects/$projectId` | coordinator/supervisor/committee | `GraduationProjectWorkspace` | `DEAD_OR_UNREACHABLE` | Draft detail RPC only | callback props only | No route/container; required assignment and acceptance flows are missing |
| `/faculty-portal/graduation-projects/proposals` | coordinator | `ProposalWorkflowPanel` | `DEAD_OR_UNREACHABLE` | Draft list/detail RPCs | Draft review RPC client | Panel exists only inside unreachable workspace; no review queue |
| `/faculty-portal/graduation-projects/defenses` | coordinator/committee | `DiscussionPanel`, `EvaluationPanel` | `DEAD_OR_UNREACHABLE` | Draft detail RPC | Some draft RPC client calls | No assigned-defenses list; panel assignment uses raw assignment ID; no file view/download |
| `/admin/graduation-projects` | authorized administration viewer | read-only overview, possibly narrowed `GraduationProjectReports` | `MISSING_FOR_MVP` | Four draft department report RPC clients | none | No route/guard/navigation; current report concept assumes operational assignment roles, not a distinct read-only viewer |

There are no alternate or hidden graduation-project routes. There are consequently no graduation-project routes without navigation; instead, all required routes and all corresponding navigation entries are absent.

# Student UI

| MVP area | Classification | Current evidence and minimum gap |
|---|---|---|
| Graduation-project dashboard | `MISSING_FOR_MVP` | `GraduationProjectsList` can render rows/filter state/risk, but is unreachable and has no dashboard query, loading/error state, coordinator decision summary, next action, or actor-aware cards. |
| Create or join team | `MISSING_FOR_MVP` | No component, form, hook, service method, or route. The draft SQL has coordinator-driven `add_graduation_project_team_member`; it is not a student join contract. |
| Team details | `MISSING_FOR_MVP` | Detail payload contains raw assignments, but workspace does not render team members, leader, invite/join state, or membership status. |
| Submit proposal | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | `CreateProjectForm` is explicitly for coordinators/department heads, takes only title/abstract, and is not routed. `ProposalWorkflowPanel` has submit/resubmit callbacks, but `GraduationProjectsRpcClient` lacks `submit_graduation_project_proposal`; editing returned proposal content is absent. |
| View coordinator decision | `MISSING_FOR_MVP` | Detail type includes `approvals`, but `GraduationProjectWorkspace` never renders it. Event history is not an adequate decision screen. |
| View assigned supervisor | `MISSING_FOR_MVP` | Raw assignments exist in detail but are not rendered as supervisor identity/contact/status. |
| Submit progress update | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | `MilestonesPanel` submits a text summary against an existing milestone. No routed query/mutation container, no update history oriented to students, and no binary attachment upload. |
| View supervisor feedback | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Supervisor notes are rendered with an empty state, but the component is unreachable and exposes no author display or notification/read status. |
| Upload final submission | `PLACEHOLDER` | UI explicitly says binary upload is suspended and only manually entered metadata is registered. This does not upload, hash, finalize, scan, or bind a real file. |
| View defense appointment | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Scheduled discussions render timestamp/venue, but only inside unreachable shared workspace; date is raw and there is no tailored student state. |
| View result and required revisions | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Corrections and archive panels render correction status, but no explicit result summary/score policy view and no route/container. |
| View archived final project | `PLACEHOLDER` | Archive metadata and object key can be shown; no authorized signed download/view action exists. |

The source does not distinguish a team leader from a team member. `studentActions()` gives every student assignment the same mutation set, so leader-only behavior cannot be represented in the UI mirror. Server authorization remains the required authority, but the UI still needs the actor distinction to present correct workflows.

# Coordinator UI

| MVP area | Classification | Current evidence and minimum gap |
|---|---|---|
| Project/teams list | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Generic list filters state and risk only. It does not show team composition, department/term, supervisor, pending action, or queues. |
| Proposal review queue | `MISSING_FOR_MVP` | No queue route, query key, filters, counts, pagination, loading, error, or empty-state container. |
| Accept/return/reject proposal | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Arabic controls and reason requirement exist and target one secure draft RPC method, but no runtime handler/container exists. Naming uses `approve` rather than mission wording `accept`, which is acceptable if policy confirms equivalence. |
| Assign supervisor | `MISSING_FOR_MVP` | Client method exists, but there is no UI form/candidate lookup. `CreateProjectForm` does not assign a supervisor. |
| View progress | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | List/workspace and milestones render progress, but no route/query/UX states. |
| Create defense appointment | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Form uses free-text ISO timestamp and venue. It lacks semantic datetime input, timezone/localization, validation, conflict feedback, and runtime handler. |
| Assign committee | `PLACEHOLDER` | Control asks the coordinator to type a raw assignment UUID and always submits `chair=false`; no candidate selector, chair assignment workflow, conflict state, or identity display. |
| Close/archive project | `MISSING_FOR_MVP` | Action matrix can expose `archive`, but `ResultCorrectionsArchivePanel` has no archive callback or archive button and the RPC client lacks `archive_graduation_project`. Closing/result conclusion is restricted to head/dean in the current model, not coordinator. The fixed ownership must be reconciled without creating a bypass. |

The reusable coordinator components are presentational foundations, not an operational coordinator UI.

# Supervisor UI

| MVP area | Classification | Current evidence and minimum gap |
|---|---|---|
| Assigned projects | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Generic direct-assignment list RPC and list component exist; no supervisor route/query/navigation. |
| Accept supervision | `MISSING_FOR_MVP` | No state, component, button, client method, or draft RPC for accept/decline supervision. Current assignment appears immediately active. |
| Review progress update | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Submitted milestones are shown and review controls exist, but no attachment view/download and no runtime integration. |
| Approve/return progress | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Accept/require-revision controls map to `review_graduation_project_submission`; missing route, handler, notification/refresh behavior, and retry UX. |
| Review final submission | `PLACEHOLDER` | Submission review exists generically, but final-file upload/download is absent and files show metadata/object key only. |

No supervisor-specific dashboard, acceptance status, or safe final-file review experience exists.

# Committee UI

| MVP area | Classification | Current evidence and minimum gap |
|---|---|---|
| Assigned defenses | `MISSING_FOR_MVP` | No route/list/query/navigation. Generic project list does not expose defense schedule or panel status. |
| View project and final file | `PLACEHOLDER` | Workspace can show project text and file metadata; no signed download or viewer, and runtime is unreachable. |
| Enter score and notes | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Evaluation form supports dynamic criteria, numeric validation, total, and comments. It starts from one synthetic empty criterion instead of an authoritative rubric and does not hydrate an existing draft. |
| Submit individual evaluation | `PARTIAL_FOR_MVP` source / `DEAD_OR_UNREACHABLE` runtime | Save/submit callback maps to draft secure RPC method through a hypothetical container; no route, mutation state, confirmation, success/error UX, or refetch. |

`resolveViewerEvaluation` correctly scopes “own evaluation” to the viewer's active committee assignment, and tests cover this regression. However, `EvaluationPanel` receives the full `detail.evaluations` array. It does not call `visibleEvaluations`; confidentiality therefore depends entirely on the draft detail RPC filtering correctly. That is appropriate only after the RPC is actually applied and verified; a UI route must not fetch broader rows directly.

# Administration UI

The authorized academic administration overview is `MISSING_FOR_MVP`.

`GraduationProjectReports` is a reusable, unreachable report card for states, assignments, evaluations, and archive metadata. Its data sources are explicitly draft-only department RPCs requiring active administrative project assignment. It is not a distinct read-only administration guard and cannot be mounted under the broad admin shell as an operational bypass.

Minimum MVP administration UI:

- one read-only overview route with explicit server-authorized scope;
- status counts/list and filters only;
- no review, assignment, scheduling, scoring, result, correction, or archive callbacks;
- clear loading/error/empty states;
- no file object keys, evaluation comments, raw user UUIDs, or sensitive detail unless separately authorized.

The current report component displays raw supervisor `user_id`, which is unsuitable as the primary identity label and should not be exposed to a read-only overview unless required and authorized.

# Navigation and Guards

- `src/routeTree.gen.ts` contains no graduation-project node.
- Student, staff, faculty, mobile-student, and admin navigation contain no graduation-project entry.
- Existing parent layouts authenticate their broad portal audience, but no graduation-project route-level actor/scope loader exists.
- `availableProjectActions(viewer_roles, state)` controls button visibility. Its own comment correctly identifies it as a UX mirror, not security. It cannot replace RPC authorization.
- The draft SQL/RPC model requires exact active direct assignment and has no broad admin/registrar bypass. No runtime path currently exercises that contract.
- The proposed administration viewer does not exist in `ProjectRole`; reusing `dean` would grant result/correction/archive actions in `availableProjectActions` and would violate “read-only/no operational bypass.”
- There are no literal buttons with empty `onClick` functions in the audited components. The larger problem is that every callback-based control lacks a mounted runtime owner, so no button is reachable or bound to a real mutation lifecycle.
- No feature flag, route availability response, or service-unavailable page is wired. `GraduationProjectsRpcError` can translate missing-function/schema-cache errors, but no UI consumes it.

# Forms and Validation

## Existing forms

- `CreateProjectForm`: title length 3–300 and abstract text; lacks program/year/semester inputs required by `createProject()`, making its callback payload structurally incomplete for that client method.
- `ProposalWorkflowPanel`: reason is required for return/reject; no editable proposal fields during resubmission and no decision-history view.
- `MilestonesPanel`: summary, review note, supervisor note, and manual file metadata; no schema library, field-level server errors, or real file input.
- `DiscussionPanel`: raw ISO timestamp, venue, rejection reason, and raw assignment UUID; no date parser, timezone, scheduling constraints, or candidate picker.
- `EvaluationPanel`: client-side criterion/score validation; does not load an authoritative rubric or existing draft scores, has no remove criterion control, and uses array index keys.
- `ResultCorrectionsArchivePanel`: correction text/due date; due date is untyped free text and archive has no action control.

## Duplication and form-state findings

- Discussion readiness is calculated/rendered in both `ProjectReadinessCard` and `DiscussionPanel`/`GraduationProjectWorkspace`; the standalone card exposes raw blocker codes while the panel maps Arabic labels. Keep one canonical renderer.
- Result/correction/archive concerns are combined in one panel and milestone/submission/note/file concerns in another. Reuse is possible, but actor-specific containers must not expose irrelevant sections.
- Shared scalar state is reused across repeated rows: one proposal review reason for all decisions, one delivery summary for all milestones, one review note for all submissions, one schedule/venue pair for all pending requests, one rejection reason for all pending requests, and one selected assignment ID for all discussions. This can submit a value against the wrong row when more than one row is displayed.
- Forms do not reset after success, preserve dirty state across refetch, show pending status per row, prevent double submission beyond a shared `busy` flag, or present mapped server errors.
- Arabic labels are broadly present. Remaining non-Arabic/raw UI includes role codes in the project list (`row.roles.join`), event/readiness fallbacks, raw UUIDs, raw timestamps, scan states in fallback paths, and technical metadata fields. These need localized display labels, not translated identifiers.

# Attachments

Current classification: `PLACEHOLDER` and **not MVP-ready**.

- No `<input type="file">`, upload hook, storage service, signed upload, signed download, download button, preview, progress, cancellation, retry, or malware-scan polling exists.
- `MilestonesPanel` asks users to manually type original filename, media type, byte size, SHA-256, and optional submission UUID. This is metadata registration, not upload.
- `buildPrivateObjectKey` creates a project-scoped private key and rejects traversal/public URLs, but no runtime caller uses it.
- The RPC client registers `objectKey`, while `RegisterFileFormInput` deliberately omits it; a missing route/container would have to invent the key/token and coordinate an upload that does not exist.
- Clean file `object_key` values are displayed as plain text in `MilestonesPanel`, and archived final object keys can be displayed in `ResultCorrectionsArchivePanel`. They are not clickable public URLs, but unnecessary key exposure should be removed from actor-facing UI.
- No `getPublicUrl` or persisted public URL usage was found in the graduation-project source. This is positive, but it does not provide an authorized private download flow.
- The only SQL is under `docs/migration-drafts`; it creates no bucket/storage policy. Storage remains closed and no production storage was accessed.

Minimum attachment implementation must follow: selected file validation → authorized project-scoped private upload contract → upload progress → server-side metadata/finalization → scan state → short-lived authorized download/view. Never store or display a public URL.

# Data Sources and Mutations

## Runtime data layer status

There are no graduation-project React Query hooks, server functions, query keys, invalidation rules, loaders, or mutation hooks. `GraduationProjectsRpcClient` is never instantiated or imported outside its own module/tests. Thus all source methods are dormant.

## Read methods

| Client method | RPC | Runtime status |
|---|---|---|
| `listMyProjects` | `list_my_graduation_projects` | Draft-only, unused |
| `getProjectDetail` | `get_graduation_project_detail` | Draft-only, unused |
| `getStatesReport` | `get_graduation_project_states_report` | Draft-only, unused |
| `getAssignmentsReport` | `get_graduation_project_assignments_report` | Draft-only, unused |
| `getEvaluationsReport` | `get_graduation_project_evaluations_report` | Draft-only, unused |
| `getArchiveReport` | `get_graduation_project_archive_report` | Draft-only, unused |

## Mutation assessment

Every mutation implemented in `src/lib/graduation-projects/rpc.ts` calls `client.rpc(...)`; none directly calls `.from(...).insert/update/delete/upsert`. This is the correct intended boundary. However, all targets exist only in docs migration drafts and are absent from applied `supabase/migrations`, so they cannot be treated as available backend contracts at this base.

Implemented client RPC wrappers: create project; review/resubmit/activate proposal; assign/end faculty assignment; submit/review deliverable; add/resolve supervisor note; register file metadata; schedule/reject defense request; assign panel member; record defense outcome; save evaluation; conclude result; complete/accept correction.

Draft RPCs with no client wrapper and therefore no viable UI handler include:

- `submit_graduation_project_proposal`;
- `add_graduation_project_team_member`;
- `set_graduation_project_milestone`;
- `request_graduation_project_discussion`;
- `finalize_graduation_project_evaluation`;
- `archive_graduation_project`.

There is no draft/client contract for student self-serve create/join team or supervisor accept supervision. These are backend-contract blockers, not gaps the UI should work around with direct table writes.

# Responsive and RTL

## RTL

- Most graduation-project roots set `dir="rtl"`, and Arabic copy is dominant.
- LTR is correctly used for some IDs, hashes, and timestamp inputs.
- The components depend on local `dir` attributes because there is no routed shell context. A mounted screen must verify inherited RTL and logical spacing end to end.
- Raw roles, UUIDs, timestamps, object keys, and fallback codes remain mixed-direction risks. Use isolated LTR spans (`dir="ltr"`) with localized surrounding labels.

## Responsive/mobile blockers

- `GraduationProjectsList` and all report tables have no explicit horizontal scroll wrapper or mobile card alternative; six-column tables will overflow narrow screens.
- Workspace and report `TabsList` instances contain four/five tabs with no wrap/scroll treatment, a likely narrow-screen overflow blocker.
- Evaluation score inputs use a horizontal `flex` row without a small-screen stack.
- Schedule and committee controls rely on dense shared forms and raw identifiers; they are not usable touch workflows.
- There are no graduation-project routes in the mobile student portal and no responsive component tests or viewport evidence.

The use of `flex-wrap` in many button groups is positive but insufficient to establish mobile readiness.

# Tests

## Existing tests

- `tests/graduation-projects/graduation-projects-foundation.test.ts`: pure domain authorization, transitions, progress, private key, readiness, report summary.
- `tests/graduation-projects/graduation-projects-lifecycle.test.ts`: action matrix, evaluation visibility/scoring, keys, corrections, filters, labels, viewer-scoped evaluation.
- Two draft-SQL contract test files inspect source text and client/draft alignment.
- Two PostgreSQL verifier scripts and recorded result documents exercise draft SQL against disposable PostgreSQL, not this application's routed UI.
- `tests/contracts/graduation-projects-mvp-audit-report.test.ts` validates a prior audit artifact, not runtime UI.

Current focused result on the required base:

```text
bun test tests/graduation-projects
42 pass, 0 fail, 437 expect() calls
```

## Missing tests

- No component render/interactions tests for any graduation-project component.
- No route tests because no routes exist.
- No React Query loading/error/empty/refetch/concurrency tests.
- No positive/negative browser-to-RPC authorization matrix for each actor.
- No navigation/guard tests, accessibility tests, RTL visual tests, responsive tests, or attachment upload/download tests.
- Existing direct PostgreSQL authorization evidence applies to draft SQL only. Per repository policy, E2E must not start until the applied backend contract and complete positive/negative direct-RPC matrix are available in a safe environment.
- `bun run security:test` was not run: this docs-only audit did not have an explicitly verified safe non-production connected environment, and production substitution is forbidden.
- Full `tsc`/build were not required because no runtime file changed. The focused test was run to report current source health.

# Missing for MVP

The minimum blockers, in dependency order, are:

1. An applied, separately authorized non-production backend contract matching the fixed actor model. Current RPCs are draft-only; UI must not call tables directly.
2. Explicit contracts for student team create/join/leader semantics and supervisor acceptance; neither can be inferred from current assignments.
3. Read-only academic administration authorization distinct from operational `department_head`/`dean` powers.
4. Runtime client factory/server adapter, stable query keys, actor-scoped queries/mutations, mapped errors, safe retries, and invalidation.
5. Reachable student and faculty routes plus route loaders/guards and navigation entries.
6. Student dashboard/team detail/decision/supervisor views.
7. Coordinator queue, supervisor assignment picker, defense scheduling, committee candidate/role picker, and an actual authorized archive control.
8. Supervisor acceptance and assigned-work queue.
9. Committee assigned-defense queue and authoritative rubric hydration.
10. Private binary upload, scan, and signed download/view flow for final submission and defense review.
11. Loading/error/empty/success states, per-row pending state, accessible validation, Arabic formatting, RTL isolation, and responsive tables/tabs/forms.
12. Component/integration tests followed by direct RPC positive/negative authorization verification for the correct assigned actor and every other role; only then safe E2E.

Mock/placeholder findings are limited and explicit: no mock project arrays or fake dashboard metrics were found, but the evaluation form seeds a local empty criterion (`c1`), committee assignment is a raw-ID placeholder, and file upload is metadata-only placeholder behavior. No production/test project records were accessed.

# Exact Files

## Existing source inspected as the graduation-project UI surface

- `src/components/graduation-projects/CreateProjectForm.tsx`
- `src/components/graduation-projects/DiscussionPanel.tsx`
- `src/components/graduation-projects/EvaluationPanel.tsx`
- `src/components/graduation-projects/GraduationProjectReports.tsx`
- `src/components/graduation-projects/GraduationProjectsList.tsx`
- `src/components/graduation-projects/GraduationProjectStateBadge.tsx`
- `src/components/graduation-projects/GraduationProjectWorkspace.tsx`
- `src/components/graduation-projects/MilestonesPanel.tsx`
- `src/components/graduation-projects/ProjectReadinessCard.tsx`
- `src/components/graduation-projects/ProposalWorkflowPanel.tsx`
- `src/components/graduation-projects/ResultCorrectionsArchivePanel.tsx`
- `src/lib/graduation-projects/domain.ts`
- `src/lib/graduation-projects/lifecycle.ts`
- `src/lib/graduation-projects/rpc.ts`

## Routing/navigation/guard surfaces inspected

- `src/routeTree.gen.ts`
- `src/routes/student.tsx`
- `src/routes/student.index.tsx`
- `src/routes/mobile.student.tsx`
- `src/routes/mobile.student.index.tsx`
- `src/routes/faculty-portal.tsx`
- `src/routes/faculty-portal.index.tsx`
- `src/routes/staff.tsx`
- `src/routes/staff.index.tsx`
- `src/routes/admin.tsx`
- `src/components/portal/FacultyPortalShell.tsx`
- `src/components/admin/AdminShell.tsx`
- `src/lib/admin-nav.ts`

## Contract/design/test evidence inspected

- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`
- `docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`
- `docs/GRADUATION-PROJECTS-MVP-FOUNDATION-01-REPORT.md`
- `docs/GRADUATION-PROJECTS-COMPLETION-01-REPORT.md`
- `tests/graduation-projects/graduation-projects-foundation.test.ts`
- `tests/graduation-projects/graduation-projects-lifecycle.test.ts`
- `tests/graduation-projects/graduation-projects-sql-draft.test.ts`
- `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts`
- `tests/graduation-projects/postgres-foundation-verifier.sql`
- `tests/graduation-projects/postgres-lifecycle-verifier.sql`
- `tests/graduation-projects/POSTGRES-17-VERIFICATION-RESULT.md`
- `tests/graduation-projects/POSTGRES-17-LIFECYCLE-VERIFICATION-RESULT.md`
- `tests/contracts/graduation-projects-mvp-audit-report.test.ts`
- `src/lib/reports/catalog/entries.ts`

## File changed by this audit

- `docs/PORTAL-GRADUATION-PROJECTS-MVP-UI-CURRENT-STATE-AUDIT-01.md`

# Recommended Implementation Tasks

Minimum implementation order; each task is source-scoped until separately authorized:

1. **Freeze UI/backend actor contracts.** Define team leader/member transitions, supervisor acceptance, coordinator close/archive ownership, administration read-only scope, rubric source, and private attachment API. Do not create UI workarounds for missing RPCs.
2. **Make backend availability a hard gate.** Promote only reviewed RPC contracts through the repository's separate migration process and prove direct positive/negative authorization in a safe environment. No production connection and no direct table mutation.
3. **Add the runtime data adapter.** Instantiate the RPC client behind authenticated portal adapters; add project/detail/report query keys, typed mutation hooks, correlation IDs, per-action errors, retries, and precise invalidation.
4. **Add route shells and guards.** Create student list/detail/team routes, faculty list/detail/queue/defense routes, and a separate read-only administration overview. Route loaders fetch server-authorized viewer roles; UI action mirrors remain secondary.
5. **Deliver the student vertical slice.** Dashboard → create/join team → team details → editable proposal submit/resubmit → decision/supervisor → progress/feedback. This proves identity and lifecycle before files.
6. **Deliver coordinator operations.** Team/project list and proposal queue → decision → supervisor selection/assignment → progress → defense appointment → committee selection. Use identity selectors, never raw UUID entry.
7. **Deliver supervisor operations.** Assigned projects → accept/decline contract → progress/final review → accept/return and feedback.
8. **Deliver private attachments.** Real final-file upload, progress, finalization, scan state, and authorized signed view/download. Remove actor-facing object-key display.
9. **Deliver committee evaluation.** Assigned defenses → project/final file → server-provided rubric → draft/submit individual evaluation with viewer scoping and immutable submitted state.
10. **Deliver result/archive and administration overview.** Result/revisions/archive actions only for the explicitly authorized operational actor; administration stays read-only.
11. **Harden UX.** Canonical Arabic labels/date formatting, RTL isolation, mobile table/tab alternatives, per-row form state, loading/error/empty/success/disabled states, accessibility, and confirmation for irreversible submissions.
12. **Verify in order.** Component tests → route/data integration tests → direct safe RPC ALLOW/DENY matrix for all roles → only then E2E. Run mandatory typecheck, focused tests, safe security tests when environment identity is proven, build, and `git diff --check`.

# Out of Scope

- Migration application or modification of applied migrations.
- Production/staging data creation, cleanup, backfill, or mutation.
- Bucket creation, storage policy deployment, or use of public URLs.
- Deployment, publish, feature activation, or payment behavior.
- Notifications, appeals, grade writeback, plagiarism tooling, analytics beyond the named read-only overview, or new report families.
- Global admin/registrar/dean bypass or any operational authority inferred from title alone.
- Changes to `request_types.student_visible`.
- Unnecessary visual redesign, mobile-native feature expansion, or modifications to protected `enrollment_certificate` behavior.

# Final Decision

**HOLD_GRADUATION_PROJECTS_MVP_UI_NO_RUNTIME_ROUTES_OR_INTEGRATION**

The reusable source components and draft RPC wrapper materially reduce future implementation work, and the focused source tests pass. They do not constitute an MVP UI: zero routes are reachable, zero runtime queries/mutations are wired, multiple fixed actor workflows have no contract/component, attachments are metadata-only, and administration read-only separation is absent.

Production impact: **ZERO**. This audit changes documentation only, does not connect to production, and does not authorize implementation, migration application, deployment, publication, or feature activation.

Audit disposition: **HOLD** until the exact missing contracts and minimum routed vertical slices above are implemented and verified in the required order.
