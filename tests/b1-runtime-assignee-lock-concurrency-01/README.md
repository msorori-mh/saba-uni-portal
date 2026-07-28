# B1 runtime-assignee lock concurrency harness

Proves the TOCTOU closure of migration draft order 29
(`B1-RUNTIME-ASSIGNEE-PROPAGATION-01`) with real concurrent sessions.

```
python3 tests/b1-runtime-assignee-lock-concurrency-01/run-harness.py
```

- Creates a temporary PostgreSQL 17 cluster in a temp directory and removes it
  afterwards. It never connects to production and never needs credentials.
- Applies the migration draft byte-for-byte, so drift between the draft and the
  proof is impossible.
- Exit code 0 = all cases passed. Latest recorded run: `RESULTS.md`.

Not wired into CI (it needs local `initdb`/`pg_ctl`); the bun test
`tests/student-requests/b1-runtime-assignee-propagation-01.test.ts` pins the
case list and the recorded result.
