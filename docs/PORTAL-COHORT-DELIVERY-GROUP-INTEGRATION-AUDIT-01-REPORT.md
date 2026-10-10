# PORTAL-COHORT-DELIVERY-GROUP-INTEGRATION-AUDIT-01

**Decision:** `PASS_PORTAL_COHORT_DELIVERY_GROUP_INTEGRATION_AUDIT_READY_FOR_DESIGN`

**Mode:** Source-only and read-only audit

**Portal baseline:** `origin/main@7b60ad33f03437d4e52a54633db3de857742ed5f`

**Production impact:** None. No runtime source, applied migration, database, production data, deployment, publication, or `student_visible` value was changed.

## Executive summary

The Portal has a usable section-and-enrollment execution model, but it does not have a first-class academic-cohort or delivery-group model. The authoritative path for a student's actually delivered course is currently:

`student_enrollments → course_sections → course_offerings → courses`

The study plan is curricular intent, not proof of registration, timetable membership, lecturer assignment, or material audience. `student_academic_status` records period and level, while `student_profiles` records program and `study_system`; together they form an incomplete, derived cohort-like context. They do not identify an admitted cohort, approved plan version, delivery group, or individual academic exceptions.

The recommended target is cohort-first curriculum membership plus explicit delivery-group assignment and an individual exception overlay. The existing section model must remain behind a compatibility adapter until all consumers and historical records are migrated. Portal consuming rather than generating schedules and delivery groups is the recommended ownership boundary, but remains pending the authoritative-source decision recorded below.

The principal blocking facts for implementation are:

- no stable `academic_cohort`, `cohort_term_course`, `delivery_group`, or student-group assignment entity;
- no canonical current-term resolver shared by schedule, materials, mobile, and reporting;
- no explicit approved plan binding per student/cohort;
- no complete academic-exception ledger;
- `course_offerings`, `course_sections`, and `class_schedule` all expose anonymous read surfaces through table grants plus applied policies; the schedule policy is fully unbounded and the active offering/section policies still disclose academic grouping metadata;
- all three tables also have broad authenticated `USING (true)` read policies, so UI/RPC restrictions alone cannot provide least privilege;
- existing material cohort fallback can broaden access to every section matching program/level/period;
- no Flutter/Dart client artifact exists in this repository, so only backend contracts can be designed here;
- lecture occurrence/execution monitoring is not represented.

The audit is complete and ready for design. It does not approve a schema, migration, import, or production rollout.

## 1. Current schema inventory

| Entity/contract | Current purpose and relationships | Actual use | Classification | Access/security observation |
|---|---|---|---|---|
| `academic_years` | Period master; `is_current`, dates, status | Imports, requests, offerings, reports | ACTIVE | Authenticated read is broad; current uniqueness is not enforced structurally |
| `semesters` | Child of academic year; code and `is_current` | Imports, offerings, academic status | ACTIVE | Unique only by `(academic_year_id, code)`; consumers must bind year and semester together |
| `academic_levels` | Global numbered levels | Status, plans, offerings | ACTIVE | Not program-specific |
| `programs` | Student/program and offering context; department ownership | Student profile, plans, offerings | ACTIVE | Program is not a cohort |
| `student_profiles` | Student identity, program and study system | Portal-wide | ACTIVE | `program_id` + `study_system` are necessary but insufficient delivery context |
| `student_academic_status` | One row per student/year/semester with level and enrollment status | Student status, reporting, validation | ACTIVE_INCOMPLETE | Unique period row but multiple active rows across periods are possible; latest-active selection is risky |
| `study_plans` | Versioned program curriculum | Study-plan UI/import | ACTIVE | No academic-year validity or explicit student/cohort approval binding |
| `study_plan_courses` | Course by plan, level, semester code; required/elective flag | Study-plan UI/import | ACTIVE_INCOMPLETE | `semester_code` is text, not a period FK; elective choice is not captured |
| `course_offerings` | Course offered for year, semester, program and level | Sections, schedules, grades, imports | ACTIVE | Strong term anchor; anon active-row and authenticated-wide reads disclose course/period/program/level metadata |
| `course_sections` | Executing section under an offering; one faculty owner | Enrollments, timetable, grades, materials | ACTIVE_LEGACY_COMPATIBLE | Anon active-row and authenticated-wide reads disclose grouping/faculty metadata; model conflates grouping and teaching |
| `student_enrollments` | Individual student-to-section membership | Courses, grades, timetable, materials | ACTIVE_AUTHORITATIVE | Correct current delivery truth; can be expensive/redundant as the only cohort mechanism |
| `class_schedule` | Weekly section sessions with type, time and room | Schedule imports and timetable views | ACTIVE | Anon and authenticated reads are unbounded by `USING (true)`; forward ACL/RLS hardening required |
| `faculty_profile_id` on section | Single section lecturer | Faculty views and RLS | ACTIVE_INCOMPLETE | Not a normalized multi-lecturer/component teaching assignment |
| course materials design/runtime | Material and files scoped to section with audience modes | Faculty/student materials | ACTIVE/EVOLVING | Enrollment-only is safest; broad cohort fallback is not a delivery-group proof |
| imports | Plans, offerings/sections, enrollments, grades, schedule | Admin ingestion | ACTIVE | Current order assumes legacy section/enrollment model |
| academic cohort | No canonical table/key found | None | MISSING | Must not be inferred from admission year alone |
| cohort courses/electives | No explicit entity | None | MISSING | Plan rows do not prove term delivery or approved elective selection |
| delivery/practical groups | No explicit entity | Section is used as proxy | MISSING | Needs stable external keys and component-aware membership |
| lecture occurrence/execution | No occurrence/status/evidence model | None | MISSING | Weekly plan is not execution evidence |

### Relevant source locations

- Period and status foundation: `supabase/migrations/20260531230139_df358bbe-d10e-477d-a8ed-06a13fb837cb.sql`.
- Plans and plan courses: `supabase/migrations/20260531231424_21a9b57e-9e93-4533-8cfb-8eeb7f33abc1.sql`.
- Offerings, sections and original schedule policies: `supabase/migrations/20260531232114_d62ab13e-9bf1-4ecc-844e-839f5168e916.sql`.
- Individual enrollments and validation: `supabase/migrations/20260531232752_5865cae8-4ba6-44ae-b10a-fceb5fb3f15c.sql`.
- Schedule replacement/import contracts: `src/lib/imports/class-schedule.ts`, `src/lib/imports/class-schedule.server.ts`, and later forward migrations.
- Import orchestration/templates: `src/lib/imports.functions.ts`, `src/lib/imports/engine.server.ts`, `src/lib/imports/validators.ts`, and `src/lib/imports/templates.ts`.
- Student plan view: `src/routes/student.study-plan.tsx`.
- Materials design and current audience reasoning: `docs/FACULTY-COURSE-MATERIALS-MVP-IMPLEMENTATION-01-REPORT.md` and related source.

## 2. Current student-course behavior

### Registered/current courses

Where the Portal needs actual course membership, the reliable chain is an enrolled `student_enrollments` row joined to its section and offering. This establishes the precise course, term, program/level context, section and assigned faculty. Grades also depend on this chain.

The study-plan page instead selects an active plan by the student's program and lists its plan courses. It is a curriculum browser: it does not prove the student is registered, that the course is offered now, which lecturer teaches it, or which group the student attends.

An empty “registered courses” card can therefore be explained by missing `student_enrollments`, missing/mismatched sections or offerings, an incorrect current-period choice, or incomplete imported data. It must not be filled by treating every plan course as registered.

### Timetable

The student timetable is derivable only from enrolled section membership joined to `class_schedule`. Offering context supplies year and semester, but all read paths must explicitly filter the same canonical current period and published state. A plan or academic-status row alone cannot establish a timetable.

### Theory, practical, lecturer and group

`class_schedule.schedule_type` distinguishes `lecture`, `lab`, and `tutorial`, but the same `course_section_id` is the grouping anchor. There is no component catalog, separate practical group membership, multi-instructor teaching assignment, or delivery-group identity. The section faculty field is therefore a legacy single-owner approximation.

### Materials

Direct enrolled-section membership is a defensible material-audience proof. Program/level/period matching across all sections is not: it can expose parallel sections, different practical groups, or a lecturer's material to students not assigned to that delivery group. Default and future read models should fail closed to explicit enrollment or explicit delivery-group membership.

## 3. Student-to-cohort binding findings

Current binding classification: **`DERIVED_AND_RISKY`**.

| Required dimension | Current source | Reliability |
|---|---|---|
| Program | `student_profiles.program_id` | Exists, but transfer history/effective dating are absent |
| Level | `student_academic_status.level_id` | Exists per period |
| Current semester/year | `student_academic_status` plus `academic_years/semesters.is_current` | Multiple competing notions; canonical resolver missing |
| Study system | `student_profiles.study_system` | Exists, values must be normalized and isolated end-to-end |
| Approved plan | Active plan selected by program | No explicit student/cohort plan binding |
| Academic cohort/admission batch | None | Missing |

Risk cases must fail closed or be surfaced to data-quality review:

- no cohort: do not derive delivery membership from plan alone;
- more than one active cohort/context: return ambiguity, never choose arbitrarily;
- regular/parallel mismatch: deny cross-system results and flag data defect;
- transferred student: require effective program/plan/cohort history and explicit equivalencies;
- suspended/deferred student: preserve academic record but suppress current delivery according to approved status rules;
- incomplete context: return an actionable incomplete-context state rather than an empty-success response.

The existing enrollment validation selects the latest updated active academic-status row. That is insufficient because “latest updated” is not synonymous with canonical current period and can choose a future or stale row.

## 4. Cohort term courses

The desired derivation is:

`program → approved plan version → cohort current level/term → required cohort courses + approved cohort electives → current offerings`

The existing reusable pieces are programs, plans, plan courses, courses, periods, levels and offerings. Missing pieces are cohort identity, plan validity/binding, cohort-term course activation, approved elective choice, study-system isolation at the offering/delivery boundary, and import provenance.

Electives require two scopes:

- cohort-level selection when the institution selects one option for the whole cohort;
- student-level exception when an approved individual selection differs.

Uniqueness must be based on stable source keys and semantic keys, not labels. At minimum, a cohort term course must not repeat the same `(cohort, academic_period, course, component/context)` and external imports must be idempotent.

## 5. Cohorts, delivery groups and legacy sections

| Concept | Meaning | Portal state |
|---|---|---|
| Academic cohort | Students admitted/advanced together under program, plan and study system | Missing |
| Cohort term course | Course approved for that cohort in a specific academic period | Missing |
| Delivery group | Students receiving a course component together | Missing; section proxy used |
| Course offering section | Legacy execution group under an offering | Present as `course_sections` |
| Practical group | Component-specific lab/tutorial membership | Missing; schedule type is not membership |

Classification of current “section” uses:

- enrollments, grades, historical timetable and material records: `LEGACY_COMPATIBILITY_REQUIRED`;
- a whole-course lecture group with exact one-to-one imported identity: `CAN_MAP_TO_DELIVERY_GROUP`;
- plan/cohort inference: `SHOULD_NOT_BE_USED_BY_NEW_FEATURES`;
- generic Arabic label “الشعبة” without distinguishing academic cohort from execution group: `REQUIRES_USER_DECISION` for terminology, not authorization.

Proposed compatibility adapter, design only:

- expose a stable delivery-group read shape;
- map a legacy section only when one section has one unambiguous offering/component/group identity;
- include `source_kind='legacy_section'` and the legacy ID;
- never infer cohort membership from section code;
- reject ambiguous multi-component/multi-system mapping;
- keep historical joins intact until consumer parity and reconciliation pass.

## 6. Scheduling-platform integration contract

All records require `source_system`, immutable `external_key`, source revision or `updated_at`, import batch, and deterministic idempotency key. Updates are upserts only when immutable parents and study-system boundaries match; otherwise reject and quarantine.

| Entity | Stable key / required fields | Relationships and rejection conditions |
|---|---|---|
| Academic cohort | `cohort_external_key`; program, plan version, admission/label year, study system, status | Reject unknown program/plan, duplicate active key, or system mismatch |
| Cohort term course | `cohort_term_course_external_key`; cohort, year, semester, course, required/elective status | Reject noncanonical period, inactive cohort, duplicate semantic course, missing approved elective evidence |
| Cohort elective selection | `selection_external_key`; cohort or student scope, option/course, approval reference | Reject ambiguous scope or unapproved choice |
| Course component | `component_external_key`; cohort term course, type, contact hours | Reject unsupported type or duplicate component |
| Delivery group | `delivery_group_external_key`; component, code, capacity, study system, status | Reject cross-system parent, duplicate code in component, missing component |
| Student group assignment | `assignment_external_key`; student, delivery group, effective period/status | Reject missing cohort-course membership, multiple active groups for exclusive component, cross-system assignment |
| Teaching assignment | `teaching_assignment_external_key`; staff/faculty, delivery group/component, role | Reject unverified identity or incompatible department/role |
| Published session | `session_external_key`; delivery group, day/date/time, room/lab, publication version/status | Reject unpublished payload as student-visible, invalid time, unknown group/room, conflicting revision |
| Room/lab | `room_external_key`; code, type, capacity, active status | Reject duplicate code or incompatible lab requirement |
| Academic period | stable year/semester external keys; dates and canonical state | Reject overlapping/ambiguous current periods |

Import order:

1. normalize study-system vocabulary and load periods, departments/programs, plans, courses and rooms;
2. resolve student/student-profile and faculty/staff master identities using stable external keys;
3. load cohorts and effective plan bindings;
4. load cohort term courses and elective decisions;
5. load components and delivery groups;
6. load student group and teaching assignments;
7. load published schedule versions and sessions.

### Excel versus API/synchronization

| Option | Strengths | Risks | Recommendation |
|---|---|---|---|
| Versioned Excel packages | Fast initial adoption, human-reviewable, fits current import tooling | Stale files, partial packages, weak deletion/revision semantics | Use first for controlled pilot with dry-run, manifest, checksums and all-or-nothing batch validation |
| API/synchronization | Better revisions, observability, incremental publication and idempotency | More authentication, retry, reconciliation and operational work | Target after the contract and pilot data quality stabilize |

Phase-one recommendation: a versioned Excel package generated by the scheduling platform, not manually composed Portal sheets. The same canonical contract should later back an API so Excel is a transport, not a second data model.

## 7. Proposed read models (design only)

All functions are owner-scoped, authenticated, canonical-current-period filtered, published-only where relevant, and fail closed on ambiguous context.

### `get_my_current_term_courses()`

Returns course ID/code/names, credits, membership source (`cohort`, `individual_addition`), status, cohort, study system, components, delivery groups, lecturers, published-session summary, material availability and exception label. Membership formula:

`cohort term courses + approved individual additions - approved individual exclusions`

### `get_my_current_timetable()`

Returns only published sessions for delivery groups assigned to the caller, with course/component/group, lecturer, room, day/date/time and schedule version. It must not expose other groups or draft schedules.

### `get_my_study_plan_progress()`

Returns the explicitly bound plan version, requirements, completed/in-progress/current/pending status, equivalencies, exemptions, repeats and remaining credits. It must distinguish curriculum eligibility from current delivery membership.

### `get_faculty_current_teaching_context()`

Returns only verified current teaching assignments, their cohort course, component, delivery group, published sessions and allowed material audience. Generic faculty role is insufficient without assignment.

### `get_course_material_audience(material_or_context)`

Returns/validates the exact cohort or delivery-group audience and caller authorization. Student access requires explicit current course membership and, for group-specific material, exact group assignment. No program/level-wide fallback should silently widen access.

## 8. Individual academic exceptions

| Case | Current representation | Required design behavior |
|---|---|---|
| Repeated/remaining course | Grades/enrollments can imply history; no canonical exception | Approved addition with reason, period and source decision |
| Equivalency/exemption | Partial academic history/report concepts; no complete delivery overlay | Satisfy plan requirement without creating false current registration |
| Deferred course | Status/request concepts, no course-level overlay | Exclude/defer from term membership with effective period |
| Transferred student | Program changes possible; history not effective-dated sufficiently | Explicit plan/cohort binding plus equivalency decisions |
| Suspended study | Student/request status exists | Suppress delivery while retaining curriculum/history |
| Exceptional addition | Individual enrollment can implement outcome | Preserve approval provenance; do not call it free registration |

This is an **academic membership exception ledger**, not student course registration. It must record decision authority, reason/reference, effective period, add/exclude/satisfy effect and audit history.

## 9. Portal impact matrix

| Surface | Impact |
|---|---|
| Student dashboard / registered courses | `READ_MODEL_CHANGE`, then `UI_REQUIRED` |
| Student timetable | `READ_MODEL_CHANGE`, `DATA_IMPORT_REQUIRED`, `LEGACY_ADAPTER_REQUIRED` |
| Study plan page | `READ_MODEL_CHANGE`, `LABEL_CHANGE` |
| Faculty portal | `BACKEND_REQUIRED`, `UI_REQUIRED` |
| Course materials | `BACKEND_REQUIRED`, `READ_MODEL_CHANGE`, `SECURITY/RLS` gate |
| Lecture execution monitoring | `BACKEND_REQUIRED`, `UI_REQUIRED`, `DATA_IMPORT_REQUIRED` |
| Notifications | `READ_MODEL_CHANGE`; audience must derive from exact membership |
| Reports | `READ_MODEL_CHANGE`, compatibility reconciliation |
| Imports | `DATA_IMPORT_REQUIRED`, manifest/order/reconciliation changes |
| Flutter contracts | `BACKEND_REQUIRED`; consumer work blocked until external artifact supplied |
| Android Capacitor | Shared web contracts; `READ_MODEL_CHANGE`, later build verification |
| Security/RLS | `BACKEND_REQUIRED`; exact owner/group policies and anon schedule hardening |

## 10. Apply and exclude decisions

Apply in Portal design:

- current-term courses as an authoritative read model;
- cohort course membership plus approved individual add/exclude overlay;
- component-aware delivery groups, especially practical sessions;
- strict regular/parallel isolation at every parent and assignment;
- published schedules only;
- cohort-wide versus delivery-group-specific material audiences;
- shared backend contracts for web, Capacitor and external Flutter clients;
- legacy section adapter with explicit provenance.

Recommended exclusions, pending confirmation that the scheduling platform is authoritative:

- free student course registration or section choice;
- lecturer, room or time selection by students;
- schedule generation or conflict resolution;
- creation of delivery groups inside Portal;
- legacy sections as the foundation of new features;
- mass individual enrollment rows when cohort/group membership expresses the same truth, except compatibility/materialized projections proven necessary.

## 11. Risks and dependencies

| Risk | Severity | Gate/mitigation |
|---|---|---|
| Cross-group or cross-study-system disclosure | HIGH | Exact membership RLS/RPC matrices; no broad fallback |
| Ambiguous current period | HIGH | Canonical resolver with zero/multiple-current fail-closed behavior |
| Anonymous offering/section/timetable disclosure | HIGH | Forward hardening must cover table ACLs and anon policies on all three tables; never edit applied history |
| Broad authenticated direct reads | HIGH | Replace `co_select`, `cs_select`, and `sch_select` only through a reviewed forward migration and exact owner/group matrices; UI/RPC restrictions are insufficient |
| Plan treated as registration | HIGH | Separate curriculum and delivery read models/tests |
| Partial/out-of-order platform import | HIGH | Manifest, dependency order, transactional batch or quarantine |
| Legacy section mapping ambiguity | MEDIUM | Explicit adapter provenance and reconciliation report |
| Missing Flutter consumer | MEDIUM | Publish backend manifest; require external repository/artifact for consumer validation |
| Schedule plan called lecture execution | MEDIUM | Introduce occurrence/evidence model before monitoring claims |

Dependencies include an institutional definition of cohort identity and lifecycle, authoritative scheduling-platform keys, plan approval/version rules, regular/parallel terminology, elective approval ownership, exception decision sources, publication semantics, and retention/compatibility requirements.

## 12. Recommended execution sequence

| Phase | Dependencies / likely files | Tests and security gates | Migration / production impact | PASS or HOLD |
|---|---|---|---|---|
| 1. Current-model audit | This report | Inventory review | None | PASS when evidence is complete |
| 2. Integration contract | Scheduling owner decisions; new docs/contracts | Schema fixtures, invalid package cases | None | HOLD on unstable keys |
| 3. Import/source contract | Phase 2; `src/lib/imports/*` later | Dry-run/idempotency/order tests | Future migration likely; no production until approved | HOLD on partial package semantics |
| 4. Binding quality audit | Read-only safe dataset/environment | zero/multiple/mismatch matrices | None for audit | HOLD on unknown source truth |
| 5. Source foundation | Approved model | constraints; anon ACL/RLS and authenticated owner/group matrices for offerings, sections and schedules; regular/parallel isolation | Migration required separately | HOLD without independent security PASS |
| 6. Read models | Foundation + canonical term resolver | owner/cross-user/group/published-state matrices | Migration/RPC likely | HOLD on any bypass |
| 7. Individual exceptions | Academic governance | add/exclude/equivalency audit tests | Migration likely | HOLD without authoritative decision mapping |
| 8. Student UI | Stable read models | loading/empty/ambiguous/accessibility tests | Deploy required separately | HOLD before backend PASS |
| 9. Faculty/materials | Exact teaching/group assignments | direct assignment and audience DENY matrices | Backend/storage changes likely | HOLD on broad service-role mutation |
| 10. Lecture monitoring | Published sessions + occurrence design | occurrence lifecycle and evidence tests | Migration required | HOLD if only weekly plan exists |
| 11. Flutter consumption | Backend manifest + external client artifact | contract/compatibility tests | Separate client release | HOLD until artifact is supplied |
| 12. Legacy retirement | Adoption and reconciliation evidence | parity, historical access, rollback plan | Later migration/cleanup separately approved | HOLD until all consumers migrate |

Parallel-safe work now: integration contract drafting, read-model interface design, read-only binding-quality queries for a safe environment, legacy mapping inventory, and Flutter/backend manifest design. Schema implementation must wait for institutional decisions and independent security review.

## Decisions still needed

1. What immutable source key and lifecycle define an academic cohort?
2. Is the approved study plan bound to cohort, student, or both with effective dates?
3. Are electives chosen institutionally per cohort or individually, and what is the approval source?
4. What normalized value represents the currently called “parallel/private” study system?
5. Can a student have multiple simultaneous delivery groups for one component?
6. What constitutes schedule publication, replacement and cancellation?
7. Which system is authoritative for teaching assignments, rooms and student group assignments?
8. What exact external Flutter repository/artifact consumes the contracts?
9. What retention period and parity evidence permit legacy-section retirement?

These decisions block implementation design choices, not completion of this audit. No architectural option in this report is automatically approved for migration or production use.

## G0–G12 traceability and verification

| Gate | Evidence/conclusion | Status |
|---|---|---|
| G0 | Isolated Portal worktree from `origin/main@7b60ad3`; clean preflight; PR/CI inventory reviewed | PASS |
| G1 | Schema/source/import/RLS inventory in sections 1–2 | PASS |
| G2 | Exact enrollment-based student course behavior and missing-data explanation | PASS |
| G3 | Binding classified `DERIVED_AND_RISKY` with required risk cases | PASS |
| G4 | Reusable plan/offering pieces and missing cohort/elective facts | PASS |
| G5 | Five concepts separated; legacy adapter proposed, not implemented | PASS |
| G6 | Versioned Excel/API contract, identities, order and rejection rules | PASS_FOR_DESIGN; source ownership pending |
| G7 | Five conceptual owner-scoped read models, no RPC written | PASS_FOR_DESIGN |
| G8 | Exception overlay separated from free course registration | PASS_FOR_DESIGN |
| G9 | Web/faculty/materials/mobile/import/security impact matrix | PASS |
| G10 | Apply and recommended-exclude lists; ownership exclusions explicitly pending | PASS_FOR_DESIGN |
| G11 | Twelve-phase roadmap with gates and production boundaries | PASS |
| G12 | This single report; runtime and migrations unchanged | PASS |

Verification executed for this documentation-only audit: `bun test tests/student-requests` PASS (514 tests, 0 failures), `bunx tsc --noEmit` PASS, and `git diff --check` PASS. Repository lint baseline is not used to suppress any finding.

## Final decision

`PASS_PORTAL_COHORT_DELIVERY_GROUP_INTEGRATION_AUDIT_READY_FOR_DESIGN`
