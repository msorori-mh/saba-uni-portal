# PORTAL_B1_E2E_TEST_ONLY_IDENTITY_AND_VISIBILITY_CONTROL_PLAN_86

Mode: strict read-only. Production writes this mission: ZERO.
Project: wpmicqriltrowwonknox · migration head 20260804004546 · fixtures 19/19.

## Decision

HOLD_B1_TEST_ONLY_E2E_PROVISIONING_PLAN_NOT_READY

Reason (verified, not assumed): the ten TEST_ONLY staff-shaped auth accounts exist, but each one has **no staff profile, no role assignment, and no processing assignment**. They cannot be resolved as an assignee by any workflow step today. A TEST_ONLY-only E2E therefore cannot be executed by reusing existing identities; it needs an owner-approved provisioning package.

## What the production reads showed

Workflow steps for the five services all use `assignment_strategy = specific_user`, resolved through `request_processing_assignments`.

Active assignments in production: **13 rows, exactly one per (unit, role, department scope)**, all real-person:

| unit | role | current holder |
|---|---|---|
| student_affairs | student_affairs_specialist | hitham@usr.edu.ye |
| student_affairs | student_affairs_manager | yasmin@usr.edu.ye |
| registrar | registrar_general | toaiman@usr.edu.ye |
| finance | revenue_finance_officer | fares@usr.edu.ye |
| library | library_officer | naji@usr.edu.ye |
| labs | labs_manager | mohammed@usr.edu.ye |
| archive | archive_officer | mameen@usr.edu.ye |
| dean | dean | faculty-profile assignment |
| department | department_head | three department-scoped position assignments (ce485c67, 22222222, 11111111) |

There is **no unique index** enforcing one active row per (unit, role, dept) — the single-row state is a data convention, so behaviour when two active rows exist for the same pair is unproven and must be tested locally before any production write.

TEST_ONLY accounts that exist in auth (all with zero profiles/roles/assignments):

| purpose | email | user_id |
|---|---|---|
| specialist | test-only.b1.sa_spec@testonly.quboolye.com | 24406961-d8b2-4db7-8896-0ef82039d75f |
| SA manager | test-only.b1.sa_mgr@testonly.quboolye.com | 0b2a2543-a77a-4b86-ad7f-8b35f9db6502 |
| registrar | test-only.b1.registrar@testonly.quboolye.com | 15b0f3cd-29d8-4eb1-ad15-bb9026986dbc |
| finance | test-only.b1.finance@testonly.quboolye.com | f0d8a6b1-7845-46bd-8a12-d78ed6af2bfd |
| library | test-only.b1.library@testonly.quboolye.com | 749a6e5d-eb27-4417-99a4-7abaffe406a3 |
| labs | test-only.b1.labs@testonly.quboolye.com | b8b50c98-f26c-413b-a585-fafd0abfaa21 |
| archive | test-only.b1.archive@testonly.quboolye.com | 676ecf19-4c7a-45eb-86db-2c141e5a7691 |
| dean | test-only.b1.dean@testonly.quboolye.com | fb59542d-d410-4fa4-88d3-1e3e2fabe014 |
| source dept head | test-only.b1.dh_src@testonly.quboolye.com | 49f152f8-db2b-4bd0-af08-2f8b3425d053 |
| target dept head | test-only.b1.dh_tgt@testonly.quboolye.com | 4b45ddf7-140a-44b1-a452-e51c182aab5d |
| unassigned same-role negative | test-only.b1.unassigned@testonly.quboolye.com | 0105864b-36b7-4d72-a813-a30c672202e1 |
| owner student | test-only.b1.e2e03@usr.edu.ye | 3a279561-f8e6-41d9-b8ca-ce60682c9eab |
| other student | test-only.b1.e2e02@testonly.quboolye.com | 57e805dc-f975-4834-b1cb-f99c09756980 |
| other student (2) | test-only.b1.student@testonly.quboolye.com | 2e3ca4d6-603c-4f06-a23e-462bf92fcfd3 |

## TEST_ONLY positive actor matrix (target state)

| service | step | action | unit | role | TEST_ONLY actor | assignment needed |
|---|---|---|---|---|---|---|
| enrollment_suspension | initial_review | review | student_affairs | specialist | sa_spec | yes |
| enrollment_suspension | manager_approval | approve | student_affairs | manager | sa_mgr | yes |
| enrollment_suspension | registrar_apply | apply_decision | registrar | registrar_general | registrar | yes |
| excused_absence | student_affairs_intake | review | student_affairs | specialist | sa_spec | reuse |
| excused_absence | manager_review | approve | student_affairs | manager | sa_mgr | reuse |
| excused_absence | record_apply | apply_decision | student_affairs | specialist | sa_spec | reuse |
| department_transfer | student_affairs_intake | review | student_affairs | specialist | sa_spec | reuse |
| department_transfer | source_department_head_approval | approve | department (ce485c67) | department_head | dh_src | yes (dept-scoped) |
| department_transfer | target_department_head_approval | approve | department (22222222) | department_head | dh_tgt | yes (dept-scoped) |
| department_transfer | dean_approval | approve | dean | dean | dean | yes |
| department_transfer | payment_confirmation | confirm_payment | finance | revenue_finance_officer | finance | yes |
| department_transfer | registrar_apply | apply_decision | registrar | registrar_general | registrar | reuse |
| final_chance | student_affairs_intake / manager_review / dean_decision / payment_confirmation / registrar_apply | review / approve / approve / confirm_payment / apply_decision | as above | as above | sa_spec, sa_mgr, dean, finance, registrar | reuse |
| file_withdrawal | intake / library / labs / activities / finance / registrar_apply / archive | review, clear ×4, apply_decision, archive | as above + library, labs, archive | as above | sa_spec, library, labs, sa_mgr, finance, registrar, archive | library, labs, archive new |

## Negative actor matrix

| case | account | status |
|---|---|---|
| owner student | e2e03 | exists |
| other student | e2e02 / b1.student | exists |
| unassigned same-role | b1.unassigned (needs the same role_code, no assignment) | exists, needs role only |
| wrong department head | dh_tgt against the source step (and vice versa) | covered by the two dept heads |
| faculty-only | none | **MISSING** |
| registrar / dean / admin bypass | registrar, dean TEST_ONLY + an admin-role TEST_ONLY | admin TEST_ONLY **MISSING** |
| previous-step / next-step actor | any two adjacent TEST_ONLY actors in the same chain | covered |

## True minimum distinct accounts

- Positive: **10** (sa_spec, sa_mgr, registrar, finance, library, labs, archive, dean, dh_src, dh_tgt) — all exist in auth.
- Negative-only extra: **3** (unassigned same-role, second student, faculty-only) + **1** admin-role TEST_ONLY.
- Student: **1** owner (e2e03) + 1 other.
- **Minimum distinct = 15**, of which **13 already exist in auth** and **2 are missing** (faculty-only actor, admin-role actor).

Missing identities: faculty-only TEST_ONLY actor; admin-role TEST_ONLY actor; passwords for all 13 existing TEST_ONLY accounts are unknown to this environment.

## Temporary assignment package (design only)

One reviewed forward-only migration, tagged `TEST_ONLY_B1_E2E_86`:

1. Insert TEST_ONLY `staff_profiles` rows (status TEST_ONLY-marked) for the ten staff actors, plus a faculty profile for the dean and department-position rows for the two dept heads.
2. Insert `user_role_assignments` role_code rows matching each actor's role.
3. Assignment exclusivity: because resolution is `specific_user` and production holds exactly one active row per (unit, role, dept), the package must **temporarily deactivate** each real-person row (`is_active=false`, recording the original id) and insert the TEST_ONLY row, then restore on cleanup. Adding a parallel second active row is not permitted until the local PG17 harness proves the resolver's behaviour with two active rows.
4. Boundaries: no global admin/registrar/dean bypass, no changes to `graduate_affairs` rows, nothing outside the nine (unit, role) pairs the five services use, no touch to enrollment_certificate.
5. Cleanup manifest: exact list of inserted profile/role/assignment ids to delete and exact list of deactivated real-person assignment ids to re-activate, verified by a post-cleanup query asserting the original 13-row state byte-for-byte.

Blast radius to disclose: while the swap is active, real staff cannot act on **any** service that shares those units/roles, including live traffic. This is the main reason the package must run inside one short owner-supervised window.

## Visibility-control package (design only)

Single reviewed production function, e.g. `admin_set_b1_service_visibility_window(p_service_code, p_enable, p_reason)`:

- Updates `request_types.student_visible` only; never touches `is_active`.
- Accepts exactly one of the five B1 codes; rejects `enrollment_certificate` and anything else.
- Refuses to open a second service while another window is open (single-service invariant).
- Records an audit row (actor, service, open/close, reason, timestamp) via the existing audit path.
- Auto re-hide: a closing call is mandatory in the runbook, plus a stored `expires_at`; the read gate re-checks `student_visible` on every draft creation, so once closed a stale browser session cannot create another request — the RPC `create_b1_request_draft_for_student` re-evaluates visibility server-side per call.
- Failure behaviour: any error path closes the window (sets false) before raising.
- No Publish/Deploy needed — it is a database function callable by an authorized admin.
- Cleanup: after the fifth service, assert all five back to `student_visible=false` and the audit log shows a matched open/close pair per service.

## Owner approvals required

- Auth user creation: **required** (faculty-only + admin-role TEST_ONLY actors).
- Password reset / credential issuance: **required** for the 13 existing TEST_ONLY accounts.
- Temporary assignments (with real-person deactivation window): **required**.
- Visibility control function: **required**.
- Migration/package apply: **required** — two packages total (identity+assignments, visibility control), applied one at a time.

## Final recommendation

DO_NOT_PROCEED until the four approvals above are granted. Once granted, the sequence is: identity+assignment package → local PG17 verification → single production apply → per-service visibility window E2E → cleanup and restoration proof.
