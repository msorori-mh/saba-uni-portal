# B1-RPC-AUTHORIZATION-MATRIX-CURRENT-TRUTH-01

| field | value |
|---|---|
| mission | `PORTAL-B1-GO-LIVE-MIGRATION-DRIFT-TESTONLY-D02-FINAL-CLOSURE-LONGRUN-01` |
| generated | 2026-08-10 |
| `SOURCE_SHA` | `9833269998a68f4ff1b86a57faf897f9b825f654` |
| `DEPLOYED_SHA` | `UNKNOWN` |
| status | `CURRENT_TRUTH_RECONCILED` — no production matrix execution in this refresh |

## 1. 267-case negative contract

The authoritative negative authorization contract for the five B1 services lives in:

- `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`

Counts from that file:

| bucket | count |
|---|---|
| negative core | 240 |
| illegal action | 24 |
| supplemental department scope | 3 |
| **negative total** | **267** |
| positive cases (held-back render) | 43 |
| executable negative total | 267 |

The 267 negative cases are **fail-closed**: every case expects `DENY` with a
specific `B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED` / `B1_ATOMIC_ACTION_REQUIRED` /
`B1_PREDECESSOR_INCOMPLETE` / `AUTHENTICATION_REQUIRED` SQLSTATE and error code.
No case admits an admin, registrar, dean, or role-pool bypass.

## 2. Negative role matrix (63-case source closure)

`docs/b1/B1-RPC-AUTHORIZATION-MATRIX-01.json` remains the source-closure matrix
used by `bun test tests/b1-rpc-matrix`. It inventories:

- 5 canonical services with stored aliases
- 11 RPCs
- 63 cases (M01..M40, X-01..X-17, E-01..E-05, H-01)
- F1 and F2 findings recorded as remediated
- 0 critical / high / medium severity findings

It cross-checks against `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` (27 entries,
sequence 1..27). No drift.

## 3. Fresh render / workflow step IDs / direct assignee constraints

`tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json` pins:

- `step_state_pins` — exact active step IDs per fixture request
- `direct_assignment_slots = 1`
- `active_unit_role_assignments = 1`
- `assigned_user_id_is_null = true`
- every runtime step binds exactly one active `request_processing_assignments` row
  for its unit+role

The fixture contract is enforced by:

- `tests/b1-five-services-rpc-authorization-preflight-01/operator-execution-package-01.test.ts`
- `tests/b1-five-services-rpc-authorization-preflight-01/atomic-rpc-literal-configured-action-package-66.test.ts`
- `tests/b1-five-services-rpc-authorization-preflight-01/execution-authorization-fail-closed-26.test.ts`

## 4. No admin bypass

Verified in source (no production RPC calls executed in this refresh):

- `act_on_b1_student_request_step_atomic` resolves authority through
  `can_current_user_act_on_step` → `user_matches_workflow_runtime_step` /
  `assert_b1_runtime_step_row_assignee_effective`.
- Authority resolution order: `assigned_user_id`, `assigned_staff_profile_id`,
  `assigned_faculty_profile_id`, `assigned_position_assignment_id`, then
  `request_processing_assignments` fallback (unit+role, active, window-valid).
- There is no special-casing for `admin`, `registrar`, or `dean` roles outside
  their own active unit/role assignment.
- Dean authority resolves only through the canonical `dean` unit-role assignment.

## 5. Academic effects protected

The five academic-effect functions are protected by:

- `b1.atomic_action` GUC required (`B1_ATOMIC_ACTION_REQUIRED`)
- direct assignee / predecessor-complete checks before effect execution
- callable only from `act_on_b1_student_request_step_atomic` or equivalent
  atomic RPC under the atomic boundary
- canonical request-type gating: `enrollment_suspension`, `excused_absence`,
  `department_transfer`, `final_chance`, `file_withdrawal`

Sources:

- `supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql`
- `supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql`

## 6. Positive / negative separation

- Negative harness: `tests/b1-five-services-rpc-authorization-preflight-01/01-negative-rollback-harness.sql`
- Positive harness: `tests/b1-five-services-rpc-authorization-preflight-01/02-positive-harness.HELD_BACK.sql`
  (intentionally held back; positive fixture matrix is verified separately)
- `MATRIX.json` separates `negative_cases`, `positive_cases`, `illegal_action_cases`,
  and `supplemental_department_scope_cases`.

## 7. Old baselines marked HISTORICAL / DIAGNOSTIC

The following reports captured valuable historical evidence but are **not** the
current Go-Live gate:

- `docs/reviews/PORTAL-B1-PR310-CRITICAL-CONTRACT-CLOSURE-LONGRUN-16.md`
- `docs/reviews/PORTAL-B1-PR310-DEFINITIVE-OPERATOR-ARCHITECTURE-AND-REAL-267-CLOSURE-LONGRUN-14.md`
- `docs/reviews/PORTAL-B1-PR310-FRESH-CI-REPRODUCIBILITY-AND-FULL-SUITE-CLOSURE-LONGRUN-18.md`

The production-readonly attestation inside
`tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
(`obtained_at_utc: 2026-07-29T04:55:00Z` against migration
`20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2`) is **HISTORICAL/DIAGNOSTIC**.
That migration is now classified `SUPERSEDED` in the canonical graph
(`docs/b1/B1-CANONICAL-MIGRATION-GRAPH-01.json`). Current truth is the source
contract at `SOURCE_SHA` above.

## 8. Decision

`NEGATIVE_MATRIX_CURRENT_TRUTH_RECONCILED` — the 267-case contract, 63-case
source-closure matrix, workflow pins, direct-assignee constraints, no-admin-bypass
invariant, and academic-effect protections are all consistent with the current
branch source. No production matrix execution was required or performed.
