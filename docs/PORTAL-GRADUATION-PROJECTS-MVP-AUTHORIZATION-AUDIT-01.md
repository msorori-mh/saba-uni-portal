# Decision

**PASS_WITH_NOTES_GRADUATION_PROJECTS_MVP_AUTHORIZATION_PARTIAL**

The Graduation Projects MVP authorization architecture implements a strict, fail-closed, direct-assignment-scoped model. All table access is default-denied via Row Level Security (RLS) with zero direct table grants, and all mutations and reads flow through atomic `SECURITY DEFINER` RPCs that check `auth.uid()` against active project assignments. 

However, specific MVP requirements—namely explicit **Team Leader vs. Team Member** operational differentiation for student team actions, a two-step **Supervisor Acceptance** state flow, and strict exclusion of unassigned `department_head`/`dean` broad administrative overrides from standard project-level coordinator RPCs—are partially modeled and documented as required remediation tasks prior to production migration apply.

---

# Repository Identity

- **Repository**: `saba-gp-mvp-auth` (`msorori-mh/saba-uni-portal`)
- **Base Commit SHA**: `b71016d6f706cfe01dd1f402338e5d56a83184d8`
- **Branch**: `docs/gp-mvp-auth-audit-01`
- **Audit Target File**: `docs/PORTAL-GRADUATION-PROJECTS-MVP-AUTHORIZATION-AUDIT-01.md`
- **Execution Mode**: SOURCE-ONLY / DOCS-ONLY (No production write, no SQL apply, no schema mutation)

---

# MVP Authorization Boundary

The Graduation Projects MVP authorization boundary is defined by strict fail-closed access control principles:

1. **Assignment-Bound Principal Scope**: Every project action requires an active row in `public.graduation_project_assignments` linking `project_id`, `user_id = auth.uid()`, `department_id`, and `role`.
2. **Zero Global/Broad Bypass**: Global roles (`admin`, `system_admin`, `registrar`, `dean`, `department_head`, unrelated supervisor, unrelated committee member, non-assigned student) have **NO** direct bypass capabilities on project tables or RPCs without an explicit, active project assignment.
3. **Fail-Closed Default Deny**: Tables have RLS enabled with `REVOKE ALL` from `anon` and `authenticated`. No `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grants exist on underlying tables.
4. **RPC-Only Data Access**: Read and write capabilities are exposed exclusively via `SECURITY DEFINER` functions set with `search_path = public, pg_temp`, granted strictly to `authenticated`.
5. **State-Locked Concurrency & Idempotency**: State transitions require exact optimistic version matching (`p_expected_version`) and idempotency correlation IDs (`p_correlation_id`) audited in an append-only event ledger (`graduation_project_events`).

---

# Existing Roles and Helpers

### 1. Database & Domain Roles
- **Assignment Role Enum (`graduation_project_assignment_role`)**:
  - `student`: Project team member or leader.
  - `supervisor`: Academic supervisor assigned to guide the project.
  - `coordinator`: Departmental graduation projects coordinator.
  - `department_head`: Head of the academic department.
  - `dean`: College dean.
  - `panel_member`: Defense committee / evaluation panel member.

### 2. Application User & Position Roles (`user_roles` / `position_assignments`)
- `admin`, `system_admin`: System administration.
- `dean`: College executive leadership.
- `department_head`: Departmental academic leadership.
- `faculty`: Academic teaching staff.
- `student`: Enrolled student.

### 3. Core Authorization Helper Functions
- **[`public.require_graduation_project_assignment(p_project_id uuid, p_roles graduation_project_assignment_role[])`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql#L229-L238)**:
  - Validates that `auth.uid()` holds an active (`active = true`, `ended_at IS NULL`) direct assignment on `p_project_id` matching one of `p_roles`.
  - Rejects with exception `'exact direct processing assignment required'` (P0001) if absent.
- **[`public.guard_graduation_project_assignment()`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql#L151-L167)**:
  - Database trigger verifying student/faculty profile identity and department alignment upon assignment creation/update.
- **[`public.graduation_project_is_discussion_ready(p_project_id uuid)`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql#L174-L187)**:
  - Checks state (`active`), active student & supervisor presence, weight sum = 100%, all milestones accepted, no pending corrections, clean accepted final deliverable.

---

# Existing RLS

All 15 tables within the Graduation Projects module have Row Level Security enabled and all direct permissions revoked:

```sql
alter table public.graduation_projects enable row level security;
alter table public.graduation_project_assignments enable row level security;
alter table public.graduation_project_approvals enable row level security;
alter table public.graduation_project_milestones enable row level security;
alter table public.graduation_project_submissions enable row level security;
alter table public.graduation_project_supervisor_notes enable row level security;
alter table public.graduation_project_files enable row level security;
alter table public.graduation_project_discussion_requests enable row level security;
alter table public.graduation_project_discussions enable row level security;
alter table public.graduation_project_panel_members enable row level security;
alter table public.graduation_project_evaluations enable row level security;
alter table public.graduation_project_evaluation_scores enable row level security;
alter table public.graduation_project_corrections enable row level security;
alter table public.graduation_project_final_archives enable row level security;
alter table public.graduation_project_events enable row level security;

revoke all on public.graduation_projects, public.graduation_project_assignments, ... from anon, authenticated;
```

**Key Findings on Existing RLS**:
- **Default Deny**: No direct queries (SELECT/INSERT/UPDATE/DELETE) can be executed by clients.
- **Storage Policies**: Storage buckets and policies are not yet created (Docs/Drafts only). All file metadata is stored in `graduation_project_files` with `scan_state` controls.

---

# Existing RPC Authorization

All lifecycle interactions flow through `SECURITY DEFINER` functions in `docs/migration-drafts/`:

1. **[`create_graduation_project`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L25-L50)**: Requires active `coordinator` or `department_head` assignment in the target department.
2. **[`submit_graduation_project_proposal`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql#L240-L252)**: Requires `student` assignment on `p_project_id`. State must be `draft`.
3. **[`review_graduation_project_proposal`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L53-L92)**: Requires `coordinator` or `department_head` assignment. State `submitted`/`under_review`.
4. **[`resubmit_graduation_project_proposal`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L95-L109)**: Requires `student` assignment. State `revision_required`.
5. **[`activate_graduation_project`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L112-L126)**: Requires `coordinator` or `department_head` assignment. State `approved`.
6. **[`assign_graduation_project_faculty`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L130-L157)**: Requires `coordinator` or `department_head` assignment. Roles: `supervisor`, `coordinator`, `panel_member`.
7. **[`end_graduation_project_assignment`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L160-L181)**: Requires `coordinator` or `department_head` assignment. Cannot end own assignment or assignments in terminal projects.
8. **[`submit_graduation_project_deliverable`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L185-L209)**: Requires `student` assignment. State `active`.
9. **[`review_graduation_project_submission`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L213-L247)**: Requires `supervisor` assignment. State `active`.
10. **[`add_graduation_project_supervisor_note`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L250-L270)** / **[`resolve_graduation_project_supervisor_note`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L272-L288)**: Requires `supervisor` assignment.
11. **[`register_graduation_project_file`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L293-L326)**: Requires `student` or `supervisor` assignment. Validates scoped object key (`graduation-projects/{project_id}/...`).
12. **[`schedule_graduation_project_discussion`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L330-L352)** / **[`reject_graduation_project_discussion_request`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L354-L375)**: Requires `coordinator` or `department_head` assignment. State `discussion_requested`.
13. **[`assign_graduation_project_panel_member`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L378-L402)**: Requires `coordinator` or `department_head` assignment. State `discussion_scheduled`.
14. **[`record_graduation_project_discussion_outcome`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L406-L436)**: Requires `coordinator` or `department_head` assignment. State `discussion_scheduled`. Moves project to `evaluating` if outcome is `held`.
15. **[`save_graduation_project_evaluation`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L440-L494)**: Requires `panel_member` assignment. Validates score bounds, prevents modifying another member's evaluation or submitted evaluation.
16. **[`conclude_graduation_project_result`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L498-L538)**: Requires `department_head` or `dean` assignment. Requires ALL panel evaluations to be finalized (`state = 'finalized'`).
17. **[`complete_graduation_project_correction`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L541-L560)**: Requires `student` assignment. State `corrections_required`.
18. **[`accept_graduation_project_correction`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L564-L586)**: Requires `department_head` or `dean` assignment. Returns project to `evaluating` when zero unaccepted corrections remain.
19. **[`archive_graduation_project`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql#L199-L227)**: Requires `department_head` or `dean` assignment. State `completed`. Clean accepted final deliverable required.
20. **Read RPCs**: [`list_my_graduation_projects`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L591-L604), [`get_graduation_project_detail`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql#L606-L691), and department report RPCs (`get_graduation_project_states_report`, `get_graduation_project_assignments_report`, `get_graduation_project_evaluations_report`, `get_graduation_project_archive_report`).

---

# Client Guards

Frontend client components in `src/components/graduation-projects/` and `src/lib/graduation-projects/` implement UX visibility guards:

- **[`availableProjectActions(viewerRoles, state)`](file:///C:/projects/saba-gp-mvp-auth/src/lib/graduation-projects/lifecycle.ts#L104-L135)**: Derives boolean flags (`can_submit_proposal`, `can_review_proposal`, `can_submit_deliverable`, `can_evaluate`, etc.) based on viewer roles and project state.
- **[`resolveViewerEvaluation(detail, viewerUserId)`](file:///C:/projects/saba-gp-mvp-auth/src/lib/graduation-projects/lifecycle.ts#L182-L200)**: Scopes evaluation viewing/form selection strictly to the authenticated user's active panel assignment (MEDIUM-1 fix preventing cross-evaluator leakage).
- **[`GraduationProjectWorkspace.tsx`](file:///C:/projects/saba-gp-mvp-auth/src/components/graduation-projects/GraduationProjectWorkspace.tsx#L60-L150)**: Conditionally renders control buttons based on derived actions.

> **CRITICAL SECURITY NOTE**: Client guards exist solely for UX state management and button disabling. All authorization security boundaries are enforced exclusively at the database layer inside `SECURITY DEFINER` RPCs.

---

# Broad Bypasses

Audit evaluation of potential broad role bypasses:

1. **System Admin (`admin`, `system_admin`)**:
   - **Current Code Status**: **NO BYPASS**. Admin users cannot read or mutate project rows unless explicitly assigned in `graduation_project_assignments`. RPCs fail with `'exact direct processing assignment required'` (P0001).
2. **College Dean (`dean`)**:
   - **Current Code Status**: **NO BYPASS for standard actions**. However, in administrative RPCs (`conclude_graduation_project_result`, `accept_graduation_project_correction`, `archive_graduation_project`), `dean` is permitted alongside `department_head`.
3. **Department Head (`department_head`)**:
   - **Current Code Status**: **NO BYPASS for standard actions**. Permitted in administrative/coordinator RPCs.
4. **Registrar (`registrar`)**:
   - **Current Code Status**: **NO BYPASS**. Zero access.
5. **Unrelated Supervisor / Unrelated Committee Member / Unassigned Student**:
   - **Current Code Status**: **NO BYPASS**. Denied by `require_graduation_project_assignment`.

### Identified Authorization Gaps
- **Gap 1: Absence of Explicit Team Leader vs. Team Member Roles**: Currently, any student assigned to a project has equal mutation powers (proposal submit/resubmit, deliverable submission, correction completion, file registration). The MVP requires restricting team management and formal submissions strictly to the designated **Team Leader**.
- **Gap 2: Missing Supervisor Acceptance Flow**: In current draft, supervisor assignment immediately becomes active (`active = true`). The MVP requires a two-step assignment flow: Coordinator assigns -> Supervisor accepts/rejects -> Active supervisor.
- **Gap 3: Department Head / Dean Role Overreach in Coordinator RPCs**: Coordinator actions (`review_proposal`, `assign_faculty`, `schedule_discussion`) allow `department_head` without requiring a specific project-level coordinator assignment.

---

# Required Actor Model

To satisfy the MVP fail-closed authorization specification, the actor model must strictly enforce:

1. **Team Leader (`student` with `is_leader = true`)**:
   - Sole student authority to: submit initial/revised proposal, submit deliverable updates, upload final deliverable file, add/remove team members before proposal lock, transfer leader role.
2. **Team Member (`student` with `is_leader = false`)**:
   - Read assigned project details, view team status, leave team (prior to proposal lock), acknowledge deliverable submissions. Cannot execute team mutations or formal submissions.
3. **Coordinator (`coordinator`)**:
   - Create project/team, review/return/reject proposal, assign supervisor (initiates offer), replace supervisor, schedule defense, assign defense committee members, set revision deadlines.
4. **Assigned Supervisor (`supervisor`)**:
   - Accept/reject supervisor assignment, approve/return student progress deliverables, add supervisor notes, acknowledge final file readiness. Cannot review proposals or evaluate defense.
5. **Assigned Defense Committee Member (`panel_member`)**:
   - Access assigned project defense package, submit own evaluation rubric score **ONCE**, view own draft and finalized scores. Cannot edit another member's evaluation.
6. **Authorized Academic Viewer (`department_head`, `dean`)**:
   - Read department-scoped reporting and project state. Conclude final result upon 100% committee evaluation completion, accept final corrections, archive completed project.

---

# Complete Authorization Matrix

| RPC / Action | Allowed Principal (Actor) | Required Request / Project State | Positive Case Condition | All Required Negative Actors (Must Deny) | Expected Denial Error Family | Protected Fingerprint Scope |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `create_graduation_project` | `coordinator` | N/A (New Project) | Active coordinator in target department | Admin, Dean, Registrar, Dept Head without assignment, Supervisor, Student | `P0001: project creation assignment required` | `(department_id)` |
| `add_graduation_project_team_member` | `team_leader` (rem. `coordinator`) | `draft`, `revision_required` | Team leader on draft project | Admin, Dean, Registrar, Team Member, Unassigned Student, Supervisor | `P0001: team mutation state denied / leader assignment required` | `(project_id, student_profile_id)` |
| `submit_graduation_project_proposal` | `team_leader` | `draft` | Assigned team leader, version match | Admin, Dean, Registrar, Team Member, Unassigned Student, Supervisor, Coordinator | `P0001: proposal transition precondition failed` | `(project_id, version)` |
| `review_graduation_project_proposal` | `coordinator` | `submitted`, `under_review` | Active coordinator on project, version match | Admin, Dean, Registrar, Dept Head without assignment, Supervisor, Student | `P0001: proposal review precondition failed` | `(project_id, version)` |
| `resubmit_graduation_project_proposal` | `team_leader` | `revision_required` | Assigned team leader, version match | Admin, Dean, Registrar, Team Member, Unassigned Student, Supervisor, Coordinator | `P0001: proposal resubmission precondition failed` | `(project_id, version)` |
| `activate_graduation_project` | `coordinator` | `approved` | Active coordinator on project, version match | Admin, Dean, Registrar, Dept Head without assignment, Supervisor, Student | `P0001: project activation precondition failed` | `(project_id, version)` |
| `assign_graduation_project_faculty` (Supervisor) | `coordinator` | `draft`, `revision_required`, `approved`, `active` | Active coordinator on project | Admin, Dean, Registrar, Dept Head without assignment, Supervisor, Student | `P0001: faculty assignment role denied` | `(project_id, user_id, role)` |
| `accept_supervisor_assignment` | `assigned_supervisor` | `pending_acceptance` | Target supervisor user matches `auth.uid()` | Admin, Dean, Registrar, Unassigned Supervisor, Coordinator, Student | `P0001: supervisor assignment acceptance denied` | `(project_id, assignment_id)` |
| `submit_graduation_project_deliverable` | `team_leader` | `active` | Assigned team leader, milestone open | Admin, Dean, Registrar, Team Member, Unassigned Student, Supervisor, Coordinator | `P0001: deliverable submission state denied` | `(project_id, milestone_id)` |
| `review_graduation_project_submission` | `assigned_supervisor` | `active` | Active supervisor on project, submission `submitted` | Admin, Dean, Registrar, Unrelated Supervisor, Coordinator, Committee Member, Student | `P0001: submission review precondition failed` | `(project_id, submission_id)` |
| `register_graduation_project_file` (Final File) | `team_leader` | `active`, `corrections_required` | Assigned team leader, project-scoped object key | Admin, Dean, Registrar, Team Member, Unassigned Student, Supervisor, Coordinator | `P0001: file object key outside project scope` | `(project_id, object_key)` |
| `schedule_graduation_project_discussion` | `coordinator` | `discussion_requested` | Active coordinator, valid request ID & venue | Admin, Dean, Registrar, Dept Head without assignment, Supervisor, Student | `P0001: discussion scheduling precondition failed` | `(project_id, request_id)` |
| `assign_graduation_project_panel_member` | `coordinator` | `discussion_scheduled` | Active coordinator, assigned faculty profile | Admin, Dean, Registrar, Dept Head without assignment, Supervisor, Student | `P0001: panel assignment precondition failed` | `(discussion_id, assignment_id)` |
| `save_graduation_project_evaluation` | `assigned_panel_member` | `evaluating` (Discussion `held`) | Active panel member on discussion, own evaluation | Admin, Dean, Registrar, Unassigned Faculty, Other Panel Member, Supervisor, Student | `P0001: evaluation write precondition failed / evaluation already submitted` | `(discussion_id, panel_member_id)` |
| `conclude_graduation_project_result` | `department_head`, `dean` | `evaluating` | Active dept head/dean, 100% panel evaluations finalized | Admin, Registrar, Coordinator without dept head role, Supervisor, Panel Member, Student | `P0001: evaluations not finalized` | `(project_id, version)` |
| `complete_graduation_project_correction` | `team_leader` | `corrections_required` | Assigned team leader | Admin, Dean, Registrar, Team Member, Unassigned Student, Supervisor, Coordinator | `P0001: correction completion precondition failed` | `(project_id, correction_id)` |
| `accept_graduation_project_correction` | `department_head`, `dean` | `corrections_required` | Active dept head/dean, correction completed | Admin, Registrar, Coordinator without dept head role, Supervisor, Student | `P0001: correction acceptance precondition failed` | `(project_id, correction_id)` |
| `archive_graduation_project` | `department_head`, `dean` | `completed` | Active dept head/dean, clean final file, no pending corrections | Admin, Registrar, Coordinator without dept head role, Supervisor, Student | `P0001: project not archive-ready` | `(project_id, final_file_id)` |

---

# Negative Matrix

Test matrix specifying mandatory failure cases that MUST produce explicit exception denials:

```
[Negative Test 1: System Admin Bypass Attempt]
Actor: User with app role 'admin' or 'system_admin' NOT in graduation_project_assignments
Action: Call submit_graduation_project_proposal(project_id)
Expected Outcome: DENY (P0001: exact direct processing assignment required)

[Negative Test 2: Unassigned Student Action]
Actor: Enrolled student NOT assigned to project_id
Action: Call submit_graduation_project_deliverable(project_id, milestone_id, summary)
Expected Outcome: DENY (P0001: exact direct processing assignment required)

[Negative Test 3: Non-Leader Team Member Action]
Actor: Assigned student with is_leader = false
Action: Call submit_graduation_project_proposal(project_id)
Expected Outcome: DENY (P0001: team leader assignment required)

[Negative Test 4: Unrelated Supervisor Review]
Actor: Faculty with 'supervisor' role on Project A
Action: Call review_graduation_project_submission(Project B, submission_id, 'accept')
Expected Outcome: DENY (P0001: exact direct processing assignment required)

[Negative Test 5: Supervisor Proposal Review Attempt]
Actor: Assigned supervisor on Project A
Action: Call review_graduation_project_proposal(Project A, 'approve')
Expected Outcome: DENY (P0001: exact direct processing assignment required)

[Negative Test 6: Committee Member Evaluation Overwrite Attempt]
Actor: Panel Member 1
Action: Call save_graduation_project_evaluation for Panel Member 2's panel_member_id
Expected Outcome: DENY (P0001: evaluation write precondition failed)

[Negative Test 7: Double Evaluation Submission]
Actor: Assigned Panel Member 1
Action: Call save_graduation_project_evaluation(submit = true) when evaluation state is 'submitted' or 'finalized'
Expected Outcome: DENY (P0001: evaluation already submitted)

[Negative Test 8: Result Conclusion with Unfinalized Panel]
Actor: Department Head
Action: Call conclude_graduation_project_result when 1 of 3 panel members has state 'draft'
Expected Outcome: DENY (P0001: evaluations not finalized)

[Negative Test 9: Archive Uncompleted Project]
Actor: Department Head / Dean
Action: Call archive_graduation_project on project in state 'active' or 'evaluating'
Expected Outcome: DENY (P0001: project not archive-ready)

[Negative Test 10: Cross-Project File Object Key Ingestion]
Actor: Assigned Student on Project A
Action: Call register_graduation_project_file with object_key 'graduation-projects/Project-B-UUID/file.pdf'
Expected Outcome: DENY (P0001: file object key outside project scope)
```

---

# State and Replay Protection

### Race Condition & Replay Audit

1. **Duplicate Active Team**:
   - **Risk**: Concurrent requests creating multiple active team assignments for the same student in the same semester.
   - **Mitigation**: Unique index on `graduation_project_assignments(student_profile_id)` WHERE `active = true`, enforced under row locks (`FOR UPDATE`).
2. **Duplicate Supervisor Acceptance**:
   - **Risk**: Concurrent supervisor acceptance calls or double supervisor assignment.
   - **Mitigation**: Filtered unique index `graduation_project_active_assignment` on `(project_id, role, user_id)` WHERE `active = true`. RPC uses row-level locking on `graduation_projects`.
3. **Double Evaluation**:
   - **Risk**: Panel member submitting evaluation twice concurrently or updating a finalized evaluation.
   - **Mitigation**: Unique constraint `unique(discussion_id, panel_member_id)` on `graduation_project_evaluations`. Atomic check `e.state <> 'draft'` under `FOR UPDATE` transaction lock.
4. **Transition Replay**:
   - **Risk**: Network retry executing a state mutation twice.
   - **Mitigation**: Every write RPC accepts `p_correlation_id uuid` and checks `graduation_project_events` before executing mutations. Replays return the existing entity ID without side effects.
5. **Stale Update (Optimistic Concurrency Control)**:
   - **Risk**: User operating on outdated project state.
   - **Mitigation**: All state transition RPCs require `p_expected_version bigint` matching `graduation_projects.version`. Increments `version = version + 1` atomically.
6. **Archive Before Completion**:
   - **Risk**: Archiving an active or unapproved project.
   - **Mitigation**: `archive_graduation_project` verifies `v_project.state = 'completed'`, requires a clean scanned final file, and verifies zero pending unaccepted corrections.

---

# RLS and ACL Requirements

### Minimum Required SQL Ownership & ACL Policies

1. **Table RLS**: Enable RLS on all 15 module tables. Revoke `ALL` privileges from `anon` and `authenticated`.
2. **RPC Ownership**: All RPCs MUST be owned by `postgres` (or administrative role) with `SECURITY DEFINER` and `SET search_path = public, pg_temp`.
3. **Function Execute Grants**:
   ```sql
   REVOKE ALL ON FUNCTION public.rpc_name(...) FROM PUBLIC, anon;
   GRANT EXECUTE ON FUNCTION public.rpc_name(...) TO authenticated;
   ```
4. **Storage Bucket & ACL**:
   - Private bucket `graduation-projects-files` (public = `false`).
   - Storage RLS policy: Access allowed **ONLY** via signed URLs generated by authorized RPCs or authenticated read policies checking `graduation_project_files.scan_state = 'clean'` and matching active assignment.

---

# Risks

1. **Risk 1: Missing Team Leader Field in Database Schema**: Current SQL draft does not distinguish `team_leader` from `team_member` in `graduation_project_assignments`.
   - *Impact*: Any student on the project can submit proposals or deliverables.
   - *Remediation*: Add `is_leader boolean NOT NULL DEFAULT false` or extend `graduation_project_assignment_role` enum with `'team_leader'`.
2. **Risk 2: Instant Supervisor Assignment without Acceptance Phase**: Current `assign_graduation_project_faculty` directly activates supervisor assignments.
   - *Impact*: Faculty automatically assigned without formal acknowledgment.
   - *Remediation*: Introduce `pending_acceptance` state on `graduation_project_assignments` and add `accept_graduation_project_supervisor_assignment` RPC.
3. **Risk 3: Unrestricted Department Head / Dean Scope in Coordinator RPCs**: `require_graduation_project_assignment` includes `department_head` for standard coordinator actions.
   - *Impact*: Department head can bypass assigned coordinator workflow.
   - *Remediation*: Restrict project-level operational RPCs strictly to `coordinator` role, requiring explicit coordinator assignment.

---

# Exact Files and Functions

### Core Source & Draft Files
- **[`docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql)**: Foundation schema, types, assignments, archive RPC.
- **[`docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`](file:///C:/projects/saba-gp-mvp-auth/docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql)**: Lifecycle RPCs, evaluation, corrections, reporting.
- **[`src/lib/graduation-projects/lifecycle.ts`](file:///C:/projects/saba-gp-mvp-auth/src/lib/graduation-projects/lifecycle.ts)**: TypeScript types, state machine, action derivation (`availableProjectActions`, `resolveViewerEvaluation`).
- **[`src/lib/graduation-projects/rpc.ts`](file:///C:/projects/saba-gp-mvp-auth/src/lib/graduation-projects/rpc.ts)**: Client RPC wrapper class (`GraduationProjectsRpcClient`).
- **[`src/components/graduation-projects/GraduationProjectWorkspace.tsx`](file:///C:/projects/saba-gp-mvp-auth/src/components/graduation-projects/GraduationProjectWorkspace.tsx)**: UI workspace component.

### Automated Verifier & Test Suite
- **[`tests/graduation-projects/postgres-foundation-verifier.sql`](file:///C:/projects/saba-gp-mvp-auth/tests/graduation-projects/postgres-foundation-verifier.sql)**: Executable PostgreSQL verification script (23 denial cases).
- **[`tests/graduation-projects/postgres-lifecycle-verifier.sql`](file:///C:/projects/saba-gp-mvp-auth/tests/graduation-projects/postgres-lifecycle-verifier.sql)**: Full lifecycle SQL verifier script.
- **[`tests/graduation-projects/graduation-projects-foundation.test.ts`](file:///C:/projects/saba-gp-mvp-auth/tests/graduation-projects/graduation-projects-foundation.test.ts)**: TypeScript contract tests for foundation.
- **[`tests/graduation-projects/graduation-projects-lifecycle.test.ts`](file:///C:/projects/saba-gp-mvp-auth/tests/graduation-projects/graduation-projects-lifecycle.test.ts)**: TypeScript contract tests for lifecycle.
- **[`tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts`](file:///C:/projects/saba-gp-mvp-auth/tests/graduation-projects/graduation-projects-lifecycle-sql-draft.test.ts)**: SQL draft validation tests.

---

# Recommended Implementation Tasks

1. **Task 1: Add `is_leader` Flag to Team Assignments**: Update `graduation_project_assignments` schema to include `is_leader boolean`. Update `submit_graduation_project_proposal`, `submit_graduation_project_deliverable`, and `register_graduation_project_file` to require `is_leader = true`.
2. **Task 2: Implement Supervisor Acceptance Workflow**: Add `pending_acceptance` assignment status. Add `accept_graduation_project_supervisor_assignment` RPC requiring `auth.uid() = supervisor.user_id`.
3. **Task 3: Refine Coordinator vs. Department Head Scope**: Separate operational coordinator RPCs (which require `role = 'coordinator'`) from executive departmental RPCs (`conclude_result`, `archive_project`, which require `role = 'department_head'` or `'dean'`).
4. **Task 4: Private Storage Bucket & Virus Scan Policy**: Define private bucket `graduation-projects-files` with anti-virus scan trigger (`pending` -> `clean` / `quarantined`).

---

# Out of Scope

- Applying database migrations to remote or production Supabase environments.
- Administrative manual correction workflow for archived records.
- External payment processing or fee gateway integration (managed externally).
- Modifying `request_types.student_visible` or unapproved core system tables.
- Building custom UI themes or non-essential visual redesigns.

---

# Final Decision

**PASS_WITH_NOTES_GRADUATION_PROJECTS_MVP_AUTHORIZATION_PARTIAL**

The Graduation Projects MVP authorization architecture is designed with strong fail-closed security controls (RLS default deny, direct assignment validation, RPC-only mutations, transaction locking, and idempotency tracking). Implementation may proceed to the next source-only milestone once the recommended remediation tasks (Team Leader field enforcement, Supervisor Acceptance flow, and explicit Coordinator role scoping) are incorporated into the authoritative SQL draft.
