# B1 local PostgreSQL 17 compile harness

This harness compiles the ordered B1 five-service migration drafts against an
isolated `postgres:17` Docker container. It is source-only: it has no Supabase
URL, production credential, deployment command, or `student_visible` mutation.

Run from this worktree:

```powershell
.\scripts\b1-local-pg-compile\02-run-compile.ps1
```

The script creates a random Docker-published host port, waits for the local
database, applies `01-minimal-compatible-schema.sql`, and removes its uniquely
named container in `finally`, including on an error.

The order-1 release-evidence draft is handled specially:

1. Its real source must retain `APPROVED_RELEASE_COMMIT_PLACEHOLDER`.
2. The real source is executed once to prove it fails closed.
3. Only a temporary file outside the worktree has the placeholder replaced by
   `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` and is compiled.

The minimal schema contains synthetic local identities solely for the UUIDs
hard-coded in the processing-domain draft. They are not production identity
mappings. If that preflight cannot be met, the script reports the exact error
and blocks later domain-dependent drafts as `BLOCKED_BY_DOMAINS`.

Outputs are overwritten on each run:

- `results.json` — machine-readable per-draft compile status and LF-normalized SHA-256
- `RESULTS.md` — local-only human summary

`positive_negative_writes` is intentionally `SKIP`: this harness is a compile
and idempotency gate, not an authorization behavior test suite.
