# PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-DESIGN-13

> **SUPERSEDED (2026-08-01) by Remediation-15.** The identity model, transfer-detail
> rows, department actor model (source IT / target CS / unrelated CIS) and deterministic
> ids described below were corrected in
> `docs/B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-RUNTIME-CONTRACT-REMEDIATION-15-REPORT.md`.
> Read that report for the authoritative package contract; this document is kept for
> discovery provenance only.

**MODE:** PRODUCTION READ-ONLY DISCOVERY + SOURCE-ONLY FIXTURE MIGRATION DESIGN
**Production writes performed this mission:** NONE (read-only channel only)
**Migration head at discovery:** `20260731203030`
**Deliverables:**
- `docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql`
- `docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-CLEANUP-13.NOT_APPLIED.sql`
- this report

---

## 1. Principal inventory (active direct assignees, read-only verified)

All eleven required principals resolve to exactly one active assignment.
**No `NEEDS_SEPARATE_PRINCIPAL` gap exists.**

| Unit | Role | Dept scope | Resolved user_id | Source |
|---|---|---|---|---|
| student_affairs | student_affairs_specialist | – | `c8a94548-4782-4252-86f9-23559d3b95bd` | staff_profile S2026003 |
| student_affairs | student_affairs_manager | – | `aac0e62d-4e8b-4440-b649-caa388d34837` | staff_profile S2026002 |
| registrar | registrar_general | – | `4c261c1c-97fb-42da-a544-e8a59853ebe3` | staff_profile S2026001 |
| dean | dean | – | `b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0` | faculty_profile F2025001 |
| finance | revenue_finance_officer | – | `79783c0f-8d95-4110-8239-0ac504d63a24` | staff_profile S2026004 |
| library | library_officer | – | `e7a93314-bb06-4525-b412-5315198c668a` | staff_profile S2026009 |
| labs | labs_manager | – | `67b39ee4-4918-4b00-b4cc-0d5046ac8a5a` | staff_profile S2026005 |
| archive | archive_officer | – | `aec1303e-de6a-4580-94cf-7205c17b5535` | staff_profile S2026006 |
| department | department_head | IT `ce485c67…` | `d4aaa5c9-72d1-4996-b0e8-d30c6327da6e` | position_assignment |
| department | department_head | CS `11111111…` | `97acbe02-c59c-409c-8d51-7d4ef72e6db7` | position_assignment |
| department | department_head | CIS `22222222…` | `f602b62c-194b-4591-8e9c-956e5cbb347d` | position_assignment |

Unrelated-principal (negative) coverage is fully satisfiable from within this
set: any role above serves as a wrong-principal for every step it does not own,
and CIS head serves as the unrelated department head for the transfer
department-scope cases.

## 2. Workflow configuration (active workflows only)

Every step across all five services is `assignment_strategy = specific_user`
with `config.authorization = exactly_one_direct_assignee`. No broad-role or
bypass path exists in configuration.

| Service | Steps | Order → step_key (literal action) |
|---|---|---|
| enrollment_suspension | 3 | 1 student_affairs_intake (review) · 2 manager_approval (approve) · 3 registrar_apply (apply_decision) |
| excused_absence | 3 | 1 student_affairs_intake (review) · 2 manager_review (approve) · 3 record_apply (apply_decision) |
| department_transfer | 6 | 1 intake (review) · 2 source_dept_head (approve) · 3 target_dept_head (approve) · 4 dean_approval (approve) · 5 payment_confirmation (confirm_payment) · 6 registrar_apply (apply_decision) |
| final_chance | 5 | 1 student_affairs_intake (review) · 2 manager_review (approve) · 3 dean_decision (approve) · 4 payment_confirmation (confirm_payment) · 5 registrar_apply (apply_decision) |
| file_withdrawal | 7 | 1 intake (review) · 2 library_clearance (clear) · 3 labs_clearance (clear) · 4 activities_clearance (clear) · 5 finance_clearance (clear) · 6 registrar_apply (apply_decision) · 7 archive (archive) |

No step requires an attachment. Payment steps are
`EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` only — no gateway, no amounts.

## 3. Fixture package shape

**19 fixture requests**, one per blocked target step, all owned by
`TEST_ONLY_B1_0002` (`b1e20002-…-0002`, active, IT department, has auth user).
Each fixture is parked with **exactly one active step**; earlier steps are
marked `completed` as fixture initialization (no actor, no decision, no
academic effect, no notification); later steps stay `pending`.

| # | Service | Active step | Direct assignee |
|---|---|---|---|
| 1–5 | department_transfer | orders 2,3,4,5,6 | IT head, CS head, dean, finance, registrar |
| 6–7 | enrollment_suspension | orders 2,3 | SA manager, registrar |
| 8–9 | excused_absence | orders 2,3 | SA manager, SA specialist |
| 10–15 | file_withdrawal | orders 2–7 | library, labs, SA manager, finance, registrar, archive |
| 16–19 | final_chance | orders 2,3,4,5 | SA manager, dean, finance, registrar |

Deterministic identifiers: ids `f1300000-0000-4000-8000-0000000000NN`,
request numbers `SR-20260801-13000NN`, marker `TEST_ONLY_B1_FIXTURE_13`
in `internal_notes`, `form_data.test_only_marker`, and step `metadata`.
Exact-count assertions: **19 requests / 104 runtime steps / 19 active steps**.

## 4. Blocked-case → fixture mapping (22/22 covered)

| Case | Class | Service · step | Fixture |
|---|---|---|---|
| 0242 | illegal_action_by_exact_assignee | department_transfer · source_dept_head | 1 |
| 0243 | illegal_action_by_exact_assignee | department_transfer · target_dept_head | 2 |
| 0244 | illegal_action_by_exact_assignee | department_transfer · dean_approval | 3 |
| 0245 | illegal_action_by_exact_assignee | department_transfer · payment_confirmation | 4 |
| 0246 | illegal_action_by_exact_assignee | department_transfer · registrar_apply | 5 |
| 0248 | illegal_action_by_exact_assignee | enrollment_suspension · manager_approval | 6 |
| 0249 | illegal_action_by_exact_assignee | enrollment_suspension · registrar_apply | 7 |
| 0251 | illegal_action_by_exact_assignee | excused_absence · manager_review | 8 |
| 0252 | illegal_action_by_exact_assignee | excused_absence · record_apply | 9 |
| 0254 | illegal_action_by_exact_assignee | file_withdrawal · library_clearance | 10 |
| 0255 | illegal_action_by_exact_assignee | file_withdrawal · labs_clearance | 11 |
| 0256 | illegal_action_by_exact_assignee | file_withdrawal · activities_clearance | 12 |
| 0257 | illegal_action_by_exact_assignee | file_withdrawal · finance_clearance | 13 |
| 0258 | illegal_action_by_exact_assignee | file_withdrawal · registrar_apply | 14 |
| 0259 | illegal_action_by_exact_assignee | file_withdrawal · archive | 15 |
| 0261 | illegal_action_by_exact_assignee | final_chance · manager_review | 16 |
| 0262 | illegal_action_by_exact_assignee | final_chance · dean_decision | 17 |
| 0263 | illegal_action_by_exact_assignee | final_chance · payment_confirmation | 18 |
| 0264 | illegal_action_by_exact_assignee | final_chance · registrar_apply | 19 |
| 0265 | department_scope_swap | department_transfer · target_dept_head vs IT/CIS head | 2 |
| 0266 | department_scope_swap | department_transfer · source_dept_head vs CS head | 1 |
| 0267 | department_scope_swap | department_transfer · source_dept_head vs CIS head | 1 |

Cases 0247, 0250, 0253, 0260 remain executable against step 1 of each fixture
family and need no new state.

## 5. Safety boundaries encoded in the SQL

- Single explicit transaction; every precondition executes before the first write.
- Migration-head pin `20260731203030`; aborts on any drift.
- Protected-state preconditions **and** post-write re-checks: 4 enrollment_certificate
  requests, 2 certificate document details, 2 official documents, five B1 services
  `is_active = true / student_visible = false`, certificate visible.
- Principal preconditions require **exactly one** matching active assignment per
  (unit, role, dept) — aborts on ambiguity or reassignment.
- Identifier-collision precondition: fixture id range and request-number prefix
  must be empty.
- `set_config('b1.atomic_init','1', true)` is transaction-local and is the
  documented initialization channel for the runtime guard trigger — not a
  privilege, RLS, GRANT, or policy change.
- No Auth users, no Storage objects, no `student_profiles` rows, no academic
  effect rows, no notifications, no workflow RPC invocation, no terminal state.
- Cleanup script targets only the pinned id range **and** the marker, deletes
  leaves before parents, and asserts 104 / 19 exact counts plus zero residue.

## 6. Residual risks

1. **Statement-level triggers on `student_requests`** (`validate_transfer_request`,
   `validate_enrollment_suspension_request`, `guard_b1_request_submit_boundary`)
   may reject a fixture insert on eligibility grounds for a student that already
   holds an open request of the same type. The package fails closed and rolls
   back entirely if so; remediation would be a forward-only adjustment of the
   fixture student set, not a trigger change.
2. **Concurrent open requests** for `TEST_ONLY_B1_0002` (one existing submitted
   `enrollment_suspension`, `SR-20260727-F67CF366`, currently on HOLD) could
   interact with (1). It is untouched by this package.
3. Fixture `completed` predecessor steps carry no actor; any reporting surface
   that assumes an actor on completed steps may render blanks for fixtures only.

## 7. Decision

**PASS_B1_FIVE_SERVICES_SAFE_RPC_FIXTURE_PACKAGE_DESIGNED_SOURCE_ONLY_READY_FOR_EXPLICIT_APPLY_APPROVAL**

Nothing was applied. Applying either SQL file requires a separate, explicit
production apply authorization.
