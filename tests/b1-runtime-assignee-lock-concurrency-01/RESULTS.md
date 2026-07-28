# RESULTS — B1 runtime-assignee lock concurrency harness

Runner: `tests/b1-runtime-assignee-lock-concurrency-01/run-harness.py`
Target: throwaway local PostgreSQL 17 cluster created and destroyed by the runner.
Production: **not touched** (no production connection string is ever used).

The harness loads `pg/10-minimal-schema.sql`, then applies the **unmodified**
`docs/migration-drafts/B1-RUNTIME-ASSIGNEE-PROPAGATION-01.sql`, then `pg/20-fixtures.sql`,
and drives real concurrent psql sessions.

## Recorded run

```
PASS draft applies cleanly on minimal schema
PASS C1 activation succeeds
PASS C1 concurrent deactivate blocked until activation commit  [waited 1.34s]
PASS C1 step ended active exactly once
PASS C2 activation waited for the mutation (no stale read)  [waited 1.33s]
PASS C2 activation rejected fail-closed  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:registrar_review:0]
PASS C2 no partial activation persisted
PASS C3 activation waited for the phantom insert  [waited 1.33s]
PASS C3 activation rejected with count 2  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:registrar_review:2]
PASS C3 no active step created
PASS C4 head activation waited for the department re-scope  [waited 1.36s]
PASS C4 head activation rejected after re-scope  [ERROR:  B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:source_department_head_approval]
PASS C5 retry after correction activates exactly once
PASS C6a multi-scope call sorts keys: no deadlock
PASS C6b crossed activation/mutation on distinct scopes: no deadlock
PASS C7 enrollment_certificate activation is not blocked and not guarded  [0.04s]

SUMMARY: 16 passed, 0 failed
```

## Interpretation

- C1: the activating transaction holds the scope lock; a concurrent deactivate
  waits ~1.3 s and only lands after the activation commits. No stale window.
- C2/C3/C4: when the mutation commits first, activation blocks, re-reads the
  committed state and is rejected fail-closed; the step stays `pending`, no
  event, no partial completion, never more than one active step.
- C5: after the data is corrected, the same activation succeeds — retry safe.
- C6a/C6b: no deadlock. Keys are always acquired ascending inside the single
  entry point `b1_lock_assignment_scopes`.
- C7: `enrollment_certificate` (non-B1) activation takes no lock, is not
  blocked by an assignment mutation, and is not guarded — legacy untouched.
