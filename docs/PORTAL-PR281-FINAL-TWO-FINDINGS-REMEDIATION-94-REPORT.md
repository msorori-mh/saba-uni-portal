# PORTAL_PR281_FINAL_TWO_FINDINGS_REMEDIATION_94

Decision: **PASS_PR281_FINAL_TWO_FINDINGS_REMEDIATION** (pending post-push verification block)

Starting HEAD: `e9632382b4ede73d8bbc374a4624fc7bccc1a8c6`  
PR: https://github.com/msorori-mh/saba-uni-portal/pull/281  
Branch: `feat/b1-e2e-request-scoped-support-88`  
Mode: SOURCE AND LOCAL TESTING ONLY

## Findings remediated

### 1. Package decommission is now executable and fingerprint-proven

`docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` is a complete executable NOT_APPLIED package:

- Embeds exact base-`092ba053` `CREATE OR REPLACE FUNCTION` bodies for:
  - `create_student_request(text,text,jsonb,text)` ← last effective: `20260710140000_student_request_types_rpc_rls.sql`
  - `user_matches_workflow_runtime_step(uuid)` ← `20260723070217_645bb701-…`
  - `current_user_matches_transfer_department_scope(uuid,text)` ← `20260727065220_7419d7c9-…`
  - `can_current_user_act_on_step(uuid,text)` ← `20260727072354_608688a7-…`
- Pins migration-88 preimage fingerprints and base post-restore fingerprints (catalog-derived: `pg_get_functiondef` + owner + `prosecdef` + volatility + strictness + parallel + `proconfig` + ACL + identity args).
- Restores EXECUTE ACLs / search_path via CREATE attributes + REVOKE/GRANT.
- Guards: open execution, active binding, CAS/ops cleanup, fixtures 19/19, five-service visibility, enrollment_certificate visibility, RPA fingerprint.
- Revokes operational entry points (`open` / `bind` / `close` / `cleanup`) while preserving append-only audit evidence.
- Entire script is one transaction; any assertion failure aborts/rolls back.
- Manual paste / `git show` / placeholder instructions removed.

### 2. Fixture-15 carrier detection is content-based

`tests/b1-fixture-15-forward-only-reissue-44.test.ts` now classifies carriers by executable SQL identity (request id, SR number, seven-step contract, protected UPDATE, evidence/audit markers, auth-context behavior, contract markers) with safe comment/whitespace normalization.

Approved set:

- canonical source: `20260803030000_b1_44_restore_sr_20260801_13000015.sql`
- Lovable managed applied alias: `20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql` (semantically reconciled)

Mutation coverage (temp staging dirs only; production migration files untouched): arbitrary-name clone rejected; comment/filename-only clone rejected; third carrier rejected; partial UPDATE-without-audit/auth rejected; approved content drift fails reconciliation; unrelated later migrations tolerated.

## PG17 decommission harness

Extended `tests/b1-e2e-request-scoped-support-88/pg17-disposable-harness.test.ts` + `pg17-decommission-harness.sql`:

- Capture base fingerprints → apply migration 88 → prove expected drift set
- Disposable execution + operational cleanup
- Execute complete decommission draft without manual editing
- Post-verify fingerprint equality, auth parity, entry-point revoke, audit preserved, protected fingerprints
- Ten mutants fail-closed with full rollback

## Scope

| Path | Role |
|---|---|
| `docs/migration-drafts/B1-E2E-88-REQUEST-SCOPED-SUPPORT-CLEANUP.NOT_APPLIED.sql` | Executable decommission |
| `tests/b1-e2e-request-scoped-support-88/*` | PG17 harness + contracts + base schema defs |
| `tests/b1-fixture-15-forward-only-reissue-44.test.ts` | Content-based carrier proof |
| this report | Remediation evidence |

Not modified: applied historical migrations, managed alias bytes, RPA, `student_visible`, `enrollment_certificate`, PR #271, `routeTree.gen.ts`.

Migration apply: **NONE** · Production access: **NONE** · Production writes: **ZERO** · Deploy/Publish: **NONE**
