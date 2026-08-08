# PORTAL-B1-NEGATIVE-RPC-MATRIX-TEST-FIXTURES-SEED-MIGRATION-SOURCE-PACKAGE-64 — Report

MODE: SOURCE PACKAGE + PRODUCTION READ-ONLY PREFLIGHT ONLY
Input HOLD: `HOLD_B1_NEGATIVE_RPC_MATRIX_TEST_FIXTURE_PROVISIONING_RUNTIME_STEP_INSERT_REQUIRES_ATOMIC_BOUNDARY_GUARD_BYPASS_AND_DEPARTMENT_SCOPED_POSITION_ASSIGNMENT_CREATION`
Source reports consumed:
`docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-BLOCKED-FIXTURES-CLOSURE-62-REPORT.md`,
`docs/PORTAL-B1-NEGATIVE-RPC-MATRIX-DEDICATED-TEST-FIXTURES-PROVISIONING-63-REPORT.md`

## FINAL DECISION

**HOLD_NEEDS_ISOLATED_TEST_IDENTITIES_AND_DEPARTMENTS**

Mission rule 3 is triggered: production contains **no isolated TEST_ONLY staff
identities and no isolated TEST_ONLY departments/programs**. Every direct
assignee and every department scope the 19 fixtures require resolves to a real
operational identity or a real operational academic department. Rule 3 forbids
emitting an incomplete migration in that condition, so **no seed migration file
was authored** and nothing was applied.

## 1. Isolation inventory (production, read-only)

| Isolation axis | Required | Found | Verdict |
|---|---|---|---|
| TEST_ONLY departments (isolated) | ≥ 1 (plus source/target pair for F01/F02) | **0** of 3 departments | FAIL |
| TEST_ONLY programs (isolated) | ≥ 2 (transfer source/target) | **0** | FAIL |
| TEST_ONLY staff profiles | 8 distinct unit/role assignees | **0** of 9 staff profiles | FAIL |
| TEST_ONLY position assignments | 2 department-scoped (source/target head) | **0** of 5 active | FAIL |
| TEST_ONLY student profiles | ≥ 1 | **4** present | PASS |

### Departments (all 3 are operational, none TEST_ONLY)

| id | name | isolated? |
|---|---|---|
| `ce485c67-5f7c-498d-b120-4b1130a86ae8` | قسم تكنولوجيا المعلومات | no — operational |
| `11111111-1111-4111-8111-111111111111` | قسم علوم الحاسوب | no — operational |
| `22222222-2222-4222-8222-222222222222` | قسم نظم المعلومات الحاسوبية | no — operational |

### Staff profiles (9/9 operational `@usr.edu.ye`, 0 TEST_ONLY)

هيثم الشبلي · ياسمين الولص · عبدالله طعيمان · فارس اليوسفي · ناجي الروقي ·
محمد حيدر · محمد امين · محمد شوقي · صالح علي

### Active processing assignments (13 active; 3 position-assignment, 3 department-scoped)

All three department-scoped `position_assignment` rows point at the three
operational departments above. There is no department-scoped assignment that
could be resolved without binding a fixture to a real department.

### TEST_ONLY students (only isolated axis available)

`65f55997…` (test-only.b1.e2e03), `7020e51d…` (test-only.b1.student),
`b1e20002-0000-4000-8000-000000000002` (test-only.b1.e2e02), `51b9c5e9…`.

## 2. Nineteen-fixture inventory with production-resolved requirements

Configured `action_type` values below are read from
`request_type_workflow_steps` in production (not assumed).

| # | service | target step_key | configured action | unit / role | required direct assignee (production) | dept scope | isolation verdict |
|---|---|---|---|---|---|---|---|
| F01 | department_transfer | source_department_head_approval | approve | department / department_head | position assignment of a real department head | **real source dept** | BLOCKED — real dept + real head |
| F02 | department_transfer | target_department_head_approval | approve | department / department_head | position assignment of a real department head | **real target dept** | BLOCKED — real dept + real head |
| F03 | department_transfer | dean_approval | approve | dean / dean | real faculty-profile dean assignment | — | BLOCKED — real identity |
| F04 | department_transfer | payment_confirmation | confirm_payment | finance / revenue_finance_officer | فارس اليوسفي | — | BLOCKED — real identity |
| F05 | department_transfer | registrar_apply | apply_decision | registrar / registrar_general | عبدالله طعيمان | — | BLOCKED — real identity |
| F06 | enrollment_suspension | manager_approval | approve | student_affairs / student_affairs_manager | ياسمين الولص | — | BLOCKED — real identity |
| F07 | enrollment_suspension | registrar_apply | apply_decision | registrar / registrar_general | عبدالله طعيمان | — | BLOCKED — real identity |
| F08 | excused_absence | manager_review | approve | student_affairs / student_affairs_manager | ياسمين الولص | — | BLOCKED — real identity |
| F09 | excused_absence | record_apply | apply_decision | student_affairs / student_affairs_specialist | هيثم الشبلي | — | BLOCKED — real identity |
| F10 | file_withdrawal | library_clearance | clear | library / library_officer | ناجي الروقي | — | BLOCKED — real identity |
| F11 | file_withdrawal | labs_clearance | clear | labs / labs_manager | محمد حيدر | — | BLOCKED — real identity |
| F12 | file_withdrawal | activities_clearance | clear | student_affairs / student_affairs_manager | ياسمين الولص | — | BLOCKED — real identity |
| F13 | file_withdrawal | finance_clearance | clear | finance / revenue_finance_officer | فارس اليوسفي | — | BLOCKED — real identity |
| F14 | file_withdrawal | registrar_apply | apply_decision | registrar / registrar_general | عبدالله طعيمان | — | BLOCKED — real identity |
| F15 | file_withdrawal | archive | archive | archive / archive_officer | محمد امين | — | BLOCKED — real identity |
| F16 | final_chance | manager_review | approve | student_affairs / student_affairs_manager | ياسمين الولص | — | BLOCKED — real identity |
| F17 | final_chance | dean_decision | approve | dean / dean | real faculty-profile dean assignment | — | BLOCKED — real identity |
| F18 | final_chance | payment_confirmation | confirm_payment | finance / revenue_finance_officer | فارس اليوسفي | — | BLOCKED — real identity |
| F19 | final_chance | registrar_apply | apply_decision | registrar / registrar_general | عبدالله طعيمان | — | BLOCKED — real identity |

Predecessor/later-step contract per fixture (unchanged from Package 62): all
predecessors `completed`, target step `active` (exactly one), later steps
`pending`, active assignment count = 1.

## 3. Why an isolated migration cannot be authored today

`assert_b1_runtime_step_row_assignee_effective()` requires that exactly one
**effective** `request_processing_assignments` row resolves for the fixture's
`(unit, role, department scope)`. That resolution is global per unit/role: the
only way to attach a TEST_ONLY assignee is to insert a *second* active
assignment for the same unit/role, which either

- breaks singular resolution for **real production requests** on that unit/role
  (assignment count ≠ 1 → real staff lose actionability), or
- forces the fixture to reuse the existing real staff identity, which violates
  mission rule 2 (`no real user`) and grants a TEST_ONLY fixture to a principal
  that also owns real requests.

For F01/F02 the same applies to departments: department-scoped head resolution
exists only for the three operational departments, so a fixture would have to
be scoped to a real academic department.

Emitting a migration under either shape would be an incomplete/unsafe package,
which rule 3 explicitly forbids.

## 4. What a compliant package needs (new mandate required)

1. Provision an isolated `TEST_ONLY` department (and two programs for transfer
   source/target), flagged so no operational surface lists them.
2. Provision 8 `TEST_ONLY` staff profiles + auth identities (one per unit/role
   in the table above) that hold **no** operational assignments.
3. Introduce a scoping mechanism for `request_processing_assignments` that lets
   a TEST_ONLY assignment resolve **only** for TEST_ONLY requests (e.g. an
   explicit test-scope discriminator honoured by
   `assert_b1_runtime_step_row_assignee_effective`), so singular resolution for
   real requests is provably unchanged.
4. Only then author the single seed migration: fail-closed preflight,
   `SET LOCAL b1.atomic_init`, minimal request/runtime-step/detail inserts,
   temporary `SECURITY DEFINER` seeding function created → called once →
   `DROP`ped before `COMMIT`, no `GRANT`, structural + post verifiers, cleanup
   manifest.

## 5. Results

- Unique fixtures planned: **19** (inventoried, not provisioned)
- Migration files authored: **0** (rule 3 hold)
- Migration applied: **0** · Workflow RPC calls: **0** · Operator Preflight: **0**
- Production writes: **0** · existing-row UPDATE/DELETE deltas: **0**
- Persistent seeding functions: **0**
- Matrix cases: **267** · executable: **245** · blocked: **22** (unchanged)
- Authoritative Baseline: untouched — `PINNED` / `be5040a4fd34fc1fbab235e118c509d0`
- Production reads: 5 SELECT-only queries (schema columns, isolation inventory,
  counts, processing assignments, configured workflow actions)
- Positive harness: HELD_BACK · Deploy: none · Baseline change: none

## 6. Cleanup manifest

Empty — no rows, no objects, no migration were created.

**HOLD_NEEDS_ISOLATED_TEST_IDENTITIES_AND_DEPARTMENTS**
