# PORTAL-GRADUATION-PROJECTS-MVP-DATA-AND-E2E-READINESS-AUDIT-01

**Mission:** `PORTAL_GRADUATION_PROJECTS_MVP_DATA_AND_E2E_READINESS_AUDIT_01`  
**Mode:** LONG DATA AND E2E READINESS AUDIT — READ-ONLY — DOCS-ONLY  
**Base HEAD:** `b71016d6f706cfe01dd1f402338e5d56a83184d8`  
**Branch:** `docs/gp-mvp-data-e2e-audit-01`  
**Date:** 2026-08-06  

**Invariants for this mission:** no user provisioning, no TEST_ONLY data creation, no file upload, no production connection, no E2E execution, no migration apply, no deploy/publish. Credentials and tokens are never exposed.

---

# Decision

**HOLD_GRADUATION_PROJECTS_MVP_DATA_E2E_UNAPPLIED_SCHEMA_MISSING_TEST_ONLY_ACTOR_ROSTER_AND_PRIVATE_BUCKET**

Graduation Projects MVP has a source-ready domain, draft SQL, typed client (partial), unrouted UI panels, and disposable PostgreSQL 17 verifiers that prove a lifecycle happy path under `ROLLBACK`. It is **not** data/E2E ready for one complete live lifecycle: schema/RPCs are absent from applied migrations and generated types; no private GP bucket exists; no GP-shaped TEST_ONLY actor roster (coordinator, supervisor, committee, negatives) exists; several required journey steps do not map 1:1 to the current RPC surface; and no GP fingerprint/cleanup contract exists.

Closest proven substitute today: disposable PG17 verifier chain — not browser or staging E2E.

---

# Repository Identity

| Item | Value |
|---|---|
| Package name | `tanstack_start_ts` |
| Remote | `https://github.com/msorori-mh/saba-uni-portal.git` |
| Required base HEAD | `b71016d6f706cfe01dd1f402338e5d56a83184d8` — `Released B1 five services` |
| Audit branch | `docs/gp-mvp-data-e2e-audit-01` |
| Agent rules | `AGENTS.md` — SOURCE-ONLY default; no prod writes; no E2E before positive/negative auth matrix |
| GP domain | `src/lib/graduation-projects/{domain,lifecycle,rpc}.ts` |
| GP UI (unrouted) | `src/components/graduation-projects/*` |
| SQL drafts | `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`, `…-LIFECYCLE-COMPLETION-01.sql` |
| Prior GP reports | `docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`, `…-FOUNDATION-01-REPORT.md`, `…-COMPLETION-01-REPORT.md` |
| Tests | `tests/graduation-projects/*`, `tests/contracts/graduation-projects-mvp-audit-report.test.ts` |
| Applied migrations | **zero** `graduation_project*` objects under `supabase/migrations/**` |
| Generated types | **zero** `graduation_project*` matches in `src/integrations/supabase/types.ts` |
| Routes | **zero** TanStack routes reference graduation-project components |
| Reports catalog | GP entries remain `route: null` / **BLOCKED** (SQL draft unapplied + no route) |

---

# MVP E2E Boundary

## In scope (one required journey)

Prove exactly one complete TEST_ONLY Graduation Projects MVP lifecycle:

1. Create a TEST_ONLY team / project shell  
2. Add team members  
3. Submit proposal with attachment  
4. Coordinator returns once  
5. Team corrects and resubmits  
6. Coordinator accepts  
7. Coordinator assigns supervisor  
8. Supervisor accepts  
9. Team submits one progress update  
10. Supervisor returns it  
11. Team corrects it  
12. Supervisor approves it  
13. Team uploads final submission  
14. Coordinator schedules defense  
15. Coordinator assigns committee  
16. Every committee member submits an evaluation  
17. Final result is calculated/recorded  
18. Project is archived  
19. All unauthorized actors are denied at every stage  
20. TEST_ONLY temporary artifacts are cleaned while preserving final E2E evidence  

## Explicit out of scope for readiness (this audit)

- Provisioning Auth users or passwords  
- Creating teams/projects/proposals/files  
- Applying foundation/lifecycle SQL  
- Creating storage buckets or policies  
- Running browser E2E or connected staging security suites  
- Reusing real staff/faculty sessions as GP TEST_ONLY actors  
- Grade writeback, notifications productization, public document issuance  

## Source model vs required journey (boundary mismatches)

| Required step | Closest source surface | Boundary gap |
|---|---|---|
| 1 Create TEST_ONLY team | `create_graduation_project` — **coordinator / department_head only** | No student-led create; no `TEST_ONLY` marker column on projects |
| 2 Add members | `add_graduation_project_team_member` — coordinator/head; states `draft\|revision_required` | Domain `manage_team` lists student; SQL denies non-coordinator/head. No team-leader role — all members are flat `student` |
| 3 Proposal + attachment | `submit_graduation_project_proposal` | **No proposal-attachment path**; `register_graduation_project_file` only when `active\|corrections_required` |
| 4–6 Return / resubmit / accept | `review_*('require_revision'|'start_review'|'approve')`, `resubmit_*`, then separate `activate_*` | Accept ≠ activate; activation needs milestones/readiness later |
| 7 Assign supervisor | `assign_graduation_project_faculty(...,'supervisor')` | Immediate active assignment |
| 8 Supervisor accepts | — | **No accept/decline RPC**; assignment is not an invitation |
| 9–12 Progress cycle | `submit_graduation_project_deliverable` + `review_graduation_project_submission` on a milestone | Progress = milestone deliverable, not free-form update |
| 13 Final upload | final milestone + `register_file` + external `scan_state='clean'` | Binary upload blocked until private bucket/policy; scan external |
| 14 Schedule defense | `request_discussion` → `schedule_discussion` | Defense = “discussion”; readiness gates apply |
| 15 Committee | `assign_faculty(...,'panel_member')` then `assign_panel_member` | Two-step |
| 16–17 Evaluate / conclude | `save_*` + `finalize_*` + `conclude_graduation_project_result` | Conclude is department_head/dean; may yield `corrections_required` |
| 18 Archive | `archive_graduation_project` | Requires completed + clean accepted final + accepted corrections |
| 19 Negatives | PG17 denial matrices | Source/disposable only — not live E2E |
| 20 Cleanup | — | **No GP cleanup RPC / fingerprint manifest** |

---

# Existing TEST_ONLY Accounts

**Credentials/tokens are intentionally omitted.** Status below is from prior source manifests and migrations already in git — this audit did **not** query production.

## GP-specific TEST_ONLY accounts

**None.** No GP students, coordinators, supervisors, or committee shells are defined for Graduation Projects.

## Reusable B1 student TEST_ONLY shells (portal-wide, not GP-shaped)

| Academic number | profile_id | user_id | Documented scope / notes |
|---|---|---|---|
| `TEST_ONLY_B1_0001` | `7020e51d-19e3-4acb-9597-5145b65d117e` | `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3` | IT-scoped in migrations; heavy B1 request history; cleanup candidate historically |
| `TEST_ONLY_B1_0002` | `b1e20002-0000-4000-8000-000000000002` | `57e805dc-f975-4834-b1cb-f99c09756980` | IT dept `ce485c67-…`, program `97638001-…`; email shell `test-only.b1.e2e02@…`; **evidence parent — do not delete lightly** |
| `TEST_ONLY_B1_0003` | `65f55997-6fd0-40d0-9235-70ac65afeac2` | `3a279561-f8e6-41d9-b8ca-ce60682c9eab` | e2e03 shell; **evidence parent** |
| Isolated axis (pkg-64) | `51b9c5e9…` (truncated in source docs) | — | Cited for negative matrices; not GP-assigned |

Domain markers: `@testonly.quboolye.com`, selected `@usr.edu.ye` shells, `academic_number LIKE 'TEST_ONLY_B1_%'`.

### Fitness for GP E2E (students)

| Check | Assessment |
|---|---|
| Active profiles | Documented as present for 0001–0003 in B1 manifests |
| College/dept/program scope | IT department + IT program for 0002 (and 0001 scoped similarly in migration); usable **only if** GP E2E is authorized on IT |
| Usable login | Auth shells exist in prior manifests; passwords **not** in repo and not verified here |
| Conflicting active projects | **No GP projects exist** (schema unapplied). Concurrent **B1 student_requests** contamination risk is real for 0002 |
| Unsafe real-person linkage | Markers are TEST_ONLY; safe **if** reuse is limited to these academic numbers and never rebinds real staff |

## Staff / faculty TEST_ONLY

| Set | Status |
|---|---|
| Planned seven `test-only.b1.*@usr.edu.ye` / `TEST_B1_STAFF_001..007` | **0/7 created** — HOLD documented in `docs/PORTAL-B1-SEVEN-TEST-ONLY-STAFF-ACCOUNTS-OWNER-SECRETS-PRODUCTION-EXEC-22.md` |
| E2E-88 shells (`sa_spec`, `sa_mgr`, `registrar`, `dh_src`/`dh_tgt`, `unassigned`) | Auth shells only; many lack staff/faculty profiles (`tests/b1-e2e-request-scoped-support-88/IDENTITIES.md`) |
| Faculty-only TEST_ONLY with `faculty_profiles` | **Unresolved / missing** |
| True admin-role TEST_ONLY | **Missing** — `unrelated.admin.test.01d@quboolye.test` is `hr_officer`, not admin |
| Staging security templates | `tests/security/staging-setup.example.env` — `sec-*@test.local` roles; staging-only pattern, not GP roster |

## Real operational identities (NOT TEST_ONLY — do not reuse for GP E2E)

Prior B1 docs resolve real department heads / staff for student-request workflows (e.g. IT dept head `d4aaa5c9-…`). Per `AGENTS.md` and this mission: **do not create fake assignments on real people** and do not treat them as GP TEST_ONLY actors.

---

# Required Actor Roster

Minimum deterministic roster for the required journey + negatives. **Do not create in this mission.**

| Slot | Role shape | Count | Why required |
|---|---|---|---|
| `GP_E2E_LEADER` | student assignment on project (operational “leader”) | 1 | Proposal submit / deliverables / final / discussion request |
| `GP_E2E_MEMBER_A` | student | 1 | Team membership + teammate visibility |
| `GP_E2E_MEMBER_B` | student | 1 | Third member for minimum team proof |
| `GP_E2E_UNRELATED_STUDENT` | student, same college/dept preferred, **no** project assignment | 1 | Cross-project / unassigned denial |
| `GP_E2E_COORDINATOR` | faculty/staff with GP `coordinator` assignment capability in dept | 1 | Create project, team add, proposal review, activate path, schedule, panel bootstrap |
| `GP_E2E_SUPERVISOR` | faculty `supervisor` | 1 | Deliverable review / notes |
| `GP_E2E_UNRELATED_SUPERVISOR` | faculty with supervisor eligibility, **no** assignment on target project | 1 | Wrong-supervisor denial |
| `GP_E2E_PANEL_1..N` | faculty `panel_member` | 2–3 | Committee evaluations / quorum |
| `GP_E2E_DEPT_HEAD_OR_DEAN` | `department_head` and/or `dean` | 1 | `conclude_result` + `archive` (source requires these roles) |
| `GP_E2E_UNAUTHORIZED_ADMIN` | global admin/system_admin **without** project assignment | 1 | Prove no admin bypass |
| `GP_E2E_UNAUTHORIZED_STAFF` | staff/faculty wrong unit or inactive assignment | 1 | Same-role-without-assignment DENY |

### Mapping readiness

| Slot | Available today without provisioning? |
|---|---|
| Leader + 2 members | Partially — at most three B1 TEST_ONLY students; **no GP team semantics**; B1 contamination risk |
| Unrelated student | Partially — among B1 / sec-student-B patterns |
| Coordinator | **No** TEST_ONLY coordinator |
| Supervisor + unrelated supervisor | **No** TEST_ONLY faculty supervisors |
| Panel 2–3 | **No** |
| Dept head / dean TEST_ONLY | **No** (real chairs exist — forbidden as TEST_ONLY substitutes) |
| Unauthorized admin / staff | Partial shells only; admin-negative unresolved |

**Roster verdict:** incomplete — HOLD until a dedicated GP TEST_ONLY actor package is provisioned under a separate authorized mission.

---

# Existing Reference Data

Reusable portal reference data documented in prior audits/migrations (not re-queried here):

| Reference | Evidence of existence | GP usability |
|---|---|---|
| Departments | IT `ce485c67-5f7c-498d-b120-4b1130a86ae8`, CS `11111111-…`, IS `22222222-…` | Usable as department scope once schema applies |
| Programs | e.g. IT program `97638001-87cd-4df0-abe9-63c829504072` | FK target for `create_graduation_project` |
| Academic year | B1 fixtures often use `6b297abe-b4d5-47f0-a24e-ea25c7c691f6` | Must confirm still current-term before E2E |
| Semester | B1 fixtures often use `d4dc2d92-00ce-4ea0-a7ed-da06d546512f` | Same |
| Faculty / dept chairs | Operational faculty_profiles + position_assignments | **Real people — not TEST_ONLY** |
| Student TEST_ONLY profiles | B1 0001–0003 | Students only; no GP course eligibility proof |

---

# Required Reference Data

Minimum reference package before any live GP E2E:

| Need | Status | Gate |
|---|---|---|
| Canonical academic year + semester for the E2E window | Exists in portal; **GP seed/resolver absent** | Must pin exact IDs in fixture manifest |
| Department + program for the team | Exists (IT documented) | Pin one department for all actors |
| Graduation-project course / eligibility marker | **Unresolved academic policy** (audit + foundation reports) | HOLD — eligibility not inventable |
| Team size min/max + leader semantics | **Unresolved** | Source has no leader role |
| Supervisor eligibility + load | **Unresolved**; assignment is raw UUID | Need TEST_ONLY faculty eligible in dept |
| Committee eligibility / quorum / rubric | Partial in SQL (finalize/conclude); academic rubric HOLD | Need 2–3 panel TEST_ONLY faculty |
| Canonical current-term resolver for GP | **Not implemented** | Required by design audit |
| File MIME/size/scan/retention policy | **Unresolved**; draft forbids bucket creation | Blocks step 3 attachment + step 13 final |

---

# Existing Graduation-Project Data

| Surface | Finding |
|---|---|
| Applied DB schema | **Absent** from migrations/types ⇒ **zero** GP project/team/proposal rows in applied portals |
| Disposable PG17 verifiers | Create synthetic projects then **ROLLBACK** — no persistent contamination |
| Production contamination risk if E2E proceeds early | Reusing B1 students with open `student_requests`; binding real coordinators/supervisors; writing into non-GP buckets |
| TEST_ONLY marker on GP rows | **None** — must be designed before live fixtures |

Contamination verdict: no existing GP rows to clean; **high future contamination risk** if E2E reuses B1/request identities or real faculty without a GP marker + cleanup contract.

---

# Storage and Attachments

| Topic | Finding |
|---|---|
| Private GP bucket | **Not created**. Foundation draft explicitly: do not create bucket here |
| Object key shape | `graduation-projects/{projectId}/{token}-{safeBase}` (`isSafePrivateObjectKey` / `buildPrivateObjectKey`) |
| Constraints | no `http`, no `..`, unique `object_key`, `sha256` 64 hex, `byte_size > 0`, `scan_state` default `pending` |
| MIME / size allowlist | **Not defined** in draft — academic decision pending |
| Ownership | Row tied to `uploaded_by_assignment_id`; RLS deny-direct; RPCs only |
| Proposal attachment | **Unsupported** in register states (`active\|corrections_required` only) |
| Progress attachment | Optional via submission linkage after active; binary path still blocked |
| Final submission | Requires clean accepted final evidence for archive |
| Readable keys | Exposed only when `scan_state='clean'` |
| Orphan cleanup | Completion report: orphan object-key cleanup **out of scope** |
| Adjacent buckets | `official-documents`, council/materials paths — **must not reuse by assumption** |

---

# Deterministic Fixture Requirements

**Define only — do not create.**

## Package name (proposed)

`TEST_ONLY_GP_MVP_E2E_01`

## Marker contract (proposed)

| Surface | Marker |
|---|---|
| Project title / abstract prefix | `TEST_ONLY_GP_MVP_E2E_01` |
| Correlation / idempotency namespace | UUID v4 per action; documented in run manifest |
| Events filter | `event_type` + project_id + correlation_id |
| Storage prefix | `graduation-projects/{projectId}/TEST_ONLY_GP_MVP_E2E_01-*` |
| Actor academic numbers / staff codes | `TEST_ONLY_GP_*` (new) — do not overload B1 request evidence parents without owner approval |

## Minimum fixture rows (logical)

1. One department-scoped coordinator bootstrap assignment path (required by `create_graduation_project`)  
2. One project in `draft` with program/year/semester FKs pinned  
3. Three student assignments (`GP_E2E_LEADER`, `MEMBER_A`, `MEMBER_B`)  
4. Coordinator + (later) supervisor + 2–3 panel_member faculty assignments  
5. One progress milestone + one final milestone with weights summing to 100  
6. Proposal cycle artifacts (submitted → revision_required → resubmitted → under_review → approved → active)  
7. One deliverable version chain (submit → require_revision → resubmit → accept)  
8. One final file metadata row with `scan_state='clean'` (after storage policy)  
9. One discussion request + scheduled discussion + panel memberships  
10. N evaluations finalized + conclude result + archive  
11. Negative actors present but **unassigned** to the project  

## Explicit non-goals of the fixture package

- No real-person staff rebinding  
- No payment/fee rows  
- No `official_documents` issuance  
- No mutation of `request_types.student_visible`  
- No reuse of B1 evidence request numbers as GP parents  

---

# Complete E2E Sequence

Sequential happy path mapped to source RPCs. Stop if any step fails or a stop condition fires.

| # | Actor | Action | Source RPC / note | Expected state / evidence |
|---|---|---|---|---|
| 0 | Owner/ops | Preflight: schema applied, bucket policy live, roster loginable, term IDs current | — | Go/No-Go |
| 1 | Coordinator | Create project | `create_graduation_project` | `draft`; event `project_created` |
| 2 | Coordinator | Add 3 students | `add_graduation_project_team_member` ×3 | 3 active `student` assignments |
| 3a | Student | Submit proposal | `submit_graduation_project_proposal` | `submitted` |
| 3b | — | Proposal attachment | **BLOCKED in current model** | Requires schema/product change or journey amendment |
| 4 | Coordinator | Return once | `review_*('start_review')` then `require_revision` **or** direct `require_revision` from `submitted` per allowed transitions | `revision_required` + reason |
| 5 | Student | Resubmit | `resubmit_graduation_project_proposal` | `submitted` |
| 6a | Coordinator | Accept | `start_review` → `approve` | `approved` |
| 6b | Coordinator/supervisor | Set milestones (progress + final, weight 100) | `set_graduation_project_milestone` | milestones ready |
| 6c | Coordinator | Activate | `activate_graduation_project` | `active` |
| 7 | Coordinator | Assign supervisor | `assign_graduation_project_faculty(...,'supervisor')` | active supervisor |
| 8 | Supervisor | Accept | **NO RPC** | Journey amendment or new invitation RPC required |
| 9 | Student | Progress deliverable | `submit_graduation_project_deliverable` | submission pending review |
| 10 | Supervisor | Return | `review_graduation_project_submission(...,'require_revision')` | revision note required |
| 11 | Student | Correct | re-submit deliverable (versioned) | new submission version |
| 12 | Supervisor | Approve | `review_…('accept')` | accepted progress |
| 13 | Student | Final upload | final milestone deliverable + `register_graduation_project_file` + scan→`clean` | clean final file |
| 14a | Student/supervisor | Request defense | `request_graduation_project_discussion` | `discussion_requested` if readiness OK |
| 14b | Coordinator | Schedule | `schedule_graduation_project_discussion` | `discussion_scheduled` |
| 15 | Coordinator | Assign committee | `assign_faculty(...,'panel_member')` ×N + `assign_panel_member` ×N | panel set |
| 15b | Coordinator | Record held | `record_graduation_project_discussion_outcome('held')` | `evaluating` |
| 16 | Each panel member | Evaluate + finalize | `save_graduation_project_evaluation` + `finalize_graduation_project_evaluation` | all finalized |
| 17 | Dept head/dean | Conclude | `conclude_graduation_project_result` | `completed` (or corrections branch — not the happy path) |
| 18 | Dept head/dean | Archive | `archive_graduation_project` | `archived` |
| 19 | Negatives | Matrix at each stage | see Negative Test Sequence | all DENY with zero side effects |
| 20 | Cleanup job | Remove temps; keep evidence | see Cleanup Contract | orphans gone; evidence preserved |

**Client gap:** `src/lib/graduation-projects/rpc.ts` omits foundation methods (`submit_graduation_project_proposal`, `add_graduation_project_team_member`, `set_graduation_project_milestone`, `request_graduation_project_discussion`, `finalize_graduation_project_evaluation`, `archive_graduation_project`) — E2E harness must call SQL names directly or extend the client first.

---

# Negative Test Sequence

Run after positive auth for the same stage is green. UI hide is **not** security proof (`AGENTS.md`).

| Stage | Unauthorized actor | Denied action | Expected |
|---|---|---|---|
| Create | Student / unrelated faculty / admin without assignment | `create_graduation_project` | `project creation assignment required` / assignment required |
| Team add | Student / unrelated coordinator / admin | `add_graduation_project_team_member` | assignment / state denied |
| Proposal submit | Unrelated student / supervisor / admin | `submit_graduation_project_proposal` | exact direct assignment required |
| Proposal review | Student / supervisor / unrelated coordinator / admin | `review_graduation_project_proposal` | DENY |
| Activate | Student / supervisor / wrong version | `activate_graduation_project` | DENY / precondition failed |
| Assign supervisor | Student / unrelated faculty / admin | `assign_graduation_project_faculty` | DENY |
| Deliverable submit | Unrelated student / panel / admin | `submit_graduation_project_deliverable` | DENY |
| Deliverable review | Student / unrelated supervisor / admin | `review_graduation_project_submission` | DENY |
| File register | Wrong state / wrong key prefix / unrelated actor | `register_graduation_project_file` | state/key/assignment DENY |
| Discussion request | Unready project / unrelated actor | `request_graduation_project_discussion` | readiness/assignment DENY |
| Schedule / panel | Student / unrelated staff / admin | schedule / assign panel | DENY |
| Evaluate | Non-panel faculty / student / admin / other panel member writing other’s eval | `save_*` / finalize | DENY |
| Conclude / archive | Student / supervisor / panel / admin without role | conclude / archive | DENY |
| Terminal freeze | Any writer after `archived` | any mutation | DENY (read/report only) |
| Cross-project | Actor assigned to project A acting on B | any write | DENY + zero side effects |

Disposable PG17 verifiers already encode substantial denial/idempotency matrices; live E2E must re-prove the same with real JWT principals from the GP TEST_ONLY roster.

---

# Fingerprint Contract

Exact fingerprints to capture in the E2E evidence bundle (proposed; none exist yet for GP).

| Family | Fingerprint |
|---|---|
| Unrelated students | `user_id` / `student_profile_id` of `GP_E2E_UNRELATED_STUDENT`; assert zero assignments on target `project_id` |
| Unrelated projects | Any other `graduation_projects.id` must remain unchanged (row version + state hash) |
| Teams | Set of active `(project_id, role='student', user_id)` = exactly {leader, memberA, memberB} |
| Proposals | Ordered events: `proposal_submitted` → `proposal_revision_required` → `proposal_submitted` → `proposal_review_started` → `proposal_approved` (+ versions) |
| Assignments | Active supervisor + coordinator + panel_member user_ids; ended_at null; department_id match |
| Evaluations | One finalized evaluation per panel assignment; scores checksum; student cannot read before conclude |
| Attachments | `object_key` prefix `graduation-projects/{projectId}/`; sha256; scan_state; byte_size; uniqueness |
| Notifications | If/when wired: recipient set + template key + idempotency key; until then assert **no accidental** notification spam to real users |
| Audit events | Append-only `graduation_project_events` count/types/correlation_ids; UPDATE/DELETE rejected |
| User roles | No global admin/registrar bypass; authority = direct project assignment only |
| Storage objects | Storage listing under project prefix equals registered clean keys; no public URLs |

Evidence export layout (proposed): `docs/exports/GP-MVP-E2E-01/` with CSV/JSON of project, assignments, events, files, evaluations, archive row — plus run SHA and base commit.

---

# Cleanup Contract

## Temporary (delete after evidence export)

| Class | Rule |
|---|---|
| Non-evidence GP child rows from failed/aborted runs | Delete only rows tagged `TEST_ONLY_GP_MVP_E2E_01` |
| Pending/orphan storage objects under failed project prefixes | Remove storage objects whose keys are registered to TEST_ONLY projects **or** unmatched orphans under the TEST_ONLY prefix |
| Draft idempotency / bootstrap coordinator-only shells created solely for the run | Removable if not referenced by preserved evidence project |
| Session caches / local downloads | Local only |

## Preserved final evidence (do not delete)

| Class | Rule |
|---|---|
| One archived SUCCESS project row + final archive metadata | Keep |
| Append-only event stream for that project | Keep |
| Final clean file metadata + storage object for the archived project | Keep |
| Evaluation finalization rows used to conclude | Keep |
| Actor profile shells (`TEST_ONLY_GP_*`) | Keep as parents (like B1 0002/0003 evidence parents) |
| This audit doc + future run report | Keep in git |

## Hard prohibitions

- No delete/update of non-`TEST_ONLY_GP_*` profiles, requests, documents, or real faculty assignments  
- No touch of `enrollment_certificate` / `request_types.student_visible`  
- No cascade that removes shared academic reference data  
- No production cleanup without a CAS/manifest RPC patterned after B1 `cleanup_b1_e2e_88_package`  

## Orphan storage rule

1. List `graduation_project_files` for TEST_ONLY projects.  
2. List storage objects under `graduation-projects/{projectId}/`.  
3. Delete storage objects with no DB row **only** when project is TEST_ONLY-tagged.  
4. Never delete objects for non-TEST_ONLY prefixes.

**Status:** contract defined; **cleanup RPC/manifest not implemented**.

---

# Stop Conditions

Halt immediately (no further writes) when any of the following is true:

1. Working tree dirty with unexpected changes / wrong base HEAD  
2. Foundation or lifecycle SQL not applied in the target environment  
3. Private GP bucket/policy missing or MIME/scan policy undecided while journey requires uploads  
4. Any required TEST_ONLY actor missing, inactive, wrong department, or lacking login  
5. Attempt would bind or mutate a **real** staff/faculty assignment  
6. Project create/team add would proceed without `TEST_ONLY_GP_MVP_E2E_01` marker  
7. Proposal-attachment step required but RPC/state model still forbids files outside `active\|corrections_required`  
8. Supervisor-accept step required but no accept RPC and no owner-approved journey amendment  
9. Positive auth for a stage is not green — do not run negatives or continue  
10. Any RPC succeeds for an unauthorized actor (security stop)  
11. State/version precondition fails unexpectedly (optimistic concurrency drift)  
12. Discussion readiness blockers unresolved (`team_missing`, `supervisor_missing`, `milestone_weight_invalid`, `clean_final_file_missing`, etc.)  
13. Conclude yields `corrections_required` when happy-path archive was planned — branch or stop  
14. Cleanup would touch non-TEST_ONLY data or evidence parents  
15. Production project ref detected when staging-only credentials were required  

### Sequential dependencies (hard)

```
schema+types → storage policy → TEST_ONLY roster → coordinator bootstrap
  → create project → add members → proposal cycle → milestones → activate
  → assign supervisor → (accept gap) → progress cycle → final+scan clean
  → discussion request → schedule → panel → held → evaluations finalized
  → conclude → archive → evidence export → cleanup temps
```

Per `AGENTS.md`: **no E2E before completed positive and negative authorization matrices**.

---

# Missing for MVP

| # | Missing item | Blocks |
|---|---|---|
| 1 | Applied foundation + lifecycle SQL + regenerated types | All live RPCs |
| 2 | Private bucket + storage policies + scan hook | Steps 3b, 13, archive evidence |
| 3 | MIME/size/retention academic approval | Storage policy |
| 4 | GP TEST_ONLY actor roster (coord, supervisors, panel, dept head/dean, admin/staff negatives) | Steps 1–19 |
| 5 | Student-led team create **or** approved journey amendment to coordinator-led create | Step 1 semantics |
| 6 | Proposal attachment support **or** journey amendment | Step 3 |
| 7 | Supervisor accept/decline RPC **or** journey amendment | Step 8 |
| 8 | Client wrappers for omitted foundation RPCs | Typed E2E harness |
| 9 | TanStack routes / feature activation | Browser E2E |
| 10 | Eligibility course/program/term rules | Who may be on a team |
| 11 | Team leader / team-size policy | Roster semantics |
| 12 | GP fingerprint + cleanup RPC/manifest | Step 20 |
| 13 | Notification contract (optional for MVP proof) | Observable side effects |
| 14 | Connected staging security harness for GP | Live denial proof |

---

# Exact Files and Objects

## Source / docs (exist)

- `docs/GRADUATION-PROJECTS-MVP-AUDIT-AND-DESIGN-01-REPORT.md`
- `docs/GRADUATION-PROJECTS-MVP-FOUNDATION-01-REPORT.md`
- `docs/GRADUATION-PROJECTS-COMPLETION-01-REPORT.md`
- `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
- `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`
- `src/lib/graduation-projects/domain.ts`
- `src/lib/graduation-projects/lifecycle.ts`
- `src/lib/graduation-projects/rpc.ts`
- `src/components/graduation-projects/*.tsx`
- `src/lib/reports/catalog/entries.ts` (GP reports BLOCKED)
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
- `AGENTS.md`
- `package.json`

## Adjacent TEST_ONLY / cleanup patterns (reuse design language only)

- `tests/b1-e2e-request-scoped-support-88/IDENTITIES.md`
- `tests/b1-e2e-request-scoped-support-88/CLEANUP_MANIFEST.md`
- `docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md`
- `docs/PORTAL-B1-SEVEN-TEST-ONLY-STAFF-ACCOUNTS-OWNER-SECRETS-PRODUCTION-EXEC-22.md`
- `docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-TEST-FIXTURES-SEED-MIGRATION-SOURCE-PACKAGE-64-REPORT.md`
- `tests/security/staging-setup.example.env`

## Must not exist yet for live E2E (confirm absence)

- Applied `graduation_project*` migrations  
- Generated DB types for GP tables/RPCs  
- Private `graduation-projects` bucket  
- `TEST_ONLY_GP_*` actor package  
- GP Playwright/Cypress suite  
- GP cleanup RPC  
- Routed GP UI feature flag  

## This audit output

- `docs/PORTAL-GRADUATION-PROJECTS-MVP-DATA-AND-E2E-READINESS-AUDIT-01.md` (**this file**)

---

# Recommended Implementation Tasks

Ordered for a later authorized mission (not executed here):

1. **Owner decisions:** amend journey for coordinator-led create, no proposal attachment until active, and assignment-without-accept — **or** authorize RPC/product gaps.  
2. Close academic HOLDs: eligibility, team size/leader, file policy, quorum/rubric.  
3. Authorize and apply foundation + lifecycle SQL on disposable/staging only; regenerate types.  
4. Authorize private bucket + policies + scan path; still no public URLs.  
5. Extend `GraduationProjectsRpcClient` with missing foundation RPCs.  
6. Provision `TEST_ONLY_GP_*` roster (students + faculty coordinator/supervisor/panel/dept head or dean + negatives); never rebind real staff.  
7. Seed one marked fixture project package; pin year/semester/program/department IDs.  
8. Implement positive RPC matrix, then negative matrix, both with JWT principals.  
9. Add routes only after RPC matrices pass.  
10. Define fingerprint export + cleanup RPC (B1-style CAS/manifest); preserve archived evidence.  
11. Only then: browser E2E for the single journey + cleanup verification.  

---

# Out of Scope

- Creating or mutating any database rows  
- Provisioning Auth users or resetting passwords  
- Uploading binaries or creating buckets  
- Applying migrations or regenerating types  
- Connecting to production / running E2E  
- Publish, deploy, or feature activation  
- Changing `request_types.student_visible`  
- Touching enrollment certificate or real requests/documents  
- Inventing academic eligibility or grade writeback  
- Using real faculty/staff as TEST_ONLY GP actors  

---

# Final Decision

**HOLD_GRADUATION_PROJECTS_MVP_DATA_E2E_UNAPPLIED_SCHEMA_MISSING_TEST_ONLY_ACTOR_ROSTER_AND_PRIVATE_BUCKET**

### Summary of blockers

1. GP schema/RPCs are draft-only (absent from applied migrations and generated types).  
2. No private GP storage bucket/policy; proposal attachments unsupported in current state machine.  
3. No GP TEST_ONLY actor roster for coordinator, supervisors, committee, dept head/dean, or admin/staff negatives.  
4. Required journey mismatches: student-created team, proposal attachment, supervisor accept.  
5. No GP fingerprint/cleanup contract; typed client incomplete; UI unrouted.  
6. Academic eligibility/file-policy HOLDs remain open.  

### What already passes (source-only)

- Domain authorization model (direct assignment, no admin bypass).  
- Draft SQL + disposable PostgreSQL 17 positive/negative/idempotency verifiers with `ROLLBACK`.  
- Bun unit/contract tests for foundation/lifecycle pure logic and SQL draft strings.  

### Production impact of this mission

**Zero.** Docs-only audit artifact. No production read/write, no data creation, no E2E run.

---

## Agent report

| Field | Value |
|---|---|
| Files modified | `docs/PORTAL-GRADUATION-PROJECTS-MVP-DATA-AND-E2E-READINESS-AUDIT-01.md` only |
| Tests run | None (docs-only; E2E forbidden) |
| Assumptions | Prior B1/GP reports and migrations accurately describe TEST_ONLY shells; no live DB revalidation this mission |
| Risks | Reusing B1 students or real faculty for a future GP E2E without markers would contaminate evidence and violate AGENTS.md |
| Blockers | Schema unapplied; roster missing; storage missing; journey gaps |
| Production impact | None |
| Decision | **HOLD_GRADUATION_PROJECTS_MVP_DATA_E2E_UNAPPLIED_SCHEMA_MISSING_TEST_ONLY_ACTOR_ROSTER_AND_PRIVATE_BUCKET** |
