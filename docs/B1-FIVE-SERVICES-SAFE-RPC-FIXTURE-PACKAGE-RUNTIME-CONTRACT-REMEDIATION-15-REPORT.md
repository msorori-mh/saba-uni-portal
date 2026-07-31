# PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-RUNTIME-CONTRACT-REMEDIATION-15 — Report

**Mode:** SOURCE-ONLY REMEDIATION + LOCAL DISPOSABLE DATABASE VALIDATION
**Production writes:** none. **Migrations applied:** none. **Deploy/Publish:** none.
**Production access this mission:** read-only `SELECT` / `pg_get_functiondef` only.
**Migration head (unchanged):** `20260731203030`

## Decision

**PASS_B1_FIVE_SERVICES_SAFE_RPC_FIXTURE_PACKAGE_RUNTIME_CONTRACT_REMEDIATED_SOURCE_ONLY_READY_FOR_EXPLICIT_APPLY_APPROVAL**

## Root cause of the previous HOLD

Design-13 wrote every runtime-step assignee into `assigned_user_id`. The applied
Migration-29 contract (`assert_b1_runtime_step_row_assignee_effective`) requires:

- `num_nonnulls(assigned_user_id, assigned_staff_profile_id, assigned_faculty_profile_id, assigned_position_assignment_id) = 1`
- the stored identity to equal the resolved assignment's identity **column for column**
- `metadata.direct_assignment_id`, when present, to equal the resolved assignment id
- department-head steps to resolve through a **position assignment** inside the exact
  department taken from `transfer_request_details`

All eleven production principals are profile/position principals (`assigned_user_id`
is NULL everywhere), so the old draft would have failed the activation trigger on the
very first active step.

## Gate-by-gate remediation

| Gate | Change |
|---|---|
| **G1** identity contract | Each runtime step now copies the resolved assignment's four identity columns verbatim (`user_id` / `staff_profile_id` / `faculty_profile_id` / `position_assignment_id`) and pins `metadata.direct_assignment_id`. Resolution uses the same predicate as production, including `is_valid_b1_direct_assignment` and the position-assignment-only rule for department scope. Every ACTIVE step is re-checked with `assert_b1_runtime_step_assignee_effective`. |
| **G2** transfer details | The 5 `department_transfer` fixtures insert a `transfer_request_details` row (IT → CS, with programs and reason) **before** any transfer runtime step, so department scope is never missing. |
| **G3** actor model | Source = IT head `d4aaa5c9…`, target = **CS head `97acbe02…`**, unrelated = CIS head `f602b62c…`. CIS is never stored as a transfer scope and is never bound to a fixture step; it exists only as the unrelated-actor negative principal. |
| **G4** deterministic ids | `request = f1300000-0000-4000-8000-<ord:12>`, `step = f1300001-0000-4000-8000-<ord:6><step_order:6>`, `detail = f1300002-0000-4000-8000-<ord:12>`, `number = SR-20260801-13<ord:6>`. No `gen_random_uuid()` in any write. |
| **G5** MATRIX rebind | All 22 previously blocked cases (0242–0267 region) are bound to deterministic ACTIVE fixture steps. Blocked partition = 0; blocked rendering is abolished and now aborts the render with `HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED`. |

## Fixture inventory (design, NOT applied)

| Service | fixtures | active step orders |
|---|---|---|
| department_transfer | 5 | 2,3,4,5,6 |
| enrollment_suspension | 2 | 2,3 |
| excused_absence | 2 | 2,3 |
| file_withdrawal | 6 | 2,3,4,5,6,7 |
| final_chance | 4 | 2,3,4,5 |

Totals: **19 requests / 104 runtime steps / 19 active steps / 5 transfer detail rows**,
all owned by `TEST_ONLY_B1_0002`, all parked at `status = 'in_review'`, none terminal,
no academic effect rows, no notifications, no fee/payment rows, no attachments.

## Local disposable-database validation (G7)

`tests/b1-five-services-fixture-contract-15/run-harness.sh` builds a throwaway
Postgres cluster, loads a minimal schema whose identity-contract functions
(`is_valid_b1_direct_assignment`, `assert_b1_runtime_step_row_assignee_effective`,
`assert_b1_runtime_step_assignee_effective`, `guard_b1_runtime_step_activation`,
`guard_b1_runtime_mutation_boundary`) are **verbatim production definitions**, seeds
the production principal/workflow model, then applies the package.

```
== fixture apply ==  FIXTURE13_OK: 19 requests / 104 runtime steps / 19 active / 5 transfer details
== verify ==         VERIFY_OK: fixture package satisfies the runtime-assignee identity contract
== cleanup apply ==  CLEANUP13_OK: 19 requests / 104 runtime steps / 5 transfer details removed
== residue ==        requests=0 steps=0 details=0 certificate=4
LOCAL_FIXTURE_15_HARNESS_OK
```

The verifier additionally proves: the contract holds for **all 104** steps (not only
active ones), source-head steps bind the IT head (5/5), target-head steps bind the CS
head (5/5), the CIS head binds **0** steps, `assigned_user_id` is NULL on every step,
and no step escapes the deterministic id space.

## Source verification

| Command | Result |
|---|---|
| `bun test tests/student-requests` | **1060 pass / 0 fail** (97 files) |
| `bunx tsc --noEmit` | PASS |
| `bun run scripts/b1-rpc-principal-harness-01/render-negative-cases.ts` | 267 rendered, **0 blocked** |
| `git diff --check` | PASS |
| local pg harness | PASS |

## Files changed

- `docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql`
- `docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-CLEANUP-13.NOT_APPLIED.sql`
- `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
- `scripts/b1-rpc-principal-harness-01/rebind-fixture-cases-15.ts` (new)
- `scripts/b1-rpc-principal-harness-01/render-negative-cases.ts`
- `scripts/b1-rpc-principal-harness-01/00-preflight.sql`
- `scripts/b1-rpc-principal-harness-01/TARGET-MANIFEST.json` (MATRIX sha re-pin)
- `tests/b1-five-services-fixture-contract-15/**` (new local harness)
- `tests/student-requests/b1-five-services-fixture-contract-15.test.ts` (new)
- `docs/B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-DESIGN-13-REPORT.md` (superseded note)

## Risks and boundaries

- The package remains **NOT APPLIED** and lives outside `supabase/migrations/`.
- The authoritative negative baseline stays **PENDING**; no baseline was captured.
- The five B1 services remain `student_visible = false`; nothing in this package changes visibility.
- `enrollment_certificate` (4 requests, 2 document details, 2 official documents) is asserted
  before **and** after the fixture writes and is never touched.
- Applying the package requires a separate explicit production apply authorization; the matching
  cleanup script removes exactly the 19 + 104 + 5 fixture rows and nothing else.

## Recommended next step

Explicit apply approval for the fixture package → apply → run the fixture-state
preflight → execute the 267-case negative matrix → capture the fresh authoritative
baseline → run the cleanup script.
