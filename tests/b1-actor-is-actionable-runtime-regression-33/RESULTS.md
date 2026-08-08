# PORTAL-B1-ACTOR-IS-ACTIONABLE-RUNTIME-REGRESSION-33 — RESULTS

Deterministic executable regression for draft
`docs/migration-drafts/B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql`.

- Executed against a **disposable local PostgreSQL cluster** (`run-harness.sh`).
- The draft is applied **VERBATIM**; production is never touched.
- All cases run inside a single transaction that ends with `ROLLBACK`.
- Draft SHA256 (LF): `d24d42c99f8a8f19935f659e5e4e6c2bca0e86f4639970735e6db033dbdbf1b2`

## Cases

| Case | Meaning |
| --- | --- |
| A | Haitham fixture: direct assignee on an `active` step configured `review` → `is_actionable = true` |
| B | Old defective probe (`'approve'`) is false while the configured action (`review`) is true |
| C | Wrong actor on the same step → denied everywhere |
| D | Missing / NULL configured action → fail-closed `false`, resolver stays single-row |
| E | Non-active steps (`completed`, `pending`) are never actionable |

## Verdict

OVERALL: **REGRESSION_PASS** — 5 cases / 21 assertions / 0 failures.

## Raw run output

```text
== applying local minimal schema
== applying Package 30 migration draft VERBATIM: B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql
== running CASE A..E (isolated transaction, ends with ROLLBACK)
BEGIN
CREATE TABLE
DO
== PER-ASSERTION RESULTS
 seq | case_id |                         assertion                         | expected |           actual            | verdict 
-----+---------+-----------------------------------------------------------+----------+-----------------------------+---------
   1 | A       | workflow_runtime_step_configured_action(active step)      | review   | review                      | PASS
   2 | A       | user_matches_workflow_runtime_step                        | true     | true                        | PASS
   3 | A       | current_user_has_exact_processing_binding                 | true     | true                        | PASS
   4 | A       | get_student_request_detail_for_actor -> is_actionable     | true     | true                        | PASS
   5 | A       | get_my_request_actor_inbox -> is_actionable               | true     | true                        | PASS
   6 | A       | fee_processing_context -> can_execute_current_step        | true     | true                        | PASS
   7 | B       | can_current_user_act_on_step(step, 'approve') [old probe] | false    | false                       | PASS
   8 | B       | can_current_user_act_on_step(step, configured 'review')   | true     | true                        | PASS
   9 | C       | user_matches_workflow_runtime_step (wrong actor)          | false    | false                       | PASS
  10 | C       | detail_for_actor -> is_actionable (wrong actor)           | false    | false                       | PASS
  11 | C       | actor_inbox rows for wrong actor                          | 0        | 0                           | PASS
  12 | D       | configured_action with missing workflow_step_id           | <null>   | <null>                      | PASS
  13 | D       | detail_for_actor -> is_actionable, missing config         | false    | false                       | PASS
  14 | D       | configured_action with NULL action_type                   | <null>   | <null>                      | PASS
  15 | D       | detail_for_actor -> is_actionable, NULL action_type       | false    | false                       | PASS
  16 | D       | fee context -> can_execute_current_step, NULL action_type | false    | false                       | PASS
  17 | D       | ambiguous duplicate config id rejected by primary key     | rejected | rejected (unique_violation) | PASS
  18 | D       | configured_action returns exactly one scalar row          | 1        | 1                           | PASS
  19 | E       | detail_for_actor -> is_actionable, completed step         | false    | false                       | PASS
  20 | E       | detail_for_actor -> is_actionable, pending step           | false    | false                       | PASS
  21 | E       | actor_inbox -> any actionable among non-active steps      | false    | false                       | PASS
(21 rows)

== PER-CASE SUMMARY
 case_id | assertions | passed | case_verdict 
---------+------------+--------+--------------
 A       |          6 |      6 | PASS
 B       |          2 |      2 | PASS
 C       |          3 |      3 | PASS
 D       |          7 |      7 | PASS
 E       |          3 |      3 | PASS
(5 rows)

== OVERALL
 cases | assertions | passed | failed |     overall     
-------+------------+--------+--------+-----------------
     5 |         21 |     21 |      0 | REGRESSION_PASS
(1 row)

ROLLBACK
```
