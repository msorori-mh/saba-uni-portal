# B1 Safe RPC Matrix Harness 01 Report

Decision: **HOLD_RUNTIME_PREDECESSOR_GUARD_GAP**

## Scope and environment

- Source: `origin/main@309992be6acff351bd7c9a8f6503c64d25b2430a`.
- Isolated runtime: disposable local Docker `postgres:17` (server 17), removed in `finally`.
- Services: `enrollment_suspension`, `excused_absence`, `department_transfer`, `final_chance`, `file_withdrawal`.
- Synthetic UUID identities only. No Supabase link, production credential, network database, SQL/migration application outside the disposable database, deploy, publish, or `student_visible` change.

## Runtime result

The focused harness executed 285 authorization assertions. After correcting a
harness-only final-chance source matcher, 280 are expected to pass and five are
expected to expose the same runtime gap: an active step remains authorized when
a synthetic predecessor for the same request/workflow is still `pending`.

The passing matrix covers all 24 canonical B1 staff steps and proves:

- exact direct assignee ALLOW;
- same role but unassigned, wrong unit, wrong role, wrong action, admin,
  registrar, dean, anonymous, inactive, completed/stale replay, and another
  request DENY;
- source/target department-head scope mismatch DENY;
- exact finance assignee ALLOW and unassigned finance RPC DENY with unchanged
  runtime row and event count;
- secure attachment exact-assignee download ALLOW and unassigned download DENY
  with unchanged attachment row;
- external payment source has no `fee_type.code`, amount, currency, invoice,
  gateway transaction, or internal balance;
- final-chance source enforces `final_chance` for new writes.

## Finding

**HIGH — incomplete predecessor is not checked by the database authorization gate.**

`public.can_current_user_act_on_step(uuid,text)` checks authentication, active
status, exactly one direct assignee, exact unit/role binding, transfer department
scope, and the closed B1 tuple. It does not establish that every preceding
runtime step is completed. A deliberately inconsistent local fixture with the
target `active` and a lower-order predecessor `pending` returns ALLOW for one
representative step in each of the five services.

This blocks migration/runtime promotion. The remediation should be made in the
Cursor-owned authorization draft/worktree, then this harness rerun. This branch
does not edit that draft or `scripts/b1-local-pg-compile/*`.

## Files added

- `scripts/b1-safe-rpc-matrix-harness-01/01-runtime-matrix.sql`
- `scripts/b1-safe-rpc-matrix-harness-01/02-run.ps1`
- `scripts/b1-safe-rpc-matrix-harness-01/03-specialized-rpcs.sql`
- `scripts/b1-safe-rpc-matrix-harness-01/README.md`
- `docs/B1-SAFE-RPC-MATRIX-HARNESS-01-REPORT.md`

## Tests and evidence

- `./scripts/b1-safe-rpc-matrix-harness-01/02-run.ps1`: expected exit 2,
  behavioral HOLD due solely to the five predecessor assertions.
- `git diff --check`: required before commit.
- No TypeScript runtime source changed, so `tsc` and application build are not
  required for this SQL/PowerShell harness branch.

## Assumptions, risks, blockers, and production impact

- Assumption: a step must fail closed when any lower-order runtime predecessor
  for the same request/workflow is not completed, even if bad state already
  marked the target active.
- Risk: without the database guard, a stale/concurrent or malformed activation
  can bypass sequence enforcement despite otherwise correct direct assignment.
- Blocker: five-service predecessor authorization remediation and rerun PASS.
- Production impact: none; all mutations occurred in a disposable synthetic
  local PostgreSQL container.
