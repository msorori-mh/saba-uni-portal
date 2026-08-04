# PORTAL_B1_E2E_VISIBILITY_AND_ACTOR_UNBLOCK_PREFLIGHT_85

Decision: **HOLD_B1_E2E_UNBLOCK_PLAN_NOT_READY** (blocking gap: positive-actor credentials)
Final recommendation: **REQUIRES_TEST_IDENTITY_PROVISIONING_DECISION**, then `READY_FOR_OWNER_APPROVED_ONE_SERVICE_VISIBILITY_WINDOW`

Production writes this mission: ZERO. Migration apply: NONE. Publish: NONE. Deploy: NONE. Source changes: NONE.

## 1 — Safety state (verified read-only)

| Check | Value |
|---|---|
| Project ref | wpmicqriltrowwonknox |
| Migration head | 20260804004546 |
| Fixture matrix | 19 requests / 19 `active` steps (one per request) |
| Five B1 services | all `is_active=true`, `student_visible=false` |
| enrollment_certificate | `is_active=true`, `student_visible=true` — unchanged |
| Total `student_requests` | 52 |
| E2E-84 requests created | none |

Pre-state matches the mission contract. No `HOLD_..._PRESTATE_MISMATCH`.

## 2 — Minimum visibility window

Only three production functions reference `student_visible`:

- `create_b1_request_draft_for_student` — rejects unless `student_visible IS true` (draft creation)
- `create_student_request` — legacy generic create path, same gate
- `get_b1_secure_read_runtime_capability` — student-side secure read capability requires `rt.student_visible is true`

Not gated by visibility: draft update/persist, `submit_b1_student_request_atomic` (checks `is_active` only), workflow initialization, staff reads (`get_b1_assigned_inbox_for_actor`, `get_b1_assigned_request_details_for_actor`), `act_on_b1_student_request_step_atomic`, all terminal/apply-effect functions.

Because all five services share the same generic B1 RPCs (`b1_is_five_service_type`), the classification is identical and proved for each:

| Service | Window | Earliest safe re-hide point |
|---|---|---|
| enrollment_suspension | **C. FULL_STUDENT_PHASE_WINDOW** | immediately after successful submit + single workflow initialization |
| excused_absence | **C. FULL_STUDENT_PHASE_WINDOW** | same |
| department_transfer | **C. FULL_STUDENT_PHASE_WINDOW** | same |
| final_chance | **C. FULL_STUDENT_PHASE_WINDOW** | same |
| file_withdrawal | **C. FULL_STUDENT_PHASE_WINDOW** | same |

Rationale for C rather than A/B: create needs visibility, and every student-side read between create and submit goes through the secure read capability, which also requires it. Nothing after workflow initialization needs it — the whole staff workflow, the RPC matrix and the terminal actions run with the service hidden.

## 3 — Actor manifest (resolved from live assignments)

All 19 active fixture steps resolve through `request_processing_assignments` (`assigned_user_id` is NULL on every step, so resolution is unit+role based).

Positive actors resolved by staff profile:

| Service | Step | Action | user_id | Login | TEST_ONLY? |
|---|---|---|---|---|---|
| department_transfer | payment_confirmation | confirm_payment | 79783c0f-8d95-4110-8239-0ac504d63a24 | fares@usr.edu.ye | No — real-person staff |
| department_transfer | registrar_apply | apply_decision | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | toaiman@usr.edu.ye | No |
| enrollment_suspension | manager_approval | approve | aac0e62d-4e8b-4440-b649-caa388d34837 | yasmin@usr.edu.ye | No |
| enrollment_suspension | registrar_apply | apply_decision | 4c261c1c… | toaiman@usr.edu.ye | No |
| excused_absence | manager_review | approve | aac0e62d… | yasmin@usr.edu.ye | No |
| excused_absence | record_apply | apply_decision | c8a94548-4782-4252-86f9-23559d3b95bd | hitham@usr.edu.ye | No |
| file_withdrawal | library_clearance | clear | e7a93314-bb06-4525-b412-5315198c668a | naji@usr.edu.ye | No |
| file_withdrawal | labs_clearance | clear | 67b39ee4-4918-4b00-b4cc-0d5046ac8a5a | mohammed@usr.edu.ye | No |
| file_withdrawal | activities_clearance | clear | aac0e62d… | yasmin@usr.edu.ye | No |
| file_withdrawal | finance_clearance | clear | 79783c0f… | fares@usr.edu.ye | No |
| file_withdrawal | registrar_apply | apply_decision | 4c261c1c… | toaiman@usr.edu.ye | No |
| file_withdrawal | archive | archive | aec1303e-de6a-4580-94cf-7205c17b5535 | mameen@usr.edu.ye | No |
| final_chance | manager_review | approve | aac0e62d… | yasmin@usr.edu.ye | No |
| final_chance | payment_confirmation | confirm_payment | 79783c0f… | fares@usr.edu.ye | No |
| final_chance | registrar_apply | apply_decision | 4c261c1c… | toaiman@usr.edu.ye | No |

Unresolved to a single login by this read: `department_transfer / source_department_head_approval` and `target_department_head_approval` (three `position_assignment` rows scoped to departments 22222222…, 11111111…, ce485c67…), and the two dean steps (`department_transfer / dean_approval`, `final_chance / dean_decision`, `faculty_profile` type with no `auth.users` row joined). These four steps need an explicit identity resolution pass before execution.

No passwords, tokens, OTPs or cookies are read or exposed anywhere in this plan.

TEST_ONLY accounts that exist (all confirmed, all last signed in 2026-07-27):
`test-only.b1.student@`, `test-only.b1.e2e02@`, `test-only.b1.e2e03@usr.edu.ye`, `test-only.b1.unassigned@`, `test-only.b1.dh_src@`, `test-only.b1.dh_tgt@`, `test-only.b1.dean@`, `test-only.b1.registrar@`, `test-only.b1.sa_mgr@`, `test-only.b1.sa_spec@`, `test-only.b1.library@`, `test-only.b1.labs@`, `test-only.b1.finance@`, `test-only.b1.archive@` (domain `testonly.quboolye.com`), plus older `*.test.01d@quboolye.test` fixtures (student, dean, student affairs, unrelated admin).

## 4 — Minimum distinct accounts

Minimum safe set: **13 distinct accounts**.

Positive side (5 needed, none TEST_ONLY): hitham, yasmin, naji, mohammed, fares, toaiman, mameen plus the two department heads and the dean — these are real-person staff accounts and are the only identities the live assignments authorize.

Negative side (fully covered by existing TEST_ONLY accounts, kept distinct so no account carries two roles that would make a denial ambiguous):

| Negative category | Account |
|---|---|
| owner student | test-only.b1.e2e03@usr.edu.ye |
| another student | test-only.b1.student@testonly.quboolye.com |
| same role, unassigned | test-only.b1.unassigned@ |
| wrong department | test-only.b1.dh_tgt@ (against source-dept step) |
| previous-step actor | test-only.b1.sa_spec@ |
| next-step actor | test-only.b1.registrar@ |
| department-head negative | test-only.b1.dh_src@ |
| dean negative | test-only.b1.dean@ |
| registrar negative | test-only.b1.registrar@ |
| admin negative | unrelated.admin.test.01d@quboolye.test |
| faculty negative | **MISSING** — no TEST_ONLY faculty-only account found |

- Accounts with a usable current session: none (no live browser session; last sign-ins are days old).
- Accounts requiring manual owner-supplied credentials: all of them.
- Missing categories: faculty-only negative actor; department-head and dean **positive** identities pending resolution.
- Excluded as real-person data: the nine `@usr.edu.ye` staff accounts are real staff, not TEST_ONLY — using them is the blocking authorization decision.

## 5 — Authentication execution channel

Supported: **method 1 — browser login using owner-supplied existing credentials**, driven through the sandbox browser against the app, one actor at a time. Method 2 (existing session) is unavailable. Method 3 (native authenticated Lovable action) does not exist for these RPCs. Method 4 is acceptable only when the session came from a real sign-in.

Explicitly rejected and not used: service-role impersonation, fabricated JWTs, overriding `request.jwt.claim.sub`, migration-channel execution as a user, bypassing auth middleware, treating UI visibility as authorization proof.

Sequential isolation is provable: each actor runs in a fresh browser context (sign in → execute exact RPCs → sign out → clear storage/cookies → verify `auth.uid()` is null → sign in as next actor), and `auth.uid()` is re-read from the live session before every call.

## 6 — Visibility control method

There is **no existing safe production mechanism** to flip `student_visible` for one B1 service. The only related function, `admin_set_enrollment_certificate_e2e_submit_window`, is hard-coded to `enrollment_certificate`, toggles `is_active`, and requires `student_visible=false` — it is rejected on three of the mission's own criteria.

Therefore the only compliant option is an owner-approved, single-service, forward-only controlled change per window:

- Scope: exactly one row in `request_types` (`code = <service>`), field `student_visible` only.
- `updated_at` changes; the change is immediately effective (server-side gate, no cache).
- No Publish, no Deploy, no workflow-config change, no `is_active` change, no enrollment_certificate touch.
- Restoration verified by re-reading all six rows and asserting five `false` + enrollment_certificate `true`.
- Stale-browser risk: a page already loaded keeps rendering, but every gated RPC re-checks server-side, so create/read fails after re-hide; mitigation is to sign out and clear the session at re-hide time.
- Student request creation is impossible again immediately after restoration.

## 7 — One-service-at-a-time runbook (not executed)

For each service in order — enrollment_suspension, excused_absence, department_transfer, final_chance, file_withdrawal:

1. Capture global read-only fingerprint (head, request count, fixture matrix, request_types).
2. Assert the other four services are hidden.
3. Open the visibility window for the current service only.
4. Sign in as the TEST_ONLY owner student.
5. Create the fresh TEST_ONLY draft (marker `TEST_ONLY_FIRST_DELIVERY_5_SERVICES`), attach required files.
6. Submit inside the window.
7. Assert workflow initialized exactly once, one active step.
8. Re-hide the service immediately (earliest proven safe point per section 2); sign out and clear session.
9. Assert all five services hidden.
10. Run the positive/negative RPC matrix as authenticated actors, one identity at a time with isolation proof.
11. Complete the lifecycle to the terminal step.
12. Assert terminal state and academic effect.
13. Assert fixture matrix still 19/19.
14. Assert enrollment_certificate unchanged.
15. Assert no unrelated row mutated (counts + fingerprints).
16. Mark the service PASS before moving to the next.

## 8 — Required owner authorizations

- **A. Temporary `student_visible` change — REQUIRED.** One service at a time, `student_visible` only, restored within the same window.
- **B. Use of existing credentials — REQUIRED.** For the nine real-person staff positive actors and the TEST_ONLY negative actors; credentials supplied manually by the owner, never stored or echoed.
- **C. Password resets — not requested.**
- **D. New Auth users — requested only for the missing faculty-only negative actor, and only if the owner rules that category mandatory.**
- **E. Role/assignment writes — not requested.**

## Blocking gap

The E2E cannot start until the owner decides how the positive actors are authenticated: every positive actor for the 19 active steps is a real-person staff account, and two department-head steps plus two dean steps have not yet been resolved to a single login. That decision (plus item A) is the entire remaining unblock.
