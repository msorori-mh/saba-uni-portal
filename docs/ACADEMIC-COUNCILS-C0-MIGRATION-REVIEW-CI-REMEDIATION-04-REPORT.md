# ACADEMIC-COUNCILS-C0-MIGRATION-REVIEW-CI-REMEDIATION-04

## Verdict
**PASS_ACADEMIC_COUNCILS_C0_MIGRATION_REVIEW_CI_REMEDIATED**

## SHAs
| Field | Value |
|---|---|
| PR_NUMBER | 294 |
| START_SHA | `84a7171b560cae356095c4e3a5af1965bd34dc40` |
| NEW_SHA | `1a64d5342ce6ca110635640bca0a339d40c609c6` |
| BRANCH | `fix/councils-c0-write-surface-hardening-01` |

## Confirmed issue
Migration Review CI failed on PR #294 because C0 migration contained 14× `DROP POLICY IF EXISTS` patterns. Scanner treats that as dangerous. Remediation preserves/strengthens security without bypassing the scanner.

## Target design (defense in depth)
1. **Table privilege:** `REVOKE INSERT/UPDATE/DELETE` from `PUBLIC/anon/authenticated`
2. **RLS write policy:** keep predecessor policy objects; convert to explicit deny-all
   - INSERT → `WITH CHECK (false)`
   - UPDATE → `USING (false) WITH CHECK (false)`
3. Sensitive writes remain action-specific `SECURITY DEFINER` RPCs only
4. `system_admin`/`admin` retain no automatic academic-governance bypass

## Verdict matrix
| Gate | Result |
|---|---|
| POLICY_INVENTORY_VERDICT | PASS (fail-closed on name/table/cmd) |
| DENY_ALL_POLICY_VERDICT | PASS (14 write policies altered in place) |
| TABLE_GRANT_VERDICT | PASS (REVOKE retained; SELECT preserved) |
| ACCIDENTAL_REGRANT_VERDICT | PASS (`ACCIDENTAL_REGRANT_STILL_DENIED`) |
| RPC_VERDICT | PASS (action RPCs still succeed) |
| ADMIN_BYPASS_VERDICT | PASS (removed for academic ops) |
| NEGATIVE_MATRIX | PASS (zero mutation on denials) |
| PG17 | PASS |
| TESTS | PASS (6/6) |
| TSC | PASS |
| BUILD | PASS |
| DIFF_CHECK | PASS |
| WEB_CI | SUCCESS |
| MIGRATION_REVIEW_CI | SUCCESS |

## Phase A — Policy inventory (fail closed)
Before ALTER, assert exact predecessor write-policy name + table + cmd identity via `pg_policies`. Missing/mistyped identity → migration exception. No silent CREATE substitute.

## Phase B — ALTER to deny-all
All 14 write policies altered in place. No policy object removal. SELECT policies untouched.

## Phase C — Direct grants
Preserved `REVOKE INSERT, UPDATE, DELETE` + authenticated `SELECT` on all seven lifecycle tables.

## Phase D–F — RPC / negative matrix
Disposable PG17 verifier proves:
- action RPCs still succeed (definer contract)
- adminish academic ops denied without membership
- direct client DML denied with zero mutation
- accidental temporary `GRANT INSERT/UPDATE` to authenticated still denied by deny-all RLS

## Phase G — Scanner
Expected dangerous matches in C0 migration: **NONE**
(`DROP POLICY` / `DELETE FROM` / `DROP TABLE` / `TRUNCATE`)

## Files
- `supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql`
- `tests/academic-councils/postgres-c0-write-surface-verifier.sql`
- `tests/academic-councils/councils-c0-write-surface-hardening.test.ts`
- `docs/ACADEMIC-COUNCILS-C0-WRITE-SURFACE-HARDENING-03-REPORT.md`
- this report

## Production impact
- **PRODUCTION_WRITES: 0**
- **MIGRATION_APPLIED: NO**

## Next
`TARGETED_CODEX_C0_DELTA_REVIEW`
