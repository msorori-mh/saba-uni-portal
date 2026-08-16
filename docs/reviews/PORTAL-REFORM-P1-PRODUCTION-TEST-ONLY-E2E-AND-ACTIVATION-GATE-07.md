# PORTAL_REFORM_P1_PRODUCTION_TEST_ONLY_E2E_AND_ACTIVATION_GATE_07

Result: **HOLD** — stopped at G3/G4 preflight, before any TEST_ONLY production write.
Production writes performed by this mission: **ZERO** (read-only verification only).

## G0 — Production baseline (PASS)

| Item | Value |
|---|---|
| LIVE_SOURCE_SHA | `3e47c1c65235f70198a507feb33b825814ab64af` (verified via `/version.json`) |
| P1-01 SHA256_LF | `5bfa4b15f9548d281f80fef7f9b8bfb5b064305eca45308aeaf1b302eff76648` |
| P1-02 SHA256_LF | `02dfcf494816327419169f678b6375232892cef95d087f09cd75dbfb3ffbe9be` |
| P1-03 SHA256_LF | `b359dbf1df9604daaed067e4feda6cb8effffca82a000399f7835590e9634513` (match) |
| P1-04 SHA256_LF | `d9b2bc25d96bbfd93540f1645d147622ce7a7deadc82fe0248422eb5ae5f6337` |
| P1-05 SHA256_LF | `bb43939df053c81ba82b1bb8806ba252da89854c8be671e85757cd9a0f9d679f` |
| P1_PACKAGE_SHA256 | `483351996eb0b7808af8e7826966359ad860d9f44681d485d302d0b0c2b6febb` (match) |
| P1 workflows | 3 rows, all `status=active`, `is_active=true`, version 1 |
| student_visible | october=false, replacement_card=false, grade_appeal=false |

P1_PRODUCTION_BASELINE = PASS

## BLOCKER (exact)

**No authenticated student submission path exists for the three P1 services.**

1. `public.create_student_request(text,text,jsonb,text)` is the only student-facing
   creation RPC. For a request type with `student_visible=false` it raises
   `نوع الطلب غير متاح للطالب (42501)` unless
   `public.b1_e2e_88_allows_hidden_create(...)` returns true.
2. That hidden-create escape hatch is hard-restricted by
   `public.b1_e2e_88_is_five_service(text)` to
   `enrollment_suspension | excused_absence | department_transfer | final_chance | file_withdrawal`.
   The three P1 codes are **not** in that allowlist, so a TEST_ONLY authenticated
   student is denied at creation.
3. `submit_b1_student_request_atomic(...)` is likewise canonical-code bound to the
   same five B1 services.

Secondary contract gaps found in the same read-only sweep (independent of the
visibility problem, and each on its own is an E2E blocker):

4. `p1_assert_october_eligibility(uuid,uuid[])` and
   `p1_assert_replacement_card_eligibility(uuid)` exist but are called by
   **no** function, trigger, or RPC in `public`. The only P1 assert reachable from
   a live path is `p1_assert_final_result_appeal_eligibility`, via
   `p1_apply_final_result_decision`. G3's requirement
   "remaining-course count must be recomputed by backend" therefore has no
   enforcement point on a real submit.
5. No live function writes `october_exam_entry_details` or
   `replacement_card_details`; the P1-01 detail models have no producer.

Any of the three legal ways forward is outside this mission's authorization:
flipping `student_visible` (DENY by G12/G15), applying a new migration to wire a
TEST_ONLY submit path for P1 (requires owner approval), or `service_role`
impersonation of a successful actor (explicitly forbidden).

Execution stopped here per the mission rule "apply new schema migrations only if
an exact E2E blocker is discovered and execution is stopped for owner approval".

## Results

```
TEST_RUN_ID=TEST_ONLY_P1_E2E_07 (allocated, unused — no TEST_ONLY rows created)
OCTOBER_LEVEL4_4=NOT_RUN
OCTOBER_LEVEL4_5_DENY=NOT_RUN
OCTOBER_LEVEL3_DENY=NOT_RUN
OCTOBER_FULL_E2E=BLOCKED
OCTOBER_REVENUE_GATE=BLOCKED
REPLACEMENT_CARD_FULL_E2E=BLOCKED
REPLACEMENT_CARD_DUPLICATE_DENY=BLOCKED
REPLACEMENT_CARD_REVENUE_GATE=BLOCKED
FINAL_APPEAL_SUBMISSION_RULES=BLOCKED
FINAL_APPEAL_FULL_E2E=BLOCKED
FINAL_APPEAL_47_TO_48_TO_50=BLOCKED
COURSEWORK_IMMUTABILITY=NOT_RUN
OFFICIAL_GRADING_RUNTIME=NOT_RUN (P1-05 post-verify PASS recorded in 06B)
GPA_VISIBLE_ANYWHERE=NO
AUTHZ_POSITIVE_MATRIX=BLOCKED
AUTHZ_NEGATIVE_MATRIX=BLOCKED
DIRECT_RPC_BYPASS=ZERO (creation path denies hidden P1 types for all students)
P1_NOTIFICATION_CONTRACT=NOT_RUN
OCTOBER_SAFE_TO_ACTIVATE=NO
REPLACEMENT_CARD_SAFE_TO_ACTIVATE=NO
FINAL_RESULT_APPEAL_SAFE_TO_ACTIVATE=NO
REAL_STUDENT_REQUESTS_CHANGED=0
REAL_STUDENT_RESULTS_CHANGED=0
REAL_GRADE_COMPONENTS_CHANGED=0
REAL_STUDENT_PROFILES_CHANGED=0
REAL_STAFF_PROFILES_CHANGED=0
REAL_FINANCIAL_ROWS_CHANGED=0
TEST_ONLY_RESIDUE=NONE
TEST_ONLY_CLEANUP_STATUS=NOT_REQUIRED
STUDENT_VISIBLE_ROWS_CHANGED=0
SERVICES_ACTIVATED=0
DEPLOY=0
PUBLISH=0
P2_STARTED=0
```

## Required remediation (needs explicit owner authorization — P1-06)

Forward-only migration package that:

- adds a TEST_ONLY hidden-create allowlist covering the three P1 codes, gated by an
  explicit P1 E2E marker, mirroring the B1-88 pattern (never widening B1's own
  allowlist, never touching `enrollment_certificate`);
- wires `p1_assert_october_eligibility` / `p1_assert_replacement_card_eligibility`
  into the submit boundary so the backend recomputes remaining requirements;
- adds the detail-row producers for `october_exam_entry_details` and
  `replacement_card_details` at submit.

Only after that package is applied and post-verified can G3–G16 run.

FINAL: **HOLD_PORTAL_REFORM_P1_PRODUCTION_TEST_ONLY_E2E_AND_ACTIVATION_GATE_07_NO_P1_SUBMIT_PATH_HIDDEN_TYPE_CREATE_RESTRICTED_TO_B1_FIVE_SERVICES**
