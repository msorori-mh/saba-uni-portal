# PORTAL_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_EXECUTION_111

Decision:
HOLD_B1_E2E_88_PRODUCTION_READONLY_PREFLIGHT_SQL_ERROR_PERMISSION_DENIED_FOR_SCHEMA_AUTH

Trusted channel attestation:
- Lovable project ID: 90f4dcde-07fb-4441-b86a-6ad5510833b8
- Supabase project ref: wpmicqriltrowwonknox (managed by Lovable: true)
- Attestation source: Lovable connected-project metadata + managed Supabase project_info channel (not prompt, not SQL)
- Match: YES (both expected values confirmed independently; stale ID 4b291119-... not used)

Source identity:
- Merged commit: ce450252f05edb0539bdfe0330ab906d515fe08d (equals current checkout HEAD)
- SQL path: docs/production-preflight/B1-E2E-88-PRODUCTION-READONLY-PREFLIGHT-97.sql
- Raw SHA: e65dc4ae5f36a692e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68
- LF SHA: e65dc4ae5f36a692e5ffbe7fd48cfec303229e76f208435017b3bcd93af62c68
- Bytes: 57376
- Lines: 1262 (1261 newlines; final line unterminated — LF-only file)
- Match: YES

Trusted migration-history attestation:
- Source: Lovable-managed database metadata channel (supabase_migrations.schema_migrations via managed read tool)
- Migration version: 20260804120000 — NOT PRESENT
- Managed alias: NONE (latest applied head is 20260804004546 / 17b78d6d-3a17-41d9-ba7b-d0c19c6459cc)
- Applied: NO
- Equivalent migration: NONE observed in ledger
- Trusted: YES
- Conflict with SQL object-state: UNDETERMINED (SQL aborted before object-state gates returned)

Execution:
- Execution count for SQL hash e65dc4ae...: 1 (first and only; superseded f58d5446 run not counted)
- Transaction mode: BEGIN issued by the script (SERIALIZABLE READ ONLY as authored)
- Final ROLLBACK: transaction aborted at error; session terminated without commit — implicit ROLLBACK, no COMMIT reached
- SQL errors: 1 — `ERROR: permission denied for schema auth` at script line 1259 / statement LINE 622 (`SELECT count(*) FROM auth.users u ...`)
- Result row count: 0
- Before/after mutation verdict: NO MUTATION (read-only script, aborted, rolled back)

Gate results:
- G01 status: NOT_RETURNED
- G01 detail: script aborted before result set emission
- G01 evidence: no rows
- G02 status: NOT_RETURNED
- G02 detail: n/a
- G02 evidence: no rows (ledger read separately, out-of-band, via trusted managed channel)
- G03–G14 status/detail: NOT_RETURNED

Combined classifications:
- Trusted G01 project identity: PASS (project ID and ref confirmed via trusted connected-project metadata)
- SQL G02: NOT_RETURNED
- SQL object_state_code: NOT_RETURNED
- Final operational G02: HOLD (trusted metadata proves 20260804120000 not applied and no equivalent, but SQL object-state evidence is missing, so the combined rule cannot be satisfied)
- Overall preflight: HOLD

Exact blockers:
- Migration/application blockers: preflight SQL cannot complete under the managed execution role — it reads `auth.users` (and related auth-schema objects), and the managed role has no USAGE on schema `auth`
- Partial-apply blockers: UNKNOWN (gates not returned)
- TEST_ONLY identity blockers: UNKNOWN (gates not returned)
- Password/session blockers: UNKNOWN (gates not returned)
- Faculty negative-role blockers: UNKNOWN (gates not returned)
- Admin negative-role blockers: UNKNOWN (gates not returned)
- Business-data blockers: UNKNOWN (gates not returned)

Production access:
READ_ONLY

Production writes:
ZERO

Migration apply:
NONE

Auth writes:
NONE

RPC calls:
ZERO

Deploy/Publish:
NONE

Final recommendation:
HOLD_REMEDIATION_REQUIRED

## Remediation to unblock (next package)

Same class of defect as the previous `supabase_migrations` denial, now on schema `auth`:

1. Remove every executable `auth.*` reference from the preflight SQL (the `auth.users` counts around statement LINE 622 and any sibling auth-schema reads).
2. Replace each with a fail-closed UNPROVEN branch carrying an explicit code (e.g. `HOLD_B1_E2E_88_AUTH_SCHEMA_UNREADABLE`), mirroring the G02 ledger-unreadable pattern, so all 14 gates still return.
3. Sweep the whole file for any other schema the managed role cannot access (`storage`, `vault`, `supabase_functions`, `realtime`) and apply the same treatment before re-pinning hashes.
4. Re-pin raw/LF SHA, bytes and line count, update the Package 97 doc and its contract tests, merge, then re-issue execution as a new SQL identity.

No retry of hash `e65dc4ae...` was performed and none should be attempted; that identity is now consumed.
