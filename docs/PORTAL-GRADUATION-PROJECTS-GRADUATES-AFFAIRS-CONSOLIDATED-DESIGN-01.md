# PORTAL-GRADUATION-PROJECTS-GRADUATES-AFFAIRS-CONSOLIDATED-DESIGN-01

Mission: PORTAL-GRADUATION-PROJECTS-AND-GRADUATES-AFFAIRS-OVERNIGHT-MASTER-01
Base: origin/main @ 6393f3d4 + this branch's consolidation commits.
Status of every element is marked: [MAIN] pre-existing on main, [PORTED] integrated by this
mission from the audited k3 / review branches, [DRAFT] source-only SQL (NOT_APPLIED), [BLOCKED]
awaiting a documented product decision.

---

## 1. Design principles (binding)

1. Canonical portal tables are reused; no duplicate profile/program/department/academic-year/user
   tables are created by either module. Graduation-projects SQL references `departments` and
   faculty/student identity via the portal's existing profile tables (composite FKs
   `(id, department_id)` bind every child row to the same project and department).
2. Deny by default. RLS is enabled on every module table with zero permissive policies; all
   table grants are revoked from `anon`/`authenticated`. All access flows through narrowly
   authorized `security definer` RPCs with pinned `search_path = public, pg_temp`.
3. No broad admin/dean/registrar bypass. Authority derives from explicit, active, directly-assigned
   rows (`graduation_project_assignments`), checked inside the RPCs via
   `require_graduation_project_assignment(...)`.
4. UI hiding is never authorization. Client action matrices (`availableProjectActions`) are UX
   mirrors only; every write re-validates actor identity (auth.uid()), role, ownership,
   department scope, lifecycle state and input server-side.
5. SQL stays source-only (`.NOT_APPLIED.sql`) until an authorized operator runs the documented
   promotion sequence. Nothing in this branch applies a migration.

## 2. Graduation Projects architecture

### 2.1 Entities [DRAFT M1–M8]
- Enums: `graduation_project_state` (14 states), `graduation_project_assignment_role`
  (student/supervisor/co_supervisor/coordinator/department_head/dean/panel_member).
- Tables (15, M1): `graduation_projects`, `graduation_project_assignments`,
  `graduation_project_approvals`, `graduation_project_milestones`,
  `graduation_project_submissions`, `graduation_project_supervisor_notes`,
  `graduation_project_files`, `graduation_project_discussion_requests`,
  `graduation_project_discussions`, `graduation_project_panel_members`,
  `graduation_project_evaluations`, `graduation_project_evaluation_scores`,
  `graduation_project_corrections`, `graduation_project_final_archives`,
  `graduation_project_events` (append-only audit via trigger).
- M4 additions: file scan-state columns, `graduation_project_rubrics`,
  `graduation_project_rubric_criteria`, `graduation_project_notification_log`; partial unique
  indexes (one active supervisor, one pending discussion request, one panel chair).
- M6 additions: `graduation_project_settings` (per-department team size, supervisor capacity,
  proposal window; RPC-only access).
- View: `graduation_project_reporting` (`security_invoker=true`, revoked from clients).

### 2.2 Lifecycle [MAIN domain.ts / DRAFT M1–M2]
`draft → submitted → under_review → approved → active → discussion_requested →
discussion_scheduled → evaluating → completed → archived`, with `revision_required`,
`corrections_required`, `rejected`, `cancelled` (reserved) branches. Immutable terminal states
permit only `read`/`read_report`. All transitions enforced inside RPCs with `FOR UPDATE` row
locks, version guards and correlation-id idempotency.

### 2.3 Access model [MAIN + PORTED]
- Students: own team/project state only (assignment row role `student`).
- Supervisors/co-supervisors: assigned projects only.
- Panel members: assigned projects; own evaluation drafts; students see only finalized
  evaluations (and only at result states, per portal-privacy redaction).
- Coordinator/department_head: own department only (composite FK + assignment checks).
- Dean: read/report level per assignment; no blanket bypass.
- Admin: portal capability-gated admin workspace; roster candidate listing is manager-gated
  (GP-09-MED-1 fix).
- Server functions (`portal.functions.ts`, 25+ createServerFn wrappers) never accept actor ids
  from the client; `auth.uid()` is authoritative inside the RPCs.

### 2.4 RPC surface [DRAFT M1–M8, consumed by src/lib/graduation-projects/rpc.ts]
19 write RPCs (create/review/resubmit proposal, activate, assign/end faculty, submit/review
deliverable, supervisor notes, register file metadata, schedule/reject discussion, assign panel,
record outcome, save evaluation, conclude result, complete/accept correction) + 6 read/report
RPCs (my projects, project detail, states/assignments/evaluations/archive reports) + settings,
rubric, notifications and orphan-file review RPCs (service-only where marked).
GP-07-HIGH-1: result conclusion requires panel completeness (M7). GP-08: defense cannot be
recorded held with incomplete panel (M8).

### 2.5 Files and notifications [DRAFT M4–M5]
- Binary upload deliberately disabled pending storage-policy approval; only file metadata
  registration with 10-kind stage binding and private object-key contract
  (`buildPrivateObjectKey`); files accessible only when scan state is `clean`.
- Notification fan-out trigger with dedupe key and actor exclusion;
  `list_my_graduation_project_notifications`. Reminder scheduling is a rollout-time operator
  decision (no scheduler in repo).

### 2.6 Routes and navigation [PORTED]
- `/student/graduation-project{,/$projectId}` — student workspace.
- `/faculty-portal/graduation-projects{,/$projectId}` — supervisor/panel workspace.
- `/admin/graduation-projects{,/$projectId}` — coordinator/department admin workspace + reports.
- Additive nav entries in AdminShell, admin-nav, student.index, faculty-portal.index; routeTree
  regenerated additively. Each route resolves viewer roles server-side and renders
  loading/error/empty/service-unavailable states (PortalRuntimeStates, availability probe —
  fail-closed when RPCs are absent, i.e. before any promotion).

### 2.7 Reporting, audit, archive [MAIN + DRAFT]
- 4 department reports via RPCs (states/assignments/evaluations/archive); 4 further catalogued
  reports remain without data source (`pending:graduation_projects_report_roles`) [BLOCKED].
- Audit: append-only `graduation_project_events` (33 event types, Arabic labels in lifecycle.ts).
- Archive: `graduation_project_final_archives` + `archive_graduation_project` RPC;
  corrections archive panel.

## 3. Graduates Affairs architecture

### 3.1 Entities [DRAFT foundation + completion]
- Enums: decision state, source kind, employment status, specialization relationship,
  opportunity state, follow-up state, account policy state.
- Tables (14+3): `graduate_official_decisions` (immutable ledger, sha256 payload,
  UNIQUE(source_kind, source_reference)), `graduate_records` (one current award partial unique),
  `graduate_profiles`, `graduate_contact_points` (raw email/phone isolated in `protected_value`,
  pending approved protection mechanism), `graduate_consents` (append-only), `graduate_employers`,
  `graduate_employment_events` (append-only, correction by supersession), `graduate_opportunities`,
  `graduate_surveys`(+ immutable published versions, consent-guarded responses),
  `graduate_events`(+ consent-guarded registrations), `graduate_domain_events` (audit),
  `graduate_followups` (one active per graduate), `graduate_communication_events`,
  `graduate_account_continuity_policies` (immutable once decided, supersede model).
- RLS enabled on all tables with zero policies (default deny); both security-definer functions
  revoked from all client roles pending the G4 authorization package [BLOCKED].

### 3.2 Contract layer [MAIN] and presentation [MAIN + PORTED]
- `src/lib/graduates-affairs/` — pure, fail-closed contracts mirroring SQL guards:
  record creation only from approved official decisions; purpose+version consents; employment
  timeline integrity; consent-gated communications/surveys; aggregate-only survey results;
  cohort reports with minimum cell size 5 and aggregate-safety assert; D-13 account continuity
  default-deny.
- 4 panels (file card, communication, survey, reports) — presentational only, no network calls;
  visual/UX/privacy QA hardening ported by this mission (Arabic purpose labels, ar-EG dates,
  no raw UUIDs/machine keys, submit lock, suppressed-cell aria labels, mobile collapse) plus a
  416-line privacy non-regression guard test.

### 3.3 Privacy boundaries (enforced by contract and test)
- Raw contact values never leave `graduate_contact_points.protected_value`; views carry
  channel/purpose/verification state only.
- Graduate self-service, staff ALLOW/DENY matrix, EXECUTE grants: all part of the G4 package
  [BLOCKED — documented product decision; not invented by this mission].
- Row-level exports prohibited until purpose-scoped expiring assignments + audited approval exist.

### 3.4 Roles
- Staff functional roles `graduate_affairs_manager` / `graduate_affairs_specialist` exist in
  `src/lib/staff-functional-roles.ts` with `appRoleFallback: "student_affairs"`; no new role enum
  is introduced. The `graduate_affairs` unit label conflict (alumni vs postgraduate affairs) is
  documented as NEEDS_PRODUCT_DECISION and left untouched.

## 4. Shared integration

- Identity/org: canonical `departments`, `programs`, student/faculty/staff profiles and academic
  years are referenced, never duplicated.
- Navigation: graduation-projects wired into admin/student/faculty shells (additive, role-gated);
  graduates-affairs has no routes anywhere in repo evidence — none created (G4 dependency).
- Notifications: graduation-projects fan-out is source-only (M5); no production execution.
- Reports catalog: GP entries partially sourced; ALU entries remain
  `pending:g4_authorization_package`.
- Mobile/PWA/RTL: all ported components follow the existing Tailwind RTL design system; QA suites
  assert logical CSS properties, aria labels, keyboard/touch targets and 360px layouts.
- routeTree.gen.ts: regenerated additively; no hand edits.

## 5. Verification architecture

- bun suites: domain/lifecycle/action-matrix, SQL-draft content contracts, authorization closure,
  security audit invariants, hardening, admin settings, files/notifications, E2E portal journeys,
  portal integration, visual-UX QA (155 tests) + graduates-affairs suites (44 tests).
- Disposable PostgreSQL 17 chain (`tests/graduation-projects/run-pg17-migration-package.sh`):
  preflight → apply draft → verifier per migration, with full verifier re-runs after every step;
  verifiers end in ROLLBACK; container destroyed on exit. Includes the 68-row direct-RPC
  authorization matrix and the 53-step isolated E2E.
