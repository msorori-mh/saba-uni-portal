# B1 Negative RPC Matrix — Operator Execution Package (Remediation 05)

**Operator-run only. Nothing here is executed by CI or by the agent.**
Preparing this package involved **NO_PRODUCTION_CONNECTION, ZERO_RPC_CALLS,
NO_ROLE_CHANGE, NO_MIGRATION, NO_DEPLOY.**

## Files

| File | Purpose | Runs |
| --- | --- | --- |
| `TARGET-MANIFEST.json` | the only source of endpoint, migration, trigger, function-graph and baseline pins | data |
| `00-preflight.sql` | fail-closed session / target / privilege / baseline / catalog / function-graph preflight, read-only, ends in `ROLLBACK` | operator |
| `fingerprint.sql` | canonical complete-content fingerprint (count + full row content, **no LIMIT**) | operator |
| `render-negative-cases.ts` | offline renderer: MATRIX.json + manifest → pins, 267 cases, master script | offline |
| `run-negative-matrix.ps1` | Windows launcher: renders, then runs **one** psql process | operator |
| `generated/` | pins, cases, master, redacted report — git-ignored | produced locally |
| `negative-harness.sql`, `positive-harness.sql` | superseded / **HELD_BACK** | not run |

Case source of truth: `tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json`
(240 core + 24 illegal-action + 3 transfer-scope = **267**, positives rendered **0**,
`COMMIT` statements **0**).

## G1 — value sanitation

Every MATRIX-derived value is validated for shape (UUID, `SR-YYYYMMDD-XXXXXXXX`,
snake-case key/action) and rejected on newline/CR, **`[\u0000-\u001F\u007F]` with
the `u` flag**, `/`, `\`, `..`, `;`, `--`, `/*`, `*/`, `$case$`, quotes or a
transaction-control keyword. `expect_error` is free text but is held to the same
control-character, quote and terminator rules. File names are pure ordinals
(`case-0001.sql` … `case-0267.sql`); no MATRIX value ever reaches a path.

## G2 — credentials

`DATABASE_URL` is **not read and not supported**. There is no pgpass file, no
`PGPASSWORD`, no password in argv and no password on disk. The launcher aborts if
`DATABASE_URL`, `PGPASSWORD`, `PGPASSFILE`, `PGSERVICE` or `PGSERVICEFILE` is set
in the environment, then invokes `psql -W` so PostgreSQL prompts once,
interactively, for the single master run. All psql output is captured, passed
through `Protect-Output` and only the redacted text is written to
`generated/report/`.

## G3 — fixed target manifest

Host, port, database, user shape and sslmode come **only** from
`TARGET-MANIFEST.json` (`project_ref = wpmicqriltrowwonknox`). The launcher has no
host/user/ref parameters, so no other endpoint can be selected. Port **5432**
(session mode) is required; transaction-mode **6543** is explicitly rejected
because the package needs `ON COMMIT DROP` temp pins, `SET LOCAL ROLE` and
multi-statement transactions.

## G4 — Migration 29 attestation

The preflight requires `supabase_migrations.schema_migrations` to contain
version `20260729014519` exactly once **with the exact pinned `name`**, the six
Migration-29 functions by exact signature, and the eight Migration-29 triggers by
exact `tgname` + trigger function + `tgtype` + `tgenabled` + `UPDATE OF` column
set. Any addition, removal, retype, disable or column change ⇒
`B1_PREFLIGHT_MIGRATION_29_TRIGGER_SET_DRIFT` / `..._FUNCTION_SET_DRIFT`.

## G5 — operator visibility via an authoritative baseline

The operator is proven a pure observer: not `sandbox_exec`/`service_role`/
`supabase_admin`/`postgres`, resolvable in `pg_roles`, not `SUPERUSER`, not
`BYPASSRLS`, owner of **no** scope relation, `SELECT` on every relation and
**no** `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`. RLS must be enabled **and** carry at
least one policy on every scope relation — partial RLS fails.

Row-count checks are not accepted as visibility proof. The preflight computes the
complete-content fingerprint and compares it to the pinned
`authoritative_baseline.fingerprint` produced out-of-band through the Lovable
read-only channel. Status `PENDING` (the current state) fails closed with
`PREFLIGHT_FAIL: OPERATOR_VISIBILITY_NOT_PROVEN` — the baseline must be generated
and pinned in the manifest immediately before the run.

## G6 — real locking and state pinning

Advisory locks are gone. Every case takes genuine `SELECT … FOR SHARE` locks in a
fixed order — request → runtime steps (`ORDER BY id`) → processing assignments
(`ORDER BY id`) → transfer detail row for `department_transfer` — inside
`BEGIN ISOLATION LEVEL SERIALIZABLE`. It then pins request type, runtime step id,
step order, step status, direct assignee, predecessor completion and (for
transfers) department scope against MATRIX.json before touching the RPC. Any
divergence raises `CASE_STATE_DRIFT` and, with `ON_ERROR_STOP`, stops the run.
Because row locking requires more than `SELECT`, the preflight probes `FOR SHARE`
and fails with `OPERATOR_ROW_LOCK_CAPABILITY_NOT_PROVEN` rather than granting
anything itself.

## G7 — complete content fingerprint

`fingerprint.sql` hashes count + **full row content** with **no `LIMIT`** for 23
relations: `student_requests`, `student_request_workflow_steps`,
`student_request_workflow_events`, `request_processing_assignments`,
`student_request_attachment_uploads`, `student_request_attachments`,
`student_request_fee_assessments`, `payment_receipts`, `official_documents`,
`enrollment_certificate_document_details`, `transfer_request_details`,
`enrollment_suspension_details`, `absence_excuse_details`, `extra_chance_details`,
`file_withdrawal_details`, `student_excused_absences`, `student_extra_chances`,
`student_academic_status`, `student_enrollments`, **`student_profiles`**,
`notifications`, `audit_logs`, plus B1 service visibility, the three protected
enrollment-certificate requests and `supabase_migrations.schema_migrations`.
The renderer inlines the same expression between the `BEGIN_FINGERPRINT_EXPR` /
`END_FINGERPRINT_EXPR` markers into the pins, into each case's before/after check
and into the post-run check, and refuses to render if the expression contains
`LIMIT`.

## G8 — transitive function-graph pinning

The manifest pins 31 functions (the two entry points plus their closure:
authorization guards, workflow transition, the five academic-effect appliers,
notification/audit writers and the Migration-29 identity guards). The preflight
(a) proves every pinned function exists, (b) walks the closure **from the
database** starting at the entry points and fails with `FUNCTION_GRAPH_DRIFT` on
any reachable function that is not pinned, (c) rejects `pg_net.`, `net.http_`,
`dblink`, `http_post`, `http_get`, `pg_notify`, `lo_export`, `lo_import` and
`copy program` anywhere in the closure, and (d) requires the normalized
`pg_get_functiondef` SHA256, `SECURITY DEFINER/INVOKER`, owner and `search_path`
to match. Unpinned (`null`) hashes fail closed while printing the observed value
as a notice for review.

## G9 — single-psql master execution

`generated/master-negative-matrix.sql` is executed by one `psql -W … -f` process:
preflight → `case-0001` … `case-0267` → outside-transaction baseline check. Each
case is its own `BEGIN ISOLATION LEVEL SERIALIZABLE … ROLLBACK`. `ON_ERROR_STOP`
aborts the entire run at the first `PREFLIGHT_FAIL`, `CASE_STATE_DRIFT`,
`CASE_FAIL_ALLOWED`, `CASE_FAIL_MUTATION` or `POST_RUN_FAIL`. The session runs with
`default_transaction_read_only=off` on purpose (see G1): read-only sessions must
never mask an authorization bypass. Isolation comes from the ROLLBACK-only cases.

## Usage

```powershell
./scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1
```

`psql` (PostgreSQL 15+) and `bun` must be on `PATH`. No arguments are accepted for
the target or for credentials by design.

## Hard rules

- No `postgres` / `service_role` / `sandbox_exec` RPC calls.
- No employee passwords, no token minting, no `auth.users` writes.
- No fee assessment, no workflow transition, no `student_visible` change.
- Negative cases always end in `ROLLBACK`; positives are **not** part of this package.
- Secrets never enter Git, logs, or the generated report.
