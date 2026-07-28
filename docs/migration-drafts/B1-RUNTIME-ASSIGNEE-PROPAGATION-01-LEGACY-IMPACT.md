# Legacy Impact Report — B1-RUNTIME-ASSIGNEE-PROPAGATION-01

Status: **MIGRATION_NOT_APPLIED** (source-only draft, order 29).

## Surface introduced

| Object | Kind | Scope |
| --- | --- | --- |
| `public.assert_b1_runtime_step_assignee_effective(uuid)` | new `STABLE SECURITY DEFINER` function | returns immediately for non-B1 request types |
| `public.guard_b1_runtime_step_activation()` | new trigger function | thin wrapper over the assert |
| `trg_guard_b1_runtime_step_activation` | new `BEFORE UPDATE OF status` row trigger | fires only on `pending/returned → active` |

No existing function, trigger, policy, grant, table or row is altered or dropped.

## Legacy / enrollment_certificate

`enrollment_certificate` and every other non-B1 request type take the early
`RETURN;` branch guarded by `is_b1_stored_request_type(request_type)`. The
trigger therefore adds one indexed lookup per activation and changes no
outcome. `apply_student_request_workflow_transition` (the legacy engine) keeps
its exact current behaviour for non-B1 requests; for B1 requests it inherits
the same fail-closed guard as the atomic engine, which is the intended
generalisation.

## Execution surface

Direct `EXECUTE` on the assert is revoked from `PUBLIC`, `anon` and
`authenticated`. It is reachable only through the trigger (definer context).

## Rows touched by the migration

Zero. The migration contains no `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE`
against any table (enforced by
`tests/student-requests/b1-runtime-assignee-propagation-01.test.ts`).

## Pre-existing pending steps

Covered without backfill. `SR-20260727-88D885F0` steps 2 and 3 already carry
exactly one `assigned_position_assignment_id` each, scoped correctly
(source → قسم تكنولوجيا المعلومات, target → قسم نظم المعلومات الحاسوبية); the
guard re-proves that at the moment each becomes active.

## Rollback by forward

`DROP TRIGGER trg_guard_b1_runtime_step_activation ON public.student_request_workflow_steps;`
restores the prior behaviour exactly; the assert function can remain in place
harmlessly.
