# PORTAL-B1-SEQ10-SANDBOX-EXEC-ACL-SOURCE-REMEDIATION-01

## Decision

`PASS_SEQ10_SANDBOX_EXEC_ACL_SOURCE_REMEDIATION_PR_READY`

### Mandatory verification

| Check | Result |
|---|---|
| A–D local ACL harness | PASS |
| E SEQ07-B→SEQ10 chain | PASS |
| F enrollment_certificate regression | NONE (no EC files touched) |
| G `bun test tests/student-requests` | 829 pass / 1 fail pre-existing on `origin/main` (`types.ts` lacks `file_withdrawal_details:` before SEQ11 apply) |
| H `bun test` | 1887 pass / same 1 pre-existing fail |
| I `bunx tsc --noEmit` | PASS |
| J `bun run build` | PASS |
| K `git diff --check` | PASS |

## Production context (read-only observation; no production write)

- SEQ09 realized under actual version `20260727044849`.
- SEQ10 failed and rolled back fully (`ABSENCE_EXCUSE_ACL_INVENTORY_MISMATCH`).
- No partial apply.
- Pre-SEQ10 ACL included platform role `sandbox_exec` privileges on `public.absence_excuse_details`.

## Source fix

- Migration: `supabase/migrations/20260725110300_b1_10_excused_absence_detail_05a.sql`
- Draft: `docs/migration-drafts/REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql`
- Explicit fail-safe before ACL inventory guard:

```sql
DO $revoke_sandbox_exec$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    REVOKE ALL ON TABLE public.absence_excuse_details FROM sandbox_exec;
  END IF;
END
$revoke_sandbox_exec$;
```

- Final allowlist unchanged: owner + `authenticated`/`service_role` SELECT only.
- `sandbox_exec` is never allowlisted.
- No backfill / no data rewrite.

## Pins

| Artifact | LF SHA-256 |
|---|---|
| Migration SEQ10 | `ff61ae4a400b2b7d9dfbbec03212d04032103d5343f54a4ad42e274cbb9ab505` |
| Draft 05A | `a94233525724f96959568672744b7466a88b22d338298eaf13a6b75319f97df4` |

## Verifiers

- Preflight: treats `sandbox_exec` as remediable; fails closed on any other unexpected grantee.
- Post-verifier: proves `sandbox_exec` has zero table privileges when role exists; policy/ACL contract exact.

## Local harness

`tests/b1-seq10-sandbox-exec-acl/run-harness.ps1`

- A: role present with SELECT+INSERT → apply cleans privileges
- B: role absent → apply succeeds
- C: unknown grantee → preflight + migration fail-closed
- D: second apply idempotent under SEQ10 contract
