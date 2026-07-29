# PORTAL-B1-NEGATIVE-RPC-MATRIX-BLOCKED-FIXTURES-CLOSURE-62 — Report

MODE: SOURCE FIXTURE REMEDIATION + PRODUCTION READ-ONLY ATTESTATION ONLY
Input SHA: `a603e4d365becef938cd522dfb77b44a1300e4c8`

## FINAL DECISION

**HOLD_B1_NEGATIVE_RPC_MATRIX_BLOCKED_FIXTURES_ACTIVE_STEP_FIXTURE_REQUIRES_FORBIDDEN_WORKFLOW_TRANSITION**

All 22 BLOCKED cases share one and only one missing precondition: an **ACTIVE**
runtime step at the target `step_key`. In production every one of those 22 steps
is `pending` (or, for `SR-20260727-695EC35B`, already `completed`). The only
mechanism that turns a `pending` B1 runtime step into `active` is executing the
predecessor step through `act_on_b1_student_request_step_atomic` — a Workflow
RPC and a production write, both explicitly forbidden by this mission
(`ZERO_WORKFLOW_RPC_ACTIONS`, `NO_PRODUCTION_WRITE`, `NO_MIGRATION`, no DML).

Therefore `blocked cases = 0` is **not reachable** inside this mission's mandate.
Per rule 4, the 22 cases stay BLOCKED, no data was created, no request modified.

## Production reads (SELECT only, 4 queries, 0 RPC, 0 writes)

1. `information_schema.columns` for `student_request_workflow_steps`
2. runtime step state for the five TEST_ONLY requests
3. `request_types` visibility for the five services + `enrollment_certificate`
4. `supabase_migrations.schema_migrations` head

### Observed runtime state

| request | type | request status | active step |
|---|---|---|---|
| SR-20260727-3C550070 | final_chance | submitted | `student_affairs_intake` (39931cd9-…) |
| SR-20260727-42393846 | file_withdrawal | submitted | `student_affairs_intake` (38fffaa0-…) |
| SR-20260727-50BEDCE2 | enrollment_suspension | submitted | `initial_review` (6e7855cb-…) |
| SR-20260727-88D885F0 | department_transfer | submitted | `student_affairs_intake` (6ae588d1-…) |
| SR-20260727-695EC35B | excused_absence | **completed** | none (all 3 steps completed) |

No step targeted by the 22 blocked cases is `active`.

## Inventory of the 22 BLOCKED cases

| # | case class | service | request | step_key | runtime_step_id | runtime status | configured action | attempted action | principal (actor_user_id) | unit/role | missing fixture |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | illegal_action_by_exact_assignee | department_transfer | SR-20260727-88D885F0 | source_department_head_approval | `6b224eb7-7720-42e4-bb08-ad3c2bd1c0f3` | pending | approve | archive | d4aaa5c9-72d1-4996-b0e8-d30c6327da6e | department/department_head | ACTIVE runtime step at this step_key |
| 2 | illegal_action_by_exact_assignee | department_transfer | SR-20260727-88D885F0 | target_department_head_approval | `dd1360de-d3a1-49e8-9a67-876506b27150` | pending | approve | archive | f602b62c-194b-4591-8e9c-956e5cbb347d | department/department_head | ACTIVE runtime step at this step_key |
| 3 | illegal_action_by_exact_assignee | department_transfer | SR-20260727-88D885F0 | dean_approval | `b75dff6d-f8ba-4654-b4ce-f8986d90dbcc` | pending | approve | archive | b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0 | dean/dean | ACTIVE runtime step at this step_key |
| 4 | illegal_action_by_exact_assignee | department_transfer | SR-20260727-88D885F0 | payment_confirmation | `4b55d00e-1827-4347-8a61-ed4658f63fa5` | pending | confirm_payment | archive | 79783c0f-8d95-4110-8239-0ac504d63a24 | finance/revenue_finance_officer | ACTIVE runtime step at this step_key |
| 5 | illegal_action_by_exact_assignee | department_transfer | SR-20260727-88D885F0 | registrar_apply | `ab2ee336-a6c0-4c86-a9b1-a8a31aa476c4` | pending | apply_decision | archive | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | registrar/registrar_general | ACTIVE runtime step at this step_key |
| 6 | illegal_action_by_exact_assignee | enrollment_suspension | SR-20260727-50BEDCE2 | manager_approval | `70614d9a-d916-4b33-a7e0-b3ceae082705` | pending | approve | archive | aac0e62d-4e8b-4440-b649-caa388d34837 | student_affairs/student_affairs_manager | ACTIVE runtime step at this step_key |
| 7 | illegal_action_by_exact_assignee | enrollment_suspension | SR-20260727-50BEDCE2 | registrar_apply | `53f1aeb6-0475-4753-8c44-3495962cbe3a` | pending | apply_decision | archive | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | registrar/registrar_general | ACTIVE runtime step at this step_key |
| 8 | illegal_action_by_exact_assignee | excused_absence | SR-20260727-695EC35B | manager_review | `7db4eacc-d542-459b-a066-46a54c2e325b` | pending | approve | archive | aac0e62d-4e8b-4440-b649-caa388d34837 | student_affairs/student_affairs_manager | ACTIVE runtime step at this step_key |
| 9 | illegal_action_by_exact_assignee | excused_absence | SR-20260727-695EC35B | record_apply | `b7c0f4d2-1565-4af7-9196-45bf87a1baed` | pending | apply_decision | archive | c8a94548-4782-4252-86f9-23559d3b95bd | student_affairs/student_affairs_specialist | ACTIVE runtime step at this step_key |
| 10 | illegal_action_by_exact_assignee | file_withdrawal | SR-20260727-42393846 | library_clearance | `1830c0f2-3503-4cf8-af49-246623b2be33` | pending | clear | archive | e7a93314-bb06-4525-b412-5315198c668a | library/library_officer | ACTIVE runtime step at this step_key |
| 11 | illegal_action_by_exact_assignee | file_withdrawal | SR-20260727-42393846 | labs_clearance | `c00ce6ba-9c3f-440d-9664-f18341bc52e5` | pending | clear | archive | 67b39ee4-4918-4b00-b4cc-0d5046ac8a5a | labs/labs_manager | ACTIVE runtime step at this step_key |
| 12 | illegal_action_by_exact_assignee | file_withdrawal | SR-20260727-42393846 | activities_clearance | `884ec9d9-4b55-49af-bc12-478b53ae5e2a` | pending | clear | archive | aac0e62d-4e8b-4440-b649-caa388d34837 | student_affairs/student_affairs_manager | ACTIVE runtime step at this step_key |
| 13 | illegal_action_by_exact_assignee | file_withdrawal | SR-20260727-42393846 | finance_clearance | `80f23452-2505-4a0d-9a0c-53469645ed4d` | pending | clear | archive | 79783c0f-8d95-4110-8239-0ac504d63a24 | finance/revenue_finance_officer | ACTIVE runtime step at this step_key |
| 14 | illegal_action_by_exact_assignee | file_withdrawal | SR-20260727-42393846 | registrar_apply | `0111b914-4783-4418-b6ac-587cab06fed1` | pending | apply_decision | archive | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | registrar/registrar_general | ACTIVE runtime step at this step_key |
| 15 | illegal_action_by_exact_assignee | file_withdrawal | SR-20260727-42393846 | archive | `39daa476-4014-4403-a925-41da710180ee` | pending | archive | confirm_payment | aec1303e-de6a-4580-94cf-7205c17b5535 | archive/archive_officer | ACTIVE runtime step at this step_key |
| 16 | illegal_action_by_exact_assignee | final_chance | SR-20260727-3C550070 | manager_review | `12d31b1b-c84a-47ac-ac0b-ce4027d4fa4e` | pending | approve | archive | aac0e62d-4e8b-4440-b649-caa388d34837 | student_affairs/student_affairs_manager | ACTIVE runtime step at this step_key |
| 17 | illegal_action_by_exact_assignee | final_chance | SR-20260727-3C550070 | dean_decision | `4a9bfb3f-18f2-4cf8-bcf1-7051420c8dcc` | pending | approve | archive | b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0 | dean/dean | ACTIVE runtime step at this step_key |
| 18 | illegal_action_by_exact_assignee | final_chance | SR-20260727-3C550070 | payment_confirmation | `55c927de-6b10-4e48-ad56-df3b406a10dd` | pending | confirm_payment | archive | 79783c0f-8d95-4110-8239-0ac504d63a24 | finance/revenue_finance_officer | ACTIVE runtime step at this step_key |
| 19 | illegal_action_by_exact_assignee | final_chance | SR-20260727-3C550070 | registrar_apply | `6761a1c5-eb21-4e7a-9cc0-a9c1e011d5b4` | pending | apply_decision | archive | 4c261c1c-97fb-42da-a544-e8a59853ebe3 | registrar/registrar_general | ACTIVE runtime step at this step_key |
| 20 | department_scope_swap_source_head_on_target_step | department_transfer | SR-20260727-88D885F0 | target_department_head_approval | `dd1360de-d3a1-49e8-9a67-876506b27150` | pending | approve | approve | d4aaa5c9-72d1-4996-b0e8-d30c6327da6e | department/department_head | ACTIVE runtime step at this step_key |
| 21 | department_scope_swap_target_head_on_source_step | department_transfer | SR-20260727-88D885F0 | source_department_head_approval | `6b224eb7-7720-42e4-bb08-ad3c2bd1c0f3` | pending | approve | approve | f602b62c-194b-4591-8e9c-956e5cbb347d | department/department_head | ACTIVE runtime step at this step_key |
| 22 | third_department_head_unrelated | department_transfer | SR-20260727-88D885F0 | source_department_head_approval | `6b224eb7-7720-42e4-bb08-ad3c2bd1c0f3` | pending | approve | approve | 97acbe02-c59c-409c-8d51-7d4ef72e6db7 | department/department_head | ACTIVE runtime step at this step_key |
### Why each case is blocked (identical root cause)

`act_on_b1_student_request_step_atomic` evaluates `B1_ACTIVE_STEP_REQUIRED`
**before** the direct-assignee authorization gate and before the
`action_type` / department-scope gates. Against a `pending` step the RPC denies
with a step-state error, which never proves the illegal-action contract
(cases 1–19) nor the transfer department-scope contract (cases 20–22).

### Closure method required per case (NOT executed here)

Cases 1–7, 10–22: drive the owning request forward with the *legitimate*
assignee for each predecessor step via the atomic RPC until the target
`step_key` becomes `active`, then re-pin `runtime_status=active` and render the
case as executable. This is a sequence of real workflow transitions on
TEST_ONLY requests and needs an explicit execution mandate.

Cases 8–9 (`SR-20260727-695EC35B`, excused_absence): **permanently unclosable on
this request** — the request is `completed` and its steps can never return to
`active`. Closing them requires a *new* TEST_ONLY excused_absence request, i.e.
data creation, which this mission forbids.

## Baseline drift verdict

| item | expected | observed | verdict |
|---|---|---|---|
| migration head | 20260729173359 | 20260729173359 | MATCH |
| baseline status / fingerprint | PINNED / be5040a4fd34fc1fbab235e118c509d0 | unchanged in source | UNTOUCHED |
| Function Graph | 28/28 | unchanged in source (not re-captured) | UNTOUCHED |
| five services | is_active=true, student_visible=false | identical for all five | MATCH |
| enrollment_certificate | active + visible | is_active=true, student_visible=true | PROTECTED |
| Positive harness | HELD_BACK | HELD_BACK | UNCHANGED |

**Baseline fingerprint domain drift: NONE.** Baseline was neither re-captured
nor modified.

Advisory (outside the fingerprint domain): the matrix `step_state_pins` for
`SR-20260727-695EC35B|manager_review` and `|record_apply` were pinned as
`pending`; production now reports them `completed` (mission-56 lifecycle
completion). This is expected historical progression, not baseline drift, and is
recorded here without changing the pinned artifact.

## Counts

- executable cases: **245**
- blocked cases: **22**
- total: **267**

## Ledger

- Workflow RPC calls: 0
- Operator Preflight runs: 0
- Executed matrix cases: 0
- Production writes / DML / DDL / Migrations: 0
- Role, assignment, workflow-config, student_visible changes: 0
- Deploy: none
