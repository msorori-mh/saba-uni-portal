# PORTAL_REFORM_P1_STRICT_RUNTIME_ASSIGNMENT_REUSE_SOURCE_CLOSURE_08A

MODE: SOURCE_ONLY + PG17_REHEARSAL + PRODUCTION_READONLY_PREFLIGHT
PRODUCTION_WRITES = 0 | MIGRATION_APPLY = 0 | DEPLOY = 0 | PUBLISH = 0 |
STUDENT_VISIBLE_CHANGE = 0 | P2 = NOT_STARTED

## 1. Blocker being closed

After P1-07, the three existing TEST_ONLY P1 runtimes carried **zero direct
assignees**, because `submit_student_request_with_details` initialized the
runtime through the generic (role-pool) initializer while
`can_current_user_act_on_step` enforces the strict contract
(`num_nonnulls(assigned_*) = 1`). Result: no staff actor could act.

## 2. Deliverable (source only)

`docs/migration-drafts/p1/P1-08-STRICT-RUNTIME-ASSIGNMENT-REUSE.sql`
SHA256 (LF-normalized, `SHA256_LF_NORMALIZED_V1`):
`d172c65dc7621317b1b46d86281bd9f968475e4fdf45bdd6cc0badea234e9777`

What it does — all of it by **reuse**, no new engine, no new runtime table, no
parallel authorization system, no role/admin/registrar/dean bypass:

1. Pins the P1 runtime contract into the existing
   `b1_workflow_runtime_contract_snapshot` (13 configured steps) and disables
   legacy-shape fallback for the three P1 services.
2. Extends the **existing** `initialize_b1_request_workflow_strict` to accept
   `october_exam_entry_form`, `replacement_student_card`, `grade_appeal`, keeping
   the B1 branch byte-identical.
3. Points the P1 submit path at that strict initializer (single call-site swap).
4. Grade-appeal department scope derived from the appealed course
   (`grade_appeal_details → course_sections → course_offerings → courses.department_id`),
   never from the student profile.
5. One contextual exception — `grade_appeal / instructor_review` — bound to the
   authoritative section instructor (`assigned_faculty_profile_id` only), and
   authorized by `p1_current_user_is_appeal_section_instructor`. It is an
   identity binding, not a role bypass.
6. Forward repair of exactly the three authorized TEST_ONLY requests, gated on
   the `TEST_ONLY_P1_E2E_07_` marker and fail-closed. No recreation, no history
   reset, no touching of real requests.

## 3. PG17 isolated rehearsal — PASS

Harness: `scripts/p1-strict-assignment-08a-pg17/` (throwaway cluster, port 55434).
Chain: base harness → P1-01..P1-05 → atomic-submit harness → P1-06 →
production strict-runtime preimages → P1-07 → fixtures → **P1-08 applied twice**
→ matrix.

Result: `P1_08_STRICT_RUNTIME_ASSIGNMENT_PG17_REHEARSAL_PASS` — **73/73 assertions**.

Covered:
- Preflight reproduces production exactly: 13 runtime rows with zero assignees.
- Repair leaves **zero** unassigned rows; instructor step bound to the section
  instructor with provenance metadata; appeal department-head steps bound to the
  department of the appealed course.
- Full positive/negative matrix over 10 actors on the first active step of each
  service (30 decisions) + wrong-action denial.
- Continuation of all three requests step by step (department head → instructor →
  academic decision; payment confirmation → registrar finalize / card issuance),
  with negative cases at every step: other-department head, non-section faculty,
  registrar, student-affairs manager, request owner — all denied.
- Tamper cases: removing the contextual provenance metadata, or changing the
  section instructor, immediately revokes the instructor's authority.
- Future submissions initialize strictly (ZERO_UNASSIGNED_FUTURE_RUNTIME) and an
  appeal whose section has no valid instructor fails closed.
- Repair refuses a non TEST_ONLY request.
- **B1 non-regression**: `excused_absence` still initializes strictly, keeps one
  assignee per step, keeps its legacy fallback, and its authorization matrix is
  unchanged.

Fidelity note: the rehearsal preimage of the pre-P1-08 strict initializer stubs
the *resubmit* branch (P1-08 replaces that whole function anyway); the resubmit
path itself was not exercised.

## 4. Production read-only preflight

| service | steps | active assignments per step | note |
|---|---|---|---|
| october_exam_entry_form | 4 | 1 / 1 / 1 / 1 | resolves once everywhere |
| replacement_student_card | 3 | 1 / 1 / 1 | resolves once everywhere |
| grade_appeal | 6 | registrar 1, dept_head 3, instructor 0, dept_head 3, registrar 1, archive 1 | see below |

- `department_head` has 3 active assignments (علوم الحاسوب / نظم المعلومات /
  تكنولوجيا المعلومات), all `position_assignment` with exactly one actor. The
  appealed course of `SR-20260816-E852B4E3` belongs to **قسم علوم الحاسوب**, so
  the department-scoped resolver resolves to exactly one.
- `course_instructor` has 0 generic assignments by design — it is the contextual
  binding.
- `student_visible = false` for all three types; unchanged.

## 5. Remaining blocker before any apply

`TESTONLY_INSTRUCTOR_FIXTURE_REQUIRED = YES`
The appealed section of `SR-20260816-E852B4E3` (`TESTONLY-P1`) is currently
taught by a **real faculty member** (أ. يوسف عبدالواحد الهجري). Applying P1-08
would bind a real person to a TEST_ONLY runtime step. Before P1-08 is applied,
that section must be assigned a TEST_ONLY faculty fixture (or the appeal must be
re-pointed at a TEST_ONLY section).

## 6. Verdict

**PASS_P1_08_SOURCE_CLOSURE_PG17_REHEARSAL_73_OF_73**
with **HOLD_P1_08_PRODUCTION_APPLY_TESTONLY_INSTRUCTOR_FIXTURE_REQUIRED**.

No production write, migration, deploy, publish or visibility change was made.
