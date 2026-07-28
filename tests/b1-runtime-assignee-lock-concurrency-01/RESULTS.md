# Recorded run — B1 runtime-assignee lock concurrency harness

Command: `python3 tests/b1-runtime-assignee-lock-concurrency-01/run-harness.py`
Engine: throwaway PostgreSQL 17 cluster in a temp directory (created and
removed by the harness). Never production.
Applied artifact: `docs/migration-drafts/B1-RUNTIME-ASSIGNEE-PROPAGATION-01.sql`
(byte-for-byte, unmodified) — global identity-boundary lock revision.

```
PASS draft applies cleanly on minimal schema
PASS C1 activation succeeds
PASS C1 concurrent deactivate blocked until activation commit  [waited 1.35s]
PASS C1 step ended active exactly once
PASS C2 activation waited for the mutation (no stale read)  [waited 1.34s]
PASS C2 activation rejected fail-closed  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:registrar_review:0]
PASS C2 no partial activation persisted
PASS C3 activation waited for the phantom insert  [waited 1.34s]
PASS C3 activation rejected with count 2  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:registrar_review:2]
PASS C3 no active step created
PASS C4 head activation waited for the department re-scope  [waited 1.34s]
PASS C4 head activation rejected after re-scope  [ERROR:  B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:source_department_head_approval]
PASS C5 retry after correction activates exactly once
PASS C6a global identity lock: no deadlock, reentrant
PASS C6b crossed activation/mutation in reversed row order: no deadlock
PASS C7 enrollment_certificate activation is not blocked and not guarded  [0.05s]
PASS C8 activation waited for the staff status change  [waited 1.33s]
PASS C8 activation rejected after the principal was disabled  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:registrar_review:0]
PASS C8 no partial activation persisted
PASS C9 activation waited for the staff user_id change  [waited 1.34s]
PASS C9 activation rejected after the principal was unlinked  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:registrar_review:0]
PASS C10 activation succeeds
PASS C10 concurrent staff disable blocked until activation commit  [waited 1.35s]
PASS C11 faculty step activation waited for the faculty status change  [waited 1.34s]
PASS C11 faculty step activation rejected fail-closed  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:academic_advisor_review:0]
PASS C12 faculty department move serializes with activation  [waited 1.34s]
PASS C12 faculty step state is total (active or pending, never partial)
PASS C13 head activation waited for the position principal change  [waited 1.33s]
PASS C13 head activation rejected after the position was unlinked  [ERROR:  B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:source_department_head_approval:0]

SUMMARY: 29 passed, 0 failed
```

## What each case proves

| Case | Mutable identity surface | Property proven |
|------|--------------------------|-----------------|
| C1   | `request_processing_assignments.is_active` | activation holds the boundary; the mutation waits |
| C2   | same, mutation first | activation cannot read a stale snapshot; fail-closed |
| C3   | phantom `INSERT` | predicate is phantom-free (count 2 rejected) |
| C4   | `transfer_request_details` department re-scope | head steps re-resolve per department |
| C5   | corrected data | retry is idempotent and total |
| C6a  | lock primitive itself | one global key ⇒ reentrant, cycle-free |
| C6b  | multi-row statement, reversed row order | no deadlock in the natural production pattern |
| C7   | legacy `enrollment_certificate` | no guard, no lock, no added latency |
| C8   | `staff_profiles.status` | disabled principal rejected at activation |
| C9   | `staff_profiles.user_id` | unlinked/swapped account rejected |
| C10  | `staff_profiles.status`, activation first | profile mutation waits for the activation commit |
| C11  | `faculty_profiles.status` | faculty-backed step fails closed |
| C12  | `faculty_profiles.department_id` | department move serializes; state stays total |
| C13  | `position_assignments.user_id` | department-head position principal re-checked |
