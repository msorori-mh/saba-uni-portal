# B1 Stage 3 — Forward-only TEST_ONLY cleanup migration (source-only)

Mission: `B1_STAGE3_PREPARE_FORWARD_ONLY_CLEANUP_MIGRATION_SOURCE_ONLY-128`
Mode: SOURCE-ONLY. **NOT_APPLIED.**

## Artifact

`docs/migration-drafts/B1-STAGE3-TESTONLY-LIMITED-CLEANUP-FORWARD-ONLY-128.NOT_APPLIED.sql`

Deliberately placed under `docs/migration-drafts/` (not `supabase/migrations/`)
so that no migration runner can pick it up. Promotion into a real migration
version is a separate, explicitly approved step.

## Why direct DML failed

| Attempt | Mission | Outcome |
|---|---|---|
| Direct DML in one transaction | 126 | `ERROR 42501 B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED` from `guard_b1_runtime_mutation_boundary()` — transaction-local GUC `b1.atomic_init` was not set. ROLLBACK, zero rows changed. |
| Direct DML + approved `set_config('b1.atomic_init','1',true)` | 127 | Guard cleared, then `ERROR: permission denied for table student_request_attachment_uploads`. The `sandbox_exec` execution role is SELECT-only and cannot read `supabase_migrations` either. ROLLBACK, zero rows changed. |

## Why the migration path is required

The migration channel is the only privileged write path available to this
project. It runs with sufficient privileges for the ordered deletes and can
read `supabase_migrations.schema_migrations` for the head precondition.

## What the migration carries

Verbatim from approved package 125:

- transaction-local `SELECT set_config('b1.atomic_init','1', true);`
- the same preconditions (candidate count 37, all TEST_ONLY, no HOLD
  intersection, no open requests, drift guard, child volumes 20/135/157,
  evidence present, visibility invariants, migration head `20260730175527`)
- the same ordered deletes (children first, explicit ID lists only)
- the same postconditions, incl. evidence/legacy/protected-profile integrity,
  total-row invariants, visibility and `enrollment_certificate` untouched
- fail-fast: any mismatch raises and aborts the whole transaction

Explicitly excluded: all evidence requests, `SR-20260727-695EC35B`,
`SR-20260727-F67CF366`, protected legacy records, `TEST_ONLY_B1_0002`,
`TEST_ONLY_B1_0003`, storage objects, auth accounts, all non-TEST_ONLY data.

## Transaction wrapping

The migration runner wraps the file in a single transaction, so `BEGIN`/`COMMIT`
are omitted. For manual execution the file must be wrapped explicitly.

## Status

- Migration **not applied**; no DB write, no DDL, no DML executed.
- No deploy, no publish, no workflow RPC, no `student_visible` change.
- Ready for independent review; apply requires separate owner approval.
