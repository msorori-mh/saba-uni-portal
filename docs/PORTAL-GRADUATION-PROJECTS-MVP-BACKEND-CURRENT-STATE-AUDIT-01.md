# Decision

**HOLD_GRADUATION_PROJECTS_MVP_BACKEND_SOURCE_DRAFTS_ONLY_FIXED_MVP_GAPS**

At required base HEAD `b71016d6f706cfe01dd1f402338e5d56a83184d8`, the Graduation Projects backend is **not production-ready**. A rich **source-only** draft schema/RPC/lifecycle exists under `docs/migration-drafts/`, with matching TypeScript domain/UI and disposable PostgreSQL verifiers. There is **zero** `graduation_project*` object in `supabase/migrations/` or `src/integrations/supabase/types.ts`. No repository evidence proves production apply. The draft lifecycle is also **misaligned** with the fixed MVP contract (missing team leader, one-active-team-per-student, structured proposal fields + attachment, supervisor acceptance, `passed`/`failed` finals, private storage bucket).

This audit is SOURCE-ONLY / READ-ONLY / DOCS-ONLY. No SQL, migrations, runtime edits, production access, or apply were performed.

---

# Repository Identity

| Field | Value |
|---|---|
| Remote | `https://github.com/msorori-mh/saba-uni-portal.git` (`origin`) |
| Workspace | `C:\projects\saba-gp-mvp-backend` |
| Required base HEAD | `b71016d6f706cfe01dd1f402338e5d56a83184d8` |
| Observed HEAD at audit start | `b71016d6f706cfe01dd1f402338e5d56a83184d8` (match) |
| Branch | `docs/gp-mvp-backend-audit-01` |
| Mission | `PORTAL_GRADUATION_PROJECTS_MVP_BACKEND_CURRENT_STATE_AUDIT_01` |
| Mode | LONG SOURCE AUDIT · READ-ONLY · DOCS-ONLY OUTPUT |

HEAD message at audit: `Released B1 five services`.

---

# MVP Boundary

## Fixed lifecycle (in scope)

```
team
→ proposal
→ coordinator review
→ supervisor assignment and acceptance
→ basic progress follow-up
→ final submission
→ defense scheduling and committee
→ committee evaluation and final decision
→ archive
```

## In MVP (must be deliverable)

1. One active graduation-project team per student
2. Team leader and members
3. Proposal: title, problem, objectives, summary, one proposal attachment
4. Coordinator: accept / return with comments / reject
5. Assign exactly one supervisor
6. Supervisor accepts supervision
7. Basic progress submissions with supervisor approve/return
8. Final submission with private attachment
9. Defense date and committee members
10. Committee scores and final decision
11. Final states: `passed`, `revisions_required`, `failed`
12. Archive final project, members, supervisor, result, and final file

## Strictly out of scope

companies/external orgs · public gallery · competitions · funding/incubation · AI · plagiarism · intelligent supervisor matching · mentoring · graduate affairs · advanced analytics · public APIs · messaging/chat · complex task management · mobile application

---

# Existing Backend Inventory

Classification key used below:

- **PRESENT_IN_CURRENT_SOURCE** — exists as committed runtime/docs/test source in this HEAD
- **SOURCE_ONLY_NOT_PROVEN_APPLIED** — exists as draft SQL / verifier / design; not in `supabase/migrations`; not proven applied
- **LEGACY_OR_PARTIAL** — design names or partial concepts superseded/incomplete relative to fixed MVP
- **UNRELATED** — similarly named portal capabilities that must not be overloaded
- **MISSING_FOR_MVP** — required by fixed MVP and absent (or absent as authoritative applied backend)

## A. Applied migrations (`supabase/migrations/`)

| Object | Classification | Evidence |
|---|---|---|
| Any `graduation_projects` / `graduation_project_*` table | **MISSING_FOR_MVP** | `rg` over `supabase/migrations` → zero matches |
| Any `graduation_project_*` enum/function/RPC/policy/trigger | **MISSING_FOR_MVP** | same |
| GP storage bucket | **MISSING_FOR_MVP** | no migration creates GP bucket |

**Explicit finding:** there is **no** `create table public.graduation_projects` (or any GP object) in applied source migrations at this HEAD.

## B. Generated database types

| Object | Classification | Evidence |
|---|---|---|
| `graduation_project*` in `src/integrations/supabase/types.ts` | **MISSING_FOR_MVP** | zero matches |

## C. Migration drafts (`docs/migration-drafts/`)

Both drafts declare `DRAFT ONLY — DO NOT APPLY`.

### Enums — SOURCE_ONLY_NOT_PROVEN_APPLIED

| Enum | Values | File |
|---|---|---|
| `graduation_project_state` | `draft`, `submitted`, `under_review`, `revision_required`, `approved`, `active`, `discussion_requested`, `discussion_scheduled`, `evaluating`, `corrections_required`, `completed`, `archived`, `rejected`, `cancelled` | `GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` |
| `graduation_project_assignment_role` | `student`, `supervisor`, `coordinator`, `department_head`, `dean`, `panel_member` | same |

### Tables (15) — SOURCE_ONLY_NOT_PROVEN_APPLIED

| Table | Role |
|---|---|
| `graduation_projects` | Root project + proposal title/abstract + lifecycle state/version |
| `graduation_project_assignments` | Unified student/faculty assignment (`role`, active interval, generated `processing_unit_id`/`processing_role`) |
| `graduation_project_approvals` | Stage decisions (`approved`/`rejected`/`revision_required`) |
| `graduation_project_milestones` | Progress/final milestones with weight/status |
| `graduation_project_submissions` | Versioned deliverables |
| `graduation_project_supervisor_notes` | Supervisor notes |
| `graduation_project_files` | Private object-key metadata + scan state |
| `graduation_project_discussion_requests` | Defense/discussion request |
| `graduation_project_discussions` | Schedule (`starts_at`, `venue`) |
| `graduation_project_panel_members` | Committee members |
| `graduation_project_evaluations` | Panel evaluations |
| `graduation_project_evaluation_scores` | Criterion scores |
| `graduation_project_corrections` | Post-defense corrections |
| `graduation_project_final_archives` | Archive row + final file FK |
| `graduation_project_events` | Append-only domain audit events |

### View — SOURCE_ONLY_NOT_PROVEN_APPLIED

- `graduation_project_reporting` (security_invoker; grants revoked)

### Check-constrained text states (not enums) — SOURCE_ONLY_NOT_PROVEN_APPLIED

| Surface | Values |
|---|---|
| approvals.decision | `approved`, `rejected`, `revision_required` |
| milestones.milestone_kind | `progress`, `final` |
| milestones.status | `pending`, `in_progress`, `submitted`, `accepted`, `late` |
| submissions.state | `submitted`, `accepted`, `revision_required`, `superseded` |
| files.scan_state | `pending`, `clean`, `quarantined`, `rejected` |
| discussion_requests.state | `pending`, `approved`, `rejected`, `cancelled` |
| discussions.state | `scheduled`, `held`, `postponed`, `cancelled` |
| evaluations.state | `draft`, `submitted`, `finalized` |

### Constraints / indexes (draft) — SOURCE_ONLY_NOT_PROVEN_APPLIED

- Composite project/department uniqueness and composite FKs binding child rows to same project
- Unique active assignment index: `(project_id, role, user_id) WHERE active`
- Unique milestone `(project_id, sequence_no)`; unique submission `(milestone_id, version_no)`
- Unique file `object_key`; archive unique on `project_id` and `correlation_id`
- Events unique `(project_id, correlation_id, event_type)`
- **Absent vs fixed MVP:** no unique active membership per `student_profile_id` across projects; no “exactly one active supervisor per project”; no team-leader flag/role; no proposal-attachment cardinality

### Triggers / helpers — SOURCE_ONLY_NOT_PROVEN_APPLIED

| Object | Purpose |
|---|---|
| `guard_graduation_project_assignment` + trigger | Identity/department shape check |
| `reject_graduation_project_event_mutation` + trigger | Append-only events |
| `graduation_project_is_discussion_ready(uuid)` | Readiness predicate (execute revoked from clients) |
| `require_graduation_project_assignment(uuid, role[])` | Internal SECURITY DEFINER assignment gate (execute revoked from clients) |

### RLS — SOURCE_ONLY_NOT_PROVEN_APPLIED

- RLS enabled on all 15 tables
- **No `CREATE POLICY`** → default deny for table DML/SELECT by clients
- `REVOKE ALL` from `anon`/`authenticated` on tables and reporting view
- Intended access path: narrowly granted SECURITY DEFINER RPCs only

### RPCs — SOURCE_ONLY_NOT_PROVEN_APPLIED

**Foundation draft**

| RPC | Purpose |
|---|---|
| `submit_graduation_project_proposal` | draft → submitted |
| `add_graduation_project_team_member` | add student assignment |
| `set_graduation_project_milestone` | create milestone |
| `request_graduation_project_discussion` | active → discussion_requested |
| `finalize_graduation_project_evaluation` | panel eval finalize |
| `archive_graduation_project` | completed → archived |

**Lifecycle completion draft**

| RPC | Purpose |
|---|---|
| `create_graduation_project` | create project (+ bootstrap assignment propagation) |
| `review_graduation_project_proposal` | start_review / approve / reject / require_revision |
| `resubmit_graduation_project_proposal` | revision_required → submitted |
| `activate_graduation_project` | approved → active |
| `assign_graduation_project_faculty` | supervisor/coordinator/panel_member |
| `end_graduation_project_assignment` | end active assignment |
| `submit_graduation_project_deliverable` | progress/final submission |
| `review_graduation_project_submission` | supervisor accept/return |
| `add_graduation_project_supervisor_note` / `resolve_…` | notes |
| `register_graduation_project_file` | private file metadata |
| `schedule_graduation_project_discussion` / `reject_…_request` | defense schedule |
| `assign_graduation_project_panel_member` | committee |
| `record_graduation_project_discussion_outcome` | held/postponed/cancelled |
| `save_graduation_project_evaluation` | scores |
| `conclude_graduation_project_result` | `completed` \| `corrections_required` only |
| `complete_graduation_project_correction` / `accept_…` | corrections loop |
| `list_my_graduation_projects` / `get_graduation_project_detail` | reads |
| `get_graduation_project_states_report` / `_assignments_report` / `_evaluations_report` / `_archive_report` | department reports |

## D. Runtime TypeScript — PRESENT_IN_CURRENT_SOURCE

| Path | Notes |
|---|---|
| `src/lib/graduation-projects/domain.ts` | States, roles, transition matrix, readiness, private key helper |
| `src/lib/graduation-projects/lifecycle.ts` | UX action mirror, labels, detail/report types (non-authoritative auth) |
| `src/lib/graduation-projects/rpc.ts` | Typed client for **draft** lifecycle/read RPCs; maps missing DB function (`42883`) to “service updating” |
| `src/components/graduation-projects/*` (11 components) | Unrouted UI panels |

**Client gap:** `rpc.ts` does **not** wrap foundation RPCs `submit_graduation_project_proposal`, `add_graduation_project_team_member`, `set_graduation_project_milestone`, `request_graduation_project_discussion`, `finalize_graduation_project_evaluation`, `archive_graduation_project`, despite comment claiming merged foundation surface.

## E. Routes / activation

| Object | Classification | Evidence |
|---|---|---|
| GP workspace/list/create routes | **MISSING_FOR_MVP** | `src/routes` has zero `GraduationProject` / `graduation-projects` mounts |
| Feature flag / activation | **MISSING_FOR_MVP** | foundation/completion reports explicitly no feature activation |

## F. Adjacent portal objects (reusable patterns only)

| Object | Classification | Safe conclusion |
|---|---|---|
| `student_profiles`, `faculty_profiles`, `departments`, programs/years/semesters | **PRESENT_IN_CURRENT_SOURCE** (portal core) | Reuse identity/scope; not a GP store |
| Generic `notifications` | **UNRELATED** until GP event vocabulary approved | No GP notification mapping in source |
| `audit_logs` / `log_audit` | **UNRELATED** / not bridged for GP | GP uses draft `graduation_project_events` only |
| `student_requests` / `official_documents` | **UNRELATED** | Must not become the project store |
| Council topics/votes/attachments | **UNRELATED** | Not defense/committee model |
| `/admin/graduation-candidates` | **UNRELATED** | Degree candidates, not GP teams |
| Graduates-affairs draft domain (`graduate_*`) | **UNRELATED** | Distinct alumni domain; name similarity only |

## G. Design-name leftovers — LEGACY_OR_PARTIAL

Early design report (`docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`) proposed separate tables `graduation_project_members`, `_supervisors`, `_submission_files`. Implemented drafts supersede these with unified `graduation_project_assignments` + `graduation_project_files`. Treat design names as **LEGACY_OR_PARTIAL**, not second schema.

---

# Existing Lifecycle

## Draft/runtime state machine (reconstructed)

Canonical states (`domain.ts` + draft enum):

```
draft → submitted → under_review → (revision_required | approved | rejected)
revision_required → submitted
approved → active
active → discussion_requested
discussion_requested → (discussion_scheduled | active via reject)
discussion_scheduled → evaluating (held) | active (cancelled)
evaluating → (completed | corrections_required)
corrections_required → evaluating (all corrections accepted)
completed → archived
```

`cancelled` exists in the enum and TS transitions but **no RPC produces it** (documented reserved). `rejected` is produced by proposal review only.

### Transition ownership (draft RPCs)

| Transition | Actor roles | RPC |
|---|---|---|
| draft → submitted | student | `submit_graduation_project_proposal` |
| submitted → under_review | coordinator / department_head | `review_…` `start_review` |
| * → revision_required / rejected | coordinator / department_head | `require_revision` / `reject` |
| under_review → approved | coordinator / department_head | `approve` |
| revision_required → submitted | student | `resubmit_…` |
| approved → active | coordinator / department_head | `activate_…` |
| active → discussion_requested | student / supervisor | `request_…_discussion` |
| discussion_requested → discussion_scheduled | coordinator / department_head | `schedule_…` |
| discussion_scheduled → evaluating | coordinator / department_head | outcome `held` |
| evaluating → completed / corrections_required | department_head / dean | `conclude_…_result` |
| completed → archived | department_head / dean | `archive_…` |

### Side workflows (not root-state transitions)

Team member add · faculty assign/end · milestones · deliverable submit/review · supervisor notes · file register · panel assign · evaluation save/submit/finalize · corrections complete/accept

## Mapping to fixed MVP lifecycle

| Fixed MVP stage | Draft coverage | Gap |
|---|---|---|
| team | Partial via `role=student` assignments | No leader; no one-active-team-per-student |
| proposal | Partial (`proposal_title`, nullable `proposal_abstract`) | Missing problem/objectives/summary; missing one proposal attachment |
| coordinator review | Present (approve / require_revision / reject + start_review) | Extra `under_review` + separate `activate` step |
| supervisor assignment and acceptance | Partial assign only | No pending/accept state; not constrained to exactly one |
| basic progress follow-up | Present (milestones + submit/review) | — |
| final submission | Partial (`milestone_kind=final` + file metadata) | No private bucket/upload pipeline |
| defense scheduling and committee | Present as “discussion” + panel | Naming differs; functionally close |
| committee evaluation and final decision | Partial scores + conclude | Outcomes are `completed`/`corrections_required`, not `passed`/`revisions_required`/`failed` |
| archive | Partial archive row + final file | No denormalized freeze of members/supervisor/result; archive RPC unwired in TS client |

---

# Existing Storage and Attachments

| Capability | Classification | Evidence |
|---|---|---|
| Private object-key prefix `graduation-projects/{project_id}/…` | **SOURCE_ONLY_NOT_PROVEN_APPLIED** / mirrored in TS | lifecycle draft register RPC; `domain.isSafePrivateObjectKey`; `lifecycle.buildPrivateObjectKey` |
| File metadata table (`graduation_project_files`) | **SOURCE_ONLY_NOT_PROVEN_APPLIED** | digest, media type, size, scan_state; rejects `http%` and `..` |
| Storage bucket creation | **MISSING_FOR_MVP** | Foundation draft L363–364: “Do not create a bucket here.” |
| Storage RLS / signed download RPCs | **MISSING_FOR_MVP** | absent |
| Binary upload pipeline | **MISSING_FOR_MVP** | UI registers metadata only |
| Proposal attachment category (exactly one) | **MISSING_FOR_MVP** | no file category/kind column; no proposal binding |
| Progress / final attachment categories | **LEGACY_OR_PARTIAL** | inferred via milestone kind + optional `submission_id` (nullable) |
| Public URLs | Denied by design in drafts | object_key must not look like URL |

---

# Existing Audit and Notifications

| Capability | Classification | Evidence |
|---|---|---|
| Domain append-only events (`graduation_project_events`) | **SOURCE_ONLY_NOT_PROVEN_APPLIED** | 33 event types labeled in `lifecycle.EVENT_LABELS` |
| Correlation/idempotency `(project_id, correlation_id, event_type)` | **SOURCE_ONLY_NOT_PROVEN_APPLIED** | unique constraint + RPC replay |
| Bridge to portal `audit_logs` / `log_audit` | **MISSING_FOR_MVP** | no GP bridge in source |
| User notifications for GP transitions | **MISSING_FOR_MVP** | completion report lists state notifications as out of that slice; no GP notify vocabulary in `src/lib/graduation-projects` |
| Notification idempotency keys for GP | **MISSING_FOR_MVP** | design-only in early audit report |

---

# Existing Tests

| Artifact | Classification | What it proves | What it does **not** prove |
|---|---|---|---|
| `tests/graduation-projects/graduation-projects-foundation.test.ts` | PRESENT_IN_CURRENT_SOURCE | Pure domain auth/transitions/progress/keys/readiness | Applied DB |
| `tests/graduation-projects/graduation-projects-lifecycle.test.ts` | PRESENT_IN_CURRENT_SOURCE | UX action matrix, evaluation visibility helpers | Applied DB / routes |
| `tests/graduation-projects/graduation-projects-sql-draft.test.ts` | PRESENT_IN_CURRENT_SOURCE | Foundation draft text contracts | Production apply |
| `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts` | PRESENT_IN_CURRENT_SOURCE | Completion draft RPC inventory + client string matches | Production apply |
| `postgres-*-verifier.sql` + POSTGRES-17 result markdown | SOURCE_ONLY_NOT_PROVEN_APPLIED evidence of **draft compile** | Disposable PG17 positive/negative/idempotency with `ROLLBACK` | Production schema presence |
| `tests/contracts/graduation-projects-mvp-audit-report.test.ts` | PRESENT_IN_CURRENT_SOURCE | Early design audit markdown gates | Fixed MVP readiness / apply |

**Rule respected:** audit-test / disposable PG success ≠ production apply.

---

# Source-vs-Production Evidence

| Claim | Repository evidence | Verdict |
|---|---|---|
| GP tables exist in source migrations | `supabase/migrations` has zero `graduation_project` matches | **Not in applied-source migrations** |
| GP tables exist in generated types | `types.ts` has zero matches | **Not in generated types** |
| GP drafts exist | `docs/migration-drafts/GRADUATION-PROJECTS-*.sql` marked DRAFT ONLY | **Source drafts only** |
| Production apply of GP drafts | No apply log, no migration copy under `supabase/migrations`, no types regeneration proving presence | **Not proven** |
| D02 package treats GP as expansion probe | `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` lists GP drafts and `to_regclass('public.graduation_projects')` as Q3h check | Probe implies possible absence; **does not prove presence** |
| Fresh-release baseline mentions GP objects among expansion checks | `docs/PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01-REPORT.md` Q3h | Inventory check item only; **not apply proof** |
| Foundation/completion self-reports | Explicitly: no SQL apply, no bucket, no deploy, no feature activation | **Source-ready only** |

**Audit rule:** this report never claims production presence. Absent authoritative apply evidence, production state of `graduation_projects` is **unknown/unproven** and must be treated as **not available for MVP delivery**.

---

# Missing for MVP

Against the **fixed** MVP (not the richer draft lifecycle):

| # | Fixed MVP need | Status vs current source | Minimum missing work |
|---|---|---|---|
| 1 | One active team per student | Missing uniqueness | Unique partial index/constraint on active student membership across projects |
| 2 | Team leader + members | Members only | Leader flag/role + invariants (exactly one active leader) |
| 3 | Proposal fields + one attachment | Title/abstract only | Columns for problem/objectives/summary; proposal file category + exactly-one rule |
| 4 | Coordinator accept/return/reject | Present in drafts | Align naming (`return` ↔ `require_revision`); keep comments/reason required |
| 5 | Exactly one supervisor | Multi-supervisor allowed | Unique active supervisor per project |
| 6 | Supervisor acceptance | Missing | Assignment state `pending`→`accepted`/`declined` + RPC |
| 7 | Progress approve/return | Present in drafts | Keep; ensure wired in client |
| 8 | Final private attachment | Metadata only | Private bucket + policies + upload/finalize/signed-read; final category |
| 9 | Defense date + committee | Present as discussion/panel | Optional rename/alias to “defense”; keep schedule+members |
| 10 | Committee scores + final decision | Scores present; decision vocab wrong | Final decision enum/outcomes per MVP |
| 11 | `passed` / `revisions_required` / `failed` | Uses `completed` / `corrections_required` / proposal-`rejected` | Align terminal result states to fixed MVP vocabulary |
| 12 | Archive snapshot | Archive row + final file only | Persist/freeze members, supervisor, result, final file for archive read |
| — | Applied schema + types | Missing | Reviewed migration path into `supabase/migrations` + types regen (**separate authorization**; not this audit) |
| — | RPC client completeness | Partial | Wire foundation RPCs (submit proposal, team add, milestones, request discussion, finalize eval, archive) |
| — | Routes/activation | Missing | Out of pure backend, but blocks end-to-end delivery |
| — | Notifications | Missing | Minimum event→recipient map (can be a later slice if product accepts deferred notify) |
| — | Bootstrap coordinator identity (G4) | Acknowledged gap in drafts | Privileged first-assignment gate remains unresolved |

---

# Risks and Conflicts

1. **Draft ≠ fixed MVP contract** — implementing drafts as-is would ship a different product vocabulary (`discussion`/`completed` vs `defense`/`passed`/`failed`) and omit supervisor acceptance and team-leader rules.
2. **False readiness risk** — foundation/completion reports say SOURCE_READY; disposable PG verifiers PASS; this can be mistaken for production readiness. It is not.
3. **Duplicated auth models** — `domain.authorizeProjectAction` vs `lifecycle.availableProjectActions`; UI mirrors are not authority.
4. **Unwired critical RPCs** — archive/submit-proposal/team/milestones/request-discussion/finalize not in `rpc.ts`.
5. **Unsafe / loose nullables** — `proposal_abstract`, term/program FKs nullable; `graduation_project_files.submission_id` nullable (orphan metadata).
6. **Missing uniqueness** — one active team per student; exactly one supervisor; proposal attachment cardinality.
7. **No private storage** — without bucket/policies, final/proposal attachments cannot be delivered safely.
8. **No GP notifications** — students/staff would not be informed of transitions unless added.
9. **Bootstrap chicken-egg** — `create_graduation_project` requires an existing coordinator/department_head assignment in the department (G4 privileged step).
10. **Role scope caution** — drafts correctly deny global admin/registrar bypass, but assigned `dean`/`department_head` can conclude/archive; confirm this matches academic policy for MVP.
11. **Name collision risk** — graduates-affairs (`graduate_*`) vs graduation-projects (`graduation_project_*`); keep domains separate.
12. **Unrelated UI** — `/admin/graduation-candidates` must not be treated as GP.

---

# Minimum Recommended Backend Contract

Design-only. No SQL. Prefer **adapting the existing draft model** over inventing a parallel schema, with the deltas below.

## Minimum tables (reuse draft set; do not add parallel member/supervisor tables)

Keep the 15 draft tables. Required deltas:

- Extend `graduation_projects` proposal columns: `proposal_problem`, `proposal_objectives`, `proposal_summary` (retain/repurpose title; deprecate bare abstract or map abstract→summary)
- Add membership leadership: `is_leader boolean` on student assignments **or** assignment role discriminator `team_leader` (pick one; enforce exactly one active leader)
- Add supervisor assignment acceptance state: `pending_acceptance` / `accepted` / `declined` (or `accepted_at` + pending default)
- Add file category: `proposal` | `progress` | `final` (enforce exactly one active proposal file; final required for archive)
- Align final result vocabulary to `passed` | `revisions_required` | `failed` (map or replace `completed`/`corrections_required` for **result** decision; keep archive terminal)
- Archive snapshot fields or archive child snapshot ensuring members, supervisor, result, final file are durable after archive

## Minimum state enums / checks

Root project states (minimum for fixed MVP; may collapse draft extras):

- team/proposal drafting: `draft`
- proposal submitted: `submitted`
- coordinator outcomes: `accepted`/`approved` **or** keep `approved` + explicit return `revision_required` + `rejected`
- supervision: ensure supervisor accepted before progress (`active` only after acceptance)
- progress/final work: `active` (or `in_progress`)
- defense: `defense_scheduled` (alias of discussion_scheduled)
- evaluation: `evaluating`
- finals: `passed`, `revisions_required`, `failed`
- `archived`

If retaining draft’s richer intermediate states (`under_review`, `discussion_requested`, corrections loop), document them as **allowed extensions** that still expose the fixed MVP finals.

## Minimum RPC list

| RPC | Purpose |
|---|---|
| `create_graduation_project_team` / create project | Create team/project with leader |
| `add_graduation_project_team_member` | Add member (enforce one-active-team rule) |
| `set_graduation_project_leader` | Ensure single leader (if not at create) |
| `upsert_graduation_project_proposal` | title/problem/objectives/summary |
| `register_graduation_project_file` (category=proposal) | Exactly one proposal attachment |
| `submit_graduation_project_proposal` | Submit for coordinator review |
| `review_graduation_project_proposal` | accept / return+comments / reject |
| `assign_graduation_project_supervisor` | Exactly one supervisor (pending) |
| `accept_graduation_project_supervision` | Supervisor acceptance |
| `submit_graduation_project_progress` / review | Progress approve/return |
| `submit_graduation_project_final` + file | Final private attachment |
| `schedule_graduation_project_defense` | Date + venue |
| `assign_graduation_project_committee_member` | Committee |
| `save_graduation_project_committee_score` | Scores |
| `conclude_graduation_project_result` | `passed` / `revisions_required` / `failed` |
| `archive_graduation_project` | Freeze archive package |
| `list_my_graduation_projects` / `get_graduation_project_detail` | Assignment-scoped reads |

Retain: direct-assignment checks, optimistic `version`, `correlation_id` idempotency, append-only events, default-deny RLS.

## Minimum transitions

```
draft --submit--> submitted
submitted --accept--> approved/active_pending_supervisor
submitted --return--> revision_required → (resubmit) → submitted
submitted --reject--> rejected
approved + supervisor assigned --supervisor_accept--> active
active --progress submit/review--> active
active --final accepted--> defense_ready
defense_ready --schedule+committee--> defense_scheduled
defense_scheduled --held--> evaluating
evaluating --conclude--> passed | revisions_required | failed
passed|failed --archive--> archived
revisions_required --corrections accepted--> evaluating (optional loop) OR re-conclude
```

## Minimum attachment categories

| Category | Cardinality | Visibility |
|---|---|---|
| `proposal` | exactly one active | team + coordinator (+ assigned staff) |
| `progress` | many versioned | team + supervisor |
| `final` | ≥1 clean accepted for archive | team + supervisor + committee/archive roles |

Private bucket only; signed short-lived reads after RPC auth; never public URLs.

## Minimum audit events

`team_created` · `member_added` · `leader_set` · `proposal_upserted` · `proposal_file_registered` · `proposal_submitted` · `proposal_accepted` · `proposal_returned` · `proposal_rejected` · `supervisor_assigned` · `supervision_accepted` · `progress_submitted` · `progress_accepted` · `progress_returned` · `final_submitted` · `defense_scheduled` · `committee_member_assigned` · `score_saved` · `result_passed` · `result_revisions_required` · `result_failed` · `project_archived` · `file_downloaded` (when storage exists)

---

# Exact Files and Objects

## Authoritative source files inspected

### Drafts
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`

### Prior docs (status artifacts)
- `docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`
- `docs/GRADUATION-PROJECTS-MVP-FOUNDATION-01-REPORT.md`
- `docs/GRADUATION-PROJECTS-COMPLETION-01-REPORT.md`
- `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` (Q3h probe)
- `docs/PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01-REPORT.md` (Q3h mention)

### Runtime
- `src/lib/graduation-projects/domain.ts`
- `src/lib/graduation-projects/lifecycle.ts`
- `src/lib/graduation-projects/rpc.ts`
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
- `src/integrations/supabase/types.ts` (negative: no GP objects)
- `supabase/migrations/**` (negative: no GP objects)

### Tests
- `tests/graduation-projects/graduation-projects-foundation.test.ts`
- `tests/graduation-projects/graduation-projects-lifecycle.test.ts`
- `tests/graduation-projects/graduation-projects-sql-draft.test.ts`
- `tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts`
- `tests/graduation-projects/postgres-minimal-schema.sql`
- `tests/graduation-projects/postgres-foundation-verifier.sql`
- `tests/graduation-projects/postgres-lifecycle-verifier.sql`
- `tests/graduation-projects/POSTGRES-17-VERIFICATION-RESULT.md`
- `tests/graduation-projects/POSTGRES-17-LIFECYCLE-VERIFICATION-RESULT.md`
- `tests/contracts/graduation-projects-mvp-audit-report.test.ts`

## Object classification summary

| Object class | Classification |
|---|---|
| Draft GP schema/RPC/RLS/events | SOURCE_ONLY_NOT_PROVEN_APPLIED |
| TS domain/lifecycle/rpc + components | PRESENT_IN_CURRENT_SOURCE |
| Applied migrations / generated types / bucket / routes | MISSING_FOR_MVP |
| Fixed-MVP leader, one-team, proposal fields+attachment, supervisor accept, passed/failed | MISSING_FOR_MVP |
| Design-only member/supervisor table names | LEGACY_OR_PARTIAL |
| Graduates-affairs / graduation-candidates / student_requests | UNRELATED |

---

# Recommended Implementation Tasks

Ordered minimum backend path (still requires separate academic/storage/apply authorizations; this audit does not authorize apply):

1. **Contract freeze** — publish fixed MVP state/result vocabulary vs draft aliases (defense↔discussion, passed↔completed, etc.) and accept/reject deltas.
2. **Draft delta (source-only)** — amend foundation/lifecycle drafts for: one-active-team-per-student; leader; proposal problem/objectives/summary; proposal file category; exactly one supervisor; supervisor acceptance; result states `passed`/`revisions_required`/`failed`; archive snapshot completeness.
3. **Private storage draft** — private bucket, policies, upload finalize, signed download, scan gate (separate approval).
4. **RPC client parity** — wrap all foundation write RPCs used by UI; align error labels.
5. **Authorization matrix** — positive assigned ALLOW + negative DENY for every RPC (student/supervisor/coordinator/panel/unassigned/wrong dept/anonymous); zero side effects on deny.
6. **Types + migration promotion** — only after review gates: move reviewed SQL into `supabase/migrations`, regenerate `types.ts` (**apply remains separately authorized**).
7. **Notifications (optional deferred)** — minimum transition notifies; else explicit product deferral.
8. **Routes/UI activation** — out of pure DB but required for delivery; keep UI non-authoritative.
9. **Synthetic staging verification** — disposable/staging only; never production data.
10. **Production apply** — separate command/preflight/post-verify; out of this mission.

---

# Out of Scope

Confirmed absent / must remain excluded from this MVP backend:

- companies or external organizations
- public project gallery
- competitions
- funding or incubation
- AI features
- plagiarism detection
- intelligent supervisor matching
- mentoring
- graduate affairs (separate domain)
- advanced analytics
- public APIs
- messaging/chat subsystem
- complex task management
- mobile application
- grade writeback to transcripts (not approved)
- production migration apply, publish, deploy
- creation of fake staff/students/assignments
- changes to `request_types.student_visible`
- this audit does not write SQL or modify runtime source

---

# Final Decision

**HOLD_GRADUATION_PROJECTS_MVP_BACKEND_SOURCE_DRAFTS_ONLY_FIXED_MVP_GAPS**

### Why HOLD (not PASS / PASS_WITH_NOTES)

- Backend GP objects are **draft-only** and **not proven applied**.
- Generated types and `supabase/migrations` contain **no** GP schema.
- Private storage bucket/policies are **explicitly absent**.
- Fixed MVP gaps remain even inside drafts: team leader, one active team per student, structured proposal + attachment, supervisor acceptance, exactly one supervisor, `passed`/`failed`/`revisions_required` finals, archive package completeness.
- Runtime UI exists but is **unrouted**; RPC client incomplete vs foundation RPCs.

### What already exists that should be reused

- Draft table/RPC/RLS/event architecture (assignment-scoped, default-deny, idempotent correlation)
- TS domain/lifecycle mirrors and disposable PG verifiers as regression harnesses
- Private object-key convention (pending real bucket)

### Production impact of this audit

Zero. Only this markdown report is added. No production connection, migration, bucket, UI activation, or data change.

---

## Agent report footer

| Item | Value |
|---|---|
| Files modified | `docs/PORTAL-GRADUATION-PROJECTS-MVP-BACKEND-CURRENT-STATE-AUDIT-01.md` (this file only) |
| Tests run | None required for docs-only audit; inventory via source search |
| Assumptions | HEAD `b71016d6` is the authoritative audit baseline; D02 `to_regclass` probes are not apply proofs |
| Risks | Misreading SOURCE_READY foundation/completion reports as production-ready |
| Blockers | Unapplied drafts; fixed-MVP contract gaps; missing private storage; unwired foundation RPCs; no routes |
| Production impact | None |
| Decision | **HOLD_GRADUATION_PROJECTS_MVP_BACKEND_SOURCE_DRAFTS_ONLY_FIXED_MVP_GAPS** |
