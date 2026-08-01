# GRADUATION-PROJECTS — RPC AUTHORIZATION INVENTORY (GP-07)

Scope: every graduation-projects RPC and server function as of the M7 package
(migrations 20260730100000–20260730100006, NOT_APPLIED). All write/read RPCs are
`security definer set search_path=public,pg_temp`, owner `postgres`, revoked
from `public`/`anon`, granted to `authenticated` only where listed; every one
re-verifies `auth.uid()` and a direct active assignment. Direct table access
stays revoked (42501) with RLS deny-by-default and zero policies.

Denial message family: `P0001` guarded messages (mapped to Arabic in
`src/lib/graduation-projects/rpc.ts ERROR_LABELS`) and `42501` for grant walls.

## 1. Write RPCs (19+6)

| RPC (signature) | Literal action(s) | Allowed principal | Lifecycle gate | Idempotency | Denials (exact) |
|---|---|---|---|---|---|
| `create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)` | — | coordinator/department_head on a project of the same department | — | correlation → `project_created` | `project creation assignment required`, `project title invalid` |
| `submit_graduation_project_proposal(uuid,bigint,uuid)` | — | student (direct, project) | `draft` + version + settings window/team_min | correlation → `proposal_submitted` | `exact direct processing assignment required`, `proposal transition precondition failed`, `proposal window closed`, `team below minimum size` |
| `review_graduation_project_proposal(uuid,text,text,bigint,uuid)` | `start_review\|approve\|reject\|require_revision` | coordinator/department_head | submitted→under_review→approved / rejected / revision_required + version | correlation → per-action event | `proposal review action unknown`, `proposal review precondition failed`, `review reason required` |
| `resubmit_graduation_project_proposal(uuid,bigint,uuid)` | — | student | `revision_required` + version | correlation → `proposal_resubmitted` | `proposal resubmission precondition failed` |
| `activate_graduation_project(uuid,bigint,uuid)` | — | coordinator/department_head | `approved` + version | correlation → `project_activated` | `project activation precondition failed` |
| `add_graduation_project_team_member(uuid,uuid,uuid,uuid)` | — | coordinator/department_head | `draft`/`revision_required` + settings team_max | correlation → `team_member_added` | `team mutation state denied`, `team size limit reached` |
| `assign_graduation_project_faculty(uuid,text,uuid,uuid,uuid)` | role ∈ `supervisor\|co_supervisor\|coordinator\|panel_member` | coordinator/department_head | per-role state set; exactly-one supervisor/co-supervisor; settings capacity/co-rule | correlation → `faculty_assigned` | `faculty assignment role denied`, `faculty assignment state denied`, `faculty assignment already exists`, `project supervisor slot already filled`, `supervisor capacity reached`, `co-supervisor not allowed by settings` |
| `end_graduation_project_assignment(uuid,uuid,uuid)` | — | coordinator/department_head (not own) | non-terminal | correlation → `assignment_ended` | `assignment end state denied`, `assignment not found`, `cannot end own assignment` |
| `set_graduation_project_milestone(uuid,text,text,integer,numeric,uuid)` | kind ∈ `progress\|final` | supervisor/coordinator | `approved`/`active`; unique sequence | correlation → `milestone_set` | `milestone mutation state denied` |
| `submit_graduation_project_deliverable(uuid,uuid,text,uuid)` | — | student | `active` + open milestone | correlation → `deliverable_submitted` | `deliverable submission state denied`, `milestone not found` |
| `review_graduation_project_submission(uuid,uuid,text,text,uuid)` | `accept\|require_revision` | supervisor | `active` + live submission | correlation → per-action event | `submission review action unknown`, `submission review precondition failed`, `revision note required` |
| `add_graduation_project_supervisor_note(uuid,uuid,text,uuid)` | — | supervisor | active…corrections_required | correlation → `supervisor_note_added` | `note state denied`, `note text required`, `submission not found` |
| `resolve_graduation_project_supervisor_note(uuid,uuid,uuid)` | — | supervisor | unresolved note | correlation → `supervisor_note_resolved` | `note resolution precondition failed` |
| `register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid,text)` | kind ∈ 10 literal file kinds | student/supervisor | `active`/`corrections_required`; MIME allowlist; ≤50 MiB; stage binding; project-scoped key | correlation → `file_registered` | `file registration state denied`, `file object key outside project scope`, `file metadata invalid`, `file media type not allowed`, `file size exceeds limit`, `file kind invalid`, `file stage binding invalid`, `final manuscript must attach to a final milestone submission`, `file object key already registered`, `submission not found` |
| `request_graduation_project_discussion(uuid,uuid)` | — | student/supervisor | readiness predicate + exactly-one pending | correlation → `discussion_requested` | `discussion readiness failed`, `discussion request already pending` |
| `schedule_graduation_project_discussion(uuid,uuid,timestamptz,text,uuid)` | — | coordinator/department_head | `discussion_requested` + pending request | correlation → `discussion_scheduled` | `discussion scheduling precondition failed`, `discussion schedule details invalid` |
| `reject_graduation_project_discussion_request(uuid,uuid,text,uuid)` | — | coordinator/department_head | `discussion_requested` + pending | correlation → `discussion_request_rejected` | `discussion rejection precondition failed`, `review reason required` |
| `assign_graduation_project_panel_member(uuid,uuid,uuid,boolean,uuid)` | — | coordinator/department_head | scheduled discussion; exactly-one chair | correlation → `panel_member_assigned` | `discussion not found`, `panel assignment precondition failed`, `panel member already assigned`, `panel chair already assigned` |
| `record_graduation_project_discussion_outcome(uuid,uuid,text,uuid)` | `held\|postponed\|cancelled` | coordinator/department_head | scheduled/postponed + project `discussion_scheduled` | correlation → per-outcome event | `discussion outcome unknown`, `discussion outcome precondition failed` |
| `save_graduation_project_evaluation(uuid,uuid,text,jsonb,text,boolean,uuid)` | submit flag | panel_member (own panel seat) | held discussion + `evaluating` + draft-only edit | correlation → `evaluation_saved`/`evaluation_submitted` | `evaluation write precondition failed`, `evaluation scores invalid`, `evaluation already submitted` |
| `finalize_graduation_project_evaluation(uuid,uuid)` | — | panel_member (own evaluation only) | held + `evaluating` + submitted | correlation → `evaluation_finalized` | `evaluation not found`, `evaluator panel assignment mismatch`, `evaluation lifecycle precondition failed`, `evaluation finalization precondition failed` |
| `conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid)` | `completed\|corrections_required` | department_head/dean | `evaluating` + version + every panel member finalized (M7) | correlation → per-outcome event | `result outcome unknown`, `result conclusion precondition failed`, `evaluations not finalized`, `corrections payload invalid` |
| `complete_graduation_project_correction(uuid,uuid,uuid)` | — | student | `corrections_required` + pending correction | correlation → `correction_completed` | `correction completion precondition failed` |
| `accept_graduation_project_correction(uuid,uuid,uuid)` | — | department_head/dean | completed correction; returns to `evaluating` when all accepted | correlation → `correction_accepted` | `correction acceptance precondition failed` |
| `archive_graduation_project(uuid,uuid,bigint,uuid)` | — | department_head/dean | `completed` + version + clean accepted final file + all corrections accepted | correlation → `project_archived` (+ globally unique archive correlation) | `direct archive assignment required`, `project not archive-ready`, `clean accepted final evidence and accepted corrections required` |

## 2. Read RPCs (fail-closed, assignment-scoped)

| RPC | Principal | Scope rule |
|---|---|---|
| `list_my_graduation_projects()` | any assigned user | own active assignments only |
| `get_graduation_project_detail(uuid)` | any role on the project | students: finalized evaluations only; object keys only when scan-clean |
| `list_my_graduation_project_notifications()` | any user | `recipient_user_id = auth.uid()` only |
| `list_graduation_project_rubrics(uuid)` | department staff roles | department-scoped |
| `get_graduation_project_settings(uuid)` | coordinator/head/dean | department-scoped |
| `get_graduation_project_states_report(uuid)` | coordinator/head/dean | department-scoped |
| `get_graduation_project_assignments_report(uuid)` | coordinator/head/dean | department-scoped |
| `get_graduation_project_evaluations_report(uuid)` | coordinator/head/dean | department-scoped |
| `get_graduation_project_archive_report(uuid)` | coordinator/head/dean | department-scoped |
| `get_graduation_project_defense_report(uuid)` | coordinator/head/dean | department-scoped |

## 3. Privileged/service RPCs (no app grant)

| RPC | Principal | Notes |
|---|---|---|
| `require_graduation_project_assignment(uuid,role[])` | internal only (revoked from all) | called by every write RPC |
| `graduation_project_settings_for(uuid,uuid)` | internal only | settings resolution |
| `graduation_project_is_discussion_ready(uuid)` | internal only | readiness predicate |
| `set_graduation_project_file_scan_state(uuid,text,uuid)` | service_role only (conditional grant) | one-way scan decision; 42501 for app roles |
| `list_graduation_project_orphan_files()` | service_role only (conditional grant) | review-only; never deletes |
| `upsert_graduation_project_settings(...)` | department_head/dean of the department | `settings administration assignment required`, `settings invalid` |
| `upsert_graduation_project_rubric(...)` | department_head/dean of the department | `rubric administration assignment required`, `rubric payload invalid`, `rubric not found` |

## 4. Server functions (TanStack) — all `requireSupabaseAuth` + strict zod + no client actor ids

`probeGraduationProjectsAvailability`, `listMyGraduationProjects`,
`getGraduationProjectDetailView`, `getGraduationProjectsCreateContext`,
`createGraduationProject`, `submitGraduationProjectProposal`,
`resubmitGraduationProjectProposal`, `reviewGraduationProjectProposal`,
`submitGraduationProjectDeliverable`, `reviewGraduationProjectSubmission`,
`addGraduationProjectSupervisorNote`, `resolveGraduationProjectSupervisorNote`,
`registerGraduationProjectFile`, `requestGraduationProjectDiscussion`,
`scheduleGraduationProjectDiscussion`, `rejectGraduationProjectDiscussionRequest`,
`assignGraduationProjectPanelMember`, `recordGraduationProjectDiscussionOutcome`,
`saveGraduationProjectEvaluation`, `concludeGraduationProjectResult`,
`completeGraduationProjectCorrection`, `acceptGraduationProjectCorrection`,
`addGraduationProjectTeamMember`, `assignGraduationProjectFaculty`,
`endGraduationProjectAssignment`, `setGraduationProjectMilestone`,
`finalizeGraduationProjectEvaluation`, `archiveGraduationProject`,
`listGraduationProjectAssignmentCandidates`, `listMyGraduationProjectNotifications`,
`getGraduationProjectSettings`, `upsertGraduationProjectSettings`,
`listGraduationProjectRubrics`, `upsertGraduationProjectRubric`,
`loadGraduationProjectReport`.

Each maps 1:1 to its RPC above; literal actions are re-validated by zod enums;
profile→user derivation for team/faculty assignment happens server-side.

## 5. Matrix evidence

`tests/graduation-projects/postgres-authorization-matrix-verifier.sql` — 68
rows, fail_rows=0 on disposable PG17 (see GP-07 report). Coverage: UI access
(action-matrix suites), server-function direct call (integration suites), RPC
direct call (this matrix), wrong role/assignment/project/department/state/
literal action, repeated action (idempotent replay), forged ids/department,
future-stage execution, archived-project mutation, grant walls (42501).
