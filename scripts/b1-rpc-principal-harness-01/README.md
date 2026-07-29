# B1 RPC Principal Harness 01 — Operator Execution Package

**Operator-run only. Nothing here is executed by CI or by the agent.**
Preparing this package involved **NO_PRODUCTION_CONNECTION, ZERO_RPC_CALLS,
NO_ROLE_CHANGE, NO_MIGRATION, NO_DEPLOY.**

## Files

| File | Purpose | Runs |
| --- | --- | --- |
| `00-preflight.sql` | fail-closed session / privilege / visibility / catalog / function-graph preflight, read-only, ends in `ROLLBACK` | operator |
| `fingerprint.sql` | canonical complete-content fingerprint (count + full row content) | operator |
| `render-negative-cases.ts` | offline renderer: MATRIX.json → 267 single-transaction case files | offline |
| `run-negative-matrix.ps1` | Windows PowerShell launcher | operator |
| `negative-harness.sql` | original per-principal template (superseded by the renderer) | not run |
| `positive-harness.sql` | happy-path plan | **HELD_BACK** |
| `generated/cases/` | rendered cases, **git-ignored**, cleared by the renderer | produced locally |
| `generated/report/` | redacted report, **git-ignored**, created *after* rendering | produced locally |

Case source of truth: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
(240 core + 24 illegal-action + 3 transfer-scope = **267**, positives **0**).

## G1 — credential transport

`DATABASE_URL` is **not used**. No URI and no password ever reaches `psql` argv
or any process listing. The launcher exports only non-secret libpq variables
(`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSSLMODE=require`), reads the
password with `Read-Host -AsSecureString`, writes a randomly named pgpass file
in the OS temp directory (outside the repository), breaks ACL inheritance so
only the current user has access, verifies that ACL, points `PGPASSFILE` at it,
and shreds + deletes it in `finally` (success, failure, or Ctrl+C). If a
user-only ACL cannot be enforced the run stops **before** psql starts.

All psql output is captured in memory, passed through `Protect-Output`
(redacting `postgresql://`, `postgres://`, `password=`, `PGPASSWORD`,
`PGPASSFILE=`, and pgpass-shaped lines) and only the redacted text is written to
`generated/report/`.

```powershell
./scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1 `
  -PgHost <endpoint containing wpmicqriltrowwonknox> `
  -PgUser <operator role> `
  -ProbeSub 3a279561-f8e6-41d9-b8ca-ce60682c9eab `
  -FunctionGraphMd5 <pinned md5 from the reviewed attestation>
```

`psql` (PostgreSQL 15+) and `bun` must be on `PATH`.

## G2 — target attestation (two independent checks)

**A. Launcher endpoint check** — `PGHOST` *or* `PGUSER` must contain the
approved project ref `wpmicqriltrowwonknox`, and `-ExpectedRef` must equal it.

**B. Catalog check inside SQL** — Migration 29 present exactly once at the
pinned `version` with a non-empty `name`; the six Migration-29 functions and the
eight Migration-29 triggers present by exact name; the five services present and
all `student_visible = false`; the five TEST_ONLY requests present; zero fee
assessments on the two payment-bearing test requests.

Any mismatch ⇒ `PREFLIGHT_FAIL` before the first RPC.

## G3 — operator privilege and visibility contract

The fingerprint relation list is declared explicitly in the preflight. For every
relation the preflight proves the operator is a **pure observer**:

- `session_user` ∉ {`sandbox_exec`, `service_role`, `supabase_admin`, `postgres`}
- resolvable in `pg_roles` (`NOT FOUND` ⇒ fail, never a silent pass)
- not `SUPERUSER`, not `BYPASSRLS`
- **owner of none** of the scope relations (ownership implies an implicit RLS bypass)
- has `SELECT` on every relation, and **no** `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`
- `relrowsecurity = true` and at least one policy present on every RLS-required relation
- can actually see all five TEST_ONLY requests, ≥ 24 runtime steps, the three
  protected records and the assignment table

Any gap ⇒ `PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN`. This package creates
no role and no policy.

## G4 — authenticated / anon equivalence

- `actor_user_id` present ⇒ `SET LOCAL ROLE authenticated` + claims
  `{"sub": <actor>, "role": "authenticated"}`; the case asserts
  `auth.uid() = actor` and `auth.role() = 'authenticated'`.
- `actor_user_id` null ⇒ `SET LOCAL ROLE anon` + claims `{"role":"anon"}` with
  **no** `sub`; the case asserts `auth.uid() IS NULL` and `auth.role() = 'anon'`.

`authenticated` and `anon` are both proven non-superuser and non-BYPASSRLS.
The `authenticated` role is never combined with anon claims.

## G5 — isolation and state pinning

```
BEGIN ISOLATION LEVEL SERIALIZABLE
  observer phase: fixed-order locks (request → runtime steps → assignments),
                  state pinning against MATRIX.json, before fingerprint
  SET LOCAL ROLE <authenticated|anon> → claims → the exact direct RPC
  RESET ROLE
  observer phase: DENY proof, step/assignee drift proof, after fingerprint
ROLLBACK        (unconditional)
outside the transaction: fresh read session fingerprint == baseline
```

Locking uses **transaction-scoped advisory locks in a fixed order** rather than
`SELECT … FOR UPDATE`: Postgres requires `UPDATE` privilege for row-level
locking, which directly contradicts the G3 read-only operator contract. The
combination of `SERIALIZABLE`, deterministic advisory lock ordering, MATRIX
state pinning and the post-RPC step/assignee re-check gives the same drift
detection without granting the operator any write privilege.

Serialization failure, concurrent drift, changed current step, changed direct
assignee or baseline mismatch ⇒ **stop**. There is no automatic retry.

## G6 — matrix and generator hardening

`MATRIX.json` is pinned by LF SHA256 (`eec83071…fda05`); any drift aborts before
a single file is written. Every field is validated (UUID format, request-number
format, step-key format, class enum, action enum, `expect = DENY`) and rejected
if it contains newline/CR, NUL, control characters, `/`, `\`, `..`, `;`, `--`,
`/*`, `*/`, `$case$`, quotes, or a transaction-control keyword. File names are
pure ordinals — `case-0001.sql` … `case-0267.sql` — no MATRIX value ever reaches
a path. Comments carry JSON-encoded scalars only.

## G7 — complete content fingerprint

`fingerprint.sql` hashes **count + full row content** for: `student_requests`,
`student_request_workflow_steps`, `student_request_workflow_events`,
`request_processing_assignments`, `student_request_attachment_uploads`,
`student_request_attachments`, `student_request_fee_assessments`,
`payment_receipts`, `official_documents`,
`enrollment_certificate_document_details`, `transfer_request_details`,
`enrollment_suspension_details`, `absence_excuse_details`,
`extra_chance_details`, `file_withdrawal_details`, `student_excused_absences`,
`student_extra_chances`, `student_academic_status`, `student_enrollments`,
`notifications` (global count + newest-500 content), `audit_logs` (global count
+ newest-500 content), B1 service visibility, the protected
enrollment-certificate requests, and `supabase_migrations.schema_migrations`.

No non-semantic column is excluded. The renderer inlines the *same* expression
between the `BEGIN_FINGERPRINT_EXPR` / `END_FINGERPRINT_EXPR` markers, so the
in-transaction and outside-transaction fingerprints are one contract.

## G8 — function graph pinning

The preflight declares the exact allowlist of functions the two RPC entry points
may reach, proves each exists, rejects any definition containing `pg_net.`,
`net.http_`, `dblink`, `http_post`, `http_get`, `lo_export`, `lo_import` or
`COPY … PROGRAM`, and requires the aggregate `pg_get_functiondef` md5 to equal
the pinned `-FunctionGraphMd5`. `UNPINNED` fails closed while printing the
observed value as a notice so it can be reviewed and pinned.

## Hard rules

- No `postgres` / `service_role` / `sandbox_exec` RPC calls.
- No employee passwords, no token minting, no `auth.users` writes.
- No fee assessment, no workflow transition, no `student_visible` change.
- Negative cases always end in `ROLLBACK`; positives are **not** part of this package.
- Secrets never enter Git, logs, or the generated report.
