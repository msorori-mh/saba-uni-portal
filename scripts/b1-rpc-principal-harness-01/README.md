# B1 RPC Principal Harness 01

Operator-run only. Nothing here is executed by CI or by the agent.

| File | Purpose | Runs |
| --- | --- | --- |
| `negative-harness.sql` | Per-principal denial matrix, every case in its own `ROLLBACK` transaction | Not yet |
| `positive-harness.sql` | COMMIT-capable happy-path execution plan | Held back |

## Authenticated equivalence

`auth.uid()` and `auth.role()` in this project read **only** the
`request.jwt.claims` GUC (verified against `pg_proc` for `auth.uid` /
`auth.role`). Combining `SET LOCAL ROLE authenticated` with
`set_config('request.jwt.claims', ..., true)` therefore reproduces the exact
principal, GRANT surface and RLS surface of a PostgREST authenticated request.
No function in the B1 authorization chain consults `current_user` or
`session_user`.

## Hard rules

- No `postgres` / `service_role` RPC calls.
- No employee passwords, no token minting, no `auth.users` writes.
- Negative cases always end in `ROLLBACK`; snapshot before/after must be identical.
- Any unauthorized success halts the matrix immediately.
