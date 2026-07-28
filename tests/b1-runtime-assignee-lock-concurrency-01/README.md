# B1 runtime-assignee lock concurrency harness

Proves the TOCTOU closure of migration draft order 29
(`B1-RUNTIME-ASSIGNEE-PROPAGATION-01`) with real concurrent sessions, including
the mutable-principal surface (`staff_profiles`, `faculty_profiles`,
`position_assignments`) that the effective-identity predicate depends on.

```
python3 tests/b1-runtime-assignee-lock-concurrency-01/run-harness.py
```

- Creates a temporary PostgreSQL 17 cluster in a temp directory and removes it
  afterwards. It never connects to production and never needs credentials.
- Applies the migration draft byte-for-byte, so drift between the draft and the
  proof is impossible.
- Exit code 0 = all cases passed. Latest recorded run: `RESULTS.md`
  (37 passed, 0 failed).

Case map: C1–C5 assignment row lifecycle, C6 deadlock freedom under the single
global key, C7 legacy `enrollment_certificate` never validated, C8–C10
`staff_profiles` status/user_id, C11–C12 `faculty_profiles` status/department,
C13 `position_assignments` principal, C14–C15 the INITIAL active INSERT guard
(the first B1 step is created already active, so the UPDATE guard alone never
sees it), C16 legacy active INSERT unaffected, C17–C18 statement-level locking
under multi-row DML in opposite row order.

Not wired into CI (it needs local `initdb`/`pg_ctl`); the bun test
`tests/student-requests/b1-runtime-assignee-propagation-01.test.ts` pins the
case list and the recorded result.

