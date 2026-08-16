# PORTAL_REFORM_P1_06_CONTROLLED_PRODUCTION_APPLY_07B

MODE: CONTROLLED PRODUCTION APPLY (P1-06 only)
SOURCE: `docs/migration-drafts/p1/P1-06-ATOMIC-SUBMIT-PATH.sql`

## G0 — Pre-apply state (read-only)

- P1-01..P1-05 present (`p1_active_student_profile`, `p1_enrollment_result`,
  `p1_assert_october_eligibility`, `p1_assert_replacement_card_eligibility`,
  `p1_assert_final_result_appeal_eligibility`, `p1_apply_final_result_decision`).
- Business counters: `student_requests=72`, `grade_appeal_details=0`,
  `october_exam_entry_details=0`, `replacement_card_details=0`,
  active workflows = 9.
- The three P1 request types: `student_visible = false`.
- Byte-level diff of the draft's `create_student_request` and
  `submit_student_request` against the live production bodies: identical apart
  from the added P1 guards (and `SET search_path` formatting).

## G1 — Apply

Migration 1 (P1-06 body) applied successfully:

- `p1_is_atomic_submit_service(text)`
- `p1_e2e_07_executions` (RLS enabled, no policies — fail closed)
- `p1_e2e_07_marker()`, `p1_actor_is_test_only(uuid)`,
  `p1_e2e_07_allows_hidden_submit(text,text)`
- `p1_request_has_canonical_detail(uuid,text)`
- `submit_student_request_with_details(text,text,jsonb,text,text)` — atomic
  eligibility → request → canonical detail → submit → workflow
- `create_student_request` / `submit_student_request` P1 guards
- `p1_guard_detailless_submit` + `trg_p1_guard_detailless_submit`
- `grade_appeal_details` insert/update/delete policies restricted to staff roles

Migration 2 (forward-only hardening) applied: the project's default privileges
had re-granted `anon`/`authenticated` on the new objects, so those grants were
revoked to match the intended contract.

## G2..G9 — Post-verification

| Check | Result |
| --- | --- |
| All 7 new functions present | PASS |
| Trigger `trg_p1_guard_detailless_submit` enabled (`O`) | PASS |
| `p1_e2e_07_executions` RLS on, 0 rows | PASS |
| `p1_e2e_07_executions` ACL = postgres + service_role only | PASS |
| `submit_student_request_with_details` execute = authenticated only (no anon, no service_role) | PASS |
| P1 helper functions no longer executable by `anon` | PASS |
| `grade_appeal_details` write policies staff-only, `gad_select` untouched | PASS |
| `student_visible` for the three P1 types still `false` | PASS |
| Business counters unchanged (72 requests, 11 submitted, 0 P1 detail rows) | PASS |
| B1-88 helpers and five-service allowlist untouched | PASS |

Zero business-data mutation. Zero TEST_ONLY residue. No activation performed.

FINAL: **PASS_PORTAL_REFORM_P1_06_CONTROLLED_PRODUCTION_APPLY_07B_READY_FOR_E2E**
