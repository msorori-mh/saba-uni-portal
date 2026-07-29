# B1 RPC Principal Harness 01 — Operator Execution Package

**Operator-run only. Nothing here is executed by CI or by the agent.**
Preparing this package involved **NO_PRODUCTION_EXECUTION, ZERO_RPC_CALLS,
NO_ROLE_CHANGE, NO_MIGRATION, NO_DEPLOY.**

## Files

| File | Purpose | Runs |
| --- | --- | --- |
| `00-preflight.sql` | G1 fail-closed session/role/data preflight, read-only, ends in `ROLLBACK` | operator |
| `fingerprint.sql` | outside-transaction business fingerprint (md5) | operator |
| `render-negative-cases.ts` | offline renderer: MATRIX.json → 267 single-transaction case files | offline |
| `run-negative-matrix.ps1` | Windows PowerShell launcher (G2/G3 contract) | operator |
| `negative-harness.sql` | original per-principal template (superseded by the renderer) | not run |
| `positive-harness.sql` | happy-path plan | **HELD_BACK** |
| `generated/` | rendered cases + report, **git-ignored** | produced locally |

Case source of truth: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
(240 core + 24 illegal-action + 3 transfer-scope = **267**, positives **0** in this package).

## Why an operator session is required

The Lovable sandbox executor connects with a `BYPASSRLS` role and cannot
`SET ROLE authenticated`, so it can never reproduce a PostgREST principal.
That is the recorded hold. This package moves execution to an operator `psql`
session whose role has membership in `authenticated`, with no role creation,
no `GRANT`, and no `ALTER ROLE`.

`auth.uid()` / `auth.role()` in this project read **only** the
`request.jwt.claims` GUC, so `SET LOCAL ROLE authenticated` +
`set_config('request.jwt.claims', …, true)` is authenticated-equivalent.

## Required environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | operator connection string. **Environment only** — never committed, never printed, never in the report |
| `PGPASSWORD` | if the URL carries no password | session-scoped only |
| `PGSSLMODE` | recommended | `require` |

`psql` (PostgreSQL 15+ client) must be on `PATH`. `bun` must be on `PATH` for the renderer.

## PowerShell command template

```powershell
$env:DATABASE_URL = "postgresql://<operator-role>@<host>:5432/postgres?sslmode=require"
$env:PGPASSWORD   = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText

./scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1 `
  -ExpectedRef wpmicqriltrowwonknox `
  -ProbeSub    3a279561-f8e6-41d9-b8ca-ce60682c9eab

Remove-Item Env:PGPASSWORD, Env:DATABASE_URL
```

## G1 preflight assertions (all must pass before case 001)

1. `expected_ref = wpmicqriltrowwonknox`
2. `session_user` ∉ {`sandbox_exec`, `service_role`, `supabase_admin`}, and has no `BYPASSRLS`
3. `SET LOCAL ROLE authenticated` succeeds
4. `current_user = authenticated`
5. `current_setting('role') = authenticated`
6. `row_security = on`
7. `authenticated.rolbypassrls = false` (and not superuser)
8. `auth.uid()` matches the injected `sub`; `auth.role() = authenticated`
9. renderer asserts MATRIX.json yields exactly 267 negative cases
10. the five TEST_ONLY requests exist; the three protected records exist
11. zero fee assessments on `SR-20260727-3C550070` and `SR-20260727-88D885F0`
12. Migration 29 present exactly once

Any failure ⇒ **STOP before the first RPC** (`ON_ERROR_STOP=1`).

## Per-case execution contract (G3)

```
BEGIN → SET LOCAL ROLE authenticated → SET LOCAL request.jwt.claims
      → assert current_user / auth.uid() / row_security / no-bypass
      → resolve + pin runtime step id
      → before fingerprint
      → invoke the exact direct RPC (act_on_b1_student_request_step_atomic,
        or record_external_university_payment_confirmation for confirm_payment)
      → require DENY, require after == before
      → RESET ROLE → ROLLBACK
outside the transaction → global fingerprint must equal the baseline
```

No transaction is ever reused across cases. The launcher aborts on the first
unexpected ALLOW, mutation, or fingerprint drift.

## Hard rules

- No `postgres` / `service_role` / `sandbox_exec` RPC calls.
- No employee passwords, no token minting, no `auth.users` writes.
- No fee assessment, no workflow transition, no `student_visible` change.
- Negative cases always end in `ROLLBACK`; positives are **not** part of this package.
- Secrets never enter Git, logs, or the generated report.
