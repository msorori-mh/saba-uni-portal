# B1 Safe RPC Matrix Harness 01 Report

Decision: **PASS_285_OF_285_READY_FOR_INDEPENDENT_REVIEW**

## Scope and environment

- Isolated disposable Docker `postgres:17`, removed in `finally`.
- Five services and all 24 canonical B1 staff steps.
- Synthetic identities only; no Supabase link, production credential, production SQL, deploy, publish, activation, or `student_visible` change.

## Final runtime result

The harness executed exactly 285 authorization assertions against the final merged predecessor guard: **285 passed, 0 failed**.

Each target now has a canonical same-request/same-workflow graph: submit entry to a required predecessor, one completed predecessor runtime, a legal `approved` edge into the active target, and an exact canonical outgoing result derived from the target action (`reviewed`, `approved`, `applied`, `cleared`, `archived`, or `payment_confirmed`). This makes every exact-direct-assignee ALLOW fixture valid under the final guard rather than bypassing it.

The dedicated incomplete-predecessor case isolates only the status predicate. For one representative target per service it first proves the intact canonical graph ALLOWs with the exact predecessor `completed`, snapshots target/config/edges and every non-status predecessor field, flips only that runtime status to `pending`, proves DENY, restores `completed`, and requires the snapshot to remain identical. It never deletes an edge or introduces disconnected config/runtime data.

The matrix also proves same-role unassigned, wrong unit/role/action, admin/registrar/dean, anonymous, inactive/completed replay, another request, and department-scope mismatch DENY.

Specialized RPC evidence retains exact finance and attachment ALLOW plus unassigned DENY with unchanged runtime/event or attachment state. External payment contains no portal fee code, amount, currency, invoice, gateway transaction, or balance; final chance remains exam-only.

## Files

- `scripts/b1-safe-rpc-matrix-harness-01/01-runtime-matrix.sql`
- `scripts/b1-safe-rpc-matrix-harness-01/02-run.ps1`
- `scripts/b1-safe-rpc-matrix-harness-01/03-specialized-rpcs.sql`
- `scripts/b1-safe-rpc-matrix-harness-01/README.md`
- `docs/B1-SAFE-RPC-MATRIX-HARNESS-01-REPORT.md`

## Evidence and impact

- `./scripts/b1-safe-rpc-matrix-harness-01/02-run.ps1`: exit 0; `{"total":285,"passed":285,"failed":0}`.
- `git diff --check`: required before commit.
- No application runtime source changed; TypeScript/build are outside this harness-only delta.
- Production impact: none. All database mutations were synthetic and local.
- Residual requirement: independent review and CI before any merge; production apply remains separately prohibited.
