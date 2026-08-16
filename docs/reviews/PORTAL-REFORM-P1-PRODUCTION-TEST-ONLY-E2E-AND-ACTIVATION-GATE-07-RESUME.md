# PORTAL_REFORM_P1_PRODUCTION_TEST_ONLY_E2E_AND_ACTIVATION_GATE_07_RESUME

FINAL: **HOLD_PORTAL_REFORM_P1_PRODUCTION_TEST_ONLY_E2E_07_RESUME_P1_03_WORKFLOWS_HAVE_ZERO_TRANSITIONS**

## 1. Baseline (G0)

- P1-01 … P1-06 objects live; `submit_student_request_with_details` active; `trg_p1_guard_detailless_submit` enabled.
- `p1_e2e_07_executions`: RLS on, no policies, `service_role`-only ACL.
- `student_visible = false` for `october_exam_entry_form`, `replacement_student_card`, `grade_appeal` — unchanged for the whole mission.

## 2. TEST_ONLY fixtures provisioned (isolated, marker-named)

Auth identities (all match the enforced `test-only.%@usr.edu.ye` convention):

| key | email | student_profile | level | program |
|---|---|---|---|---|
| oct4 | test-only.p1e2e07.oct4@usr.edu.ye | 53a27bd1… | 4 | TESTONLY-P1-A (4 required courses) |
| oct5 | test-only.p1e2e07.oct5@usr.edu.ye | 259c8f37… | 4 | TESTONLY-P1-B (5 required courses) |
| l3 | test-only.p1e2e07.l3@usr.edu.ye | 17fae91b… | 3 | TESTONLY-P1-A |
| appeal | test-only.p1e2e07.appeal@usr.edu.ye | 0ca2a77d… | 4 | TESTONLY-P1-A |

Supporting fixtures: 2 TEST_ONLY programs + study plans (`is_active=false` on programs), 2 TEST_ONLY offerings/sections (`TESTONLY-P1`, `TESTONLY-P1-EXP`), grade components, 3 enrollments, 3 approved grades (47 / 40 / 40). No real student, staff, or production request was touched.

## 3. Authenticated submit matrix — 12 / 12 PASS

| # | case | expected | result |
|---|---|---|---|
| P1 | october, level 4, 4 remaining | ALLOW | PASS (request created) |
| P2 | replacement card | ALLOW | PASS |
| P3 | grade appeal inside 7-day window | ALLOW | PASS |
| N1 | october with 5 remaining | OCTOBER_REMAINING_COURSES_EXCEEDS_LIMIT | PASS |
| N2 | october at level 3 | OCTOBER_NOT_LEVEL_4 | PASS |
| N3 | tampered course selection | OCTOBER_SELECTION_NOT_AUTHORITATIVE | PASS |
| N4 | hidden-type submit without run_id | denied (42501) | PASS |
| N5 | reuse of a consumed run_id | denied | PASS |
| N6 | another student's run_id | denied | PASS |
| N7 | appeal after 7-day window | FINAL_RESULT_APPEAL_WINDOW_EXPIRED | PASS |
| N8 | generic `create_student_request` for a P1 type | P1_ATOMIC_SUBMIT_REQUIRED | PASS |
| N9 | direct insert into `october_exam_entry_details` | RLS denial | PASS |

Created TEST_ONLY requests: `SR-20260816-14A2339B` (october), `SR-20260816-F01018CE` (card), `SR-20260816-E852B4E3` (appeal).

## 4. Staff authorization probe (step 1, `student_affairs_review`)

| actor | `can_current_user_act_on_step` | `act_on_student_request_step` |
|---|---|---|
| student affairs specialist (bound) | true | 400 — `لا يوجد انتقال للنتيجة: approve` |
| registrar general (unbound for this step) | false | 403 denied |
| revenue finance officer (unbound for this step) | false | 403 denied |

Authorization is exact and fail-closed; no broad admin/registrar bypass.

## 5. BLOCKER

`P1-03-WORKFLOW-SEEDS` created the three active workflows and their steps but **zero rows** in `request_type_workflow_transitions`:

```
grade_appeal            wf=fbd3fe05…  steps=6  transitions=0
october_exam_entry_form wf=b220fede…  steps=4  transitions=0
replacement_student_card wf=a3553b9d… steps=3  transitions=0
```

`act_on_student_request_step` requires a matching transition and aborts the whole action otherwise, so **no P1 step can be completed** by any actor. The full staff lifecycle (payment confirmation, registrar finalize, instructor review, `p1_apply_final_result_decision`, archive) cannot be exercised.

Secondary contract gap found while reading the seeds: `archive` steps for P1 raise `ARCHIVE_REQUIRES_ISSUED_DOCUMENT_CONTRACT` because only `enrollment_certificate` has an archive contract.

Both fixes require a new forward-only migration (P1-07: transition seeds + P1 archive contract), which is **not authorized** by this mission. Nothing was patched.

## 6. Production impact

- Migrations applied: 0. Business data mutated: 0 (only TEST_ONLY rows added).
- `student_requests` 72 → 75 (three TEST_ONLY rows), detail tables 0 → 1 each.
- `student_visible` still `false` for all three P1 services. No activation performed.

## 7. Residue (left in place, not deleted — production deletes are outside authorization)

TEST_ONLY: 4 auth users + student profiles/academic status, 2 programs + study plans, 2 offerings/sections + grade components, 3 enrollments, 3 grades, 3 requests + detail rows, `p1_e2e_07_executions` run rows (`TEST_ONLY_P1_E2E_07_*`).

## 8. Verdict

**HOLD_PORTAL_REFORM_P1_PRODUCTION_TEST_ONLY_E2E_07_RESUME_P1_03_WORKFLOWS_HAVE_ZERO_TRANSITIONS**
