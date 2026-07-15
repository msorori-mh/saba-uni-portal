# ENROLLMENT-CERTIFICATE-G3-SQL-EXCEPTION-CONDITION-FIX-01 — Report

## Decision

```text
PASS_ENROLLMENT_CERTIFICATE_G3_SQL_EXCEPTION_CONDITION_FIX_PR_OPENED_NO_APPLY_NO_DEPLOY
```

## Environment

| Item | Value |
| --- | --- |
| Repository | msorori-mh/saba-uni-portal |
| Base branch | main |
| Base SHA (`origin/main`) | `b48a1cd7ef7dae890e4574688140f23ef3dafbbd` |
| Branch | `fix/enrollment-certificate-g3-sql-exception-condition-01` |
| Supabase project | wpmicqriltrowwonknox |
| Lovable project | 4b291119-790f-4484-9285-c2b774e1ba6f |
| Reference report | `docs/ENROLLMENT-CERTIFICATE-PR124-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-01-REPORT.md` |

## What completed

### Fix

- File: `supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql`
- Replaced **both** invalid exception conditions:

  ```sql
  WHEN undefined_function OR undefined_schema THEN
  ```

  with:

  ```sql
  WHEN undefined_function OR invalid_schema_name THEN
  ```

- Corrected locations:
  1. `public._ec_new_verification_token()`
  2. `public._ec_sha256_hex(text)`

- No other migration logic changed (signatures, fallbacks, `SECURITY DEFINER`, `search_path`, grants, storage, saga, workflow).

### Regression test

- Added: `tests/migrations/enrollment-certificate-g3-exception-condition.test.ts`
- Result: **PASS** (`bun test` — 1 pass, 0 fail)

### Validations

| Check | Result |
| --- | --- |
| Regression test | PASS |
| Typecheck (`bunx tsc --noEmit`) | PASS |
| Scoped lint (`bunx eslint` on new test) | PASS |
| Build (`bun run build`) | PASS |
| `git diff --check` | PASS (scoped files only) |

### SQL static review

```text
STATIC_REVIEW_PASS_RUNTIME_COMPILATION_NOT_EXECUTED
```

- No remaining `\bundefined_schema\b`
- Exactly two corrected handlers: `WHEN undefined_function OR invalid_schema_name THEN`
- Only PL/pgSQL `EXCEPTION` handlers in the migration are those two blocks
- Dollar-quote pairs (`$$`, `$mig$`) remain balanced
- Function signatures, privileges, storage/saga/workflow logic unchanged
- Runtime PostgreSQL compilation was **not** executed (no local isolated DB; production/staging not contacted)

### Git / PR

| Item | Value |
| --- | --- |
| Commit SHA | `43e979b486a8bd95a538e260b26c596df3394280` |
| Pull Request | [#127](https://github.com/msorori-mh/saba-uni-portal/pull/127) |

## Changed files (scope)

1. `supabase/migrations/20260714010000_enrollment_certificate_pdf_storage_saga_completion_01.sql`
2. `tests/migrations/enrollment-certificate-g3-exception-condition.test.ts`
3. `docs/ENROLLMENT-CERTIFICATE-G3-SQL-EXCEPTION-CONDITION-FIX-01-REPORT.md`

## Non-execution confirmation

```text
G3 apply: NO
G1 reapply: NO
G2 reapply: NO
Supabase SQL execution: NO
Supabase data writes: NO
Storage writes: NO
Bucket modification: NO
Experimental request touched: NO
Publish/Deploy: NO
```

Forbidden touch targets respected:

- Experimental request: `93807768-a281-42de-bfb4-0c0c03786b20` — not touched
- Bucket: `official-documents` — not modified

## Next phase

```text
ENROLLMENT_CERTIFICATE_G3_SQL_EXCEPTION_CONDITION_FIX_PR_REVIEW_AND_MERGE_01
```

After merge: re-apply **G3 only** in a separate controlled apply phase (not this PR).

## Remaining stages until launch

1. Review and merge this fix PR
2. Re-apply G3 only and run full verification
3. Worker/Storage readiness check
4. Complete enrollment-certificate E2E
5. Shared foundation for the eight student services
6. Forms and workflows
7. Per-service E2E and gradual activation
8. Move educational-materials feature to GitHub, review, and merge
9. Security, data, and UI audit
10. Single final Publish/Deploy
11. Post-launch test and handoff

## Holds / blockers

- G3 not applied yet
- This PR not merged yet
- Worker/Storage readiness not confirmed
- Enrollment-certificate E2E incomplete
- Experimental request must not be touched
- Publish/Deploy forbidden

## Publish/Deploy

```text
PUBLISH_DEPLOY_FORBIDDEN
```
