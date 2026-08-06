# PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01

**Mission:** `PORTAL_GRADUATION_PROJECTS_MVP_SCOPE_AND_CONTRACT_FREEZE_01`  
**Mode:** LONG CONTRACT CONSOLIDATION · DOCS-ONLY · NO IMPLEMENTATION · NO PRODUCTION CONNECTION  
**Repository:** `msorori-mh/saba-uni-portal`  
**Required base:** `b71016d6f706cfe01dd1f402338e5d56a83184d8`  
**Branch:** `docs/gp-mvp-scope-contract-freeze-01`  
**Date:** 2026-08-06  

This document freezes the Graduation Projects MVP as a binding, minimal, implementation-ready contract. It consolidates four completed audits. It does not re-audit, expand scope, authorize migration apply, provision users, or implement runtime code.

---

# Decision

**PASS_GRADUATION_PROJECTS_MVP_SCOPE_AND_CONTRACT_FROZEN**

All fixed MVP choices in the mission are resolvable against the four authoritative audits. Draft SQL/runtime gaps are implementation work, not unresolvable contract conflicts. Parallel packages A→B→C→D may proceed against this freeze.

---

# Authoritative Inputs

| # | Audit | Commit | Path | Audit decision |
|---|---|---|---|---|
| 1 | Backend current-state | `5479056afecb4f0036e2ffbaab215e617d9b49c3` | `docs/PORTAL-GRADUATION-PROJECTS-MVP-BACKEND-CURRENT-STATE-AUDIT-01.md` | `HOLD_GRADUATION_PROJECTS_MVP_BACKEND_SOURCE_DRAFTS_ONLY_FIXED_MVP_GAPS` |
| 2 | UI current-state | `463688703bca755c3ed353772417028245e5d6ab` | `docs/PORTAL-GRADUATION-PROJECTS-MVP-UI-CURRENT-STATE-AUDIT-01.md` | `HOLD_GRADUATION_PROJECTS_MVP_UI_NO_RUNTIME_ROUTES_OR_INTEGRATION` |
| 3 | Authorization | `16bf5a4eedaf6845527479c8e6363edbace3ec41` | `docs/PORTAL-GRADUATION-PROJECTS-MVP-AUTHORIZATION-AUDIT-01.md` | `PASS_WITH_NOTES_GRADUATION_PROJECTS_MVP_AUTHORIZATION_PARTIAL` |
| 4 | Data and E2E readiness | `343578413895eb2529b488e4a485ad494cafeef1` | `docs/PORTAL-GRADUATION-PROJECTS-MVP-DATA-AND-E2E-READINESS-AUDIT-01.md` | `HOLD_GRADUATION_PROJECTS_MVP_DATA_E2E_UNAPPLIED_SCHEMA_MISSING_TEST_ONLY_ACTOR_ROSTER_AND_PRIVATE_BUCKET` |

**Baseline facts frozen from audits (do not re-litigate):**

- At base `b71016d6`, no `graduation_project*` objects exist in `supabase/migrations/` or `src/integrations/supabase/types.ts`.
- Rich source-only drafts exist under `docs/migration-drafts/` (DRAFT ONLY — DO NOT APPLY without separate authorization).
- TypeScript domain/lifecycle/rpc and eleven unrouted components exist; zero GP routes/navigation/query hooks.
- Authorization design is fail-closed and assignment-scoped in drafts, but missing leader distinction, supervisor acceptance, and coordinator-only operational scoping relative to this freeze.
- No GP private bucket, no GP TEST_ONLY roster, no GP fingerprint/cleanup RPC, no live E2E.

**Reuse rule:** Adapt the existing draft table/RPC/RLS/event architecture. Do not invent a parallel schema family (`graduation_project_members` / `_supervisors` design names are LEGACY).

---

# Immutable MVP Boundary

## In scope (must be deliverable)

1. Team — one active GP team per student; exactly one leader; one or more members.
2. Proposal — title, problem statement, objectives, summary, exactly one private proposal attachment; leader submits/resubmits.
3. Coordinator review — accept / return with required comments / reject with required reason; exact assigned coordinator only.
4. Supervisor — exactly one pending or accepted supervisor; coordinator assigns; supervisor accept/decline; no operate before accept.
5. Progress — leader basic updates; optional private attachment; supervisor approve/return; E2E requires one return/correction/approval cycle.
6. Final submission — exactly one current final private file; supervisor ready/return; superseded versions auditable, not active.
7. Defense — user-facing «مناقشة مشروع التخرج»; coordinator schedules date/time/venue; ≥2 directly assigned committee members.
8. Evaluation — each committee member submits own score 0–100 and notes; immutable after submit.
9. Final result — average of submitted scores; coordinator records `passed` | `revisions_required` | `failed`.
10. Archive — coordinator archives only after `passed` or `failed`; immutable snapshot; administration read-only viewer.
11. Storage — dedicated private GP bucket (or equivalent isolated private contract); signed short-lived download only.
12. Authorization — RPC-only; default-deny tables; SECURITY DEFINER + fixed `search_path`; exact assignment; positive+negative RPC tests; zero title bypass; no UI-only auth.
13. UI — student dashboard + team/project workspace; faculty assigned list + project workspace; actor-aware panels; one admin read-only overview; reuse existing components; no visual redesign beyond operational completeness.
14. Data/E2E — dedicated TEST_ONLY roster; one complete lifecycle; temps cleaned; evidence preserved.

## Strictly out of scope

See **Explicitly Out of Scope**. Any feature not listed in the in-scope list is forbidden in MVP packages.

---

# Canonical Terminology

| User-facing (AR) | Contract English | Internal SQL / draft alias (allowed) |
|---|---|---|
| مشروع تخرج | graduation project | `graduation_projects` |
| فريق | team | student assignments on a project |
| قائد الفريق | team leader | `student` assignment with `is_leader = true` |
| عضو الفريق | team member | `student` assignment with `is_leader = false` |
| مقترح | proposal | proposal columns + proposal file category |
| منسق مشاريع التخرج | coordinator | assignment role `coordinator` |
| مشرف | supervisor | assignment role `supervisor` |
| مناقشة مشروع التخرج | defense | SQL may retain `discussion*` names |
| لجنة المناقشة | defense committee | `panel_member` / panel tables |
| نتيجة نهائية | final decision | `final_decision` column (not root lifecycle alone) |
| أرشفة | archive | `graduation_project_final_archives` + state `archived` |

**Binding alias rules:**

- UI and product copy MUST use «مناقشة مشروع التخرج» for defense.
- SQL identifiers may keep `discussion` / `panel` for draft continuity.
- Draft outcomes `completed` / `corrections_required` are **not** MVP final decisions. MVP final decisions are only `passed` | `revisions_required` | `failed`.
- Draft roles `department_head` and `dean` MUST NOT retain operational bypass on coordinator RPCs in MVP. They are not MVP operational actors.
- Administration overview is a **read-only viewer**, not an operational assignment role with conclude/archive powers.

---

# Actor Model

| Actor | Identity binding | Scope rule |
|---|---|---|
| Team leader | Active `student` assignment, `is_leader = true`, `user_id = auth.uid()` | Leader-only write transitions for proposal/progress/final/team mutation (pre-lock) |
| Team member | Active `student` assignment, `is_leader = false` | Read project workspace; cannot leader-only transitions |
| Unrelated student | Student with no active assignment on target project | Deny all project RPCs |
| Coordinator | Active `coordinator` assignment on the **exact** project (or department bootstrap only for create) | Sole operational owner of review, supervisor assign, defense schedule, committee assign, result, archive |
| Supervisor (pending) | `supervisor` assignment in `pending` acceptance | May accept or decline only; no progress/final review |
| Supervisor (accepted) | `supervisor` assignment `accepted` | Progress approve/return; final ready/return; no proposal review; no evaluation |
| Unrelated supervisor | Faculty with no assignment on target project | Deny |
| Committee member | Direct assignment to the **exact** defense as committee/panel member | Own evaluation only |
| Unauthorized admin/staff | Global admin/system_admin/registrar/dean/department_head/staff **without** exact GP assignment required by the RPC | Deny; title alone never grants access |
| Administration viewer | Explicitly authorized read-only administration overview path | Status/list overview only; no mutations; no sensitive raw dumps |

**Hard rules:**

1. Every mutating and detail-read RPC requires exact direct assignment (or the create bootstrap rule below).
2. Zero general admin / dean / registrar / department-head title bypass.
3. UI button visibility is never security.
4. Bootstrap create: `create_graduation_project_team` requires an active department-scoped `coordinator` capability for the target department (existing draft bootstrap pattern). After create, that coordinator must hold an active project-level `coordinator` assignment.

---

# Team Contract

| Rule | Binding value |
|---|---|
| Cardinality | One **active** graduation-project team/project membership per student across all projects |
| Leader | Exactly one active leader per project (`is_leader = true`) |
| Members | One or more active members (leader counts as a student assignment; team has leader + ≥0 additional members, with ≥1 student assignment total and leader required) |
| Minimum operational team for E2E | Leader + at least one additional member |
| Team size min/max hardcoded | **Forbidden** unless a separately documented authoritative academic policy is later cited; MVP enforces only uniqueness/leader invariants above |
| Who creates | Assigned department coordinator creates the project/team shell and designates the initial leader |
| Who adds members (pre-lock) | Team leader |
| Who corrects membership (post-lock) | Exact assigned coordinator only (controlled correction) |
| Membership lock | After proposal **acceptance** (`lifecycle_state = approved` or later), leader cannot add/remove members; only coordinator correction |
| Rejected / archived | No further membership mutation |

**Leader-only student transitions:** upsert/submit/resubmit proposal; register proposal/progress/final files as required; submit progress; submit/correct final; (no defense schedule, no evaluation, no result, no archive).

**Member capabilities:** view assigned project workspace, team roster, proposal content, coordinator decision summary, supervisor identity/status, progress history, defense appointment, result/revisions summary, archive metadata (no download beyond authorized signed flows).

---

# Proposal Contract

| Field | Required | Notes |
|---|---|---|
| `title` | Yes | Non-empty bounded text |
| `problem_statement` | Yes | |
| `objectives` | Yes | |
| `summary` | Yes | Map/replace draft `proposal_abstract` → summary |
| Proposal attachment | Exactly one **active** private file, category `proposal` | Required before submit |

| Action | Actor | From state | To state / effect |
|---|---|---|---|
| Upsert proposal fields | Leader | `draft` or `revision_required` | Fields updated; state unchanged |
| Register/replace proposal file | Leader | `draft` or `revision_required` | Prior active proposal file superseded; exactly one active |
| Submit | Leader | `draft` + complete fields + active clean-acceptable proposal file | `submitted` |
| Return (comments required) | Exact coordinator | `submitted` | `revision_required` |
| Reject (reason required) | Exact coordinator | `submitted` | `rejected` (terminal for project operational path) |
| Accept | Exact coordinator | `submitted` | `approved` |
| Resubmit | Leader | `revision_required` + complete fields + attachment | `submitted` |

Members may view; members cannot submit/resubmit/upsert/register proposal files.

---

# Supervisor Contract

| Rule | Binding value |
|---|---|
| Cardinality | Exactly one assignment in status `pending` or `accepted` per active project |
| Assigner | Exact assigned coordinator |
| Initial status | `pending` |
| Accept / decline | Target supervisor only (`auth.uid()` matches assignment) |
| Decline effect | Pending assignment ends; coordinator may assign a different supervisor; project remains `approved` until an acceptance occurs |
| Accept effect | Assignment `accepted`; project may enter `active` when proposal is `approved` and supervisor accepted |
| Operate before accept | Forbidden (progress/final review denied) |
| Unrelated supervisors | Denied |
| Replace | Coordinator may end pending/accepted supervisor and assign another while project is not archived/rejected; still enforce exactly one pending-or-accepted |

Progress and final review require accepted supervisor.

---

# Progress Contract

| Rule | Binding value |
|---|---|
| Submitter | Team leader only |
| Content | Basic text progress update |
| Attachment | Optional private file, category `progress` |
| Reviewer | Accepted supervisor only |
| Outcomes | `approved` \| `returned` (comments required on return) |
| Lifecycle impact | Remains `active` (side workflow) |
| MVP E2E requirement | One full cycle: submit → return → correct → approve |
| Out of scope | Complex task boards, weighted milestone engines as a product feature. Draft milestone tables may be reused internally only as the minimal persistence vehicle for progress/final deliverables, not as a task-management UI. |

---

# Final Submission Contract

| Rule | Binding value |
|---|---|
| Submitter | Team leader |
| File | Exactly one **current** final private file, category `final` |
| Supersede | New current final supersedes prior; prior versions remain auditable, not active |
| Reviewer | Accepted supervisor |
| Outcomes | `ready` \| `returned` (comments required on return) |
| When allowed | `active` (and when `final_decision = revisions_required` for corrected final) |
| Archive gate | Active final file must be clean/accepted (scan + supervisor ready as required by storage/review gates) |

---

# Defense Contract

| Rule | Binding value |
|---|---|
| User-facing term | «مناقشة مشروع التخرج» |
| Internal SQL names | `discussion*` / `panel*` allowed |
| Scheduler | Exact assigned coordinator |
| Schedule fields | Date, time, venue (stored as timestamptz + venue text) |
| Prerequisites | Project `active`; accepted supervisor; current final in supervisor-`ready` + storage clean state |
| Committee size | At least two committee members, each directly assigned to the exact defense |
| Assigner | Exact assigned coordinator |
| Committee actor gate | Only directly assigned members may evaluate that defense |
| Lifecycle | Coordinator schedule moves project to `defense_scheduled`; marking defense held moves to `evaluating` |

Student/supervisor request-to-discuss as a separate product workflow is **not** required. Coordinator may schedule when prerequisites are met (draft `discussion_requested` intermediate is optional and not required by this freeze).

---

# Evaluation Contract

| Rule | Binding value |
|---|---|
| Who scores | Each assigned committee member for that exact defense |
| Payload | Own numeric score `0..100` inclusive + notes |
| Rubric designer | Out of MVP; no dynamic criterion designer required |
| Submit | One-way: submitted evaluation becomes immutable |
| Cross-member read/write | Denied |
| Coordinator visibility | Minimum aggregate only (count submitted, average of submitted scores) required for finalization; not full cross-member notes unless already submitted aggregate fields |
| Detail RPC filtering | Server must not return other members’ evaluations/notes to a committee peer |
| Finalize gate for result | All assigned committee members must have submitted evaluations before coordinator may conclude |

---

# Result and Revisions Contract

**Separation rule (binding):**

- `lifecycle_state` tracks workflow.
- `final_decision` is a separate nullable column: `NULL` | `passed` | `revisions_required` | `failed`.
- Do not overload proposal `revision_required` with post-defense revisions.

| Decision | Terminal? | Actor | Preconditions | Effect |
|---|---|---|---|---|
| `passed` | Yes | Exact coordinator | `evaluating`; all committee scores submitted | `final_decision = passed`; archive allowed |
| `failed` | Yes | Exact coordinator | same | `final_decision = failed`; archive allowed |
| `revisions_required` | No | Exact coordinator | same | `final_decision = revisions_required`; corrected final submission required; supervisor re-review; coordinator re-decision |

**Average score:** computed as the arithmetic mean of all **submitted** committee scores (0–100). Displayed to coordinator for decision support. **No invented academic pass threshold** — coordinator records the decision; the system does not auto-pass/fail from a cutoff.

**Revisions loop (minimal):**

1. Coordinator sets `revisions_required`.
2. Leader uploads corrected current final (supersede).
3. Accepted supervisor marks ready or returns.
4. Coordinator re-decides `passed` | `revisions_required` | `failed`.
5. Re-defense / re-scoring is **not** required by MVP unless coordinator leaves decision unset and project remains `evaluating` with prior scores; default path is corrected final + coordinator re-decision without forcing a new defense.

---

# Archive Contract

| Rule | Binding value |
|---|---|
| Actor | Exact assigned coordinator only |
| Allowed when | `final_decision IN ('passed','failed')` and not already archived |
| Snapshot must preserve | Team roster (leader/members), supervisor, committee, evaluations (scores/notes), final decision + average, current final private file identity |
| Immutability | Archived project rejects all mutating RPCs |
| Administration | Read-only overview may list archived status; no archive mutation from admin viewer |
| Storage | Final private object retained; downloads remain authorized signed short-lived only |

---

# Storage Contract

| Rule | Binding value |
|---|---|
| Bucket | One dedicated private bucket (name frozen for implementation: `graduation-projects-files`) or equivalent isolated private storage contract |
| Public URLs | Forbidden |
| Object key shape | `graduation-projects/{project_id}/{token}-{safe_filename}` |
| Key validation | Reject `..`, `http`, cross-project prefixes |
| Categories | `proposal` \| `progress` \| `final` |
| Cardinality | Exactly one **active** `proposal`; many versioned `progress`; exactly one **current** `final` |
| MIME/size | Validated on upload registration; allowlist/size limits are implementation parameters documented in Package A, not open-ended |
| Pipeline | validate → authorized upload → register metadata → finalize → scan_state `pending`→`clean`\|`quarantined`\|`rejected` |
| Clean gate | Proposal submit, final ready/archive require acceptable clean state as specified by Package A verifiers |
| Download | Authorized short-lived signed URL only after RPC authz; never persist public URL |
| Orphan cleanup | Contract required: storage objects under GP prefixes with no DB row (TEST_ONLY or failed finalize) are deletable via cleanup job/RPC; never delete non-tagged production objects casually |
| Adjacent buckets | Must not reuse `official-documents` or other portal buckets by assumption |

---

# Canonical Lifecycle

## Root lifecycle states (binding)

| State | Meaning |
|---|---|
| `draft` | Team/proposal preparation |
| `submitted` | Proposal awaiting coordinator decision |
| `revision_required` | Proposal returned to leader |
| `rejected` | Proposal rejected (operationally terminal) |
| `approved` | Proposal accepted; awaiting supervisor acceptance (supervisor may already be pending) |
| `active` | Supervisor accepted; progress/final work |
| `defense_scheduled` | Defense scheduled; committee assignment in progress/complete |
| `evaluating` | Defense held; evaluations open / result pending |
| `archived` | Immutable archive |

## Separate final decision

| `final_decision` | When set |
|---|---|
| `NULL` | Before coordinator conclusion |
| `passed` | Terminal success decision |
| `revisions_required` | Non-terminal; corrected final + re-decision |
| `failed` | Terminal failure decision |

## Allowed transitions

```
draft --leader submit proposal--> submitted
submitted --coordinator return--> revision_required
revision_required --leader resubmit--> submitted
submitted --coordinator reject--> rejected
submitted --coordinator accept--> approved
approved --supervisor accept--> active
active --coordinator schedule defense--> defense_scheduled
defense_scheduled --coordinator mark held--> evaluating
evaluating --coordinator conclude passed|failed--> (final_decision set; lifecycle stays evaluating until archive)
evaluating --coordinator conclude revisions_required--> (final_decision set; corrected final loop under active-like final rules)
{final_decision in passed|failed} --coordinator archive--> archived
```

**Side workflows (do not change root state unless noted):**

- Team membership (draft / revision_required / coordinator correction)
- Supervisor assign / decline / replace (`approved` or later pre-archive, with cardinality rules)
- Progress submit/review (`active`)
- Final submit/review (`active`, or while `final_decision = revisions_required`)
- Committee assign (`defense_scheduled`)
- Evaluation submit (`evaluating`)

**Draft extras not required by MVP:** `under_review`, `discussion_requested`, `cancelled` product path, `completed`/`corrections_required` as result vocabulary, dean/head conclude/archive. Implementations may keep unused enum values only if they are unreachable and tested as denied.

---

# RPC Contract

Client access is **RPC-only**. Names below are the frozen minimum inventory. Draft names may be adapted/aliased but semantics must match.

## Write / transition RPCs

| RPC (canonical) | Actor | Purpose |
|---|---|---|
| `create_graduation_project_team` | Department coordinator | Create project in `draft`; designate leader; create coordinator project assignment |
| `add_graduation_project_team_member` | Leader (pre-lock) or coordinator (correction) | Add student member; enforce one-active-team-per-student |
| `remove_graduation_project_team_member` | Leader (pre-lock) or coordinator (correction) | End membership; cannot remove sole leader without transfer/correction rules |
| `upsert_graduation_project_proposal` | Leader | title/problem/objectives/summary |
| `register_graduation_project_file` | Leader (and storage finalize actors as designed) | Register metadata for category `proposal`\|`progress`\|`final` |
| `finalize_graduation_project_file` | Authorized uploader path | Finalize upload + scan gate hooks |
| `submit_graduation_project_proposal` | Leader | `draft` → `submitted` |
| `resubmit_graduation_project_proposal` | Leader | `revision_required` → `submitted` |
| `review_graduation_project_proposal` | Exact coordinator | accept / return+comments / reject+reason |
| `assign_graduation_project_supervisor` | Exact coordinator | Create pending supervisor (cardinality 1) |
| `respond_graduation_project_supervision` | Pending supervisor | accept → `active` when approved; or decline |
| `submit_graduation_project_progress` | Leader | Progress update (+ optional file) |
| `review_graduation_project_progress` | Accepted supervisor | approve / return+comments |
| `submit_graduation_project_final` | Leader | Current final file + submission |
| `review_graduation_project_final` | Accepted supervisor | ready / return+comments |
| `schedule_graduation_project_defense` | Exact coordinator | Date/time/venue; → `defense_scheduled` |
| `assign_graduation_project_committee_member` | Exact coordinator | Direct defense assignment; enforce ≥2 before held/evaluate gates |
| `mark_graduation_project_defense_held` | Exact coordinator | → `evaluating` |
| `submit_graduation_project_evaluation` | Exact committee member | Own score 0–100 + notes; immutable on submit |
| `conclude_graduation_project_result` | Exact coordinator | Set `final_decision` to `passed`\|`revisions_required`\|`failed` |
| `archive_graduation_project` | Exact coordinator | Snapshot + → `archived` |
| `create_graduation_project_signed_download` | Authorized assignee per file rules | Short-lived signed download |
| `cleanup_graduation_project_test_artifacts` | Privileged TEST_ONLY ops path | Fingerprint-scoped cleanup (Package D; never production real data) |

## Common RPC mechanics (binding)

- `SECURITY DEFINER` + `SET search_path = public, pg_temp`
- `REVOKE ALL` from `PUBLIC`/`anon`; `GRANT EXECUTE` to `authenticated` only where intended
- Optimistic concurrency: `p_expected_version` on state transitions
- Idempotency: `p_correlation_id` + append-only `graduation_project_events`
- Deny ⇒ exception, **zero side effects**
- Replay of same correlation ⇒ return prior result, no double mutation

---

# Read Contract

| RPC (canonical) | Actor | Returns |
|---|---|---|
| `list_my_graduation_projects` | Any user with ≥1 GP assignment | Assignment-scoped list rows (state, roles, risk/next-action summaries) |
| `get_graduation_project_detail` | Exact project assignee | Actor-filtered detail: team, proposal, decisions, supervisor status, progress, final meta, defense, **own** evaluation only for committee, aggregate score for coordinator when allowed |
| `list_administration_graduation_projects_overview` | Authorized administration viewer only | Read-only counts/list/filters; no object keys, raw evaluation notes, or mutation affordances |

**Forbidden client patterns:** `from('graduation_project*').select/insert/update/delete`, storage `getPublicUrl` persistence, reading peer evaluations via detail over-fetch.

Department report RPCs from drafts (`get_graduation_project_*_report`) are **not** MVP-required beyond the single administration overview. They must not be exposed as operational bypass tools.

---

# Authorization Matrix

Legend: **ALLOW** = exact actor+state; **DENY** = must fail closed.

| Action | Leader | Member | Coord | Sup pending | Sup accepted | Committee | Admin/Dean/Registrar/Head (no GP assign) | Unrelated student/faculty |
|---|---|---|---|---|---|---|---|---|
| Create team | DENY | DENY | ALLOW (dept bootstrap) | DENY | DENY | DENY | DENY | DENY |
| Add/remove member (pre-lock) | ALLOW | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Membership correction (post-lock) | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Upsert/submit/resubmit proposal | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| Review proposal | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Assign supervisor | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Accept/decline supervision | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY |
| Submit progress/final | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| Review progress/final | DENY | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY |
| Schedule defense / assign committee / mark held | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Submit own evaluation | DENY | DENY | DENY | DENY | DENY | ALLOW | DENY | DENY |
| Write peer evaluation | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| Conclude result | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Archive | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Admin overview read | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW only if explicit admin-viewer grant | DENY |
| Mutate after archived | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |

## Denial and replay behavior

| Case | Required behavior |
|---|---|
| Missing assignment | `P0001` family: exact direct assignment required; zero writes |
| Wrong role / non-leader | Specific precondition denial; zero writes |
| Wrong state / version | Precondition/version denial; zero writes |
| Correlation replay | Return prior entity/result; no duplicate events/mutations |
| Double evaluation submit | Denial; immutable |
| Cross-project object key | Denial |
| Title-only admin/dean/head/registrar | Denial on all operational RPCs |
| UI hidden button | Irrelevant to security proof |

---

# UI Route Contract

Frozen minimum routes (strings are binding for Package C):

| Route | Actors | Purpose |
|---|---|---|
| `/student/graduation-projects` | Leader/member | Dashboard list + next actions |
| `/student/graduation-projects/$projectId` | Leader/member | Shared workspace; actor-aware panels |
| `/faculty-portal/graduation-projects` | Coordinator/supervisor/committee | Assigned projects queue |
| `/faculty-portal/graduation-projects/$projectId` | Same | Shared workspace; actor-aware panels |
| `/admin/graduation-projects` | Administration viewer | **Read-only** overview only |

**UI rules:**

- Reuse `src/components/graduation-projects/*` where safe; wire via Package B adapters only.
- Actor-aware panels inside shared workspace (no separate redesign system).
- No visual redesign beyond operational completeness (loading/error/empty/success, Arabic labels, RTL, responsive overflow).
- No raw UUID committee entry; use identity selectors.
- No actor-facing raw storage object keys.
- Attachments: real file input + progress + finalize + signed download — never metadata-only typing in production UI.
- Navigation entries required for the routes above; no GP entries elsewhere that imply operational admin bypass.
- `/admin/graduation-candidates` remains UNRELATED (degree candidates).

---

# Data and E2E Contract

## TEST_ONLY actor roster (dedicated; do not reuse real staff)

| Slot | Count | Role |
|---|---|---|
| `GP_E2E_LEADER` | 1 | Team leader |
| `GP_E2E_MEMBER_A` | 1 | Team member |
| `GP_E2E_MEMBER_B` | 1 | Team member |
| `GP_E2E_UNRELATED_STUDENT` | 1 | Same-dept preferred, no assignment |
| `GP_E2E_COORDINATOR` | 1 | Exact project coordinator |
| `GP_E2E_SUPERVISOR` | 1 | Pending→accepted supervisor |
| `GP_E2E_UNRELATED_SUPERVISOR` | 1 | Eligible faculty, not on project |
| `GP_E2E_COMMITTEE_1` | 1 | Committee member |
| `GP_E2E_COMMITTEE_2` | 1 | Committee member |
| `GP_E2E_UNAUTHORIZED_ADMIN` | 1 | Admin/system_admin without GP assignment |
| `GP_E2E_UNAUTHORIZED_STAFF` | 1 | Staff/faculty without required assignment |

Package marker: `TEST_ONLY_GP_MVP_E2E_01`.

**Provisioning gate:** only after schema + storage + authorization matrices are ready in a safe non-production environment. Never rebind real faculty/staff.

## One complete E2E journey (binding order)

1. Coordinator creates TEST_ONLY team with leader  
2. Leader adds members A and B  
3. Leader upserts proposal + proposal attachment; submits  
4. Coordinator returns once (comments)  
5. Leader corrects and resubmits  
6. Coordinator accepts  
7. Coordinator assigns supervisor (pending)  
8. Supervisor accepts → `active`  
9. Leader submits progress (+ optional attachment)  
10. Supervisor returns with comments  
11. Leader corrects progress  
12. Supervisor approves  
13. Leader uploads current final; supervisor marks ready  
14. Coordinator schedules defense (date/time/venue)  
15. Coordinator assigns ≥2 committee members  
16. Coordinator marks defense held → `evaluating`  
17. Each committee member submits own score/notes  
18. Coordinator records final decision (`passed` on happy path)  
19. Coordinator archives  
20. Unauthorized actors denied at every stage (matrix)  
21. Temporary artifacts cleaned; final evidence preserved  

## Stop conditions (from data audit, retained)

Halt on dirty unexpected tree, missing schema/bucket/roster, real-staff binding, missing TEST_ONLY marker, auth matrix failure, unauthorized success, or cleanup touching non-TEST_ONLY data.

**AGENTS.md gate:** no browser E2E before completed positive and negative direct-RPC matrices.

---

# Fingerprint and Cleanup Contract

## Fingerprints (evidence bundle)

| Family | Assert |
|---|---|
| Team | Active student set = {leader, memberA, memberB}; exactly one leader |
| One-team rule | Unrelated student has zero assignments on project; leader/members have no second active GP team |
| Proposal | Event order includes submit → return → resubmit → accept; one active proposal file |
| Supervisor | Exactly one accepted supervisor; unrelated supervisor has zero rights |
| Progress | Version chain shows return → resubmit → approve |
| Final | One current final; superseded versions auditable |
| Defense | Schedule fields set; ≥2 committee direct assignments |
| Evaluations | One immutable submitted evaluation per committee member; no peer leakage |
| Result | Average matches submitted scores; `final_decision` recorded by coordinator |
| Archive | Snapshot completeness; lifecycle `archived`; mutations denied |
| Storage | Keys under project prefix; no public URLs; scan clean for archived final |
| Auth | Admin/staff/unrelated denials with zero side effects |

Evidence export location (implementation): `docs/exports/GP-MVP-E2E-01/` (or Package D equivalent) with run SHA + base commit.

## Cleanup

| Delete after evidence export | Preserve |
|---|---|
| Failed/aborted TEST_ONLY child rows | One successful archived TEST_ONLY project + archive snapshot |
| Orphan storage under TEST_ONLY prefixes | Final clean file object + file rows for evidence project |
| Non-evidence bootstrap shells solely for aborted runs | Actor profile shells `TEST_ONLY_GP_*` as evidence parents |
| Local caches/downloads | Append-only events, evaluations, run report |

**Hard prohibitions:** no delete of non-TEST_ONLY profiles/requests/documents/real assignments; no touch of `enrollment_certificate` or `request_types.student_visible`; no cascade into shared academic reference data.

---

# Parallel Package Ownership

## PACKAGE A — DATABASE AND STORAGE

**Owns:**

- `docs/migration-drafts/GRADUATION-PROJECTS-*.sql` deltas toward this freeze (source-only until separately authorized)
- Future reviewed SQL under `supabase/migrations/` **only when separately authorized** (not by this freeze alone)
- Private bucket/storage policies/signed URL SQL contracts
- PostgreSQL verifiers under `tests/graduation-projects/postgres-*.sql` and result markdowns
- Schema constraints: one-active-team-per-student; one leader; one pending/accepted supervisor; file category cardinality; `final_decision`; archive snapshot

**Must not edit:**

- `src/routes/**`
- `src/components/graduation-projects/**`
- Navigation shells / `src/lib/admin-nav.ts` GP entries
- Browser E2E runners

**Expected commit outputs:** SQL draft/migration deltas; storage contract; verifier updates; no UI route activation.

## PACKAGE B — RUNTIME DOMAIN AND RPC ADAPTER

**Owns:**

- `src/lib/graduation-projects/domain.ts`
- `src/lib/graduation-projects/lifecycle.ts`
- `src/lib/graduation-projects/rpc.ts`
- New runtime helpers under `src/lib/graduation-projects/**` (hooks, query keys, error maps, client factory)
- Generated-compatible runtime types consumption (may update local GP types adapters; regeneration of `src/integrations/supabase/types.ts` only when Package A migration promotion is authorized)

**Must not edit:**

- `docs/migration-drafts/**` / `supabase/migrations/**` (except consuming signatures)
- `src/routes/**` route files
- Presentational components except via exported types/contracts

**Expected commit outputs:** complete RPC client parity with frozen inventory; query/mutation adapters; domain state/decision separation; unit tests for pure domain.

## PACKAGE C — ROUTES AND UI

**Owns:**

- GP route files under `src/routes/**` for the frozen paths
- Navigation entries for student/faculty/admin GP links
- `src/components/graduation-projects/**`
- Actor-aware workspace wiring consuming Package B only

**Must not edit:**

- Migrations / storage SQL
- Direct table/storage mutations
- Authorization SQL
- TEST_ONLY provisioning scripts that create real/prod users

**Expected commit outputs:** reachable routes; wired panels; loading/error/empty; file upload/download UX against B adapters; no redesign scope creep.

## PACKAGE D — AUTHORIZATION, CONTRACT TESTS AND E2E PACKAGE

**Owns:**

- Direct RPC positive/negative tests (JWT principals in safe env)
- Authorization matrix verifier
- `TEST_ONLY_GP_MVP_E2E_01` fixture manifest
- E2E specification/runner (safe env only)
- Fingerprint export + cleanup contract tests/scripts

**Must not edit:**

- Production users or production E2E
- Unrelated portal domains
- Operational UI redesign

**Expected commit outputs:** matrix green evidence; E2E spec; cleanup/fingerprint manifests; no production connection.

## Shared files and single owners

| File / area | Single owner | Others |
|---|---|---|
| `docs/migration-drafts/GRADUATION-PROJECTS-*.sql` | A | B/C/D read-only |
| `src/lib/graduation-projects/**` | B | C consumes; D tests against |
| `src/components/graduation-projects/**` | C | B may export types only |
| `src/routes/**` GP routes + `routeTree.gen.ts` (generated) | C | Generated tree updated by C’s route add |
| `tests/graduation-projects/postgres-*.sql` | A | D may add auth matrix tests separately under `tests/graduation-projects/` or `tests/security/` with D ownership documented in commit |
| `tests/graduation-projects/*.test.ts` domain/lifecycle | B owns domain/lifecycle/rpc unit tests; D owns RPC integration/E2E | Do not dual-edit same file in parallel |
| This freeze document | Docs mission (done) | All packages read-only thereafter |

**Parallel edit rule (AGENTS.md):** no two agents share a writable file simultaneously. Prefer package-owned paths; serialize touches to shared test folders.

---

# Dependency and Merge Order

```
A (schema + storage + SQL verifiers)
  → B (domain + RPC adapter + unit tests)
    → C (routes + UI consuming B)
      → D (auth matrix + TEST_ONLY + E2E + cleanup)
```

**Development may run in parallel** against this frozen contract, but **merge order is A → B → C → D**.

| Package | May start coding when | May merge when |
|---|---|---|
| A | Freeze merged | SQL/storage contracts review + disposable verifiers pass |
| B | Freeze available; A signatures stable enough (draft or PR) | A merged; client matches frozen RPC inventory |
| C | B adapter interfaces available (branch/PR) | B merged; no direct table access |
| D | A applied in **safe** env; B client complete | Positive+negative RPC matrices green before E2E execution |

**Apply/deploy/provision** remain separately authorized and are not granted by this freeze.

---

# Acceptance Gates

| Gate | Requirement |
|---|---|
| G0 Contract | This freeze document merged; no MVP scope expansion |
| G1 Schema | Package A delivers constraints + lifecycle/`final_decision` + file categories + private storage contract; disposable PG verifiers pass |
| G2 Authz | Every frozen RPC has direct positive ALLOW for correct actor and DENY for all required negatives; zero side effects on deny |
| G3 Adapter | Package B exposes full write/read inventory; maps errors; correlation/version support |
| G4 UI | Package C routes reachable; actor panels operational; attachments real; admin read-only |
| G5 Roster | TEST_ONLY roster provisioned in safe env only; no real staff |
| G6 E2E | One full journey + negatives + cleanup/evidence; no production |
| G7 Repo checks on runtime changes | `bunx tsc --noEmit`; `bun test tests/student-requests` (repo rule); GP tests; `bun run security:test` when safe env proven; `bun run build` when needed; `git diff --check` |

---

# Explicitly Out of Scope

- Companies and external partners  
- Public project gallery  
- Competitions  
- Funding or incubation  
- AI  
- Plagiarism detection  
- Supervisor matching  
- Mentoring  
- Graduate affairs (`graduate_*` domain)  
- Advanced analytics  
- Public APIs  
- Chat or messaging subsystem  
- Complex task management product  
- Mobile app  
- Grade/transcript writeback  
- Appeals  
- Notifications beyond essential existing portal patterns (explicitly deferrable; not required to freeze MVP core)  
- General admin/dean/registrar/department-head bypass  
- Hardcoded team size policy without authoritative source  
- Advanced rubric designer  
- Production migration apply, publish, deploy (separate authorization)  
- Creation of fake real-staff assignments  
- Changes to `request_types.student_visible`  
- Touching production/test existing requests/documents outside TEST_ONLY_GP package  

---

# Final Decision

**PASS_GRADUATION_PROJECTS_MVP_SCOPE_AND_CONTRACT_FROZEN**

### Why PASS

- The mission’s fixed MVP choices resolve the draft-vs-MVP conflicts identified by the four audits (leader, one-active-team, proposal fields+attachment, supervisor acceptance, coordinator-only operations, `passed`/`revisions_required`/`failed`, private storage, routes, TEST_ONLY E2E).
- Remaining work is implementation under packages A–D, not an unresolvable product conflict.
- Scope is minimal and closed; out-of-scope list is explicit.

### Production impact of this mission

**Zero.** Documentation only. No schema apply, no storage, no users, no E2E, no deploy.

### Binding instruction to implementers

Treat this file as the sole MVP contract authority over draft reports and UI mirrors. Where draft SQL or `availableProjectActions` disagree with this freeze, **this freeze wins**.

---

## Agent report footer

| Item | Value |
|---|---|
| Files modified | `docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md` (this file only) |
| Tests run | None required (docs-only consolidation) |
| Assumptions | Four audit commits remain readable via `git show`; base `b71016d6` is authoritative; no new academic policy appeared after audits |
| Risks | Implementers may still follow draft dean/head conclude/archive paths unless they read this freeze; Package owners must serialize shared test file edits |
| Blockers | None for contract freeze; implementation still blocked on separately authorized schema apply, storage, roster, and auth matrices |
| Production impact | None |
| Decision | **PASS_GRADUATION_PROJECTS_MVP_SCOPE_AND_CONTRACT_FROZEN** |
